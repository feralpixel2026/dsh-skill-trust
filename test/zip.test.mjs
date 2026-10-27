/**
 * ZIP 解包的安全边界测试。
 *
 * 这些用例构造真实的恶意 ZIP —— 路径逃逸、符号链接、异常压缩方法 —— 来验证
 * lib/zip.js 会拒绝而不是"尽力而为"。下载的制品来自第三方，任何一条漏掉都意味着
 * 别人的压缩包可以写到任意位置。
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import zlib from 'node:zlib';

import { containsPath, readZip, writeSkillTree } from '../lib/zip.js';

/* -------------------------------------------------------------------------- *
 * 构造 ZIP 的最小实现（只为造测试样本，不用于生产）
 * -------------------------------------------------------------------------- */

/** 造一个 stored(deflate=false) 或 deflated 的单文件 ZIP。 */
function buildZip(entries, options = {}) {
  const deflate = options.deflate === true;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8');
    const stored = deflate ? zlib.deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    // Unix 来源（高字节 3），便于写符号链接的权限位。
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(entry.externalAttributes ?? 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + stored.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, centralPart, eocd]);
}

/** ZIP 用的 CRC32，只为让样本合法。 */
function crc32(buffer) {
  let table = crc32.table;
  if (table === undefined) {
    table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------------- *
 * 正常路径
 * -------------------------------------------------------------------------- */

test('正常 ZIP 能解出文件并算出稳定指纹', async () => {
  const zip = buildZip([
    { name: 'SKILL.md', data: '# 技能' },
    { name: 'docs/NOTES.md', data: 'notes' },
  ]);
  const parsed = await readZip(zip);
  assert.equal(parsed.files.length, 2);
  assert.deepEqual(parsed.files.map((file) => file.path), ['SKILL.md', 'docs/NOTES.md']);
  assert.equal(parsed.files[0].bytes.toString('utf8'), '# 技能');

  const again = await readZip(zip);
  assert.equal(parsed.digest, again.digest, '同一输入必须得到同一指纹');
});

test('deflate 压缩的条目能正确解压', async () => {
  const content = 'A'.repeat(4096);
  const parsed = await readZip(buildZip([{ name: 'big.txt', data: content }], { deflate: true }));
  assert.equal(parsed.files[0].bytes.length, content.length);
  assert.equal(parsed.files[0].bytes.toString('utf8'), content);
});

/* -------------------------------------------------------------------------- *
 * 攻击面：路径逃逸
 * -------------------------------------------------------------------------- */

test('拒绝 .. 路径逃逸', async () => {
  for (const name of ['../evil.txt', '../../evil.txt', 'docs/../../evil.txt']) {
    await assert.rejects(
      () => readZip(buildZip([{ name, data: 'x' }])),
      /路径非法/,
      `${name} 应当被拒绝`,
    );
  }
});

test('拒绝绝对路径与 Windows 盘符', async () => {
  for (const name of ['/etc/passwd', 'C:/Windows/system32/x.dll', '\\\\server\\share\\x']) {
    await assert.rejects(() => readZip(buildZip([{ name, data: 'x' }])), /路径非法/, `${name} 应当被拒绝`);
  }
});

test('拒绝空段路径', async () => {
  await assert.rejects(() => readZip(buildZip([{ name: 'a//b.txt', data: 'x' }])), /路径非法/);
});

/* -------------------------------------------------------------------------- *
 * 攻击面：符号链接与特殊条目
 * -------------------------------------------------------------------------- */

test('拒绝符号链接条目', async () => {
  // Unix 文件类型 0xA000 表示符号链接，权限位放在 externalAttributes 高 16 位。
  const zip = buildZip([{ name: 'link', data: '/etc/passwd', externalAttributes: 0xa1ff0000 }]);
  await assert.rejects(() => readZip(zip), /符号链接/);
});

/* -------------------------------------------------------------------------- *
 * 攻击面：损坏与超限
 * -------------------------------------------------------------------------- */

test('拒绝不是 ZIP 的输入', async () => {
  await assert.rejects(() => readZip(Buffer.from('this is not a zip at all, just text')), /不是有效的 ZIP/);
});

test('拒绝被截断的 ZIP', async () => {
  const zip = buildZip([{ name: 'SKILL.md', data: 'x' }]);
  await assert.rejects(() => readZip(zip.subarray(0, zip.length - 10)), /不是有效的 ZIP/);
});

/* -------------------------------------------------------------------------- *
 * 落盘边界
 * -------------------------------------------------------------------------- */

test('writeSkillTree 拒绝非法目录名', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dst-zip-'));
  try {
    for (const slug of ['..', '.', 'a/b', 'a\\b', '']) {
      await assert.rejects(
        () => writeSkillTree(root, slug, [{ path: 'SKILL.md', bytes: Buffer.from('x') }]),
        /目录名非法|逃逸/,
        `${slug} 应当被拒绝`,
      );
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('writeSkillTree 正常落盘并保持相对路径结构', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dst-zip-'));
  try {
    const { dir, written } = await writeSkillTree(root, 'demo-skill', [
      { path: 'SKILL.md', bytes: Buffer.from('# demo') },
      { path: 'docs/NOTES.md', bytes: Buffer.from('notes') },
    ]);
    assert.equal(written.length, 2);
    assert.equal(await fsp.readFile(path.join(dir, 'SKILL.md'), 'utf8'), '# demo');
    assert.equal(await fsp.readFile(path.join(dir, 'docs', 'NOTES.md'), 'utf8'), 'notes');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('containsPath 判定目标必须位于根目录内', () => {
  const root = path.resolve('/tmp/skills');
  assert.equal(containsPath(root, path.join(root, 'a', 'b.txt')), true);
  assert.equal(containsPath(root, path.resolve('/tmp/skills-evil/x')), false);
  assert.equal(containsPath(root, path.resolve('/etc/passwd')), false);
  assert.equal(containsPath(root, root), false, '根目录本身不算"在内部"');
});
