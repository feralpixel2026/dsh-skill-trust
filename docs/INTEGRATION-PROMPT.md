# 源盾 Skill 市场 · 客户端接入提示词

> 给第三方 AI 的使用说明：这份提示词 + 源盾前端源码库（`trust-center`）一起给你。
> 你照着它能做出与源盾 Web 端基本一致的页面。
>
> **重要**：这份提示词里最有价值的部分不是「源码在哪」，而是**另一个人照着这套源码实际做过一遍之后踩到的坑**。他全部踩过了，你不用再踩。

---

## 零、先说结论：照抄源码会失败的地方

已经有人拿这套源码做过一个完整客户端（DSH 插件，已发 npm）。他的结论是：

> 源码是 Next.js Web 应用，你是在客户端里做。**能直接搬的只有设计 token、组件结构和交互逻辑，剩下全要重写。** 而且有三个地方如果照着源码的字面意思做，一定会错。

具体是哪三处、错在哪，写在后面。先把基础说清楚。

---

## 一、你收到的源码是什么

`trust-center` v1.13.0（注意：目录名是 v1.18.2，package.json 里是 1.13.0）

**技术栈**（照抄会带着这些依赖）：

| 依赖 | 版本 |
|---|---|
| Next.js | 16.4.1 |
| React | 19.2.5 |
| antd | 6.6.0 |
| Tailwind | 3.4.17 |
| echarts | ^6.0.0 |
| framer-motion | ^12.23.24 |
| lucide-react | ^1.16.0 |

**Skill 市场相关文件**（只读这些，别通读全库）：

```
src/features/community/tenant/skills/
├─ index.tsx                    # 市场页
├─ constants.ts                 # 排序/分类/状态枚举、卡片尺寸
├─ types.ts                     # 数据结构
├─ utils.ts
├─ hooks/useSkillList.ts        # 列表数据 + URL 同步
├─ components/
│  ├─ skill-card/index.tsx      # 卡片 ★重点
│  ├─ skill-filters/index.tsx   # 筛选条
│  ├─ skill-list/index.tsx      # 网格 + 骨架屏
│  ├─ skill-empty/index.tsx     # 空态
│  ├─ abstract-icons.tsx
│  └─ SkillDisclaimerFooter.tsx # 免责声明（法务要求，必须保留）
└─ detail/
   ├─ index.tsx                 # 详情页骨架
   ├─ components/Header.tsx
   ├─ components/PageSkeleton.tsx
   ├─ analysis-tab/index.tsx    # 能力分析
   ├─ audit-tab/index.tsx       # 安全审计 ★最核心
   │  └─ components/
   │     ├─ OverviewSection.tsx
   │     ├─ RadarChart.tsx      # 六维雷达图 ★重点
   │     └─ risk-profile/
   │        ├─ DimensionCard.tsx
   │        ├─ RiskItemDisplay.tsx
   │        └─ DependencyRiskDrawer.tsx
   ├─ files-tab/{index,FileListView,FileDetailView,utils,types,mockData}.tsx
   ├─ history-tab/index.tsx
   ├─ skill-md-tab/index.tsx
   └─ sidebar/
      ├─ index.tsx              # 右侧 380px 信息栏
      └─ SkillInstallBox.tsx    # 安装框 ★流光动效
```

**设计 token**（这三个文件决定整体观感）：

```
src/theme/tokens.ts        # 颜色/字号/间距
src/styles/globals.css     # CSS 变量
tailwind.config.js         # 定制色阶与动画
```

---

## 二、三个「照字面做一定错」的地方

这是本文档的核心。每一条都是前人实际踩过的。

### 坑 1：源码的接口层用不了

源码里 `src/service/skills/client.ts` 通过 `clientRequest` 调接口，而 `clientRequest`（`src/utils/http/clientFetch.ts`）依赖：

- 登录态 `ACCESSTOKEN`（cookie）
- 租户 key（`getTenantKey`）
- 401 跳转逻辑

**但源盾市场接口是匿名的**，不需要任何认证。

如果你照抄 `client.ts` → 会被这一整套鉴权逻辑拖住，最后卡在「为什么一直 401」。

**正确做法**：丢掉整个 `service/` 和 `utils/http/`，只抄 `src/config/api/skills.ts` 里的 8 个路径常量，用宿主自己的 fetch/axios 直接调。

### 坑 2：四个枚举里只有一个用中文，别被类型名骗了

源码 `src/service/skills/types.ts` 里四个枚举长得很像，但**值的语言不一样**：

