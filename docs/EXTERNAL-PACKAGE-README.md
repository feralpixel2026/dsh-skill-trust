# 源盾 Skill 集市 · 客户端接入参考实现

> 本包帮助你（或你的 AI 助手）在**任意客户端技术栈**里，复刻源盾 Web 端 Skill 集市的浏览与评估体验。

---

## 这是什么

两个部分：

| 内容 | 用途 |
|---|---|
| **`INTEGRATION-PROMPT.md`** | **先读这个。** 给 AI 读的施工说明书，包含接口陷阱、视觉要点、实施顺序 |
| **`reference/`** | 从源盾 Web 端裁剪的参考源码，用来对照设计 token 与组件结构 |

**关键认知**：`reference/` 是**参考物**，不是可运行代码。它是 Next.js + antd 写的，你大概率不是这个栈。正确用法是**读它、理解它、在你的栈里重写**。

直接照抄会踩坑，坑已经写在提示词里了。

---

## 三步走

### 1. 读提示词（30 分钟）

把 `INTEGRATION-PROMPT.md` 全文给你的 AI。这份文档里约 40% 是「别人照着这套源码实际做了一遍之后踩到的坑」，能省掉你几天返工。

重点看：

- **第二章**「三个照字面做一定错的地方」—— 接口层的鉴权依赖、枚举值的语言不一致、`pageSize` 上限
- **第三章**「做视觉时最容易失真的三处」—— 一切以 `reference/theme/tokens.ts` 为准，**不要从截图取色**
- **第四章**「源码没有、但你应该做的东西」—— 参考实现是 Web 端，天然没有的能力

### 2. 对照参考实现（半天）

按这个顺序看，别一上来就通读：

```
reference/theme/tokens.ts              ← 颜色/字号/间距的权威来源
reference/styles/                      ← CSS 变量
reference/tailwind.config.js           ← 定制色阶与动画
reference/features/.../skills/
  ├─ constants.ts                      ← 排序/分类/状态枚举、卡片尺寸
  ├─ components/skill-card/index.tsx   ← 卡片，最重要的组件
  └─ detail/audit-tab/components/RadarChart.tsx  ← 六维雷达图
```

### 3. 开始实现（按提示词第六章的顺序）

---

## 接口速查

**基址**：`https://yuandun.gitee.com`

| 端点 | 用途 |
|---|---|
| `GET /yuandun/ui/skills` | 列表 / 搜索 / 排序 / 筛选 |
| `GET /yuandun/ui/skills/detail` | 详情 |
| `GET /yuandun/ui/skills/capability` | 能力画像 |
| `GET /yuandun/ui/skills/security-audit` | 六维安全审计 |
| `GET /yuandun/ui/skills/versions` | 版本历史 |
| `GET /yuandun/ui/skills/files` | 文件清单 |
| `GET /yuandun/ui/skills/file` | 单文件文本 |
| `GET /yuandun/ui/skill-downloads` | 下载 ZIP |

**全部匿名可用，无需认证。**

### 三个必须知道的参数约定

| 参数 | 传什么 | 陷阱 |
|---|---|---|
| `category` | **中文**（`软件研发`） | 传 `SOFTWARE_DEV` 返回 400 |
| `sortBy` | 英文（`COMPREHENSIVE`） | |
| `securityStatus` | 英文（`SAFE`） | |
| `pageSize` | **≤ 30** | 传 31 返回 400 |

**游标**：`cursor` 与 `sortBy` 绑定。换排序必须回第一页，否则返回 `SKILL_CURSOR_INVALID`。

### 限流（按 IP）

| 操作 | 额度 |
|---|---|
| 查询类 | 60 次 / 60 秒 |
| 文件预览 | 30 次 / 60 秒 |
| **ZIP 下载** | **5 次 / 60 秒** |

超限返回 429，响应头带 `Retry-After`。

---

## 定位边界（重要）

**源盾是唯一的安全结论来源。**

- ✅ 你可以在界面里展示源盾给出的审计结果
- ❌ 你不能自行判断某个 Skill「安全」或「有风险」
- ❌ 你不能自建审计引擎再标注结论

原因：如果用户在不同客户端看到矛盾的结论，源盾的公信力就没了。

**另外**：界面上的免责声明（`SkillDisclaimerFooter` 的内容）是法务要求，**必须保留原文，不能删改**。

---

## 你能自己扩展的部分

参考实现是 Web 端，有些事它做不了但你可以做：

| 能力 | 为什么参考实现没有 |
|---|---|
| **本机已安装盘点** | 浏览器不能扫本地磁盘 |
| **一键装到本机** | 浏览器没有文件系统权限 |
| **离线缓存** | Web 端不需要 |

如果你的宿主是本地客户端（编辑器插件、桌面应用），这些值得做——尤其「装到本机」，体验比 Web 端的「复制安装 Prompt」好得多。

安装链路的完整要求（尤其是三重 SHA256 校验和 ZIP 安全解包）写在提示词第五章。

---

## 目录说明

```
.
├─ README.md                  ← 本文件
├─ INTEGRATION-PROMPT.md      ← 接入提示词（核心材料）
├─ manifest.json              ← 交付记录：来源版本、文件清单、哈希
└─ reference/                 ← 裁剪后的参考源码
   ├─ features/.../skills/    ← 32 个页面与组件
   ├─ service/skills/         ← 数据结构定义
   ├─ theme/                  ← 设计 token ★
   ├─ styles/                 ← CSS 变量
   ├─ config/api/skills.ts    ← 端点常量
   └─ tailwind.config.js      ← 色阶与动画
```

---

## 需要帮助

| 问题类型 | 联系方式 |
|---|---|
| 接口字段含义、审计结果解读 | 源盾团队 |
| 接入技术问题 | 源盾团队 |
| 商务合作（限流放宽、私有化） | 源盾商务 |

---

## 关于这份参考实现

- **不承诺维护**：接口可能变更，我们没有义务主动通知。建议对未知字段宽容解析
- **不提供 SLA**
- **开源许可**：参考实现的使用范围以双方协议为准

---

*源盾 · 让 AI Agent 的能力可被信任*
