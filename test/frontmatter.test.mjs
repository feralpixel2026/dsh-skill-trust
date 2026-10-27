/**
 * lib/frontmatter.js 的行为测试。
 *
 * 这些用例锁住的是**本机 43 个真实 SKILL.md 里出现过的写法**，不是形式化覆盖率：
 * 41 个技能的元数据只存在于 frontmatter（没有 _meta.json），而其中 description 大量使用
 * `>-` 折叠块、版本有时是 `metadata.version`、有时是无引号数字。解析器一旦在这些地方
 * 失真，界面上就是一批 "vnull" 或半截描述。零依赖：只用 node:test + node:assert/strict。
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseFrontmatter, pickSkillMeta } from '../lib/frontmatter.js';

/** 造一份带 frontmatter 的文档。 */
function doc(frontmatter, body = '\n# 标题\n') {
  return `---\n${frontmatter}\n---\n${body}`;
}

describe('parseFrontmatter 基本形状', () => {
  test('标准 frontmatter 切出 body', () => {
    const result = parseFrontmatter(doc('name: demo\ndescription: 测试', '\n# Demo\n\n正文\n'));
    assert.equal(result.hasFrontmatter, true);
    assert.deepEqual(result.frontmatter, { name: 'demo', description: '测试' });
    assert.equal(result.body, '\n# Demo\n\n正文\n');
  });

  test('没有 frontmatter 的纯 markdown 不抛异常', () => {
    const text = '# 只有正文\n\n没有 YAML。\n';
    const result = parseFrontmatter(text);
    assert.equal(result.hasFrontmatter, false);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, text);
  });

  test('空文件不抛异常', () => {
    const result = parseFrontmatter('');
    assert.equal(result.hasFrontmatter, false);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, '');
  });

  test('非字符串输入降级为空文本，不抛异常', () => {
    for (const input of [null, undefined, 42, {}, []]) {
      const result = parseFrontmatter(input);
      assert.equal(result.hasFrontmatter, false);
      assert.deepEqual(result.frontmatter, {});
      assert.equal(typeof result.body, 'string');
    }
  });

  test('只有开头 --- 没有结尾 --- 不抛异常', () => {
    const result = parseFrontmatter('---\nname: broken\ndescription: 没闭合\n');
    assert.equal(result.hasFrontmatter, false);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, '---\nname: broken\ndescription: 没闭合\n');
  });

  test('开头的 BOM 与前导空行不影响识别', () => {
    const result = parseFrontmatter(`\uFEFF\n\n${doc('name: bom-demo')}`);
    assert.equal(result.hasFrontmatter, true);
    assert.equal(result.frontmatter.name, 'bom-demo');
  });

  test('CRLF 换行能正常解析', () => {
    const result = parseFrontmatter('---\r\nname: crlf\r\ndescription: 测试\r\n---\r\n\r\n# 正文\r\n');
    assert.equal(result.hasFrontmatter, true);
    assert.equal(result.frontmatter.name, 'crlf');
    assert.equal(result.frontmatter.description, '测试');
  });

  test('不是文件开头第一行的 --- 不当作 frontmatter', () => {
    const result = parseFrontmatter('# 标题\n\n---\nname: later\n---\n');
    assert.equal(result.hasFrontmatter, false);
  });
});

