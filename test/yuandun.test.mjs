/**
 * 源盾接口客户端的参数拼装测试。
 *
 * 这些断言来自开发期对真实接口的探测结果——每一条都对应一个真实踩过的坑，
 * 不是形式化的覆盖率。改 lib/yuandun.js 时如果这些测试红了，说明改动会破坏
 * 线上行为，不要为了让测试通过而放宽断言。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CATEGORY_VALUES,
  DIMENSION_LABELS,
  MAX_PAGE_SIZE,
  SORT_VALUES,
  normalizeCapability,
  searchSkills,
} from '../lib/yuandun.js';

/** 用一个假 fetch 捕获实际发出的 URL，并返回可控的响应。 */
function captureFetch(payload) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => payload,
      text: async () => '',
    };
  };
  return { calls, fetchImpl };
}

/** 临时替换全局 fetch，测试结束自动还原。 */
async function withFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const EMPTY_PAGE = { result: true, message: 'OK', data: { items: [], nextCursor: null, hasMore: false } };

test('sortBy 非法值回退到 COMPREHENSIVE，不把非法参数发给上游', async () => {
  const { calls, fetchImpl } = captureFetch(EMPTY_PAGE);
  await withFetch(fetchImpl, () => searchSkills('https://example.test', { sortBy: 'NOT_A_SORT' }));
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('sortBy'), 'COMPREHENSIVE');
});

test('sortBy 四个合法值原样透传', async () => {
  for (const sortBy of SORT_VALUES) {
    const { calls, fetchImpl } = captureFetch(EMPTY_PAGE);
    await withFetch(fetchImpl, () => searchSkills('https://example.test', { sortBy }));
    assert.equal(new URL(calls[0]).searchParams.get('sortBy'), sortBy);
  }
});

test('pageSize 上限 30 —— 传 60 会被钳制，避免上游 400', async () => {
  // 文档规定 pageSize 取值 1-30，超出返回 400「pageSize 必须在 1-30 之间」。
  assert.equal(MAX_PAGE_SIZE, 30);

  const oversize = captureFetch(EMPTY_PAGE);
  await withFetch(oversize.fetchImpl, () => searchSkills('https://example.test', { pageSize: 60 }));
  assert.equal(new URL(oversize.calls[0]).searchParams.get('pageSize'), '30');

  // 0 / 负数 / 非法值一律回退到默认 20（Number(x) || 20），而不是发 0 让上游报错。
  const zero = captureFetch(EMPTY_PAGE);
  await withFetch(zero.fetchImpl, () => searchSkills('https://example.test', { pageSize: 0 }));
  assert.equal(new URL(zero.calls[0]).searchParams.get('pageSize'), '20');

  const negative = captureFetch(EMPTY_PAGE);
  await withFetch(negative.fetchImpl, () => searchSkills('https://example.test', { pageSize: -5 }));
  assert.equal(new URL(negative.calls[0]).searchParams.get('pageSize'), '1');
});

test('有 cursor 时只带 cursor，不带 page', async () => {
  // 上游的游标（keyset）分页要求：翻页只回传 nextCursor，不能同时发页码。
  // lib/yuandun.js 的列表请求本来就不发 page，这里锁住这个契约，
  // 防止以后有人"顺手补个页码"把翻页弄坏。
  const withCursor = captureFetch(EMPTY_PAGE);
  await withFetch(withCursor.fetchImpl, () => searchSkills('https://example.test', { cursor: 'abc123', page: 3 }));
  const cursorUrl = new URL(withCursor.calls[0]);
  assert.equal(cursorUrl.searchParams.get('cursor'), 'abc123');
  assert.equal(cursorUrl.searchParams.get('page'), null, '有游标时不应再发页码');

  // 首屏没有 cursor 时，请求里根本不该出现 cursor 参数（空串会被过滤掉）。
  const without = captureFetch(EMPTY_PAGE);
  await withFetch(without.fetchImpl, () => searchSkills('https://example.test', {}));
  const plainUrl = new URL(without.calls[0]);
  assert.equal(plainUrl.searchParams.get('cursor'), null, '空游标不应发送');
  assert.equal(plainUrl.searchParams.get('sortBy'), 'COMPREHENSIVE');
});