```ts
export enum SkillCategory {          // ← 值是中文！
  SOFTWARE_DEV = '软件研发',
  DATA_ANALYSIS = '数据与分析',
  CONTENT_CREATION = '内容与创作',
  BUSINESS_MGMT = '业务与管理',
  AI_AUTOMATION = 'AI与自动化',
  OTHER = '其他',
}

export enum SkillSortBy {             // ← 值是英文
  COMPREHENSIVE = 'COMPREHENSIVE',
  DOWNLOADS = 'DOWNLOADS',
  STARS = 'STARS',
  LATEST = 'LATEST',
}

export enum SkillSecurityStatus {     // ← 值是英文
  NOT_AUDITED = 'NOT_AUDITED',
  AUDITING = 'AUDITING',
  SAFE = 'SAFE',
  SUSPECTED = 'SUSPECTED',
  RISKY = 'RISKY',
}

export enum SkillRuntimeRequirement { // ← 值是英文
  LOCAL = 'LOCAL',
  EXTERNAL_NO_CREDENTIAL = 'EXTERNAL_NO_CREDENTIAL',
  EXTERNAL_WITH_CREDENTIAL = 'EXTERNAL_WITH_CREDENTIAL',
}
```

**所以：**

| 参数 | 传什么 |
|---|---|
| `category` | **中文**（`软件研发`），传 `SOFTWARE_DEV` 会 400 |
| `sortBy` | 英文（`COMPREHENSIVE`） |
| `securityStatus` | 英文（`SAFE`） |
| `runtimeRequirement` | 英文（`LOCAL`） |

**为什么容易错**：`SkillCategory.SOFTWARE_DEV` 这个写法看起来像「英文标识符」，直觉会以为值也是英文。但它实际是 `'软件研发'`。
**照抄源码的枚举定义不会错**（因为值已经写在里面了）——**错在你如果自己重新定义一套类型、或者用 TypeScript 的 `keyof`/反查去构造参数，就会把 key 当成值发出去。**

`constants.ts` 里的 `SKILL_SCENE_OPTIONS` 用的是 `key: SkillCategory.SOFTWARE_DEV`，所以它发出的就是中文。照抄 `constants.ts` 是安全的。

### 坑 3：`pageSize` 上限 30，不是 60

源码 `constants.ts` 有 `CARD_PAGE_SIZE = 20`。你可以用 20，但**最大只能 30**。传 31 直接 400。

其它两个参数细节：
- `sortBy` 用英文枚举（`COMPREHENSIVE` `DOWNLOADS` `STARS` `LATEST`）
- `securityStatus` 用英文枚举（`SAFE` `RISKY` `SUSPECTED` `NOT_AUDITED` `AUDITING` `ALL`）
- `cursor` 与 `sortBy` 绑定，换排序必须回第一页，否则 `SKILL_CURSOR_INVALID`

**一句话**：同一套接口，`category` 要中文，其余三个枚举要英文。这个不一致是上游的历史包袱，不是你能改的。**照抄源码的枚举定义最安全**——值已经写在里面了。

---

## 三、做视觉时最容易失真的三处

前人的原话：**「按截图倒推设计，系统性全错。」**

他从截图推断品牌色是 `#6366f1`，实际是 `#7260EB`（暗色）/ `#6049e7`（亮色）。他从截图推断安装框在顶部，实际在**右侧 380px 侧栏顶部**。

所以：**一切以 `tokens.ts` 和 `globals.css` 为准，不要从截图或官网取色。**

### 3.1 配色纪律

| 项 | 值 |
|---|---|
| 品牌主色（暗） | `#7260EB` |
| 品牌主色（亮） | `#6049e7` |
| 页面底色 | `#070707`（近黑，不是纯黑） |
| 卡片容器 | `#171718` |
| 外层容器 | `#0f0f10` |
| 成功 | `#4ade80` |
| 错误 | `#f87171` |
| 警告 | `#fbbf24` |
| 信息 | `#60a5fa` |
| 细分隔线 | `rgba(255,255,255,0.05)` |
| 内容最大宽 | 1152px（`max-w-6xl`） |
| 卡片最小宽 / 间距 | 320px / 24px |

**灰阶是主角，紫色是唯一强调。** 加第二个强调色，观感立刻变廉价。

**红橙只标真风险**：`AUDITING`（审计中）是紫色，`NOT_AUDITED` 是灰色，都不是红色。红色只给 `RISKY`。这不是美学偏好，滥用会让真风险失去警示力。

### 3.2 三个有讲究的细节

**① Hero 氛围光**（`index.tsx` 顶部）

