# 源盾 Skills · dsh-skill-trust

> 在 DSH 里浏览 AI Agent Skill 市场：看六维安全审计、看能力画像、一键装到本机。

[![CI](https://github.com/feralpixel2026/dsh-skill-trust/actions/workflows/ci.yml/badge.svg)](https://github.com/feralpixel2026/dsh-skill-trust/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-skill-trust.svg)](https://www.npmjs.com/package/dsh-skill-trust)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

`skill-market` `security-audit` `dsh-plugin` `deepseek-harness` `agent-skills`

<!-- 截图就位后取消下面注释（拍摄清单见 docs/README.md）：
![市场页](docs/screenshot-market.png)
![详情页](docs/screenshot-detail.png)
-->

---

## 为什么做这个

装 Skill 时缺的从来不是数量，而是判断依据。这个插件把源盾的判断直接搬到你的编辑器里：

- **六维安全审计**——指令、代码、权限、数据、依赖、异常行为，每一维的结论和证据位置都看得到；
- **能力画像**——这个 Skill 到底接受什么输入、产出什么、需不需要 API Key；
- **许可合规**——许可证是什么、有没有合规风险；
- **一键安装**——按 `packageSha256` 钉住版本，三重摘要校验后才落盘；
- **本机盘点**——扫描本机已装的所有 Skill（含其他工具装的），统一展示。

插件本身**不下安全结论**。所有判断都来自源盾，它只负责呈现与落地。

## 界面

左侧栏点击 **源盾 Skills** 进入主面板：

- **市场页**：搜索、四种排序、三组筛选、三列卡片
- **详情页**：左上五页签（能力分析 / 安全审计 / Skill.md / Skill 文件 / 历史版本），右侧 380px 侧栏（流光安装框 + 安全状态 / 许可合规 / 活跃度 / 来源信息）
- **安全审计**：六维雷达图 + 逐维度风险卡，证据定位到 `文件:行号`
- **本机已安装**：扫描 `~/.agents/skills`、`~/.dsh/skills`、`~/.claude/skills`

## 快速开始

### 前置

- DSH（DeepSeek Harness）
- Node.js >= 22

### 方式一：从 GitHub 安装

```bash
git clone https://github.com/feralpixel2026/dsh-skill-trust.git
```

然后在 DSH 里把插件装进当前 profile：

```
plugin_manager action=install_bundle target=<克隆下来的绝对路径>
```

重启 DSH，左侧栏出现 **源盾 Skills**。

### 方式二：从 npm 安装

```bash
npm install dsh-skill-trust
```

装到 DSH profile 的 `node_modules` 后再以 bundle 形式启用，或直接 `install_bundle` 指向 npm 包目录。

## 功能

### 市场页

- 搜索：名称、中文名、简介、分类、能力描述
- 排序：综合 / 下载量 / 收藏量 / 最近上新
- 筛选：场景分类、安全状态、运行要求
- 游标翻页：始终从源盾取最新数据

### 详情页

| 区块 | 内容 |
| --- | --- |
| 头部 | 图标、名称、来源、审计状态、版本、更新时间、功能摘要、能力标签 |
| 安装区 | 复制 Prompt / 下载压缩包安装 |
| 能力分析 | 标签、适用场景、工作步骤、执行模式、输入输出契约、运行时依赖 |
| 安全审计 | 六维状态 + findings 证据位置（`文件:起止行` + 代码片段） |
| Skill.md | 直接在面板内预览 |
| Skill 文件 | 制品文件清单，点击查看任一文件 |
| 历史版本 | 全部有 READY 制品的版本及下载地址 |
| 右侧信息卡 | 安全状态、许可合规、活跃度、来源信息 |

### 已安装

只读扫描本机技能根，显示已安装的 Skill、版本与审计状态。

## 安装是怎么做的

```
detail 取当前版本 + packageSha256
  ↓
带 packageSha256 下载 ZIP（钉住具体制品）
  ↓
三重校验：X-Skill-SHA256、detail.packageSha256、本地实算
  ↓
解包（拒绝路径逃逸 / 符号链接 / 加密条目 / 解压炸弹）
  ↓
写入 ~/.agents/skills/<slug>/ + _meta.json
```

任何一步不一致就中止并报错，**不存在"先装再说"**。

## 注意事项

### 匿名限流

源盾对未登录请求按 IP 限流：

| 分组 | 配额 |
| --- | --- |
| 查询（搜索 / 详情 / 能力 / 审计 / 版本 / 文件树） | 60 次 / 60 秒 |
| 文件预览 | 30 次 / 60 秒 |
| **ZIP 下载** | **5 次 / 60 秒** |

超限返回 429，界面会显示剩余等待秒数。批量安装时请留意下载配额。

### 已知的接口怪癖

这些行为来自实测，改动相关代码前请留意：

| 项 | 说明 |
| --- | --- |
| `pageSize` | 上限 **30**，不是 60，超出直接 400 |
| `category` | 只接受**中文显示名**（如 `软件研发`），传 `SOFTWARE_DEV` 返回 400 |
| 游标 | 与 `sortBy` 绑定，换排序必须回第一页，否则 400 `SKILL_CURSOR_INVALID` |
| 字段名 | 搜索卡片用 `installs`，详情用 `downloadCount`，同义不同名 |
| `capabilityStatus` | 非 `SUCCEEDED` 时其余字段全为 `null`，应显示「分析中」而非空卡片 |

## 配置

在 profile 的 `cordis.patch.yml` 覆盖本插件行：

```yaml
- id: dsh-skill-trust
  name: dsh-skill-trust
  config:
    base: https://yuandun.gitee.com            # 接口基址
    installRoot: C:/Users/you/.agents/skills   # 安装目录，默认 ~/.agents/skills
    clientSource: DSH-SkillMarket              # 下载来源标识，用于源盾按来源统计
```

## 文档

| 文档 | 内容 |
|---|---|
| **[配置手册](docs/CONFIG-GUIDE.md)** | 从装 DSH、接模型、装插件到装上第一个技能，一页纸走完 |
| [截图清单](docs/README.md) | 需要哪几张图、每张拍什么 |
| [发布清单](docs/RELEASE_CHECKLIST.md) | 打 tag 发布前逐项检查 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 代码结构与协作约定 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |

## 开发

```bash
npm run check    # 语法检查（5 个 lib 文件）
npm test         # 测试套件（139 个用例，零依赖）
npm run verify   # 上面两条一起跑，发布前必跑
```

CI 在 GitHub Actions 上跑 Node 22 / 24 × Ubuntu / Windows 四组合。

## 安全边界

- 下载内容**永不执行**，只写入校验过的目录。
- 解包拒绝：绝对路径、盘符、`..` 段、**空段**、反斜杠、符号链接、加密条目。
- 单文件 32 MB、解压总量 128 MB、条目数 2000 上限。
- 摘要不一致直接拒绝。
- 所有本地路由只接受本机同源请求。

## 许可证

[Apache-2.0](LICENSE) © 2026 feralpixel2026
