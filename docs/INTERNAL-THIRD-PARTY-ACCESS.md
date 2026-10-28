# 源盾 Skill 集市 · 第三方客户端接入方案

> **内部文档 · 不对外**
> 面向源盾内部：说明如何把 Skill 集市能力授权给第三方 Agent 客户端团队，以及交付什么、不交付什么。
>
> 版本：v1 ｜ 更新：2026-10-28

---

## 一、这件事的本质

第三方（另一家 Agent 客户端厂商）想要在他们的产品里做一个和源盾 Web 端一致的 Skill 集市。

**我们的策略：授人以「参考实现 + 提示词」，不授「可运行代码」。**

原因：

| 交付可运行代码 | 交付参考实现 + 提示词 |
|---|---|
| 对方能直接跑起来 | 对方需要自己实现 |
| 我们失去对实现细节的控制 | 我们控制信息边界 |
| 后续他们改了什么我们不知道 | 交付物是静态的，可版本化 |
| 技术栈强绑定，换栈就废 | 与栈解耦，适配任意宿主 |

**核心判断**：我们卖的是「源盾的审计能力 + 设计规范」，不是「一套 Next.js 代码」。所以交付的价值在于**让对方做对**，而不是**让对方跑起来**。

---

## 二、交付清单

### 2.1 给什么（三类材料）

| 材料 | 内容 | 形态 |
|---|---|---|
| **① 接入提示词** | 给对方的 AI 读的施工说明书 | 单文件 Markdown |
| **② 裁剪后的参考源码** | 只含 Skill 集市相关模块 | 代码包（见 2.2） |
| **③ 匿名接口文档** | 8 个公开端点的参数与陷阱 | 已在提示词附录内含 |

**材料 ① 是核心。** 源码只是「参考物」，没有提示词，对方的 AI 会把源码当模板照抄，然后卡在一个个坑里。

**材料 ② 之所以要裁剪**，见第 2.2 节。

### 2.2 源码裁剪：必须做，不是可选

完整源码库（`trust-center`）规模：

```
1297 个 TS/TSX/CSS/JS 文件 · 3.15 MB
```

**绝不能整库交付。** 两个原因：

**① 含内部配置**

`.env` 系列文件里有：

```
NEXT_PUBLIC_BASEURL            ← 内部服务地址
NEXT_PUBLIC_YUANDUN_WILLING_ID ← 业务标识
YUANDUN_API_URL                ← 各环境接口地址（.dev / .development / .production）
```

这些一旦流出，等于暴露内部基础设施拓扑。

**② 含大量无关业务**

`src/features/community/tenant/` 下有 17 个业务模块，Skill 只是其中一个：

```
ai  components  dashboard  golden-image  hooks  kb
mcp  no-project-access  notification  project-switcher
repo  safety  search-panel  settings  skills  ← 只有这个是目标
tenant-onboarding  user-settings
```

其余 16 个模块（知识库、仓库管理、安全中心、项目切换器……）与 Skill 集市无关，给出去只是噪音，还会让对方的 AI 误读架构。

### 2.3 裁剪后的交付边界

**保留**（实测 46 文件 / 201.4 KB）：

| 路径 | 文件数 | 大小 | 用途 |
|---|---|---|---|
| `src/features/community/tenant/skills/` | 32 | 141.8 KB | 全部页面与组件 |
| `src/service/skills/` | 4 | 23.1 KB | 数据结构定义（types 必看，client 作反面案例） |
| `src/theme/` | 6 | 10.8 KB | 设计 token ★关键 |
| `src/styles/` | 2 | 13.6 KB | CSS 变量 |
| `src/config/api/skills.ts` | 1 | — | 8 个端点常量 |
| `tailwind.config.js` | 1 | 11.4 KB | 定制色阶与动画 |

合计约 201 KB，占全库 6.2%。

**必须剥离**：

```
.env .env.dev .env.development .env.production
src/utils/http/            ← 含登录态与租户逻辑（clientFetch.ts / serverFetch.ts）
src/utils/scope-route/     ← getTenantKey，租户路由逻辑
src/utils/willing.ts       ← WILLING_ID 使用点
src/hooks/useWillingCustomForm.ts
src/components/common/WlCustomForm/
src/middlewares/           ← authGuard / guestOnly / landingGuard 全是 ACCESSTOKEN 判断
src/app/                   ← 整个 Next.js 路由层（含 app/api/chat/route.ts 读 ACCESSTOKEN）
src/service/ 下除 skills 外的其它模块
src/features/community/tenant/ 下除 skills 外的 16 个模块
.pnpm-lock.yaml pnpm-workspace.yaml .npmrc
Dockerfile .husky/ .vscode/ typings.d.ts
```

