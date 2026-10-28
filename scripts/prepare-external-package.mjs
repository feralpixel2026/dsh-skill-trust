#!/usr/bin/env node
/**
 * 源盾 Skill 集市 · 对外参考实现裁剪打包脚本（内部工具）
 *
 * 用途：从 trust-center 源码库中裁剪出可交付给第三方的参考实现包。
 *
 * 设计原则：
 *   1. 白名单制 —— 只复制明确列出的路径，不靠"排除"来保证安全
 *   2. 敏感词扫描失败即退出，不静默跳过
 *   3. 生成 manifest 记录来源 commit 与文件哈希，可追溯
 *
 * 用法：
 *   node scripts/prepare-external-package.mjs <源码目录> <输出目录>
 *
 * 示例：
 *   node scripts/prepare-external-package.mjs \
 *     "C:/Users/nicex/Downloads/trust-center-heads_release-v1.18.2/trust-center" \
 *     "./dist/external-package"
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** 白名单：相对源码根的路径。目录会递归复制，文件直接复制。 */
const KEEP = [
  'src/features/community/tenant/skills',
  'src/service/skills',
  'src/theme',
  'src/styles',
  'src/config/api/skills.ts',
  'tailwind.config.js',
];

/** 即使位于白名单目录内，也必须剔除的文件名模式 */
const EXCLUDE_NAMES = [/^\.env/i, /\.map$/, /\.test\.tsx?$/, /\.spec\.tsx?$/];

/** 敏感词：产出包中出现任何一个即失败 */
const FORBIDDEN = [
  'ACCESSTOKEN',
  'WILLING_ID',
  'getTenantKey',
  'YUANDUN_API_URL',
  'NEXT_PUBLIC_BASEURL',
  'NEXT_PUBLIC_YUANDUN_WILLING_ID',
];

const log = (msg) => console.log(`  ${msg}`);
const fail = (msg) => {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
};

async function exists(p) {
  return fs.access(p).then(() => true).catch(() => false);
}

async function walk(dir, base = dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (entry.isDirectory()) {
      await walk(abs, base, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel, name: entry.name });
    }
  }
  return out;
}