主标题背后有极淡紫色光晕。实现是**两个椭圆 + 大模糊**：
- 两个 `radial-gradient` 椭圆
- blur 约 100px / 80px
- 底部 `mask-image` 做 20% 渐隐
- 整体透明度极低——**几乎察觉不到，但去掉就「死」了**

**② 六维雷达图**（`RadarChart.tsx`）

- 画布 300×300，半径 100，标签外扩 26px
- **顶点颜色各自独立**，但**多边形边线和填充取最差那一维的颜色**
- 分值：`SAFE=4` `INCONCLUSIVE=3` `SUSPECTED=2` `RISKY=1`
- 六个维度固定顺序：`instruction_security` `code_security` `permission_security` `data_security` `dependency_security` `anomaly_detection`
- 图标：Terminal / Code / Lock / Database / Package / VenetianMask

源码用 echarts，**你手写 SVG 更好**（前人就是手写的，效果一致且零依赖）。

**③ 安装框流光**（`SkillInstallBox.tsx`）

边框上一道绕圈的光。`conic-gradient` + `@property` 角度动画，**4 秒一圈**。不是 GIF，不是 box-shadow 动画。

---

## 四、源码没有、但你应该做的东西

**这条是前人最大的教训。**

源码是 Web 端，天然没有「本机已安装」这个概念（浏览器不能扫磁盘）。

他按源码重写列表页时，**把「本机已安装」入口弄丢了**——函数还在、按钮也在，但没有任何地方调用它，形成单向死路。

**教训**：对齐参考实现时，必须单独盘点「参考实现没有、但我这个宿主特有」的能力，逐项确认入口还在。

如果你的宿主是本地客户端（有文件系统权限），这些能力值得做：

| 能力 | 说明 |
|---|---|
| **本机已安装盘点** | 扫 `~/.agents/skills`、`~/.claude/skills` 等目录，解析 `SKILL.md` 的 frontmatter |
| **一键装到本机** | 比 Web 端的「复制安装 Prompt」体验好得多 |
| **离线缓存** | 缓存已下载的技能信息 |

### 做本机盘点时的一个细节

大量现成技能的 `description` 是**给模型看的触发条件**，例如：

```
Use when the user needs to run GitNexus CLI commands like analyze a repo...
```

直接显示给人看很别扭。建议做一层改写，剥掉 `Use this skill to` / `Use when the user needs to` 这类套话前缀。

**但必须保守**：判断不出来的**宁可原样显示**，别切出半截句子。前人第一版剥得太激进，产生了 `About GitNexus itself —...`、`Know what will break...` 这种不通的片段，比原句更糟。

---

## 五、安装流程（如果宿主能写本地磁盘）

**源码帮不了你这里**——Web 端只能「复制 Prompt」或「下载 ZIP」。

完整链路：

```
① 取 detail → 拿到 packageSha256（钉住具体版本，不能跳）
② 带 packageSha256 下载 ZIP
③ 三重校验：
     · 响应头 X-Skill-SHA256
     · detail.packageSha256
     · 本地实算 SHA256
   三者必须完全一致
④ 解包
⑤ 写入技能目录 + 写一个 _meta.json 记录版本/哈希/来源
```

**解包必须拒绝**：
- 绝对路径（`/etc/passwd`、`C:\Windows\x.dll`）
- 盘符、`..` 段、**空段**（`a//b`）
- 反斜杠路径
- 符号链接条目
- 加密条目
- 超限：单文件 32MB / 总量 128MB / 条目数 2000

**校验不通过必须中止**，不能「先装再说」。

### 前人踩过的一个坑

「只读前 64KB 判断 frontmatter」时，最初写成「文件 > 64KB 就整条跳过」，**这是错的**——等于把大技能的中文名和描述全丢了。

正确做法：**始终只读前 64KB**。截断本身是安全的（没有结束 `---` 就降级为「无 frontmatter」，不抛错）。

---

## 六、实施顺序

别跳步。

**第 1 步：通读设计 token**
读 `tokens.ts` + `globals.css` + `tailwind.config.js`，把颜色/字号/间距/圆角抄成宿主主题配置。
**不做这步，后面全是返工。**

**第 2 步：静态列表页**
用 `service/skills/mock.ts` 里的假数据，把 Hero + 筛选条 + 卡片网格摆出来。
目标：截图和源盾并排看，**看不出明显差异**。

**第 3 步：接真实接口**
替换假数据，处理加载/空/错误/分页。注意第二节的四个参数陷阱。

**第 4 步：详情页壳**
五个页签先搭空壳（切换能用的空页签），再逐个填。