**其中最容易被漏掉的是 `src/middlewares/` 和 `src/app/`**：它们不在 features 目录下，看着像「框架层不用管」，但里面全是鉴权判断。

**保留但需说明**：`src/utils/http/clientFetch.ts` 建议**只摘录片段**（作为「不要这样做」的反例），不要整文件给。它包含 `ACCESSTOKEN` cookie 处理与 `getTenantKey` 调用，暴露了我们的鉴权设计。

### 2.4 交付前必查的敏感词

实测这些标识在源码中的分布（用于脚本扫描）：

| 标识 | 命中位置 |
|---|---|
| `ACCESSTOKEN` | `middlewares/{authGuard,guestOnly,landingGuard}.ts`、`providers/UserStoreHydrator.tsx`、`utils/http/clientFetch.ts`、`app/api/chat/route.ts`、`app/(community)/(tenant)/app/route.ts` |
| `NEXT_PUBLIC_YUANDUN_WILLING_ID` | `typings.d.ts`、`utils/willing.ts`、`hooks/useWillingCustomForm.ts`、`components/common/WlCustomForm/index.tsx` |
| `YUANDUN_API_URL` | `next.config.ts`（rewrite 目标）、`utils/http/serverFetch.ts`、`app/api/chat/route.ts` |
| `NEXT_PUBLIC_BASEURL` | `typings.d.ts`、`utils/env.ts` |
| `getTenantKey` | `utils/scope-route/get-tenant-key.ts`、`utils/http/clientFetch.ts` |

**扫描命中任何一个就失败退出**，不静默跳过。

> **已实测验证**：按上述清单实际裁剪一次，产出 46 文件 / 201.4 KB，
> `ACCESSTOKEN` / `WILLING_ID` / `getTenantKey` / `YUANDUN_API_URL` / `NEXT_PUBLIC_BASEURL`
> 五项全部零命中，无 `.env` 残留。**清单有效，可直接据此开发脚本。**

---

## 三、为什么「提示词」比「源码」重要

这是我们自己的实践结论。

### 3.1 实际发生过的事

我们拿这套源码做了一个 DSH 客户端插件（已发 npm，0.3.0）。过程记录：

**按源码重写列表页，结果丢了一个功能。**

源码是 Web 端，没有「本机已安装」概念（浏览器不能扫磁盘）。我们的插件有这个能力。按源码重写时，`renderInstalled` 函数还在、里面的「返回市场」按钮也在，**但没有任何地方调用它**——形成单向死路，用户进去就出不来。

直到用户反馈才发现。

**这个错误，源码里看不出来。** 因为源码根本没有这个功能，也就没有对应的入口。必须**单独盘点「参考实现没有、但我的宿主特有」的能力**，才能避免。

### 3.2 三次视觉返工

| 我们以为 | 实际 | 怎么发现的 |
|---|---|---|
| 品牌色 `#6366f1` | `#7260EB`（暗）/ `#6049e7`（亮） | 从截图取色，全错 |
| 安装框在页面顶部 | 在右侧 380px 侧栏顶部 | 布局推错 |
| 右侧栏用卡片分组 | 用分隔线分组 | 组件结构推错 |

**三次都是「从截图倒推」。** 源码里 `tokens.ts` 写得清清楚楚。

→ 所以提示词里必须写死一条：**一切以源码 token 为准，不要从截图取色。**

### 3.3 结论

**提示词的价值 = 把我们的返工成本，转换成对方的一次做对。**

这份提示词目前 15,876 字节，其中约 40% 是「坑」——每一条都对应我们真实付出过的时间。

---

## 四、接入流程（我们这边怎么走）

### 步骤 1：评估与授权（1 天）

| 项 | 内容 |
|---|---|
| 对方是谁 | 公司 / 产品 / 技术栈 |
| 接入形态 | 编辑器插件 / 桌面客户端 / Web 站 |
| 是否商用 | 影响授权条款 |
| 是否需要「装到本机」 | 决定是否要教他们做安装链路 |

