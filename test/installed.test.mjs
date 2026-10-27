/**
 * 「本机已安装」扫描器的行为测试。
 *
 * 这些用例锁住的是**真实踩过的坑**，不是形式化覆盖率：
 * 用户反馈「有那么多 vnull」的根因就是 `version` 从 `_meta.json` 读，而只有本插件
 * 安装的技能才有那个文件，其它工具装的全是 null。因此这里的重点不是「能读到」，
 * 而是**读不到时语义必须干净**：一律 `null`，不抛异常，不中断整轮扫描。
 *
 * 全程使用 os.tmpdir() 下的临时目录，并在结束时递归清理；不触碰用户真实的技能根。
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { scanInstalled, skillRoots } from '../lib/index.js';

/** 每个用例独立的临时技能根，互不干扰。 */
const created = [];

async function makeRoot() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dst-installed-'));
  created.push(dir);
  return dir;
}

/** 造一个技能目录；meta 传 undefined 表示不写 _meta.json。 */
async function makeSkill(root, slug, { skillMd = true, meta, metaRaw, nesting = [] } = {}) {
  const dir = path.join(root, ...nesting, slug);
  await fsp.mkdir(dir, { recursive: true });
  if (skillMd) {
    await fsp.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\ndescription: 测试技能\n---\n\n# ${slug}\n`, 'utf8');
  }
  if (metaRaw !== undefined) {
    await fsp.writeFile(path.join(dir, '_meta.json'), metaRaw, 'utf8');
  } else if (meta !== undefined) {
    await fsp.writeFile(path.join(dir, '_meta.json'), JSON.stringify(meta), 'utf8');
  }
  return dir;
}

after(async () => {
  for (const dir of created) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

/** 只保留指定根的结果，避免宿主机真实 ~/.agents/skills 干扰断言。 */
function onlyIn(rows, root) {
  const resolved = path.resolve(root);
  return rows.filter((row) => path.resolve(row.dir).startsWith(resolved));
}

describe('scanInstalled · _meta.json 与 version 语义', () => {
  test('有合法 _meta.json 时读出 version 与 securityStatus', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'plugin-installed', {
      meta: { name: 'owner/plugin-installed', version: '1.2.3', securityStatus: 'SAFE' },
    });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, 'plugin-installed');
    assert.equal(rows[0].version, '1.2.3');
    assert.equal(rows[0].securityStatus, 'SAFE');
  });

  test('没有 _meta.json 时 version 为 null，且不报错', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'other-tool');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].version, null);
    assert.equal(rows[0].securityStatus, null);
    // 必须是 null 而不是 undefined —— 前端按 null 判断并显示占位符。
    assert.ok(rows[0].version === null, 'version 必须严格等于 null');
    assert.equal(JSON.stringify(rows[0].version), 'null');
  });

  test('_meta.json 是数组 / 字符串 / 数字 / null 字面量时一律退回 null', async () => {
    const root = await makeRoot();
    // JSON.parse('[1,2]')、'"text"'、'123'、'null' 都能解析成功，
    // 但取 .version 会拿到 undefined（数组）或直接 TypeError（null/数字）。
    const cases = {
      'meta-array': '[1,2]',
      'meta-string': '"just-a-string"',
      'meta-number': '123',
      'meta-null': 'null',
      'meta-bool': 'true',
    };
    for (const [slug, raw] of Object.entries(cases)) {
      await makeSkill(root, slug, { metaRaw: raw });
    }

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, Object.keys(cases).length);
    for (const row of rows) {
      assert.equal(row.version, null, `${row.slug} 的 version 应为 null`);
      assert.equal(row.securityStatus, null, `${row.slug} 的 securityStatus 应为 null`);
    }
  });

  test('_meta.json 是损坏 JSON 或空文件时退回 null，不抛异常', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'broken-json', { metaRaw: '{"version": ' });
    await makeSkill(root, 'empty-file', { metaRaw: '' });
    await makeSkill(root, 'not-json', { metaRaw: '\u0000\u0001binary' });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.version, null);
      assert.equal(row.securityStatus, null);
    }
  });

  test('_meta.json 里字段类型不对时只把该字段退回 null', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'wrong-types', {
      meta: { version: { nested: true }, securityStatus: ['array'] },
    });
    await makeSkill(root, 'partial', { meta: { version: '2.0.0' } });

    const rows = onlyIn(await scanInstalled(root), root);
    const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));
    assert.equal(bySlug['wrong-types'].version, null);
    assert.equal(bySlug['wrong-types'].securityStatus, null);
    // 只缺 securityStatus，version 仍然要读出来。
    assert.equal(bySlug.partial.version, '2.0.0');
    assert.equal(bySlug.partial.securityStatus, null);
  });

  test('数字型 version 收敛成字符串，空串收敛成 null', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'numeric-version', { meta: { version: 1.5 } });
    await makeSkill(root, 'blank-version', { meta: { version: '   ' } });

    const rows = onlyIn(await scanInstalled(root), root);
    const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));
    // 数字 version 不能直接当字符串用（1.5 会被渲染成 1.5，但 1.0 会退化成 1），
    // 这里只承诺「非空则给字符串」。
    assert.equal(typeof bySlug['numeric-version'].version, 'string');
    assert.equal(bySlug['numeric-version'].version, '1.5');
    assert.equal(bySlug['blank-version'].version, null);
  });
});

