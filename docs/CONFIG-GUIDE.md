# DeepSeek Harness × 源盾 Skills 配置手册

> 一页纸配好 DSH，再用源盾 Skill 市场给 AI 装上可信技能。
>
> 适用版本：DSH 44.7.0 起 · `dsh-skill-trust` 0.3.0 起 · Windows / macOS / Linux

---

## 这套东西是什么

两个组件，各管一件事：

| 组件 | 作用 |
|---|---|
| **DeepSeek Harness（DSH）** | 桌面 AI 客户端。管模型接入、会话、技能加载。 |
| **源盾 Skills 插件** | 在 DSH 左侧栏开一个 Skill 市场。看安全审计、看能力画像、一键装到本机。 |

关键定位：**插件本身不下安全结论**。所有审计判断来自源盾，它只负责呈现与落地。

---

## 一、装 DSH

从官网下载安装包，装完启动。

**验证装好了**：终端执行

```bash
dsh --version
```

能打印版本号即可（形如 `0.2.1-rc.3`）。

> 注意区分两个版本号：`dsh --version` 打的是 **CLI / runtime 版本**（如 `0.2.1-rc.3`），不是桌面应用版本。桌面应用版本看安装目录下的 `version` 文件（如 `44.7.0`），对应的是 Electron 外壳。两者更新节奏不同，都出现是正常的。

DSH 的数据都在 `~/.dsh/`（Windows 是 `C:\Users\<你>\.dsh\`）：

```
~/.dsh/
├─ profiles/          # 配置档，默认 desktop
│  └─ desktop/
│     ├─ package.json      # 装了哪些 bundle
│     └─ cordis.patch.yml  # 你的本地配置（改这个）
├─ .credentials.yaml  # 加密的凭据存储
├─ sessions/          # 会话记录
└─ skill-trust 相关不在这里，见第四节
```

---

## 二、接上模型

DSH 需要一个模型服务才能工作。本节以 **moark** 为例，其它 provider 同理。

### 2.1 拿到 API Key

去服务商控制台生成一个 Key。

### 2.2 填进 DSH

**推荐做法**：启动 DSH 后，在**设置 → 账号**里填。DSH 会把它加密存进 `~/.dsh/.credentials.yaml`，不落到环境变量。

> ⚠️ 常见误区：以为必须设环境变量 `MOARK_API_KEY`。**不需要**。DSH 自己的凭据存储优先级更高，环境变量只是备选路径。

### 2.3 确认配置文件已生效

编辑 `~/.dsh/profiles/desktop/cordis.patch.yml`，应当有这两段：

```yaml
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: moark
    model: DeepSeek-V4.1-Flash-1017
    reasoningEffort: high

- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      moark:
        displayName: moark
        apiKeyEnv: MOARK_API_KEY      # 这里的名字只是凭据的键名，不是环境变量必须存在
        api: anthropic-messages
        baseURL: https://api.moark.com/
        models:
          - id: DeepSeek-V4.1-Flash-1017
            name: DeepSeek-V4.1-Flash-1017
            contextWindow: 1000000
            maxTokens: 384000
            reasoningEfforts: { off: null, low: low, medium: medium, high: high }
```

**改完必须重启 DSH**，配置只在启动时读一次。

---

## 三、装源盾 Skills 插件

### 3.1 安装

**方式一：从 npm**

```bash
# 装进 DSH 的 profile
cd ~/.dsh/profiles/desktop
npm install dsh-skill-trust
```

然后在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 数组里追加一行：

```json
"dsh-skill-trust"
```

**方式二：从源码**（要改代码时用）

```bash
git clone https://github.com/feralpixel2026/dsh-skill-trust.git
cd ~/.dsh/profiles/desktop
npm install --save file:<克隆下来的绝对路径>
```

> **注意语法差异**：`npm` 用 `file:`，`pnpm` 用 `link:`。两者都创建软链，改源码立即生效。
> DSH 的 profile 目录自带 `pnpm-lock.yaml`，说明 DSH 内部用 pnpm 管依赖——所以你在 profile 里可能会看到 `"link:..."` 形式的依赖，这是正常的。用 npm 装就用 `file:`，别用 `link:`（npm 会报 `EUNSUPPORTEDPROTOCOL`）。

### 3.2 确认装上了

重启 DSH，**左侧栏出现「源盾 Skills」图标**（紫色包状图标，排在 Session 附近）。

点进去能看到 Skill 卡片列表，说明装好了。

> 位置由 `sidebar.panellist` 槽位的 `order: 25` 决定，不需要手动配置。

### 3.3 插件配置（可选）

默认连官方源盾站点，一般不用改。要改的话，在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加：

```yaml
- id: dsh-skill-trust
  name: dsh-skill-trust
  config:
    base: https://yuandun.gitee.com        # 接口基址
    installRoot: C:/Users/you/.agents/skills   # 技能落地目录，默认 ~/.agents/skills
    clientSource: DSH-SkillMarket          # 下载来源标识，源盾按来源统计