**授权决策点**：

- 只给**参考实现**（不承诺维护）
- 明确**不提供 SLA**：接口可能变，我们没有义务通知
- 要求对方**保留免责声明**（安全审计仅供参考）
- 明确**源盾是唯一安全结论来源**，对方不得自行标注「安全/风险」

### 步骤 2：裁剪源码（半天）

按 2.3 的清单做。建议做成脚本，可复用：

```bash
# 建议实现的裁剪脚本（待开发）
node scripts/prepare-external-package.mjs <target-dir>
```

产出：

```
yuandun-skill-market-reference/
├─ README.md                    ← 从提示词里摘一段「这是什么」
├─ INTEGRATION-PROMPT.md        ← 主材料
├─ reference/                   ← 裁剪后的源码
│  ├─ features/skills/
│  ├─ service/skills/
│  ├─ theme/
│  ├─ styles/
│  ├─ config/skills-endpoints.ts
│  └─ tailwind.config.js
└─ CHANGELOG.md                 ← 参考实现版本
```

**交付前必查**：

- [ ] 无任何 `.env` 文件
- [ ] 无 `src/utils/http/` 完整文件
- [ ] 无 grep 到内部域名（除 `yuandun.gitee.com` 这个公开基址）
- [ ] 无 grep 到 `WILLING_ID` / `ACCESSTOKEN` / 租户相关标识
- [ ] 无其它 17 个业务模块残留

### 步骤 3：交付与对接（半天）

给对方的**开场信息**必须包含：

1. 这份提示词 + 源码包
2. **一句话说清定位**：「源盾是唯一安全结论来源，你只做呈现」
3. **明确不要做什么**：不要自建审计引擎、不要自行判断安全等级
4. 接口限流额度（匿名 60/60s，下载 5/60s）
5. 我们的联系人

### 步骤 4：验收（对方完成后）

我们**不做代码 review**（那是他们的事），只验收三件事：

| 项 | 标准 |
|---|---|
| 视觉一致性 | 截图与源盾官网并排，配色/间距/字阶无明显差异 |
| 安全结论一致 | 同一个 Skill，双方看到的审计结果完全相同 |
| 免责声明存在 | 不能删，且文案不能改 |

---

## 五、对方会问的问题（预判）

### Q1：能不能直接给我们一套跑起来的代码？

**答：不能，但能让你半天跑起来。**

理由：技术栈不同。我们是 Next.js 16 + antd 6，你是编辑器的 React 或者别的 UI 框架。给可运行代码，你要么带着我们的依赖树走（几十 MB），要么拆一天。

给参考实现 + 提示词，你的 AI 能直接在你的栈里重写，反而更快。

### Q2：接口能保证稳定吗？

**答：不保证，但已公开的字段不会删。**

实际约束：
- 字段可能**新增**
- 枚举值可能**扩展**（比如新增分类）
- 端点路径**不会变**

建议对方：解析时对未知字段宽容，不要写死枚举全量。

### Q3：限流太严了，能不能放宽？

匿名限流：查询 60/60s，文件 30/60s，**ZIP 下载 5/60s**。

**放宽的方式是走商务合作拿 key**，不是技术绕过。技术侧的合理做法是：
- 客户端缓存已获取的详情
- 列表翻页时不要预取
- 下载前先确认 `packageSha256`

### Q4：能不能把审计引擎也给我们？

**不。** 这是我们的核心资产。「占据咽喉，不造大脑」——我们做判断，客户端做呈现。

如果对方需要离线审计能力，走私有化部署商务合作。

### Q5：他们做出来的和我们不一样怎么办？

只要满足第 4 步的三条验收（视觉一致、结论一致、免责声明），细节差异**允许**。

**不要追求像素级一致**——那是控制欲，不是质量标准。

---

## 六、风险与控制

