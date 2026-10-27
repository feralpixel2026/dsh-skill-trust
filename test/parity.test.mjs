/**
 * 前后端 frontmatter 语义一致性测试（parity test）。
 *
 * ## 为什么需要这个测试
 * 本项目有一处**无法消除的重复实现**：
 *   - `lib/frontmatter.js` 的 `pickSkillMeta()` —— 服务端（Node 半部）用，功能完整
 *   - `lib/client.js` 的 `readInstalledMeta()` + `metaText/metaSingleLine/metaList/metaRecord`
 *     —— 浏览器半部用，必须内联，因为**浏览器模块只能 `require('react')`**，
 *     拿不到同仓库的其它模块（DSH 客户端模块加载机制的硬约束，不是设计失误）。
 *
 * 风险很实在：有人改了 frontmatter.js 的解析/归一规则，忘了同步 client.js，两边就静默分叉，
 * 服务端返回的字段和前端展示的不一致，而且**双方各自的测试都不会红**。
 * 这个文件的责任就是把两边的语义钉在一起。
 *
 * ## 与「两份实现的真实关系」有关的一个重要澄清
 * `readInstalledMeta()` **不解析 YAML**。它只做「把后端已归一化的字段投影成展示模型」：
 *   - 后端已摊平字段（item.version / item.tags / item.description …）存在时直接用；
 *   - 不存在时回退到 `item.frontmatter`（那也已经是 `parseFrontmatter` 解析后的**对象**，
 *     不是原始 YAML 文本）。
 * 所以两端真正的**共享语义面**是这四个归一函数（metaText / metaSingleLine / metaList /
 * metaRecord）+ 派生规则，而不是 YAML 语法本身。YAML 语法由 `lib/frontmatter.js` 单独负责，
 * 已在 `test/frontmatter.test.mjs` 里覆盖。本文件专注共享语义面。
 *
 * ## 脆弱性声明（方案 B）
 * client.js 是 `window.__ModuleLoader__.load({ factory })` 包起来的浏览器模块，不能直接 import；
 * 它的 factory 只返回 `{ inject, apply }`，没有 `__test` 出口。因此这里采用**方案 B**：
 * 读取 client.js 源码文本，按「函数声明行 + 同缩进闭合大括号」截出目标函数，再用
 * `new Function` 重新组装。
 *
 * 这份脆弱性是**有意接受**的：如果将来有人重命名/重构这些函数，本测试会抛错并整体失败
 * （文件加载期 throw），而**不是静默跳过**——把「测试不再覆盖真实实现」这件事暴露出来，
 * 正是这里想要的失败模式。下方第一个用例会显式自检这一点。
 *
 * 零依赖：只用 node:test / node:assert/strict / node:fs / node:path / node:os / node:url。
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, pickSkillMeta } from '../lib/frontmatter.js';
import { scanInstalled } from '../lib/index.js';

/** 仓库根：本文件位于 <repo>/test/，上跳一层。 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 待从 client.js 截取的内联函数。顺序无关，但必须全部存在。
 *
 * humanizeDescription 是展示层改写（把给模型看的 "Use when…" 触发式改成人话），
 * 虽然它不改变后端返回值，但会影响前端投影出的 desc，所以必须一起截取，
 * 否则 readInstalledMeta 调用它时会抛 ReferenceError，整个文件一起红。
 */
const CLIENT_FUNCTIONS = ['metaText', 'metaSingleLine', 'metaList', 'metaRecord', 'humanizeDescription', 'readInstalledMeta'];

/**
 * 从 client.js 源码文本中截取一个函数声明（含函数体）的完整源码。
 *
 * 策略：定位 `function <name>(` 的声明行，取其缩进；同一缩进下的单个 `}` 即为函数闭合。
 * 函数体内部的多行字符串/模板字面量里若出现与声明同缩进的 `}` 会误判——已知限制，
 * 但当前 client.js 不存在这种写法，且误判会导致综合断言失败而非静默通过。
 *
 * @throws 找不到声明或找不到闭合括号时抛错（让测试红，而不是跳过）。
 */