describe('parseFrontmatter 标量', () => {
  test('单行标量、双引号、单引号都能去引号', () => {
    const result = parseFrontmatter(doc('a: plain\nb: "double"\nc: \'single\''));
    assert.equal(result.frontmatter.a, 'plain');
    assert.equal(result.frontmatter.b, 'double');
    assert.equal(result.frontmatter.c, 'single');
  });

  test('单引号内的成对单引号还原为一个', () => {
    const result = parseFrontmatter(doc("a: 'it''s fine'"));
    assert.equal(result.frontmatter.a, "it's fine");
  });

  test('值里含冒号不被截断（self-improving-agent 真实写法）', () => {
    const result = parseFrontmatter(
      doc('name: self-improving-agent\ndescription: "Use when: (1) A command fails, (2) User corrects Codex"'),
    );
    assert.equal(result.frontmatter.name, 'self-improving-agent');
    assert.equal(
      result.frontmatter.description,
      'Use when: (1) A command fails, (2) User corrects Codex',
    );
  });

  test('不带引号的值里含冒号也不截断', () => {
    const result = parseFrontmatter(doc('note: see http://example.com/a:b 后面还有文本'));
    assert.equal(result.frontmatter.note, 'see http://example.com/a:b 后面还有文本');
  });

  test('数字、布尔与 null 会被类型化', () => {
    const result = parseFrontmatter(doc('int: 42\nfloat: 1.5\nbool: true\nnone: null\ntilde: ~'));
    assert.equal(result.frontmatter.int, 42);
    assert.equal(result.frontmatter.float, 1.5);
    assert.equal(result.frontmatter.bool, true);
    assert.equal(result.frontmatter.none, null);
    assert.equal(result.frontmatter.tilde, null);
  });

  test('0.0.3 这种两段点号不当数字，保持原文', () => {
    const result = parseFrontmatter(doc('version: 0.0.3'));
    assert.equal(result.frontmatter.version, '0.0.3');
  });

  test('键名大小写与连字符原样保留', () => {
    const result = parseFrontmatter(doc('Display_Name: X\ndisable-model-invocation: true'));
    assert.equal(result.frontmatter['Display_Name'], 'X');
    assert.equal(result.frontmatter['disable-model-invocation'], true);
  });

  test('行尾注释被去掉，引号内的 # 保留', () => {
    const result = parseFrontmatter(doc('a: value # 注释\nb: "keep # inside"'));
    assert.equal(result.frontmatter.a, 'value');
    assert.equal(result.frontmatter.b, 'keep # inside');
  });
});

describe('parseFrontmatter 块标量', () => {
  test('>- 折叠块把换行合并为空格', () => {
    const result = parseFrontmatter(
      doc(['description: >-', '  A live React app that the user can open', '  beside the chat. You MUST read this skill', '  before touching any .canvas.tsx file.'].join('\n')),
    );
    assert.equal(
      result.frontmatter.description,
      'A live React app that the user can open beside the chat. You MUST read this skill before touching any .canvas.tsx file.',
    );
  });

  test('| 字面块保留换行', () => {
    const result = parseFrontmatter(doc(['description: |', '  第一行', '  第二行'].join('\n')));
    assert.equal(result.frontmatter.description, '第一行\n第二行\n');
  });

  test('> 无修饰符同样折叠', () => {
    const result = parseFrontmatter(doc(['a: >', '  one', '  two'].join('\n')));
    assert.equal(result.frontmatter.a, 'one two\n');
  });

  test('折叠块内的空行保留为换行', () => {
    const result = parseFrontmatter(doc(['a: >-', '  one', '', '  two'].join('\n')));
    assert.equal(result.frontmatter.a, 'one\ntwo');
  });

  test('块标量之后的兄弟键仍能解析（缩进退出正确）', () => {
    const result = parseFrontmatter(
      doc(['name: update-cli-config', 'description: >-', '  View and modify Codex CLI configuration.', 'metadata:', '  surfaces:', '    - cli'].join('\n')),
    );
    assert.equal(result.frontmatter.name, 'update-cli-config');
    // `>-` 的 `-` 是 strip chomping：结尾换行被去掉，这是 YAML 规范行为
    assert.equal(result.frontmatter.description, 'View and modify Codex CLI configuration.');
    assert.deepEqual(result.frontmatter.metadata, { surfaces: ['cli'] });
  });

  test('块标量内出现 --- 不会提前结束 frontmatter', () => {
    const text = '---\ndescription: |\n  正文里有 --- 分隔线\nname: after\n---\n\n# body\n';
    const result = parseFrontmatter(text);
    // 缩进的 ---- 行不满足「整行就是 ---」，frontmatter 在真正的结束行收尾
    assert.equal(result.hasFrontmatter, true);
    assert.equal(result.frontmatter.description, '正文里有 --- 分隔线\n');
    assert.equal(result.frontmatter.name, 'after');
  });

  test('中文折叠块不丢字', () => {
    const result = parseFrontmatter(
      doc(['description: >-', '  这是一个面向中文创作者的 Skill，', '  输入主题后输出提示词。'].join('\n')),
    );
    assert.equal(result.frontmatter.description, '这是一个面向中文创作者的 Skill， 输入主题后输出提示词。');
  });
});