| 风险 | 影响 | 控制措施 |
|---|---|---|
| **源码泄露内部配置** | 基础设施暴露 | 裁剪清单 + 交付前 grep 检查（步骤 2） |
| **对方自建审计、标注不一致** | 用户看到矛盾结论，损害源盾公信力 | 授权条款明确 + 验收检查 |
| **对方不保留免责声明** | 法律风险转移给我们 | 验收硬性项 + 合同条款 |
| **接口变更导致对方崩溃** | 对方体验差、影响我们口碑 | 提前告知变更策略；建议对方宽容解析 |
| **对方做得太差，拉低源盾品牌** | 品牌稀释 | 交付前评估对方技术能力；必要时提供设计走查 |
| **提示词被外传** | 我们的内部实践暴露 | 提示词里不写内部信息（已遵守）；标注内部文档 |

**最需要警惕的一条**：对方的 AI 拿到提示词后，可能把它当成「必须逐条实现的需求清单」，反而做出一个僵化的东西。

→ 所以提示词里写了：**「如果你在某处做了和源码不同的判断，写清楚理由。照抄不如理解后重做。」**

---

## 七、我们从中获得什么

这件事不是纯付出。三个收益：

**1. 验证接口设计的通用性**
每接一家客户端，就是对匿名接口的一次真实压力测试。目前已经暴露过 4 个坑（`pageSize` 上限、`category` 中文、游标绑定、字段名不一致），都是接入方替我们发现的。

**2. 扩大审计覆盖面**
客户端越多，「装 Skill 前先看审计」的用户习惯越牢固。这是我们的战略咽喉。

**3. 沉淀可复用的接入资产**
这次做完，下次接第三家就是复制文件。提示词和裁剪脚本会越来越厚。

---

## 八、当前进度

| 项 | 状态 |
|---|---|
| 接入提示词 | ✅ 完成（`docs/INTEGRATION-PROMPT.md`，15.9 KB） |
| 裁剪清单 | ✅ 完成（本文档 2.3 节，已实测验证） |
| **裁剪脚本** | ✅ **完成并实跑通过**（`scripts/prepare-external-package.mjs`） |
| 对外 README 模板 | ✅ 完成（`docs/EXTERNAL-PACKAGE-README.md`） |
| 授权条款文本 | ❌ 待法务 |
| 首个第三方接洽 | ❌ 未开始 |

### 已跑通的交付流程

一条命令产出完整交付包：

```bash
node scripts/prepare-external-package.mjs <trust-center 源码目录> <输出目录>
```

实测输出：

```
[1/5] 按白名单复制       → 46 文件
[2/5] 敏感词扫描         → 6 个敏感词零命中
[3/5] 禁用文件检查       → 无 .env / 密钥
[4/5] 生成 manifest      → JSON 记录来源版本与文件清单
[5/5] 附加交付文档       → INTEGRATION-PROMPT.md + README.md
```

产出结构：

```
<输出目录>/
├─ README.md                  ← 对外说明（4.6 KB）
├─ INTEGRATION-PROMPT.md      ← 接入提示词（15.9 KB）
├─ manifest.json              ← 可追溯记录
└─ reference/                 ← 参考源码（46 文件 / 201.4 KB）
```

**脚本的设计给了个教训**：初版把敏感词扫描范围设成「整个输出包」，结果扫描命中了我自己写在提示词里的 `ACCESSTOKEN` —— 那是我刻意写来当反面案例的（说明源码鉴权层为什么用不了）。后来改成**只扫 `reference/` 源码副本**，文档不参与扫描。

这个细节值得记住：**安全扫描要明确边界，否则会把必要的说明当成泄漏。**

**下一步建议**：法务条款先行。技术上随时可交付。

---

## 附录 A：裁剪脚本设计要点

```js
// scripts/prepare-external-package.mjs 的核心逻辑
// 1. 复制保留清单里的路径
// 2. 删除剥离清单里的路径（即使它们在保留目录内）
// 3. 全文扫描禁用词：WILLING_ID / ACCESSTOKEN / getTenantKey / 内部域名
// 4. 生成 manifest.json 记录：源码 commit、裁剪时间、文件清单哈希
// 5. 打包成 tar.gz
```

**关键**：第 3 步发现命中就**失败退出**，不静默跳过。这是最后一道防线。

## 附录 B：对外一句话介绍（可直接复用）

> 源盾 Skill 集市提供 AI Agent 技能的六维安全审计、能力画像与许可合规信息，全部通过匿名接口开放。本参考实现基于源盾 Web 端裁剪，配合接入提示词，可在任意客户端技术栈中复刻一致的浏览与评估体验。
>
> 安全结论由源盾提供，参考实现只负责呈现。