test('category 只接受中文显示名 —— 英文枚举必须被丢弃', async () => {
  // 真实坑：列表接口的 category 传 `SOFTWARE_DEV` 会返回 400，
  // 只有显示名（如「软件研发」）才是合法筛选值。
  assert.ok(CATEGORY_VALUES.includes('软件研发'));
  assert.ok(!CATEGORY_VALUES.includes('SOFTWARE_DEV'));

  const rejected = captureFetch(EMPTY_PAGE);
  await withFetch(rejected.fetchImpl, () => searchSkills('https://example.test', { category: 'SOFTWARE_DEV' }));
  assert.equal(new URL(rejected.calls[0]).searchParams.get('category'), null);

  const accepted = captureFetch(EMPTY_PAGE);
  await withFetch(accepted.fetchImpl, () => searchSkills('https://example.test', { category: '软件研发' }));
  assert.equal(new URL(accepted.calls[0]).searchParams.get('category'), '软件研发');
});

test('securityStatus 只透传枚举值，ALL 与空值都不发', async () => {
  const all = captureFetch(EMPTY_PAGE);
  await withFetch(all.fetchImpl, () => searchSkills('https://example.test', { securityStatus: 'ALL' }));
  assert.equal(new URL(all.calls[0]).searchParams.get('securityStatus'), null);

  const safe = captureFetch(EMPTY_PAGE);
  await withFetch(safe.fetchImpl, () => searchSkills('https://example.test', { securityStatus: 'SAFE' }));
  assert.equal(new URL(safe.calls[0]).searchParams.get('securityStatus'), 'SAFE');
});

test('nextCursor 为 null 时判定为末页', async () => {
  const last = captureFetch({ result: true, data: { items: [], nextCursor: null, hasMore: true } });
  const lastPage = await withFetch(last.fetchImpl, () => searchSkills('https://example.test', {}));
  // 文档：以 nextCursor 为准，hasMore 只是便利标志。
  assert.equal(lastPage.nextCursor, null);
});

test('卡片字段归一：installs 映射到 installs，null 的 runtimeType 不产生标签', async () => {
  const payload = {
    result: true,
    data: {
      items: [{
        name: 'owner/skill',
        displayName: '示例技能',
        nameZh: null,
        logoUrl: null,
        status: 'ONLINE',
        securityStatus: 'SUSPECTED',
        securityStatusName: '疑似风险',
        description: '简介',
        category: '内容与创作',
        runtimeType: null,
        starCount: 4,
        installs: 100,
        currentVersion: '1.0.0',
      }],
      nextCursor: null,
      hasMore: false,
    },
  };
  const { fetchImpl } = captureFetch(payload);
  const page = await withFetch(fetchImpl, () => searchSkills('https://example.test', {}));
  const card = page.items[0];
  assert.equal(card.owner, 'owner');
  assert.equal(card.slug, 'skill');
  assert.equal(card.installs, 100);
  assert.equal(card.starCount, 4);
  assert.equal(card.runtimeType, null);
  assert.equal(card.runtimeLabel, null);
  assert.equal(card.securityStatusName, '疑似风险');
});

test('上游 result:false 抛出带状态码的错误', async () => {
  const { fetchImpl } = captureFetch({ result: false, message: '访问过于频繁', data: null });
  await assert.rejects(
    () => withFetch(fetchImpl, () => searchSkills('https://example.test', {})),
    (error) => {
      assert.match(error.message, /访问过于频繁/);
      return true;
    },
  );
});

test('能力画像未完成时不渲染分析字段', async () => {
  // 文档：capabilityStatus 非 SUCCEEDED 时其余字段均为 null，
  // 客户端应显示「分析中」，不该渲染空卡片。
  const pending = normalizeCapability({ capabilityStatus: 'PROCESSING', skillDescription: null, capabilityTags: null });
  assert.equal(pending.ready, false);
  assert.equal(pending.capabilityTags, undefined);

  const done = normalizeCapability({
    capabilityStatus: 'SUCCEEDED',
    functionSummary: '摘要',
    capabilityTags: ['a', 'b'],
    usageScenarios: ['x'],
    skillWorkflow: ['1. y'],
    runtimeDependencies: [{ name: 'zod', type: 'npm' }],
  });
  assert.equal(done.ready, true);
  assert.deepEqual(done.capabilityTags, ['a', 'b']);
  assert.equal(done.runtimeDependencies[0].name, 'zod');
});

test('六维审计的维度编码是文档固定的六个', () => {
  assert.deepEqual(Object.keys(DIMENSION_LABELS).sort(), [
    'anomaly_detection',
    'code_security',
    'data_security',
    'dependency_security',
    'instruction_security',
    'permission_security',
  ]);
});
