# 发布前检查清单

推送 GitHub / 发布 npm **之前**逐项打勾。每项都给了可直接复制执行的命令。

## 关于命令环境（先读这一节）

本机实测环境：**Windows + PowerShell，没有 `grep`、没有 `rg`**，只有 `git 2.56`、`node`、`tar.exe`。
所以本清单**不用 grep**，全部改用 `node -e` 或 `git` 原生命令——这些在 Windows / macOS / Linux 上都能跑，粘进 CI 也不会因为缺 grep 而失败。

约定：所有命令在仓库根目录 `dsh-skill-trust/` 下执行。

---

## 0. 前置：确认当前基线

| 检查 | 命令 | 期望 |
| --- | --- | --- |
| 工作目录正确 | `git rev-parse --show-toplevel` | 输出以 `dsh-skill-trust` 结尾 |
| 分支是 main | `git branch --show-current` | `main` |
| 远程已配置 | `git remote -v` | `origin` 指向 `https://github.com/feralpixel2026/dsh-skill-trust.git` |
| 没有多余远程 | `git remote` | 只有 `origin` |

---

## 1. 四个字段正确（版本号 / License / 作者 / 仓库地址）

- [ ] 版本号
- [ ] License
- [ ] 作者
- [ ] 仓库地址

**一次看全**：

```bash
node -e "const p=require('./package.json');console.log({name:p.name,version:p.version,license:p.license,author:p.author,url:p.repository.url,bugs:p.bugs.url,engines:p.engines})"
```

期望：

```json
{
  "name": "dsh-skill-trust",
  "version": "0.3.0",
  "license": "Apache-2.0",
  "author": "feralpixel2026",
  "url": "git+https://github.com/feralpixel2026/dsh-skill-trust.git",
  "bugs": "https://github.com/feralpixel2026/dsh-skill-trust/issues",
  "engines": { "node": ">=22" }
}
```

**交叉核对（字段之间不能打架）**：

```bash
# 版本号 vs CHANGELOG 最新条目
node -e "const p=require('./package.json');const fs=require('fs');const m=fs.readFileSync('CHANGELOG.md','utf8').match(/## \[([\d.]+)\]/);console.log('package.json:',p.version,'| CHANGELOG:',m&&m[1],'| 一致:',p.version===(m&&m[1]))"
```

```bash
# 作者 vs LICENSE 里的版权行（取最后一条 "Copyright <年份> ..."）
node -e "const p=require('./package.json');const fs=require('fs');const lic=(fs.readFileSync('LICENSE','utf8').match(/Copyright \d{4}[^\n]*/g)||[]).pop();console.log('author:',p.author,'| LICENSE:',lic||'(未找到)','| 一致:',Boolean(lic&&lic.includes(String(p.author))))"
```

```bash
# 仓库地址 vs git remote（去掉协议前缀与 .git 后缀再比）
node -e "const p=require('./package.json');console.log(p.repository.url.replace(/^git\+/,'').replace(/\.git$/,''))"
git remote get-url origin
```

两行输出应指向同一个仓库（`git remote` 那行带 `.git` 后缀，属正常）。

> ⚠️ 陷阱：LICENSE 正文里有 Apache 模板的 `Copyright [yyyy] [name of copyright owner]` 占位（第 189 行）与多处 "copyright owner" 字样，**不要用 `grep -i copyright` 判断**，会误判。本清单的正则只取「Copyright + 4 位年份」，命中文件末尾那条真实版权行。

---

## 2. `npm test` 全绿

- [ ] 全部通过，`fail 0`，退出码 0

```bash
npm test
```

期望末尾：

```
ℹ tests   109
ℹ pass    109
ℹ fail    0
```

**判读方法**：用例数会随开发增长，**不要把「等于 109」当判据**。判据是 `fail 0` 且退出码为 0：

```bash
npm test; echo "EXIT=$?"
```

（PowerShell 用 `$LASTEXITCODE`，bash 用 `$?`；这里 `echo "EXIT=$?"` 在 bash 下有效，PowerShell 请用 `"EXIT=$LASTEXITCODE"`。）

---

## 3. `npm run check` 全绿

- [ ] 5 个 lib 文件语法检查通过