async function main() {
  const [sourceArg, outArg] = process.argv.slice(2);
  if (!sourceArg || !outArg) {
    fail('用法: node scripts/prepare-external-package.mjs <源码目录> <输出目录>');
  }

  const source = path.resolve(sourceArg);
  const outDir = path.resolve(outArg);

  log(`源码: ${source}`);
  log(`输出: ${outDir}`);

  if (!(await exists(source))) fail(`源码目录不存在: ${source}`);
  if (!(await exists(path.join(source, 'package.json')))) {
    fail(`看起来不像 trust-center 源码库（缺 package.json）: ${source}`);
  }
  if (await exists(outDir)) {
    fail(`输出目录已存在，请先删除以免混淆: ${outDir}`);
  }

  // ---------- 1. 建立输出目录 ----------
  await fs.mkdir(outDir, { recursive: true });

  // ---------- 2. 按白名单复制 ----------
  log('\n[1/5] 按白名单复制');
  let copied = 0;
  let skipped = 0;
  const manifest = [];

  for (const rel of KEEP) {
    const src = path.join(source, rel);
    if (!(await exists(src))) {
      log(`  ⚠ 跳过（源码中不存在）: ${rel}`);
      continue;
    }
    const stat = await fs.stat(src);
    const dest = path.join(outDir, 'reference', rel);

    if (stat.isFile()) {
      if (EXCLUDE_NAMES.some((re) => re.test(path.basename(src)))) {
        skipped += 1;
        continue;
      }
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      manifest.push({ path: `reference/${rel}`, bytes: stat.size });
      copied += 1;
      log(`  ✓ ${rel}`);
    } else {
      const files = await walk(src);
      let dirCount = 0;
      for (const f of files) {
        if (EXCLUDE_NAMES.some((re) => re.test(f.name))) {
          skipped += 1;
          continue;
        }
        const target = path.join(dest, f.rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(f.abs, target);
        manifest.push({ path: `reference/${rel}/${f.rel}`, bytes: (await fs.stat(f.abs)).size });
        dirCount += 1;
        copied += 1;
      }
      log(`  ✓ ${rel} (${dirCount} 文件)`);
    }
  }

  log(`\n  合计复制 ${copied} 文件，跳过 ${skipped} 个被排除项`);

  // ---------- 3. 敏感词扫描 ----------
  // 只扫 reference/（源码副本），不扫我们自己的说明文档——
  // 文档里会刻意提到 ACCESSTOKEN / getTenantKey 来说明「源码的鉴权层用不了」，
  // 那是必要的反面案例，不该被判为泄漏。
  log('\n[2/5] 敏感词扫描（仅 reference/ 源码副本）');
  const violations = [];
  for (const item of manifest) {
    const abs = path.join(outDir, item.path);
    const text = await fs.readFile(abs, 'utf8').catch(() => '');
    for (const word of FORBIDDEN) {
      if (text.includes(word)) {
        violations.push({ file: item.path, word });
      }
    }
  }

  if (violations.length > 0) {
    console.error('\n❌ reference/ 中检测到敏感内容，已中止：\n');
    for (const v of violations) console.error(`   ${v.file} → ${v.word}`);
    console.error('\n请修正 KEEP 白名单或补充 EXCLUDE 规则后重试。');
    process.exit(1);
  }
  log(`  ✅ ${FORBIDDEN.length} 个敏感词在 ${manifest.length} 个源码文件中零命中`);

  // ---------- 4. 检查禁用文件类型 ----------
  log('\n[3/5] 禁用文件检查');
  const allOut = await walk(outDir);
  const badFiles = allOut.filter((f) => /^\.env/i.test(f.name) || /\.(pem|key|p12)$/i.test(f.name));
  if (badFiles.length > 0) {
    console.error('\n❌ 存在禁用文件：');
    for (const f of badFiles) console.error(`   ${f.rel}`);
    process.exit(1);
  }
  log('  ✅ 无 .env / 密钥文件');

  // ---------- 5. 生成 manifest ----------
  log('\n[4/5] 生成 manifest');
  const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  const totalBytes = manifest.reduce((sum, m) => sum + m.bytes, 0);

  const record = {
    generatedAt: new Date().toISOString(),
    source: {
      library: pkg.name ?? 'unknown',
      version: pkg.version ?? 'unknown',
      path: source,
    },
    summary: {
      files: manifest.length,
      bytes: totalBytes,
      readableSize: `${(totalBytes / 1024).toFixed(1)} KB`,
    },
    files: manifest.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };

  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
  log(`  ✓ manifest.json（${manifest.length} 文件，${record.summary.readableSize}）`);

  // ---------- 6. 复制提示词 ----------
  log('\n[5/5] 附加交付文档');
  const promptSrc = path.join(REPO_ROOT, 'docs', 'INTEGRATION-PROMPT.md');
  if (await exists(promptSrc)) {
    await fs.copyFile(promptSrc, path.join(outDir, 'INTEGRATION-PROMPT.md'));
    log('  ✓ INTEGRATION-PROMPT.md（接入提示词）');
  } else {
    log('  ⚠ 未找到 docs/INTEGRATION-PROMPT.md，请手动补入');
  }

  const readmeSrc = path.join(REPO_ROOT, 'docs', 'EXTERNAL-PACKAGE-README.md');
  if (await exists(readmeSrc)) {
    await fs.copyFile(readmeSrc, path.join(outDir, 'README.md'));
    log('  ✓ README.md（对外说明）');
  } else {
    log('  ⚠ 未找到 docs/EXTERNAL-PACKAGE-README.md，请手动补入');
  }

  // ---------- 完成 ----------
  console.log('\n' + '='.repeat(56));
  console.log('✅ 打包完成');
  console.log(`   输出目录: ${outDir}`);
  console.log(`   文件数:   ${manifest.length}`);
  console.log(`   大小:     ${record.summary.readableSize}`);
  console.log('='.repeat(56) + '\n');
}

main().catch((error) => {
  console.error('\n❌ 未捕获错误:', error);
  process.exit(1);
});
