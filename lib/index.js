/**
 * 源盾 Skills 的 Host 半部。
 *
 * 这个插件是「介入侧」：只做源盾 Skill 市场匿名接口的转发与安装落地，
 * 不维护自己的审计结论或信任判断——安全结论一律来自源盾。
 *
 * 三件事：
 * 1. 同源代理 `/dsh-skill-trust/*` → 源盾匿名接口；
 * 2. 安装：取 ZIP → 校验 X-Skill-SHA256 → 解包 → 写入技能根；
 * 3. 本机已装清单：只读扫描技能根，供界面显示「已安装」。
 */
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseFrontmatter, pickSkillMeta } from './frontmatter.js';
import {
  DEFAULT_BASE,
  SECURITY_LABELS,
  downloadPackage,
  getCapability,
  getFileText,
  getFiles,
  getSecurityAudit,
  getSkillDetail,
  getVersions,
  searchSkills,
} from './yuandun.js';
import { readZip, writeSkillTree } from './zip.js';

export const name = 'dsh-skill-trust';

const LIMITS = {
  keyword: 200,
  name: 240,
  filePath: 500,
  cursor: 1024,
  bodyBytes: 16 * 1024,
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function loopbackAuthority(host) {
  if (host === undefined) return false;
  const lower = host.toLowerCase();
  const value = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0];
  return value === '127.0.0.1' || value === 'localhost' || value === '[::1]';
}

function sameOrigin(request) {
  const host = request.headers.host;
  if (host !== undefined && !loopbackAuthority(host)) return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.host === host;
  } catch {
    return false;
  }
}

function methodIs(request, response, expected) {
  if (request.method === expected) return true;
  response.writeHead(405, { allow: expected });
  response.end();
  return false;
}

async function readJsonBody(request, limit = LIMITS.bodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw Object.assign(new Error('请求体过大'), { status: 413 });
    chunks.push(buffer);
  }
  if (size === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('请求体必须是对象'), { status: 400 });
  }
  return parsed;
}

function queryParam(url, key, limit) {
  const value = url.searchParams.get(key);
  if (value === null) return undefined;
  return value.length > limit ? value.slice(0, limit) : value;
}

/** 文件系统允许的单个目录名上限（字节），超长会让后续 stat 报 ENAMETOOLONG。 */
const MAX_DIR_NAME_BYTES = 255;

/**
 * 只读 SKILL.md 的字节上限。
 *
 * frontmatter 永远在文件开头，64 KB 足以覆盖任何真实技能的元数据块；
 * 而 `stat.size` 已经在前面拿到了，所以超大文件**直接不读**——既省 IO 也避免
 * 把 2 MB 的图片误当文本整读进来拖慢整轮扫描。
 */
const SKILL_HEAD_BYTES = 64 * 1024;

/** SKILL.md 读取的并发上限：43 个技能并发读盘，同时最多 8 个在飞。 */
const SKILL_READ_CONCURRENCY = 8;

/** 1970 epoch 毫秒，用来过滤「文件系统不支持 birthtime」时返回的 0。 */
const EPOCH_MS = 0;