```bash
npm run check
```

脚本依次对 `lib/index.js`、`lib/client.js`、`lib/yuandun.js`、`lib/zip.js`、`lib/frontmatter.js` 执行 `node --check`。
**无输出且退出码 0** 即通过；有语法错误会直接打印文件名与行号。

> 注意：`CONTRIBUTING.md` 里写的是「四个 lib 文件的语法检查」，实际是**五个**（漏了 `lib/frontmatter.js`）。以 `package.json` 的 `scripts.check` 为准。

一次跑完第 2、3 项：

```bash
npm run verify
```

---

## 4. `npm pack --dry-run` 输出符合预期

- [ ] 打包内容只含运行所需文件（14 个）
- [ ] **没有**测试文件（`test/`）
- [ ] **没有**临时脚本（`*.mjs` 残留、`tmp/`、`*_debug*`）
- [ ] **没有** `node_modules/`、`.env`、密钥
- [ ] `docs/`、`.github/` 不进包（它们属于 GitHub 仓库，不属于 npm 包）

```bash
npm pack --dry-run
```

期望的 14 个文件（由 `package.json` 的 `files` 字段决定）：

```
CHANGELOG.md  CONTRIBUTING.md  LICENSE  README.md
cordis.patch.yml  icon.svg
lib/client.js  lib/frontmatter.js  lib/index.js  lib/yuandun.js  lib/zip.js
locale/en.json  locale/zh.json  package.json
```

**自动核对（有意外就报错，不需要肉眼比对）**：

```bash
npm pack --dry-run --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const f=JSON.parse(s)[0].files.map(x=>x.path);const bad=f.filter(p=>/^(test\/|docs\/|\.github\/|node_modules\/|tmp\/)/.test(p)||/\.(map|tgz|log)$/.test(p)||/(^|\/)\.env/.test(p));console.log('文件数:',f.length);console.log(bad.length?'[BAD] '+bad.join(', '):'[OK] 打包内容干净')})"
```

已实测输出：`文件数: 14` / `[OK] 打包内容干净`。

**顺便确认没有 tgz 残留**（误跑不带 `--dry-run` 的 `npm pack` 会留下文件）：

```bash
node -e "const fs=require('fs');const t=fs.readdirSync('.').filter(f=>f.endsWith('.tgz'));console.log(t.length?'[BAD] 有 tgz 残留: '+t.join(', '):'[OK] 无 tgz 残留')"
```

`.gitignore` 已加 `dsh-skill-trust-*.tgz` 兜底，但仍应清掉。

---

## 5. README 截图就位

- [ ] `docs/screenshot-market.png` 存在
- [ ] `docs/screenshot-detail.png` 存在
- [ ] README 里「截图待补」占位行已删除或替换为真实图片引用
- [ ] 图片路径与文件名**大小写一致**（Linux 上大小写敏感，Windows 上测不出来）

```bash
# 1) 文件是否存在
node -e "const fs=require('fs');for(const p of ['docs/screenshot-market.png','docs/screenshot-detail.png'])console.log(fs.existsSync(p)?'[OK] '+p:'[MISSING] '+p)"
```

```bash
# 2) 占位是否还在（有输出 = 还没补，发布前这一条必须为空）
node -e "const fs=require('fs');const t=fs.readFileSync('README.md','utf8').split('\n');const hit=t.map((l,i)=>[i+1,l]).filter(([,l])=>l.includes('截图待补'));console.log(hit.length?hit.map(([n,l])=>'L'+n+': '+l.trim()).join('\n'):'[OK] 无占位残留')"
```

```bash
# 3) README 引用的所有本地图片是否真实存在
node -e "const fs=require('fs');const t=fs.readFileSync('README.md','utf8');const re=/!\[[^\]]*\]\(([^)]+)\)/g;let m,miss=[];while((m=re.exec(t))){const p=m[1];if(/^https?:/.test(p))continue;if(!fs.existsSync(p))miss.push(p)}console.log(miss.length?'[MISSING] '+miss.join(', '):'[OK] 全部图片存在')"
```

**截图怎么拍**：见 [docs/README.md](README.md) 的截图清单（每张拍什么、建议尺寸、在 README 的哪一行引用）。