function extractFunctionSource(lines, name) {
  const declaration = new RegExp(`^\\s*function ${name}\\s*\\(`);
  const start = lines.findIndex((line) => declaration.test(line));
  assert.notEqual(start, -1, `client.js 中找不到函数 ${name} 的声明 —— 若是有意重构，请同步更新本测试的提取逻辑`);
  const indent = lines[start].match(/^\s*/)[0];
  const closing = `${indent}}`;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === closing) return lines.slice(start, i + 1).join('\n');
  }
  assert.fail(`client.js 中函数 ${name}（第 ${start + 1} 行）找不到同缩进的闭合大括号`);
}

/** 从 client.js 源码里组装出可调用的内联实现。 */
async function loadClientInternals() {
  const source = await fsp.readFile(path.join(REPO, 'lib', 'client.js'), 'utf8');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const byName = new Map(CLIENT_FUNCTIONS.map((name) => [name, extractFunctionSource(lines, name)]));
  // 结构自检：确保截到的确实是目标函数，而不是恰好同名的别的东西。
  // 按名查找而不是按下标——往 CLIENT_FUNCTIONS 里插入新函数时下标会漂移。
  const readInstalled = byName.get('readInstalledMeta');
  assert.match(readInstalled, /metaRecord\(/, 'readInstalledMeta 源码里应引用 metaRecord');
  assert.match(readInstalled, /metaSingleLine\(/, 'readInstalledMeta 源码里应引用 metaSingleLine');
  assert.match(readInstalled, /metaList\(/, 'readInstalledMeta 源码里应引用 metaList');
  assert.match(readInstalled, /metaText\(/, 'readInstalledMeta 源码里应引用 metaText');
  assert.match(readInstalled, /humanizeDescription\(/, 'readInstalledMeta 源码里应引用 humanizeDescription');
  const pieces = CLIENT_FUNCTIONS.map((name) => byName.get(name));
  const factory = new Function(`'use strict';\n${pieces.join('\n\n')}\n\nreturn { ${CLIENT_FUNCTIONS.join(', ')} };`);
  return factory();
}

// 模块加载期就提取：失败即整个文件加载失败（显式红），绝不静默降级成 skip。
const client = await loadClientInternals();

/**
 * 模拟 `lib/index.js` 的 `buildRecord()` 输出，作为喂给前端 `readInstalledMeta` 的输入。
 *
 * 必须与 buildRecord 保持同一形状（字段恒定：字符串为 null、数组为空数组），
 * 否则测的就不是生产路径。这里刻意照抄其字段清单，是为了让「后端新增/改名字段」
 * 这件事在一致性测试里也留下痕迹。
 */
function simulateScanRecord(yaml, { slug = 'demo', dir = '', metaVersion = null } = {}) {
  const parsed = parseFrontmatter(yaml);
  const skillMeta = pickSkillMeta(parsed.frontmatter);
  const frontmatterVersion = typeof skillMeta.version === 'string' && skillMeta.version !== ''
    ? skillMeta.version
    : null;
  return {
    // —— 既有字段 ——
    slug,
    dir,
    root: 'test-root',
    rootLabel: '测试根',
    skillMdSize: yaml.length,
    modifiedAt: null,
    version: metaVersion ?? frontmatterVersion,
    securityStatus: null,
    installedAt: null,
    // —— 新增的 frontmatter 归一字段 ——
    frontmatter: parsed.frontmatter,
    hasFrontmatter: parsed.hasFrontmatter,
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

/** 目录末段（client 用来在缺描述时兜底的那一段）。 */
function dirTailOf(dir) {
  if (dir === '') return null;
  return dir.split(/[\\/]/).filter((part) => part !== '').pop() ?? null;
}

/**
 * 独立重述 client.js **注释里承诺的**派生规则，作为断言期望值。
 *
 * 刻意不 import 前端实现来算期望值——那会变成「用实现验证实现」的循环论证。
 * 这里写的是契约：
 *   标题 = displayName → name → slug
 *   描述 = humanize(description) → humanize(descriptionZh) → 目录末段
 *   若描述与标题相同（等于把标题重复一遍），退回完整路径；连路径都没有则不渲染
 *
 * humanize 是纯展示层改写（把给模型看的 "Use when…" 触发式改成人话），
 * **只作用于前端投影**，不改变后端返回值——所以下面单独重述一份规则来校验它。
 */
function expectedTitle(record, serverMeta) {
  return serverMeta.displayName ?? serverMeta.name ?? record.slug;
}

/**
 * 与 client.js 的 humanizeDescription 对齐的契约重述。
 * 规则刻意保守：只剥「纯套话前缀」，剥完不足 12 字符就放弃，
 * 判断不出来的一律原样返回（宁可不改，也不给半截从句）。
 */
function expectedHumanize(value) {
  // 与 metaText 的语义一致：非字符串或纯空白一律视为「没有值」。
  if (typeof value !== 'string') return null;
  if (value.trim() === '') return null;
  const text = value;
  const rules = [
    /^use (?:this|the) skill to\s+/i,
    /^use (?:this|it) to\s+/i,
    /^use when the user (?:needs? to|wants? to)\s+/i,
  ];
  for (const re of rules) {
    const matched = text.match(re);
    if (matched === null) continue;
    let rest = text.slice(matched[0].length).trim();
    if (rest.length < 12) break;
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  const zh = text.match(/^当用户(?:需要|想要|希望|问|询问)\s*/);
  if (zh !== null) {
    const rest = text.slice(zh[0].length).trim();
    if (rest.length >= 12) return rest;
  }
  return text;
}

function expectedDesc(record, serverMeta) {
  const title = expectedTitle(record, serverMeta);
  const dirTail = dirTailOf(record.dir);
  let desc = expectedHumanize(serverMeta.description)
    ?? expectedHumanize(serverMeta.descriptionZh)
    ?? dirTail;
  if (desc !== null && desc === title) desc = record.dir === '' ? null : record.dir;
  if (desc === null && record.dir !== '') desc = record.dir;
  return desc;
}

/** name 徽章规则：与标题相同时不重复渲染。 */
function expectedNameBadge(record, serverMeta) {
  const title = expectedTitle(record, serverMeta);
  return serverMeta.name !== null && serverMeta.name !== title ? serverMeta.name : null;
}

/** 失败信息里要带上的上下文（输入 + 两边输出），避免「断言失败但看不出为什么」。 */
function context(label, yaml, serverMeta, projected) {
  return [
    '',
    `用例: ${label}`,
    `输入 YAML:\n${yaml}`,
    `后端 pickSkillMeta: ${JSON.stringify(serverMeta)}`,
    `前端 readInstalledMeta: ${JSON.stringify(projected)}`,
  ].join('\n');
}

/**
 * 核心对拍：同一份输入，后端走「YAML → pickSkillMeta → buildRecord」，
 * 前端走「record → readInstalledMeta」，比对 5 个核心字段。
 */
function compareCase(label, yaml, opts = {}) {
  const record = simulateScanRecord(yaml, opts);
  const serverMeta = pickSkillMeta(parseFrontmatter(yaml).frontmatter);
  const projected = client.readInstalledMeta(record);
  const where = context(label, yaml, serverMeta, projected);

  // 1) version：纯数据，必须逐字一致
  assert.equal(projected.version, serverMeta.version, `version 不一致${where}`);
  // 2) tags：纯数据，必须逐项一致
  assert.deepEqual(projected.tags, serverMeta.tags, `tags 不一致${where}`);
  // 3) title = displayName → name → slug
  assert.equal(projected.title, expectedTitle(record, serverMeta), `title 不一致${where}`);
  // 4) desc = description → descriptionZh → 目录末段
  assert.equal(projected.desc, expectedDesc(record, serverMeta), `desc 不一致${where}`);
  // 5) name 徽章规则
  assert.equal(projected.name, expectedNameBadge(record, serverMeta), `name 徽章不一致${where}`);

  return { record, serverMeta, projected };
}

/* ====================================================================== *
 * 0. 提取逻辑自检
 * ====================================================================== */

describe('内联实现提取（方案 B）自检', () => {
  test('5 个内联函数全部定位成功，且行为可调用', () => {
    assert.deepEqual(Object.keys(client).sort(), [...CLIENT_FUNCTIONS].sort());
    assert.equal(typeof client.readInstalledMeta, 'function');
    assert.equal(client.readInstalledMeta.length, 1, 'readInstalledMeta 应当是单参数');
  });

  test('提取到的 metaText 与后端 asText 语义一致（标量归一）', () => {
    // 后端 asText 是模块私有函数，通过 pickSkillMeta 的输出来间接验证等价输入。
    const cases = [null, undefined, '', '   ', '  x  ', 42, 0];
    const expected = [null, null, null, null, 'x', '42', '0'];
    for (let i = 0; i < cases.length; i += 1) {
      assert.equal(client.metaText(cases[i]), expected[i], `metaText(${JSON.stringify(cases[i])}) 期望 ${JSON.stringify(expected[i])}`);
    }
  });
});

/* ====================================================================== *
 * 1. 标准用例：12+ 组，覆盖任务书点名的全部情形
 * ====================================================================== */

describe('核心字段一致性（标准用例）', () => {
  const CASES = [
    {
      label: '普通单行标量',
      yaml: '---\nname: plain\ndescription: 一个普通描述\n---\n\n# 正文\n',
    },
    {
      label: '双引号值',
      yaml: '---\nname: dq\ndescription: "带双引号的描述"\n---\n\n# x\n',
    },
    {
      label: '单引号值（含内部成对单引号）',
      yaml: "---\nname: sq\ndescription: 'it''s quoted'\n---\n\n# x\n",
    },
    {
      label: '值里含冒号（带引号，self-improving-agent 真实写法）',
      yaml: '---\nname: colon-q\ndescription: "Use when: (1) A command fails, (2) User corrects Codex"\n---\n\n# x\n',
    },
    {
      label: '值里含冒号（无引号）',
      yaml: '---\nname: colon-p\ndescription: Use when: (1) A command fails\n---\n\n# x\n',
    },
    {
      label: '>- 折叠块（多行变单行）',
      yaml: '---\nname: folded\ndescription: >-\n  A live React app that the user can open\n  beside the chat. You MUST read this\n  before touching any .canvas.tsx file.\n---\n\n# x\n',
    },
    {
      label: '| 字面块（保留换行，前端压成单行）',
      yaml: '---\nname: literal\ndescription: |\n  第一行描述\n  第二行描述\n---\n\n# x\n',
    },
    {
      label: '> 折叠块（无修饰符）',
      yaml: '---\nname: fold-plain\ndescription: >\n  one\n  two\n---\n\n# x\n',
    },
    {
      label: 'metadata.version 嵌套（douyin-cover-builder 真实写法）',
      yaml: '---\nname: nested-ver\ndescription: 嵌套版本\ntags:\n  - design\nmetadata:\n  version: "3.1.3"\n---\n\n# x\n',
    },
    {
      label: 'version 是数字 0.0.3（qqmusic 真实写法）',
      yaml: '---\nname: num-ver\ndescription: 数字版本\nversion: 0.0.3\n---\n\n# x\n',
    },
    {
      label: 'version 是整数（转字符串）',
      yaml: '---\nname: int-ver\ndescription: 整数版本\nversion: 42\n---\n\n# x\n',
    },
    {
      label: 'flow 数组 tags',
      yaml: '---\nname: flow-tags\ndescription: flow 标签\ntags: [design, cover, "with, comma"]\n---\n\n# x\n',
    },
    {
      label: '块数组 tags',
      yaml: '---\nname: block-tags\ndescription: 块标签\ntags:\n  - design\n  - thumbnail\n  - cover\n---\n\n# x\n',
    },
    {
      label: 'display_name 优先于 name',
      yaml: '---\nname: qqmusic\ndisplay_name: "QQ音乐助手"\ndescription: 音乐助手\n---\n\n# x\n',
    },
    {
      label: 'description_zh 回退（description 缺失时）',
      yaml: '---\nname: zh-only\ndescription_zh: "只有中文描述"\n---\n\n# x\n',
    },
    {
      label: '无 frontmatter 的纯 markdown',
      yaml: '# 只有正文\n\n没有 YAML。\n',
    },
    {
      label: '损坏 frontmatter（只有开头 ---）',
      yaml: '---\nname: broken\ndescription: 没有结尾\n',
    },
    {
      label: '空字符串',
      yaml: '',
    },
  ];

  for (const item of CASES) {
    test(item.label, () => {
      compareCase(item.label, item.yaml);
    });
  }

  test('绝对期望：折叠块在两端都是 "one two" 这类单行结果（防两边一起错）', () => {
    const { serverMeta, projected } = compareCase('folded-abs', '---\nname: f\ndescription: >-\n  alpha beta\n  gamma delta\n---\n');
    assert.equal(serverMeta.description, 'alpha beta gamma delta');
    assert.equal(projected.desc, 'alpha beta gamma delta');
  });

  test('绝对期望：数字版本 0.0.3 在两端都是字符串 "0.0.3"', () => {
    const { serverMeta, projected } = compareCase('num-abs', '---\nname: v\nversion: 0.0.3\n---\n');
    assert.equal(serverMeta.version, '0.0.3');
    assert.equal(projected.version, '0.0.3');
    assert.equal(typeof projected.version, 'string');
  });

  test('绝对期望：metadata.version 在两端都被取到', () => {
    const { serverMeta, projected } = compareCase('meta-abs', '---\nname: v\nmetadata:\n  version: "1.2.3"\n---\n');
    assert.equal(serverMeta.version, '1.2.3');
    assert.equal(projected.version, '1.2.3');
  });

  test('_meta.json 的 version 优先于 frontmatter（前端尊重后端已合并的结果）', () => {
    // 这条**不能**用 compareCase：compareCase 断言的是「前后端解析同一份 YAML 得同一结果」，
    // 而这里后端已经按 _meta.json > frontmatter 的优先级做过合并，前端只该原样采用，
    // 两种「一致」不是同一件事，混在一起会得到假失败。
    const yaml = '---\nname: p\nversion: "1.0.0"\n---\n';
    const record = simulateScanRecord(yaml, { metaVersion: '9.9.9' });
    assert.equal(record.version, '9.9.9', '后端应取 _meta.json 的版本');
    const projected = client.readInstalledMeta(record);
    assert.equal(projected.version, '9.9.9', '前端应直接采用后端给出的 version，不回退去重算');
    // 对照：没有 _meta.json 时，两端都该落到 frontmatter 的 1.0.0
    const fallback = client.readInstalledMeta(simulateScanRecord(yaml));
    assert.equal(fallback.version, '1.0.0');
  });
});

/* ====================================================================== *
 * 2. 真实数据：本机 ~/.agents/skills 全部 SKILL.md 端到端对拍
 * ====================================================================== */

describe('真实技能端到端一致性（~/.agents/skills）', () => {
  const created = [];
  after(async () => {
    for (const dir of created) await fsp.rm(dir, { recursive: true, force: true });
  });

  test('43 个真实 SKILL.md：5 个核心字段逐条一致', async () => {
    const realRoot = path.join(os.homedir(), '.agents', 'skills');
    const hasReal = await fsp.access(realRoot).then(() => true, () => false);
    if (!hasReal) {
      // 环境前置缺失（换一台没装过技能的机器），不是「发现不一致」，因此跳过。
      assert.ok(true, '本机没有 ~/.agents/skills，跳过真实数据比对');
      return;
    }

    // 复制到临时根再跑真实 scanInstalled：不触碰用户真实技能目录，且走完整生产路径。
    const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'parity-skills-'));
    created.push(tmpRoot);
    const entries = await fsp.readdir(realRoot, { withFileTypes: true });
    let copied = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const source = path.join(realRoot, entry.name, 'SKILL.md');
      const readable = await fsp.access(source).then(() => true, () => false);
      if (!readable) continue;
      await fsp.mkdir(path.join(tmpRoot, entry.name), { recursive: true });
      await fsp.copyFile(source, path.join(tmpRoot, entry.name, 'SKILL.md'));
      copied += 1;
    }
    assert.ok(copied >= 1, '临时根里至少应有一个技能');

    const records = await scanInstalled(tmpRoot);
    assert.equal(records.length, copied, '扫描条数应与复制条数一致');

    const failures = [];
    for (const record of records) {
      const yaml = await fsp.readFile(path.join(record.dir, 'SKILL.md'), 'utf8');
      const serverMeta = pickSkillMeta(parseFrontmatter(yaml).frontmatter);
      const projected = client.readInstalledMeta(record);

      // 后端自己也要和独立解析保持同源（防止 buildRecord 丢失字段）
      const checks = [
        ['version', projected.version, serverMeta.version],
        ['tags', JSON.stringify(projected.tags), JSON.stringify(serverMeta.tags)],
        ['title', projected.title, expectedTitle(record, serverMeta)],
        ['desc', projected.desc, expectedDesc(record, serverMeta)],
        ['name', projected.name, expectedNameBadge(record, serverMeta)],
      ];
      for (const [field, actual, expected] of checks) {
        if (actual !== expected) {
          failures.push({ slug: record.slug, field, actual, expected });
        }
      }
      // 后端摊平字段与 frontmatter 解析结果必须同源（否则前端拿到的就是另一份数据）
      if (record.description !== serverMeta.description) {
        failures.push({
          slug: record.slug,
          field: '后端 record.description vs pickSkillMeta',
          actual: record.description,
          expected: serverMeta.description,
        });
      }
      if (record.version !== serverMeta.version) {
        failures.push({
          slug: record.slug,
          field: '后端 record.version vs pickSkillMeta',
          actual: record.version,
          expected: serverMeta.version,
        });
      }
    }

    assert.deepEqual(failures, [], `真实技能存在 ${failures.length} 处分歧：\n${JSON.stringify(failures, null, 2)}`);
  });

  test('真实技能：脱掉末段标题重复后 desc 仍然合理（抽样人工核对）', async () => {
    const realRoot = path.join(os.homedir(), '.agents', 'skills');
    const hasReal = await fsp.access(realRoot).then(() => true, () => false);
    if (!hasReal) {
      assert.ok(true, '本机没有 ~/.agents/skills，跳过');
      return;
    }
    for (const slug of ['self-improving-agent', 'canvas', 'qqmusic', 'douyin-cover-builder']) {
      const file = path.join(realRoot, slug, 'SKILL.md');
      const readable = await fsp.access(file).then(() => true, () => false);
      if (!readable) continue;
      const yaml = await fsp.readFile(file, 'utf8');
      const serverMeta = pickSkillMeta(parseFrontmatter(yaml).frontmatter);
      // 关键回归点：self-improving-agent 的描述里含 "Use when: (1) ..."，冒号不得截断
      if (slug === 'self-improving-agent') {
        assert.ok(serverMeta.description.includes('Use when: (1) A command or operation fails'), '冒号后内容必须完整');
      }
      // canvas 是 >- 折叠块，必须非空且无换行
      if (slug === 'canvas') {
        assert.ok(serverMeta.description.length > 200, 'canvas 描述应较长');
        assert.ok(!serverMeta.description.includes('\n'), 'canvas 描述应已折成单行');
      }
      assert.ok(serverMeta.description !== null, `${slug} 的 description 不应为空`);
    }
  });
});

/* ====================================================================== *
 * 3. 已知语义分歧（本组当前预期失败 —— 需要 Lead 决策，不要为了绿色放宽）
 *
 * 背景：client.js 的 metaSingleLine 在压平空白之前多做了一步正则替换，
 * 把开头的竖线/大于号及可选修饰符剥掉（见该函数内 `replace(/^[|>][+-]?.../)` 一行）。
 * 其注释解释为「直接从 item.frontmatter 读裸值时可能还带着 YAML 块指示符」。
 * 但经核实这个前提不成立：
 *   - item.frontmatter 恒为 parseFrontmatter 解析后的**对象**，值里不含 `|`/`>` 指示符；
 *   - item.description 等摊平字段是 pickSkillMeta 的产物，同样不含指示符。
 * 因此该剥除在真实路径上不承担任何正确性职责，却会在「描述本身以 | 或 > 开头」时
 * 吞掉首字符。真实 43 个技能不触发，但这是真实的语义分叉。
 * ====================================================================== */

describe('已知语义分歧：description 以 | 或 > 开头（需要 Lead 决策）', () => {
  const CASES = [
    { label: '以竖线开头（如 markdown 表格片段）', yaml: '---\nname: p1\ndescription: "|col1|col2|"\n---\n' },
    { label: '以大于号开头', yaml: '---\nname: p2\ndescription: ">quoted gt text"\n---\n' },
    { label: '以 >- 开头', yaml: '---\nname: p3\ndescription: ">-looks-like-block"\n---\n' },
    { label: '以 |+ 开头', yaml: '---\nname: p4\ndescription: "|+keep"\n---\n' },
  ];

  for (const item of CASES) {
    test(`${item.label}：前后端 description 必须一致`, () => {
      const record = simulateScanRecord(item.yaml);
      const serverMeta = pickSkillMeta(parseFrontmatter(item.yaml).frontmatter);
      const projected = client.readInstalledMeta(record);
      const where = context(item.label, item.yaml, serverMeta, projected);
      // 后端把 "|col1|col2|" 当作普通字符串原样保留；前端会剥掉首字符 —— 断言真实差异
      assert.equal(projected.desc, serverMeta.description, `description 被前端改写${where}`);
    });
  }
});