describe('parseFrontmatter 数组与嵌套', () => {
  test('flow 数组 [a, b] 解析为字符串数组', () => {
    const result = parseFrontmatter(doc('tags: [design, cover, "with, comma"]'));
    assert.deepEqual(result.frontmatter.tags, ['design', 'cover', 'with, comma']);
  });

  test('flow 数组内的数字保留类型', () => {
    const result = parseFrontmatter(doc('nums: [1, 2, 3]'));
    assert.deepEqual(result.frontmatter.nums, [1, 2, 3]);
  });

  test('跨行 flow 数组能拼平', () => {
    const result = parseFrontmatter(doc('tags: [design, cover,\n  branding, prompt]'));
    assert.deepEqual(result.frontmatter.tags, ['design', 'cover', 'branding', 'prompt']);
  });

  test('块数组（- a 每行一项）解析为数组', () => {
    const result = parseFrontmatter(doc(['tags:', '  - design', '  - thumbnail', '  - cover'].join('\n')));
    assert.deepEqual(result.frontmatter.tags, ['design', 'thumbnail', 'cover']);
  });

  test('块数组与父键同缩进也能解析', () => {
    const result = parseFrontmatter(doc(['environments:', '- local', '- cloud', 'name: x'].join('\n')));
    assert.deepEqual(result.frontmatter.environments, ['local', 'cloud']);
    assert.equal(result.frontmatter.name, 'x');
  });

  test('metadata 一层嵌套，metadata.version 被保留', () => {
    const result = parseFrontmatter(doc(['name: douyin-cover-builder', 'metadata:', '  version: "3.1.3"'].join('\n')));
    assert.deepEqual(result.frontmatter.metadata, { version: '3.1.3' });
  });

  test('嵌套 map 里同时有标量与数组', () => {
    const result = parseFrontmatter(
      doc(['metadata:', '  version: "37"', '  tool_count: 170', '  surfaces:', '    - ide', '    - cloud'].join('\n')),
    );
    assert.deepEqual(result.frontmatter.metadata, {
      version: '37',
      tool_count: 170,
      surfaces: ['ide', 'cloud'],
    });
  });

  test('空值键给出空对象而不是抛异常', () => {
    const result = parseFrontmatter(doc('metadata:\nname: after'));
    assert.deepEqual(result.frontmatter.metadata, {});
    assert.equal(result.frontmatter.name, 'after');
  });
});