---

## 6. 没有敏感信息

- [ ] 无 token / password / secret / api key / 私钥
- [ ] 无真实个人绝对路径（示例占位如 `C:/Users/you/...` 不算）
- [ ] 无 `.env`、`.npmrc`、`id_rsa`、`*.pem`

**一次性全扫（只扫 git 跟踪的文件，自动跳过二进制）**：

```bash
node -e "const fs=require('fs'),{execSync}=require('child_process');const files=execSync('git ls-files',{encoding:'utf8'}).split('\n').filter(Boolean).filter(f=>!/\.(png|jpg|jpeg|gif|zip|tgz)$/i.test(f));const pats=[[/npm_[A-Za-z0-9]{20,}/,'npm token'],[/gh[pousr]_[A-Za-z0-9]{20,}/,'github token'],[/sk-[A-Za-z0-9]{20,}/,'sk key'],[/xox[baprs]-/,'slack token'],[/AKIA[0-9A-Z]{16}/,'aws key'],[/-----BEGIN [A-Z ]*PRIVATE KEY-----/,'private key'],[/(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*[\x22\x27][^\x22\x27]{6,}/i,'kv secret']];let hits=0;for(const f of files){const t=fs.readFileSync(f,'utf8');for(const[re,name]of pats){const m=t.match(re);if(m){hits++;console.log('[HIT]',name,'->',f,':',m[0].slice(0,80))}}}console.log(hits===0?'[OK] 无凭据形态 / '+files.length+' 个文件':'[BAD] 共 '+hits+' 处')"
```

**个人绝对路径扫描**（已排除 `C:/Users/you` 这类示例占位）：

```bash
node -e "const fs=require('fs'),{execSync}=require('child_process');const files=execSync('git ls-files',{encoding:'utf8'}).split('\n').filter(Boolean).filter(f=>!/\.(png|jpg|jpeg|gif|zip|tgz)$/i.test(f));const re=/[A-Za-z]:[\\\\/]Users[\\\\/](?!you[\\\\/])|(?<![A-Za-z0-9])[\\\\/]Users[\\\\/](?!you[\\\\/])|[\\\\/]home[\\\\/][a-z]/;let hits=0;for(const f of files){const lines=fs.readFileSync(f,'utf8').split('\n');lines.forEach((l,i)=>{const m=l.match(re);if(m){hits++;console.log('[HIT]',f+':'+(i+1),m[0])}})}console.log(hits===0?'[OK] 无真实个人路径':'[BAD] 共 '+hits+' 处')"
```

**敏感文件名检查**：

```bash
node -e "const {execSync}=require('child_process');const re=/(^|\/)(\.env|\.npmrc|id_rsa|id_ed25519|.*\.pem|.*\.key|.*\.p12|credentials)$/i;const bad=execSync('git ls-files',{encoding:'utf8'}).split('\n').filter(Boolean).filter(p=>re.test(p));console.log(bad.length?'[BAD] '+bad.join(', '):'[OK] 无敏感文件名')"
```

三条都应是 `[OK]`。

> 已知可忽略命中：`lib/yuandun.js` 里的字段名 `requiresApiKey`（源盾接口字段名，不是凭据值），上面的 `kv secret` 正则要求「键=值」形式，不会命中它。

---

## 7. `git status` 干净或改动符合预期

- [ ] 没有未跟踪的意外文件
- [ ] 暂存区内容就是准备发布的内容
- [ ] **没有** `node_modules/`、`.env`、`.dsh-memory/`、临时脚手架 `.mjs`

```bash
git status --short
git diff --cached --stat
```

**自动核对暂存区**：

```bash
node -e "const {execSync}=require('child_process');const re=/(node_modules\/|(^|\/)\.env|\.dsh-memory\/|\.tgz$|\/tmp\/|\.log$)/;const bad=execSync('git diff --cached --name-only',{encoding:'utf8'}).split('\n').filter(Boolean).filter(p=>re.test(p));console.log(bad.length?'[BAD] '+bad.join(', '):'[OK] 暂存区无禁用文件')"
```

已实测输出：`[OK] 暂存区无禁用文件`。

**这一步之后才 commit**（由维护者手动执行，代理不代做）：

