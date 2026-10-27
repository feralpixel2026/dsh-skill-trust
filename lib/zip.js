/**
 * ZIP 解包与技能落盘。
 *
 * 源盾的下载接口返回当前版本的 ZIP 制品。这里只做最小必要的事：解析中央
 * 目录、按需 inflate、校验每条路径不逃逸目标目录，然后写入磁盘。
 *
 * 安全边界（任何一条不满足即整体拒绝，不部分写入）：
 * - 只接受 stored(0) 与 deflate(8) 两种压缩方法；
 * - 拒绝绝对路径、盘符、`..` 段、反斜杠、空段；
 * - 单文件与总解压体积均设上限，防 zip bomb；
 * - 拒绝符号链接条目（外部属性高 16 位为 0xA000）。
 */
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const MAX_ENTRIES = 2000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;

/** 定位 End of Central Directory 记录（签名 0x06054b50）。 */
function findEocd(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

/** 把条目路径规范化为 POSIX 相对路径，非法时返回 null。 */
function safeRelative(rawName) {
  if (typeof rawName !== 'string' || rawName === '') return null;
  const name = rawName.replace(/\\/g, '/');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return null;
  // 保留空段再逐段校验：`a//../../b` 若先过滤空段会退化成看似合法的路径，
  // 因此空段本身必须判为非法，而不是静默折叠。
  const segments = name.split('/');
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (segment === '') return null;
    if (segment === '.' || segment === '..') return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(segment)) return null;
  }
  return segments.join('/');
}

/**
 * 解析 ZIP 并返回内存中的文件清单。
 *
 * @returns {Promise<{ files: Array<{ path: string, bytes: Buffer }>, totalBytes: number, digest: string }>}
 */
export async function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error('不是有效的 ZIP：内容过短');
  }
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new Error('不是有效的 ZIP：找不到中央目录');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > MAX_ENTRIES) throw new Error(`ZIP 条目数超过 ${MAX_ENTRIES} 上限`);
  if (directoryOffset >= buffer.length) throw new Error('不是有效的 ZIP：中央目录越界');

  const files = [];
  let totalBytes = 0;
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) throw new Error('不是有效的 ZIP：中央目录项被截断');
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('不是有效的 ZIP：中央目录项签名不符');

    const madeBy = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;

    // 目录条目（名称以 / 结尾）跳过，不当作文件。
    if (rawName.endsWith('/') || rawName.endsWith('\\')) continue;
    // 加密条目无法读取，直接拒绝而不是产出坏文件。
    if ((flags & 0x0001) !== 0) throw new Error(`ZIP 条目已加密：${rawName}`);

    const relative = safeRelative(rawName);
    if (relative === null) throw new Error(`ZIP 条目路径非法：${rawName}`);

    // 符号链接：Unix 权限位高 16 位，文件类型 0xA000。
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if (madeBy >> 8 === 3 && (unixMode & 0xf000) === 0xa000) {
      throw new Error(`ZIP 包含符号链接，已拒绝：${relative}`);
    }

    if (uncompressedSize > MAX_FILE_BYTES) {
      throw new Error(`ZIP 条目过大：${relative}`);
    }
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`ZIP 解压总量超过 ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB 上限`);
    }

    if (localOffset + 30 > buffer.length) throw new Error(`ZIP 条目偏移越界：${relative}`);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP 本地头签名不符：${relative}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`ZIP 条目数据越界：${relative}`);
    const raw = buffer.subarray(dataStart, dataEnd);

    let bytes;
    if (method === 0) {
      bytes = Buffer.from(raw);
    } else if (method === 8) {
      try {
        bytes = zlib.inflateRawSync(raw, { maxOutputLength: MAX_FILE_BYTES });
      } catch {
        throw new Error(`ZIP 条目解压失败：${relative}`);
      }
    } else {
      throw new Error(`不支持的压缩方法 ${method}：${relative}`);
    }
    if (bytes.length !== uncompressedSize) {
      throw new Error(`ZIP 条目大小与声明不符：${relative}`);
    }
    files.push({ path: relative, bytes });
  }

  const digest = createHash('sha256');
  for (const file of files.slice().sort((left, right) => (left.path < right.path ? -1 : 1))) {
    digest.update(file.path);
    digest.update('\0');
    digest.update(String(file.bytes.length));
    digest.update('\0');
    digest.update(file.bytes);
  }

  return { files, totalBytes, digest: digest.digest('hex') };
}

/** 确认目标路径确实落在根目录内（二次防线，防止拼接失误）。 */
export function containsPath(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * 把解包结果写入磁盘。
 *
 * @param root 允许写入的根目录（技能根，例如 ~/.agents/skills）。
 * @param slug 目标子目录名，只允许安全字符。
 * @param files readZip 的产物。
 * @returns {Promise<{ dir: string, written: string[] }>}
 */
export async function writeSkillTree(root, slug, files) {
  if (!/^[A-Za-z0-9._-]+$/.test(slug) || slug === '.' || slug === '..') {
    throw new Error(`目标目录名非法：${slug}`);
  }
  const targetDir = path.join(root, slug);
  if (!containsPath(root, targetDir)) throw new Error('目标目录逃逸出技能根目录');

  await fsp.mkdir(targetDir, { recursive: true });
  const written = [];
  try {
    for (const file of files) {
      const absolute = path.join(targetDir, ...file.path.split('/'));
      if (!containsPath(targetDir, absolute)) throw new Error(`写入路径逃逸：${file.path}`);
      await fsp.mkdir(path.dirname(absolute), { recursive: true });
      await fsp.writeFile(absolute, file.bytes);
      written.push(file.path);
    }
  } catch (error) {
    // 失败时整体回滚，不留半成品目录。
    await fsp.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return { dir: targetDir, written };
}