```

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `base` | `https://yuandun.gitee.com` | 源盾接口基址 |
| `installRoot` | `~/.agents/skills` | 技能装到哪 |
| `clientSource` | `DSH-SkillMarket` | 上报给源盾的来源标记，最长 32 字符 |

---

## 四、技能是怎么被 DSH 认出来的

这一节理解清楚，出问题才知道查哪里。

### 4.1 三个技能根

DSH 生态里，技能可以放在三处，插件**都会扫**：

| 路径 | 谁的 | 说明 |
|---|---|---|
| `~/.agents/skills/` | 通用 Agent 标准 | **插件默认装这里** |
| `~/.dsh/skills/` | DSH 专属 | 可以不存在 |
| `~/.claude/skills/` | Claude Code | 兼容旧技能 |

**同名技能只认第一个**（按上面顺序）。所以你在 `.claude/skills` 里也有、`.agents/skills` 里也有的技能，只会显示一次。

### 4.2 什么算一个技能

```
~/.agents/skills/<技能名>/
├─ SKILL.md          ← 必需，且必须在目录根
├─ _meta.json        ← 可选，插件安装时写，记录版本和审计状态
└─ 其它文件...        ← 随便，references/ scripts/ assets/ 都行
```

**`SKILL.md` 是硬门槛**：没有它的目录会被跳过，即使里面有子目录。

### 4.3 SKILL.md 的最小写法

```markdown
---
name: my-skill
description: 这个技能做什么，什么时候该用它
---

# 正文

具体指令写在这里，AI 读的是这段。
```

必填只有 `name` 和 `description`。其它可选字段：

| 字段 | 作用 |
|---|---|
| `version` | 版本号，也可以写在 `metadata.version` |
| `tags` | 标签数组，卡片上会显示 |
| `display_name` | 中文显示名，卡片标题优先用它 |
| `description_zh` | 中文描述，`description` 缺失时回退 |
| `user-invocable` | 是否允许用户手动调用 |
| `disable-model-invocation` | 是否禁止模型自动调用 |
| `environments` | 适用环境 |

> 插件的「本机已安装」页会解析这些字段。**大量现成技能的 `description` 写成了 `Use when the user...` 这种给模型看的触发式，插件会自动改写成给人看的直述句。**

---

## 五、日常使用

### 5.1 逛市场装技能

左侧栏「源盾 Skills」→ 浏览或搜索 → 点卡片看详情 → 右侧安装框点「安装到本机」。

**详情页五个页签**：

| 页签 | 看什么 |
|---|---|
| 能力分析 | 这技能接受什么输入、产出什么、要不要 API Key |
| 安全审计 | 六维体检：指令/代码/权限/数据/依赖/异常行为 |
| Skill.md | 直接读原文 |
| Skill 文件 | 制品清单，点开看任一文件 |
| 历史版本 | 所有可用版本 |

**安全审计怎么读**：六边形雷达图，每个顶点一个维度。颜色含义：

| 状态 | 含义 |
|---|---|
| 🟢 SAFE | 该维度未发现问题 |
| 🟡 INCONCLUSIVE | 证据不足，判不了 |
| 🟠 SUSPECTED | 有可疑迹象 |
| 🔴 RISKY | 明确风险 |

**多边形颜色取最差的那一维**。所以看到红色就点进去看具体是哪条。

### 5.2 装的时候发生了什么

```
取 detail 拿到 packageSha256（钉住具体版本）
        ↓
带 packageSha256 下载 ZIP
        ↓
三重校验：
  ① 响应头 X-Skill-SHA256
  ② detail 里的 packageSha256
  ③ 本地实算
        ↓
解包（拒绝路径逃逸/符号链接/加密条目/解压炸弹）
        ↓
写入 ~/.agents/skills/<技能名>/ + _meta.json
```

**任何一步不一致就中止**，不存在「先装再说」。

### 5.3 看本机装了什么

「源盾 Skills」→ 筛选条右侧「本机已安装」。

- 扫描三个技能根，**包括其它工具装的**
- 卡片显示：中文名、描述、标签、大小、来源、修改时间
- **两档排序**：安装时间（默认，倒序）/ 名称（升序）
- 右上「重新扫描」强制重查

> 卡片上的时间是「**修改于**」不是「安装于」——那是文件时间，不是真实安装时刻。这是刻意的，不撒这个谎。

---

## 六、常见问题

### 插件装了但左侧栏没图标

1. 检查 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 里有没有 `dsh-skill-trust`
2. 检查 `node_modules/dsh-skill-trust` 是否存在且非空
3. **重启 DSH**（不是刷新页面）

### 改了代码但界面没变