/** 目录名里不允许出现的字符：路径分隔符、Windows 保留字符、控制字符。 */
const ILLEGAL_DIR_NAME = /[\u0000-\u001f<>:"|?*\\/]/;

/**
 * 判断一个目录项是否值得当作技能目录来看。
 *
 * 这里挡掉的都不是「理论上的」问题：`readdir` 在个别文件系统上会返回奇怪名字，
 * 而超长名会让后续 `stat` 抛 ENAMETOOLONG，`..`/`.` 之类的名字拼进路径会指到别处。
 */
function usableDirName(name) {
  if (typeof name !== 'string') return false;
  if (name === '' || name === '.' || name === '..') return false;
  if (name.startsWith('.')) return false;
  if (Buffer.byteLength(name, 'utf8') > MAX_DIR_NAME_BYTES) return false;
  if (ILLEGAL_DIR_NAME.test(name)) return false;
  return true;
}

/** 把 _meta.json 里的标量字段收敛成「干净的字符串或 null」。 */
function metaText(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  // 有些工具把 version 写成数字（1.0 会退化成 1），当作有效值收下。
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** mtime 可能是 Invalid Date（坏文件系统/CIM 时间戳），toISOString 会抛 RangeError。 */
function isoOrNull(mtime) {
  if (!(mtime instanceof Date) || Number.isNaN(mtime.getTime())) return null;
  try {
    return mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * 读取本插件安装时写下的 `_meta.json`。
 *
 * 只有本插件安装的技能才有这个文件；其它工具装的技能没有它，属正常情况，
 * 因此这里一律返回 `{ version: null, securityStatus: null }` 而不是抛错。
 * 关键是「合法 JSON 但不是对象」也要挡住：`JSON.parse('null')`、`'[1,2]'`、
 * `'"text"'`、`'123'` 都能解析成功，但取属性时要么抛 TypeError、要么拿到 undefined。
 */
async function readSkillMeta(dir) {
  const empty = { version: null, securityStatus: null, installedAt: null };
  let raw;
  try {
    raw = await fsp.readFile(path.join(dir, '_meta.json'), 'utf8');
  } catch {
    return empty;
  }
  if (typeof raw !== 'string' || raw.trim() === '') return empty;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
  return {
    version: metaText(parsed.version),
    securityStatus: metaText(parsed.securityStatus),
    // 本插件安装时写的时间戳，优先于文件系统时间。
    installedAt: isoText(parsed.installedAt),
  };
}

/** 把已是字符串的 ISO 时间收敛成合法值；无法解析的当没有。 */
function isoText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : trimmed;
}

/**
 * 读取 SKILL.md 开头的一段文本并解析 frontmatter。
 *
 * 只读**前 64 KB**，不整文件读：frontmatter 永远在文件开头，超出的部分对元数据
 * 没有价值，而整读一个带大段内嵌内容（图片 base64、长附录）的 SKILL.md 会明显
 * 拖慢 43 个条目的整轮扫描。截断是安全的——若 frontmatter 块自身被截断，
 * parseFrontmatter 找不到结束 `---` 会降级为 `hasFrontmatter: false`，不会抛错。
 *
 * 这里刻意吞掉所有异常：单个技能读不到不该让整轮扫描失败，上层拿到占位结果后
 * 只是少几个展示字段。
 */
async function readSkillFrontmatter(skillPath) {
  let handle;
  try {
    handle = await fsp.open(skillPath, 'r');
    const buffer = Buffer.alloc(SKILL_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SKILL_HEAD_BYTES, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const parsed = parseFrontmatter(text);
    const meta = pickSkillMeta(parsed.frontmatter);
    return {
      frontmatter: parsed.frontmatter,
      hasFrontmatter: parsed.hasFrontmatter === true,
      meta,
    };
  } catch {
    return emptyFrontmatter();
  } finally {
    if (handle !== undefined) await handle.close().catch(() => {});
  }
}

/**
 * frontmatter 缺失时的占位。
 *
 * 形状必须与成功路径完全一致，这样前端可以无条件读 `record.description`，
 * 不必到处判空——`tags`/`environments` 用空数组而不是 null，省掉一层判空。
 */
function emptyFrontmatter() {
  return {
    frontmatter: {},
    hasFrontmatter: false,
    meta: {
      name: null,
      displayName: null,
      description: null,
      descriptionZh: null,
      version: null,
      tags: [],
      userInvocable: null,
      modelInvocable: null,
      environments: [],
      visibility: null,
      raw: {},
    },
  };
}

/**
 * 一个极简的并发闸门。
 *
 * 扫描是 IO 密集的：43 次读盘如果串行会更慢，全并发又会同时占用几十个句柄。
 * 8 个在飞是实测折中值——再高对本地 SSD 没有收益，反而放大瞬时内存峰值。
 */
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max || queue.length === 0) return;
    const job = queue.shift();
    active += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

/**
 * 文件系统 birthtime 转 ISO。
 *
 * 不是所有文件系统都记录创建时间：Windows NTFS 一般有，部分 Linux 文件系统
 * 返回 epoch 0 或干脆等于 mtime。小于等于 1970 的一律当「没有」，
 * 否则前端排序会把一堆技能排到 1970 年。
 */
function birthtimeOrNull(stat) {
  const value = stat?.birthtime;
  if (!(value instanceof Date)) return null;
  if (!Number.isFinite(value.getTime()) || value.getTime() <= EPOCH_MS) return null;
  return isoOrNull(value);
}

/** DSH 真正会加载的技能根。 */
export function skillRoots(installRoot) {
  const home = os.homedir();
  const candidates = [
    { id: 'user-agents', label: '~/.agents/skills', dir: path.join(home, '.agents', 'skills') },
    { id: 'user-dsh', label: '~/.dsh/skills', dir: path.join(home, '.dsh', 'skills') },
    { id: 'user-claude', label: '~/.claude/skills', dir: path.join(home, '.claude', 'skills') },
  ];
  if (typeof installRoot === 'string' && installRoot !== '') {
    candidates.unshift({ id: 'install', label: installRoot, dir: installRoot });
  }
  return candidates;
}

/**
 * 只读扫描：目录名 + SKILL.md 状态，不做内容审计。
 *
 * 三个刻意为之的取舍：
 * 1. 任何单个条目的异常都只跳过该条目，绝不让整轮扫描失败——已安装页宁可少一条，
 *    也不能因为某个目录权限不足就整页空白。
 * 2. `version`/`securityStatus` 缺失时统一为 `null`（不是 undefined、不是空串），
 *    前端可以直接判 null；绝大多数技能是别的工具装的，本来就没有 `_meta.json`。
 * 3. 同名 slug 只保留第一个命中的根（skillRoots 的顺序是 DSH 的加载优先级），
 *    否则同一个技能会在列表里出现两次、且显示后者覆盖前者的元信息。
 */
export async function scanInstalled(installRoot) {
  const found = [];
  const seen = new Set();
  // 一次扫描内共享一个闸门：跨根目录也要受限，否则两个根各开 8 路就等于 16。
  const limit = createLimiter(SKILL_READ_CONCURRENCY);
  const pending = [];

  for (const root of skillRoots(installRoot)) {
    let entries;
    try {
      entries = await fsp.readdir(root.dir, { withFileTypes: true });
    } catch {
      // 根目录不存在、不是目录、无权限：跳过该根，继续下一个。
      continue;
    }
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      // Dirent 上的判断都可能抛（个别文件系统不支持），整体包一层。
      let isDirectory = false;
      try {
        isDirectory = entry.isDirectory();
      } catch {
        continue;
      }
      if (!isDirectory) continue;
      if (!usableDirName(entry.name)) continue;
      if (seen.has(entry.name)) continue;

      let dir;
      try {
        dir = path.join(root.dir, entry.name);
      } catch {
        // 名字里有会让 path.join 抛错的内容（极少见，防御性保留）。
        continue;
      }

      let stat;
      try {
        stat = await fsp.stat(path.join(dir, 'SKILL.md'));
      } catch {
        // 没有 SKILL.md / 权限不足 / 软链接断链：不是技能目录，跳过。
        continue;
      }
      if (!stat.isFile()) continue;

      seen.add(entry.name);
      pending.push({ slug: entry.name, dir, root, stat });
    }
  }

  // 元数据读取全部走闸门并发执行；`Promise.all` 里的每一项都自带 catch，
  // 所以单个条目失败只会让该项降级，不会把整轮变成 rejected。
  const records = await Promise.all(pending.map(async ({ slug, dir, root, stat }) => {
    const [meta, fm] = await Promise.all([
      limit(() => readSkillMeta(dir)).catch(() => ({ version: null, securityStatus: null, installedAt: null })),
      limit(() => readSkillFrontmatter(path.join(dir, 'SKILL.md'))).catch(() => emptyFrontmatter()),
    ]);
    return buildRecord({ slug, dir, root, stat, meta, fm });
  }));

  found.push(...records);
  return found;
}

/**
 * 把一路扫描结果合并成一条「本机已安装」记录。
 *
 * 合并优先级是这张表唯一要说清的事：
 * - `version`：`_meta.json`（本插件写入）> frontmatter（作者声明）> null
 * - `installedAt`：`_meta.json`（精确的安装时刻）> SKILL.md birthtime（> 1970）> null
 * - `modifiedAt`：始终是 SKILL.md 的 mtime，语义是「内容最后改动」，不参与上面两个
 *
 * 其余 frontmatter 字段一律**平铺**返回，并保持 shape 恒定（字符串为 null、
 * 数组为空数组），前端无需判空即可渲染。
 */
function buildRecord({ slug, dir, root, stat, meta, fm }) {
  const skillMeta = fm.meta ?? {};
  const frontmatterVersion = typeof skillMeta.version === 'string' && skillMeta.version !== ''
    ? skillMeta.version
    : null;
  const version = meta.version ?? frontmatterVersion;
  const installedAt = meta.installedAt ?? birthtimeOrNull(stat);

  return {
    // —— 既有字段，名字与语义一律不动 ——
    slug,
    dir,
    root: root.id,
    rootLabel: root.label,
    skillMdSize: typeof stat.size === 'number' ? stat.size : 0,
    modifiedAt: isoOrNull(stat.mtime),
    version,
    securityStatus: meta.securityStatus,
    installedAt,
    // —— 新增：原始 frontmatter 与标准化字段 ——
    frontmatter: fm.frontmatter ?? {},
    hasFrontmatter: fm.hasFrontmatter === true,
    name: skillMeta.name ?? null,
    displayName: skillMeta.displayName ?? null,
    description: skillMeta.description ?? null,
    descriptionZh: skillMeta.descriptionZh ?? null,
    tags: Array.isArray(skillMeta.tags) ? skillMeta.tags : [],
    environments: Array.isArray(skillMeta.environments) ? skillMeta.environments : [],
    userInvocable: typeof skillMeta.userInvocable === 'boolean' ? skillMeta.userInvocable : null,
    modelInvocable: typeof skillMeta.modelInvocable === 'boolean' ? skillMeta.modelInvocable : null,
    visibility: skillMeta.visibility ?? null,
  };
}

export function apply(ctx, config = {}) {
  const base = typeof config.base === 'string' && config.base !== '' ? config.base : DEFAULT_BASE;
  const configuredInstallRoot = typeof config.installRoot === 'string' && config.installRoot !== ''
    ? config.installRoot
    : undefined;
  const clientSource = typeof config.clientSource === 'string' && config.clientSource !== ''
    ? config.clientSource
    : 'DSH-SkillMarket';
  const installRoot = () => configuredInstallRoot ?? path.join(os.homedir(), '.agents', 'skills');

  ctx.inject(['webServer'], (hostCtx) => {
    const register = (pathname, handler) => hostCtx.effect(() => hostCtx.webServer.register({
      kind: 'exact',
      path: pathname,
      handler: (request, response) => {
        if (!sameOrigin(request)) {
          sendJson(response, 403, { ok: false, error: '仅允许本机同源请求' });
          return;
        }
        const connection = ctx.get('connection');
        if (connection !== undefined && typeof connection.requestRejection === 'function') {
          let rejection;
          try {
            rejection = connection.requestRejection(request);
          } catch {
            rejection = 403;
          }
          if (rejection !== undefined) {
            sendJson(response, rejection === 401 ? 401 : 403, { ok: false, error: '请求未通过宿主验证' });
            return;
          }
        }
        Promise.resolve()
          .then(() => handler(request, response))
          .catch((error) => {
            if (response.headersSent) return;
            const status = typeof error?.status === 'number' ? error.status : 400;
            sendJson(response, status, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              code: error?.code,
              retryAfter: error?.retryAfter,
            });
          });
      },
    }), `dsh-skill-trust: ${pathname}`);

    /* 检索 */
    register('/dsh-skill-trust/search', async (request, response) => {
      if (!methodIs(request, response, 'GET')) return;
      const url = new URL(request.url ?? '/', 'http://localhost');
      const data = await searchSkills(base, {
        keyword: queryParam(url, 'keyword', LIMITS.keyword) ?? '',
        category: queryParam(url, 'category', 40) ?? '',
        securityStatus: queryParam(url, 'securityStatus', 40) ?? '',
        runtimeRequirement: queryParam(url, 'runtimeRequirement', 60) ?? '',
        sortBy: queryParam(url, 'sortBy', 20) ?? 'COMPREHENSIVE',
        cursor: queryParam(url, 'cursor', LIMITS.cursor) ?? '',
        pageSize: Number(queryParam(url, 'pageSize', 4) ?? '20'),
      });
      sendJson(response, 200, { ok: true, ...data });
    });

    /* 详情 / 能力 / 审计 / 版本 / 文件树 */
    const detailRoute = (suffix, loader) => register(`/dsh-skill-trust/${suffix}`, async (request, response) => {
      if (!methodIs(request, response, 'GET')) return;
      const url = new URL(request.url ?? '/', 'http://localhost');
      const skillName = queryParam(url, 'name', LIMITS.name);
      if (skillName === undefined || skillName === '') {
        sendJson(response, 400, { ok: false, error: '缺少 name 参数' });
        return;
      }
      sendJson(response, 200, { ok: true, data: await loader(base, skillName) });
    });

    detailRoute('detail', getSkillDetail);
    detailRoute('capability', getCapability);
    detailRoute('security-audit', getSecurityAudit);
    detailRoute('versions', getVersions);
    detailRoute('files', getFiles);

    /* 文件预览 */
    register('/dsh-skill-trust/file', async (request, response) => {
      if (!methodIs(request, response, 'GET')) return;
      const url = new URL(request.url ?? '/', 'http://localhost');
      const skillName = queryParam(url, 'name', LIMITS.name);
      const filePath = queryParam(url, 'path', LIMITS.filePath);
      if (skillName === undefined || skillName === '') {
        sendJson(response, 400, { ok: false, error: '缺少 name 参数' });
        return;
      }
      if (filePath === undefined || filePath === '') {
        sendJson(response, 400, { ok: false, error: '缺少 path 参数' });
        return;
      }
      sendJson(response, 200, { ok: true, path: filePath, content: await getFileText(base, skillName, filePath) });
    });

    /* 本机已装（只读扫描） */
    register('/dsh-skill-trust/installed', async (request, response) => {
      if (!methodIs(request, response, 'GET')) return;
      sendJson(response, 200, {
        ok: true,
        installRoot: installRoot(),
        roots: skillRoots(configuredInstallRoot).map((root) => ({ id: root.id, label: root.label })),
        installed: await scanInstalled(configuredInstallRoot),
      });
    });

    /* 安装：ZIP → SHA256 校验 → 解包 → 落盘 */
    register('/dsh-skill-trust/install', async (request, response) => {
      if (!methodIs(request, response, 'POST')) return;
      const body = await readJsonBody(request);
      const fullName = typeof body.name === 'string' ? body.name.trim() : '';
      if (fullName === '') throw Object.assign(new Error('缺少 name 参数'), { status: 400 });
      if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(fullName)) {
        throw Object.assign(new Error('技能名必须是 owner/slug 形式'), { status: 400 });
      }

      const detail = await getSkillDetail(base, fullName);
      if (detail.downloadUrl === null || detail.version === null) {
        return sendJson(response, 200, {
          ok: true,
          mode: 'unavailable',
          reason: '当前版本尚无 READY 制品，暂不可安装',
          version: detail.version,
          securityStatus: detail.securityStatus,
        });
      }

      const slug = fullName.slice(fullName.indexOf('/') + 1);
      const root = installRoot();
      const target = path.join(root, slug);
      const overwrite = body.overwrite === true;

      const existing = await fsp.stat(target).then((stat) => stat.isDirectory(), () => false);
      if (existing && !overwrite) {
        return sendJson(response, 409, {
          ok: false,
          error: `目标目录已存在：${target}`,
          code: 'ALREADY_INSTALLED',
          hint: '传 overwrite: true 可覆盖',
        });
      }

      const downloaded = await downloadPackage(base, {
        name: fullName,
        version: detail.version,
        packageSha256: detail.packageSha256 ?? undefined,
        clientSource,
      });

      // 校验：响应头摘要、详情摘要、实算摘要三者须一致。
      const expected = detail.packageSha256;
      if (downloaded.sha256 !== null && expected !== null && downloaded.sha256 !== expected) {
        throw Object.assign(new Error('下载响应头摘要与详情不一致'), { status: 409, code: 'SHA_MISMATCH' });
      }
      const actual = createHash('sha256').update(downloaded.bytes).digest('hex');
      if (expected !== null && actual !== expected) {
        throw Object.assign(
          new Error(`制品摘要不符：期望 ${expected.slice(0, 16)}…，实际 ${actual.slice(0, 16)}…`),
          { status: 409, code: 'SHA_MISMATCH' },
        );
      }

      const parsed = await readZip(downloaded.bytes);
      if (!parsed.files.some((file) => file.path.toLowerCase() === 'skill.md')) {
        throw Object.assign(new Error('制品内不含 SKILL.md，拒绝安装'), { status: 422, code: 'NO_SKILL_MD' });
      }
      if (existing && overwrite) {
        await fsp.rm(target, { recursive: true, force: true });
      }
      const written = await writeSkillTree(root, slug, parsed.files);

      // 安装来源标记，供「已安装」列表回溯；失败不影响安装结果。
      const meta = {
        name: fullName,
        version: detail.version,
        packageSha256: expected,
        securityStatus: detail.securityStatus,
        securityStatusName: detail.securityStatusName,
        licenseName: detail.licenseName,
        sourceUrl: detail.source?.sourceUrl ?? null,
        installedAt: new Date().toISOString(),
        clientSource,
      };
      await fsp.writeFile(path.join(root, slug, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8')
        .catch(() => {});

      sendJson(response, 200, {
        ok: true,
        mode: 'installed',
        name: fullName,
        slug,
        dir: written.dir,
        fileCount: parsed.files.length,
        totalBytes: parsed.totalBytes,
        sha256: actual,
        version: detail.version,
        securityStatus: detail.securityStatus,
        securityStatusName: detail.securityStatusName,
      });
    });

    /* 配置探针 */
    register('/dsh-skill-trust/meta', async (request, response) => {
      if (!methodIs(request, response, 'GET')) return;
      sendJson(response, 200, {
        ok: true,
        base,
        installRoot: installRoot(),
        clientSource,
        limits: { query: '60/60s/IP', file: '30/60s/IP', zip: '5/60s/IP' },
        securityLabels: SECURITY_LABELS,
      });
    });
  });
}