describe('pickSkillMeta 字段抽取', () => {
  test('基础字段：name / displayName 兜底 / description', () => {
    const { frontmatter } = parseFrontmatter(doc('name: demo\ndescription: 一个测试技能'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.name, 'demo');
    assert.equal(meta.displayName, 'demo');
    assert.equal(meta.description, '一个测试技能');
    assert.equal(meta.version, null);
    assert.deepEqual(meta.tags, []);
    assert.equal(meta.userInvocable, null);
    assert.equal(meta.modelInvocable, null);
    assert.equal(meta.visibility, null);
    assert.deepEqual(meta.environments, []);
  });

  test('display_name 优先作为 displayName', () => {
    const { frontmatter } = parseFrontmatter(doc('name: qqmusic\ndisplay_name: "QQ音乐助手"'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.displayName, 'QQ音乐助手');
    assert.equal(meta.name, 'qqmusic');
  });

  test('description_zh 单独抽取，不影响 description', () => {
    const { frontmatter } = parseFrontmatter(
      doc('name: qqmusic\ndescription: English text\ndescription_zh: "QQ音乐助理"'),
    );
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.description, 'English text');
    assert.equal(meta.descriptionZh, 'QQ音乐助理');
  });

  test('version 是数字 0.0.3 时转成字符串 "0.0.3"（qqmusic 真实写法）', () => {
    const { frontmatter } = parseFrontmatter(doc('name: qqmusic\nversion: 0.0.3'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.version, '0.0.3');
    assert.equal(typeof meta.version, 'string');
  });

  test('数字版本 42 转成 "42"', () => {
    const { frontmatter } = parseFrontmatter(doc('version: 42'));
    assert.equal(pickSkillMeta(frontmatter).version, '42');
  });

  test('顶层 version 缺失时回落到 metadata.version', () => {
    const { frontmatter } = parseFrontmatter(doc(['name: douyin-cover-builder', 'metadata:', '  version: "3.1.3"'].join('\n')));
    assert.equal(pickSkillMeta(frontmatter).version, '3.1.3');
  });

  test('顶层 version 优先于 metadata.version', () => {
    const { frontmatter } = parseFrontmatter(
      doc(['version: "4.0.2"', 'metadata:', '  version: "3.1.3"'].join('\n')),
    );
    assert.equal(pickSkillMeta(frontmatter).version, '4.0.2');
  });

  test('metadata 不是对象时不抛异常，版本退回 null', () => {
    const { frontmatter } = parseFrontmatter(doc('name: x\nmetadata: not-a-map'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.version, null);
    assert.equal(meta.name, 'x');
  });

  test('tags 支持块数组（douyin-cover-builder 真实写法）', () => {
    const { frontmatter } = parseFrontmatter(
      doc(['tags:', '  - design', '  - thumbnail', '  - cover', 'user-invocable: true'].join('\n')),
    );
    const meta = pickSkillMeta(frontmatter);
    assert.deepEqual(meta.tags, ['design', 'thumbnail', 'cover']);
    assert.equal(meta.userInvocable, true);
  });

  test('tags 支持 flow 数组并去重', () => {
    const { frontmatter } = parseFrontmatter(doc('tags: [a, b, a]'));
    assert.deepEqual(pickSkillMeta(frontmatter).tags, ['a', 'b']);
  });

  test('disable-model-invocation: true → modelInvocable=false', () => {
    const { frontmatter } = parseFrontmatter(doc('name: rename-chat\ndisable-model-invocation: true'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.modelInvocable, false);
    assert.equal(meta.userInvocable, null);
  });

  test('disable-model-invocation: false → modelInvocable=true', () => {
    const { frontmatter } = parseFrontmatter(doc('disable-model-invocation: false'));
    assert.equal(pickSkillMeta(frontmatter).modelInvocable, true);
  });

  test('user-invocable 支持字符串形式 "true"', () => {
    const { frontmatter } = parseFrontmatter(doc('user-invocable: "true"'));
    assert.equal(pickSkillMeta(frontmatter).userInvocable, true);
  });

  test('environments 与 disabled-environments 合并去重', () => {
    const { frontmatter } = parseFrontmatter(
      doc(['environments:', '  - local', 'disabled-environments:', '  - cloud', '  - local'].join('\n')),
    );
    const meta = pickSkillMeta(frontmatter);
    assert.deepEqual(meta.environments, ['local', 'cloud']);
    // 原始区分仍然可查
    assert.deepEqual(meta.raw['disabled-environments'], ['cloud', 'local']);
  });

  test('visibility 抽取', () => {
    const { frontmatter } = parseFrontmatter(doc('visibility: "public"'));
    assert.equal(pickSkillMeta(frontmatter).visibility, 'public');
  });

  test('raw 保留原始 frontmatter，未识别键不丢', () => {
    const { frontmatter } = parseFrontmatter(doc('name: x\nchangelog: "见 CHANGELOG.md"\ncustom-key: keep'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.raw.changelog, '见 CHANGELOG.md');
    assert.equal(meta.raw['custom-key'], 'keep');
  });

  test('折叠块 description 进 pickSkillMeta 后是单行', () => {
    const { frontmatter } = parseFrontmatter(
      doc(['description: >-', '  line one', '  line two', '  line three'].join('\n')),
    );
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.description, 'line one line two line three');
    assert.ok(!meta.description.includes('\n'));
  });

  test('| 字面块的 description 在 pickSkillMeta 里压成单行', () => {
    const { frontmatter } = parseFrontmatter(doc(['description: |', '  第一行', '  第二行'].join('\n')));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.description, '第一行 第二行');
  });

  test('空字符串与纯空白字段一律 null', () => {
    const { frontmatter } = parseFrontmatter(doc('name: x\ndescription: ""\nversion: "  "\nvisibility: ""'));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(meta.description, null);
    assert.equal(meta.version, null);
    assert.equal(meta.visibility, null);
  });

  test('pickSkillMeta 收到非对象输入不抛异常', () => {
    for (const input of [null, undefined, 'string', 42, []]) {
      const meta = pickSkillMeta(input);
      assert.equal(meta.name, null);
      assert.equal(meta.description, null);
      assert.equal(meta.version, null);
      assert.deepEqual(meta.tags, []);
      assert.deepEqual(meta.raw, {});
    }
  });
});

describe('真实样本回归（本机 ~/.agents/skills 原文）', () => {
  test('self-improving-agent：双引号值内含多个冒号，不截断', () => {
    const raw = [
      'name: self-improving-agent',
      'description: "Captures learnings, errors, and corrections to enable continuous improvement. Use when: (1) A command or operation fails unexpectedly, (2) User corrects Codex (\'No, that\'s wrong...\', \'Actually...\'), (3) User requests a capability that doesn\'t exist, (4) An external API or tool fails, (5) Codex realizes its knowledge is outdated or incorrect, (6) A better approach is discovered for a recurring task. Also review learnings before major tasks."',
      'version: "4.0.2"',
      'metadata:',
    ].join('\n');
    const { frontmatter, hasFrontmatter } = parseFrontmatter(doc(raw));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(hasFrontmatter, true);
    assert.equal(meta.name, 'self-improving-agent');
    assert.equal(meta.version, '4.0.2');
    assert.ok(meta.description.startsWith('Captures learnings'));
    // 冒号后面的内容必须完整保留
    assert.ok(meta.description.includes('Use when: (1) A command or operation fails unexpectedly'));
    assert.ok(meta.description.includes('(6) A better approach is discovered for a recurring task.'));
    assert.ok(meta.description.endsWith('Also review learnings before major tasks.'));
  });

  test('canvas：>- 折叠块 11 行合并且内容不丢', () => {
    const raw = [
      'name: canvas',
      'description: >-',
      '  A Codex Canvas is a live React app that the user can open beside the chat.',
      '  You MUST use a canvas when the agent produces a standalone analytical artifact',
      '  — quantitative analyses, billing investigations, security audits, architecture',
      '  reviews, data-heavy content, timelines, charts, tables, interactive',
      '  explorations, repeatable tools, or any response that benefits from visual',
      '  layout.',
      'metadata:',
      '  surfaces:',
      '    - ide',
      '    - cloud',
      'environments:',
      '  - local',
      '  - cloud',
    ].join('\n');
    const { frontmatter, hasFrontmatter } = parseFrontmatter(doc(raw));
    const meta = pickSkillMeta(frontmatter);
    assert.equal(hasFrontmatter, true);
    assert.equal(meta.name, 'canvas');
    assert.equal(
      meta.description,
      'A Codex Canvas is a live React app that the user can open beside the chat. You MUST use a canvas when the agent produces a standalone analytical artifact — quantitative analyses, billing investigations, security audits, architecture reviews, data-heavy content, timelines, charts, tables, interactive explorations, repeatable tools, or any response that benefits from visual layout.',
    );
    assert.deepEqual(meta.environments, ['local', 'cloud']);
    assert.deepEqual(meta.raw.metadata, { surfaces: ['ide', 'cloud'] });
  });

  test('douyin-cover-builder：tags 块数组 + user-invocable + metadata.version', () => {
    const raw = [
      'name: douyin-cover-builder',
      'description: 这是一个面向中文创作者的 OpenClaw Skill，输入主题与人物气质后，会输出可直接用于生图模型的高质量提示词与创意说明。',
      'tags:',
      '  - design',
      '  - thumbnail',
      '  - cover',
      'user-invocable: true',
      'disable-model-invocation: false',
      'metadata:',
      '  version: "3.1.3"',
    ].join('\n');
    const meta = pickSkillMeta(parseFrontmatter(doc(raw)).frontmatter);
    assert.equal(meta.name, 'douyin-cover-builder');
    assert.equal(meta.version, '3.1.3');
    assert.deepEqual(meta.tags, ['design', 'thumbnail', 'cover']);
    assert.equal(meta.userInvocable, true);
    assert.equal(meta.modelInvocable, true);
    assert.ok(meta.description.startsWith('这是一个面向中文创作者的'));
  });

  test('qqmusic：无引号数字版本 + display_name + visibility + 中英双描述', () => {
    const raw = [
      'name: qqmusic',
      'description: QQ Music — search songs, albums, playlists; AI-powered playlists.',
      'version: 0.0.3',
      'display_name: "QQ音乐助手"',
      'visibility: "public"',
    ].join('\n');
    const meta = pickSkillMeta(parseFrontmatter(doc(raw)).frontmatter);
    assert.equal(meta.version, '0.0.3');
    assert.equal(meta.displayName, 'QQ音乐助手');
    assert.equal(meta.visibility, 'public');
    assert.equal(meta.description, 'QQ Music — search songs, albums, playlists; AI-powered playlists.');
  });

  test('prototype-ui-designer：双引号中文长描述 + version + 嵌套 metadata', () => {
    const raw = [
      'name: prototype-ui-designer',
      'description: "Gitee 家族化产品原型设计与开发规范（Agent 选型时代）：外壳与基础件以 SCA/SCM 为准。触发词：原型、prototype、页面、菜单、列表页。"',
      'version: "1.8.0"',
      'metadata:',
      '  authority: "规范来源三级：① sca/scm 两原型现行 UI ② devops-prototype 多产品实测"',
    ].join('\n');
    const meta = pickSkillMeta(parseFrontmatter(doc(raw)).frontmatter);
    assert.equal(meta.version, '1.8.0');
    assert.ok(meta.description.includes('触发词：原型、prototype'));
    assert.equal(typeof meta.raw.metadata.authority, 'string');
  });
});