```bash
git commit -m "发布 0.3.0"
git push -u origin main
```

---

## 8. 打 tag 与 `package.json` version 一致

- [ ] tag 名 = `v` + `package.json.version`
- [ ] tag 打在发布 commit 上
- [ ] tag 已推送到远程（`publish.yml` 由 `v*` tag 触发）

```bash
# 生成正确的 tag 名，避免手打错
node -e "console.log('v'+require('./package.json').version)"
```

```bash
# 打 tag（必须等第 7 步 commit 完成后再执行）
git tag v0.3.0
git push origin v0.3.0
```

**校验（commit 之后才有效）**：

```bash
node -e "const {execSync}=require('child_process');const v=require('./package.json').version;let list=[];try{list=execSync('git tag --points-at HEAD',{encoding:'utf8',stdio:['pipe','pipe','ignore']}).split('\n').filter(Boolean)}catch(e){console.log('[SKIP] 还没有 commit，先完成第 7 步');process.exit(0)}console.log('version:',v,'| HEAD tags:',list.join(', ')||'(无)','| 一致:',list.includes('v'+v))"
```

期望：`一致: true`。

**确认远程也收到了 tag**：

```bash
git ls-remote --tags origin
```

> ⚠️ tag 一旦推到 GitHub 就会触发 `publish.yml`，**是真的发 npm**。前面所有项没过完不要推 tag。只想试跑时用 Actions 的 `workflow_dispatch`（该工作流有 `dry_run` 输入，默认 `true`，只执行 `npm publish --dry-run`）。

---

## 9. `NPM_TOKEN` 已配置到 GitHub Secrets

- [ ] 仓库 Settings → Secrets and variables → Actions 里有名为 `NPM_TOKEN` 的 secret
- [ ] 它是 npmjs.com 的 **Automation** 或 **Granular Access Token**，对 `dsh-skill-trust` 有 publish 权限
- [ ] token 没有出现在仓库任何文件里（第 6 步已扫）

本机没有 `gh` CLI，只能网页核对：

```
https://github.com/feralpixel2026/dsh-skill-trust/settings/secrets/actions
```

应能看到 `NPM_TOKEN` 条目（值不回显，只能看到名字和最后更新时间）。

**确认工作流引用的 secret 名与它完全一致**（写错一个字母不报错，只在发布时认证失败）：

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('.github/workflows/publish.yml','utf8').split('\n');const hit=t.map((l,i)=>[i+1,l]).filter(([,l])=>l.includes('NPM_TOKEN'));console.log(hit.length?hit.map(([n,l])=>'L'+n+': '+l.trim()).join('\n'):'[BAD] 工作流里没引用 NPM_TOKEN')"
```

期望输出一行：`L...: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`。

**有 `gh` CLI 时的等价命令**（本机暂无，装好后可用）：

```bash
gh secret list --repo feralpixel2026/dsh-skill-trust
```

---

## 10. 发布后回验（推完 tag 再做）

- [ ] GitHub Actions 的 `Publish to npm` 工作流为绿色
- [ ] npm 页面可访问：<https://www.npmjs.com/package/dsh-skill-trust>
- [ ] 版本号正确

```bash
npm view dsh-skill-trust version
npm view dsh-skill-trust dist-tags
```

- [ ] 从 npm 拉一份下来确认内容完整

```bash
npm pack dsh-skill-trust@0.3.0
tar -tzf dsh-skill-trust-0.3.0.tgz
```

- [ ] 在 GitHub Releases 里补对应版本的说明（直接搬 CHANGELOG 段落）

---

## 快速路径（前面全部都打勾后再执行）

```bash
# 1. 提交（第 1–7 项必须已通过）
git add -A && git commit -m "发布 0.3.0"

# 2. 推主干（第 9 项 NPM_TOKEN 必须先配好，否则下一步的发布工作流会失败）
git push -u origin main

# 3. 打 tag 并推送 —— 这一步触发 npm 发布
git tag v0.3.0 && git push origin v0.3.0
```

**第 3 步是单向门**：npm 一旦发布，同名版本号不可覆盖、不可删除重发（只能 `npm deprecate` 后发新版本）。确认无误再执行。