**第 5 步：填页签内容**（按价值排序，不是按顺序）
1. **安全审计** —— 最核心。雷达图 + 逐维度卡片 + 风险证据定位到「文件:行号」
2. **能力分析** —— 输入输出契约、执行模式、运行时依赖
3. **Skill.md** —— 页内渲染 markdown
4. **Skill 文件** —— 文件树 + 点开看单文件
5. **历史版本**

**第 6 步：安装能力**（若宿主支持）

**第 7 步：打磨**
- 骨架屏（**不要转圈**）
- 空态要说清「为什么没有 + 下一步做什么」，不是「暂无数据」
- 错误重试
- 窄屏适配（<320px 单列）

---

## 七、验收清单

- [ ] 市场页截图与源盾并排，**配色/间距/字号看不出明显差异**
- [ ] 1152px 宽下正好三列卡片
- [ ] 五种安全状态徽章颜色与源码一致
- [ ] 雷达图符合「多边形取最差维度」规则
- [ ] 搜索、四种排序、三组筛选都正常，**换排序不报 400**
- [ ] 五个页签都有内容（能力画像未生成时显示「分析中」而非空白）
- [ ] 安装流程（若有）三重校验齐全，失败会中止
- [ ] 界面上不出现 `null` / `undefined` / `NaN` / `vnull`
- [ ] 加载态是骨架屏不是转圈
- [ ] 错误态有明确原因和重试入口
- [ ] 「本机已安装」这类宿主特有能力，**入口没丢**

---

## 八、几个会让你返工的提醒

**1. 别从截图取色**
前人的教训：截图推 `#6366f1`，实际 `#7260EB`。一切以源码 token 为准。

**2. 别加第四个强调色**
品牌紫是唯一强调。

**3. 卡片信息不要贪多**
源码卡片只有 5 项：图标、标题、徽章、描述（两行）、底部统计。加第 6 项密度就崩。

**4. 免责声明不能删**
`SkillDisclaimerFooter.tsx` 是法务要求：审计结果仅供参考，使用者需自行评估风险。保留原文。

**5. 能力画像可能全空**
`capabilityStatus !== 'SUCCEEDED'` 时所有分析字段都是 `null`。这不是 bug，是源盾还没生成。**显示「分析中」，不要空卡片。**

**6. 一个字段两个名字**
列表卡片用 `installs`，详情用 `downloadCount`。同一样东西。

---

## 九、交付什么

1. 可运行的页面（市场页 + 详情页）
2. `README`：技术选型、如何启动、接口对接方式、做了哪些适配
3. 截图：市场页、详情页、安全审计页
4. **已知差异清单**：哪些和源盾不一致、为什么

**如果你在某处做了和源码不同的判断，写清楚理由。照抄不如理解后重做。**

---

## 十、一句话定位

> 源盾 Skill 市场不是「技能列表页」。
>
> 它的价值是让用户在**按下安装之前**就知道：这东西是谁做的、能干什么、有没有风险、风险在哪一行代码。

所有设计决策都服务于这句话。偏离它的功能可以砍，服务它的细节值得花时间。

---

## 附录：接口速查

**基址**：`https://yuandun.gitee.com`

| 端点 | 用途 | 参数 |
|---|---|---|
| `GET /yuandun/ui/skills` | 列表 | `keyword` `category`(中文) `runtimeRequirement` `securityStatus`(英文) `sortBy`(英文) `cursor` `pageSize`(≤30) |
| `GET /yuandun/ui/skills/detail` | 详情 | `name` |
| `GET /yuandun/ui/skills/capability` | 能力画像 | `name` |
| `GET /yuandun/ui/skills/security-audit` | 六维审计 | `name` |
| `GET /yuandun/ui/skills/versions` | 版本历史 | `name` |
| `GET /yuandun/ui/skills/files` | 文件清单 | `name` |
| `GET /yuandun/ui/skills/file` | 单文件文本 | `name` `path` |
| `GET /yuandun/ui/skill-downloads` | 下载 ZIP | `name` `version` `packageSha256` |

**不要调用** `POST /yuandun/ui/skills/security-audit/trigger`——这是后台管理接口，审计由源盾服务端负责，客户端只读结果。

**限流**（按 IP）：
- 查询类 60 次/60 秒
- 文件预览 30 次/60 秒
- **ZIP 下载 5 次/60 秒**

超限返回 429，带 `Retry-After`。

**错误码**：`SKILL_CURSOR_INVALID` `SKILL_NOT_FOUND` `SKILL_ARTIFACT_MISMATCH` `SKILL_STORAGE_UNAVAILABLE`