describe('scanInstalled · 目录筛选', () => {
  test('没有 SKILL.md 的目录被跳过，即使里面有子目录', async () => {
    const root = await makeRoot();
    // 只有子目录、没有 SKILL.md 的容器目录
    await fsp.mkdir(path.join(root, 'container', 'nested'), { recursive: true });
    await fsp.writeFile(path.join(root, 'container', 'README.md'), '# not a skill\n', 'utf8');
    // 正常技能，用来确认扫描本身没坏
    await makeSkill(root, 'real-skill');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.deepEqual(rows.map((row) => row.slug), ['real-skill']);
  });

  test('隐藏目录（. 开头）被跳过', async () => {
    const root = await makeRoot();
    await makeSkill(root, '.hidden');
    await makeSkill(root, '.git');
    await makeSkill(root, 'visible');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.deepEqual(rows.map((row) => row.slug), ['visible']);
  });

  test('SKILL.md 是目录而非文件时跳过该条目', async () => {
    const root = await makeRoot();
    await fsp.mkdir(path.join(root, 'skill-md-is-dir', 'SKILL.md'), { recursive: true });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.some((row) => row.slug === 'skill-md-is-dir'), false);
  });

  test('根目录为空时返回空数组', async () => {
    const root = await makeRoot();
    const rows = onlyIn(await scanInstalled(root), root);
    assert.deepEqual(rows, []);
  });

  test('根目录不存在时不抛错误', async () => {
    const root = path.join(os.tmpdir(), `dst-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const rows = await scanInstalled(root);
    assert.ok(Array.isArray(rows));
    assert.equal(onlyIn(rows, root).length, 0);
  });

  test('installRoot 指向一个普通文件时不抛错误', async () => {
    const root = await makeRoot();
    const file = path.join(root, 'not-a-dir.txt');
    await fsp.writeFile(file, 'x', 'utf8');
    const rows = await scanInstalled(file);
    assert.ok(Array.isArray(rows));
  });
});

describe('scanInstalled · 返回值结构', () => {
  test('每条记录都带前端依赖的字段名', async () => {
    const root = await makeRoot();
    const dir = await makeSkill(root, 'shape-check', { meta: { version: '9.9.9', securityStatus: 'SUSPECTED' } });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    const row = rows[0];
    for (const key of ['slug', 'dir', 'root', 'rootLabel', 'skillMdSize', 'modifiedAt', 'version', 'securityStatus']) {
      assert.ok(Object.hasOwn(row, key), `缺少字段 ${key}`);
    }
    assert.equal(row.slug, 'shape-check');
    assert.equal(row.dir, dir);
    assert.equal(row.root, 'install');
    assert.equal(row.rootLabel, root);
    assert.equal(typeof row.skillMdSize, 'number');
    assert.ok(row.skillMdSize > 0);
    // modifiedAt 要么是 ISO 字符串，要么是 null —— 不能是 Invalid Date 抛出的异常。
    assert.equal(typeof row.modifiedAt, 'string');
    assert.equal(Number.isNaN(Date.parse(row.modifiedAt)), false);
  });

  test('同名 slug 只在第一个命中的根里出现一次', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    // installRoot 排在 skillRoots 最前，用它当"第一个根"。
    await makeSkill(first, 'duplicated', { meta: { version: '1.0.0' } });
    await makeSkill(second, 'duplicated', { meta: { version: '2.0.0' } });

    const rows = await scanInstalled(first);
    const hits = rows.filter((row) => row.slug === 'duplicated');
    assert.equal(hits.length, 1, '同名 slug 只能出现一次');
    assert.equal(hits[0].version, '1.0.0', '应取第一个命中的根');
    assert.equal(path.resolve(hits[0].dir), path.resolve(first, 'duplicated'));
  });

  test('skillRoots 把 installRoot 排在最前，且标签即配置路径', () => {
    const roots = skillRoots('/tmp/custom-skills');
    assert.equal(roots[0].id, 'install');
    assert.equal(roots[0].dir, '/tmp/custom-skills');
    // 未配置 installRoot 时不应凭空多出一个 install 根。
    assert.equal(skillRoots().some((root) => root.id === 'install'), false);
  });

  test('一批技能里坏条目不影响好条目，且顺序稳定', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'good-a', { meta: { version: '1.0.0' } });
    await makeSkill(root, 'no-meta');
    await makeSkill(root, 'broken-meta', { metaRaw: '{oops' });
    await fsp.mkdir(path.join(root, 'no-skill-md'), { recursive: true });
    await makeSkill(root, '.hidden-one');
    await makeSkill(root, 'good-b', { metaRaw: '[1,2]' });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.deepEqual(rows.map((row) => row.slug).sort(), ['broken-meta', 'good-a', 'good-b', 'no-meta']);
    assert.equal(rows.every((row) => row.version === null || typeof row.version === 'string'), true);
    // 连续两次扫描结果一致（无随机性、无依赖遍历顺序的抖动）。
    const again = onlyIn(await scanInstalled(root), root);
    assert.deepEqual(again.map((row) => row.slug).sort(), rows.map((row) => row.slug).sort());
  });
});

/** 造一个技能目录，SKILL.md 内容由调用方完全控制。 */
async function makeSkillWithMd(root, slug, skillMd) {
  const dir = path.join(root, slug);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'SKILL.md'), skillMd, 'utf8');
  return dir;
}

describe('scanInstalled · frontmatter 元数据平铺', () => {
  test('完整 frontmatter 的 displayName / description / tags 正确平铺', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'full-fm', [
      '---',
      'name: full-fm',
      'display_name: 完整元数据技能',
      'description: 这是一个带完整 frontmatter 的技能。',
      'tags:',
      '  - design',
      '  - cover',
      'user-invocable: true',
      'disable-model-invocation: false',
      'environments:',
      '  - linux',
      'visibility: public',
      '---',
      '',
      '# 正文',
    ].join('\n'));

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.hasFrontmatter, true);
    assert.equal(row.name, 'full-fm');
    assert.equal(row.displayName, '完整元数据技能');
    assert.equal(row.description, '这是一个带完整 frontmatter 的技能。');
    assert.deepEqual(row.tags, ['design', 'cover']);
    assert.deepEqual(row.environments, ['linux']);
    assert.equal(row.userInvocable, true);
    assert.equal(row.modelInvocable, true);
    assert.equal(row.visibility, 'public');
    // 原始解析对象也要带上，供前端二次处理。
    assert.equal(typeof row.frontmatter, 'object');
    assert.equal(row.frontmatter.name, 'full-fm');
  });

  test('折叠块 description（>- / |）被压成单行', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'folded', [
      '---',
      'name: folded',
      'description: >-',
      '  第一行说明，',
      '  第二行继续。',
      '---',
      '',
      '# 正文',
    ].join('\n'));

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].hasFrontmatter, true);
    assert.equal(rows[0].description, '第一行说明， 第二行继续。');
    // 描述必须单行，否则前端两行截断会错乱。
    assert.equal(rows[0].description.includes('\n'), false);
  });

  test('无 frontmatter 的纯 markdown：字段降级为 null / 空数组，不抛异常', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'plain-md', '# 只是一个普通 markdown\n\n没有 YAML 头。\n');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.hasFrontmatter, false);
    assert.equal(row.name, null);
    assert.equal(row.displayName, null);
    assert.equal(row.description, null);
    assert.equal(row.version, null);
    assert.deepEqual(row.tags, []);
    assert.deepEqual(row.environments, []);
    assert.equal(row.userInvocable, null);
    assert.equal(row.modelInvocable, null);
    assert.equal(row.visibility, null);
    // 形状恒定：字段都存在，只是值为 null / 空数组。
    assert.equal(Object.hasOwn(row, 'frontmatter'), true);
    assert.deepEqual(row.frontmatter, {});
  });

  test('损坏 frontmatter（只有开头 --- 没有结尾）不抛异常', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'broken-fm', '---\nname: broken-fm\ndescription: 没有结束分隔线\n\n# 正文\n');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hasFrontmatter, false);
    assert.equal(rows[0].description, null);
    assert.equal(rows[0].version, null);
  });

  test('超长 SKILL.md（>64KB）只读前 64KB，不崩且 frontmatter 仍能解析', async () => {
    const root = await makeRoot();
    const padding = 'x'.repeat(200 * 1024);
    await makeSkillWithMd(root, 'huge-md', [
      '---',
      'name: huge-md',
      'description: 超大文件开头的元数据仍然要读到。',
      '---',
      '',
      padding,
    ].join('\n'));

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    // frontmatter 在开头，截断不影响它。
    assert.equal(rows[0].name, 'huge-md');
    assert.match(rows[0].description, /超大文件开头/);
  });

  test('二进制内容当作 SKILL.md 时不崩，frontmatter 降级', async () => {
    const root = await makeRoot();
    const dir = path.join(root, 'binary-md');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'SKILL.md'), Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x00, 0x42]));

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hasFrontmatter, false);
    assert.equal(rows[0].description, null);
  });

  test('frontmatter 字段类型异常时逐字段降级，不影响其它字段', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'odd-types', [
      '---',
      'name: odd-types',
      'description: 正常描述',
      'tags: [1, 2, 3]',
      '---',
      '',
      '# 正文',
    ].join('\n'));

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].description, '正常描述');
    // 数字 tag 会被收敛成字符串，不会直接抛错。
    assert.ok(Array.isArray(rows[0].tags));
    assert.equal(rows[0].tags.every((tag) => typeof tag === 'string'), true);
  });
});

describe('scanInstalled · version 合并优先级', () => {
  test('_meta.json 的 version 优先于 frontmatter', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'meta-wins', '---\nname: meta-wins\nversion: 1.0.0\n---\n\n# 正文\n');
    await fsp.writeFile(
      path.join(root, 'meta-wins', '_meta.json'),
      JSON.stringify({ version: '9.9.9', securityStatus: 'SAFE' }),
      'utf8',
    );

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].version, '9.9.9', '_meta.json 是本插件写的，可信度更高');
    assert.equal(rows[0].securityStatus, 'SAFE');
  });

  test('没有 _meta.json 时回退到 frontmatter 的 version', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'fm-version', '---\nname: fm-version\nversion: 2.5.1\n---\n\n# 正文\n');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].version, '2.5.1');
  });

  test('frontmatter 的 version 在 metadata.version 里也能读到', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'nested-version', [
      '---',
      'name: nested-version',
      'metadata:',
      '  version: "3.1.3"',
      '---',
      '',
      '# 正文',
    ].join('\n'));

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].version, '3.1.3');
  });

  test('两者都没有 version 时为 null（不是 undefined）', async () => {
    const root = await makeRoot();
    await makeSkillWithMd(root, 'no-version', '---\nname: no-version\n---\n\n# 正文\n');

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].version, null);
    assert.ok(rows[0].version === null, '必须是 null 而不是 undefined');
    assert.equal(JSON.stringify(rows[0].version), 'null');
  });
});

describe('scanInstalled · installedAt', () => {
  test('有 _meta.installedAt 时用它', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'meta-installed-at', {
      meta: { version: '1.0.0', installedAt: '2026-03-04T05:06:07.000Z' },
    });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].installedAt, '2026-03-04T05:06:07.000Z');
  });

  test('没有 _meta.installedAt 时回退到文件 birthtime 或 null', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'birthtime-only');

    const rows = onlyIn(await scanInstalled(root), root);
    const installedAt = rows[0].installedAt;
    // 文件系统支持 birthtime 时给 ISO；不支持时给 null，两者都合法。
    assert.ok(installedAt === null || typeof installedAt === 'string', 'installedAt 只能是 ISO 字符串或 null');
    if (typeof installedAt === 'string') {
      assert.equal(Number.isNaN(Date.parse(installedAt)), false, 'installedAt 必须是可解析的时间');
      // 不能是 1970 epoch 占位值——那会把排序全部压到底部。
      assert.ok(Date.parse(installedAt) > 0, 'installedAt 不能是 1970 占位');
    }
  });

  test('_meta.installedAt 非法时回退 birthtime，不当成有效值', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'bad-installed-at', { meta: { version: '1.0.0', installedAt: 'not-a-date' } });

    const rows = onlyIn(await scanInstalled(root), root);
    const value = rows[0].installedAt;
    assert.ok(value === null || Number.isNaN(Date.parse(value)) === false);
    assert.notEqual(value, 'not-a-date');
  });

  test('installedAt 与 modifiedAt 是两个独立字段', async () => {
    const root = await makeRoot();
    await makeSkill(root, 'two-times', { meta: { installedAt: '2026-01-02T03:04:05.000Z' } });

    const rows = onlyIn(await scanInstalled(root), root);
    assert.equal(rows[0].installedAt, '2026-01-02T03:04:05.000Z');
    // modifiedAt 语义是「内容最后改动」，不能被 installedAt 覆盖。
    assert.equal(typeof rows[0].modifiedAt, 'string');
    assert.notEqual(rows[0].modifiedAt, rows[0].installedAt);
  });
});