DSH 的模块在启动时加载。**每次改 `lib/` 下的代码都要重启 DSH**。

判断当前跑的是不是旧代码：比对 `lib/client.js` 的修改时间与 DSH 进程启动时间。文件比进程新，就是没生效。

### 点「安装到本机」失败

按错误提示区分：

| 错误 | 原因 | 怎么办 |
|---|---|---|
| 403 / 需确认 | 该技能要求登录或二次确认 | 去源盾网站用浏览器装 |
| 429 | 触发匿名限流 | 等 `Retry-After` 秒后重试 |
| SHA256 不一致 | 制品被替换或网络劫持 | **不要重试**，换个技能或用别的方式装 |
| 解包失败 | ZIP 含非法条目 | 同上，这是保护机制在起作用 |

### 匿名限流额度

源盾对未登录请求按 IP 限流：

| 操作 | 额度 |
|---|---|
| 搜索 / 详情 / 审计 / 版本 / 文件树 | 60 次 / 60 秒 |
| 文件预览 | 30 次 / 60 秒 |
| **ZIP 下载** | **5 次 / 60 秒** |

批量装技能时注意下载额度。

### 装完的技能在别的 AI 工具里能用吗

能。`~/.agents/skills/` 是交叉标准，Claude Code、Codex 等都会读同一目录。

---

## 七、卸载

```bash
# 1. 从 profile 移除
cd ~/.dsh/profiles/desktop
npm uninstall dsh-skill-trust

# 2. 从 package.json 的 dsh.profile.bundles 里删掉 "dsh-skill-trust" 这一行

# 3. 重启 DSH
```

**装过的技能不会自动删**。要清掉：

```bash
rm -rf ~/.agents/skills/<技能名>
```

---

## 附录 A：目录速查

| 路径 | 内容 |
|---|---|
| `~/.dsh/profiles/desktop/package.json` | 装了哪些 bundle |
| `~/.dsh/profiles/desktop/cordis.patch.yml` | 你的本地配置 |
| `~/.dsh/profiles/desktop/node_modules/` | bundle 实际文件 |
| `~/.dsh/.credentials.yaml` | 加密凭据 |
| `~/.dsh/sessions/` | 会话记录 |
| `~/.agents/skills/` | 技能（插件默认装这） |
| `~/.claude/skills/` | 技能（Claude Code） |
| `~/.dsh/skills/` | 技能（DSH 专属，可不存在） |

## 附录 B：全部可用配置项

```yaml
- id: dsh-skill-trust
  name: dsh-skill-trust
  config:
    base: https://yuandun.gitee.com
    installRoot: C:/Users/you/.agents/skills
    clientSource: DSH-SkillMarket
```

## 附录 C：源盾接口（自己写集成时用）

基址 `https://yuandun.gitee.com`，全部匿名可用：

| 端点 | 用途 |
|---|---|
| `GET /yuandun/ui/skills` | 列表（参数：`keyword` `category` `runtimeRequirement` `securityStatus` `sortBy` `cursor` `pageSize`） |
| `GET /yuandun/ui/skills/detail?name=` | 详情 |
| `GET /yuandun/ui/skills/capability?name=` | 能力画像 |
| `GET /yuandun/ui/skills/security-audit?name=` | 六维审计 |
| `GET /yuandun/ui/skills/versions?name=` | 版本列表 |
| `GET /yuandun/ui/skills/files?name=` | 文件清单 |
| `GET /yuandun/ui/skills/file?name=&path=` | 单文件文本 |
| `GET /yuandun/ui/skill-downloads` | ZIP 包 |

**四个实测坑**（写集成必看）：

| 坑 | 真相 |
|---|---|
| `pageSize` | 上限 **30**，不是 60，超了直接 400 |
| `category` | 只接受**中文显示名**（`软件研发`），传 `SOFTWARE_DEV` 返回 400 |
| 游标 | 与 `sortBy` 绑定，换排序必须回第一页，否则 `SKILL_CURSOR_INVALID` |
| 字段名 | 列表卡片用 `installs`，详情用 `downloadCount`，同义不同名 |

---

## 附录 D：出错先看这里

| 症状 | 先查 |
|---|---|
| 左侧栏没图标 | `package.json` 的 bundles 数组 |
| 图标有但白屏 | DSH 重启了吗；`lib/client.js` 改动时间 vs 进程启动时间 |
| 市场一片空白 | 能不能打开 `https://yuandun.gitee.com/public/skills` |
| 装到本机但列表没出现 | 目标目录是否有 `SKILL.md`（在根，不是子目录） |
| 同一个技能出现两次 | 不同根下有同名目录，去掉一个 |
| 卡片没描述 | `SKILL.md` 的 frontmatter 缺 `description` |

---

*CLI 0.2.1-rc.3 · 桌面应用 44.7.0 · dsh-skill-trust 0.3.0 · Apache-2.0*
