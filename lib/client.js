window.__ModuleLoader__.load({
  id: 'dsh-skill-trust',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const API = '/dsh-skill-trust';
    const PAGE_SIZE = 20;

    /* ==================================================================== *
     * 设计 token —— 逐项取自源盾前端源码
     *   src/theme/tokens.ts      语义色 / 主色
     *   src/styles/globals.css   容器 / 描边 / 氛围光
     *   tailwind.config.js       text-color-* 层级
     *
     * 容器类颜色先取宿主主题 token，缺失时回落到源盾深色值；
     * 主色与状态色是品牌语义，保持源盾的固定值。
     * ==================================================================== */

    const C = {
      // 主色：深色主题 #7260EB（源码 darkTokens.colorPrimary），浅色 #6049e7
      primary: 'var(--dst-primary)',
      primarySoft: 'var(--dst-primary-soft)',
      primaryBorder: 'var(--dst-primary-border)',

      // 容器
      page: 'var(--dst-page)',
      container: 'var(--dst-container)',

      // 文字四级（源码 color-400/300/200/100，由深到浅）
      text: 'var(--dst-text)',
      textSub: 'var(--dst-text-sub)',
      textTertiary: 'var(--dst-text-tertiary)',
      textQuaternary: 'var(--dst-text-quaternary)',

      // 描边
      narrow: 'var(--dst-narrow)',
      split: 'var(--dst-split)',

      // 填充
      fill50: 'var(--dst-fill-50)',
      fill100: 'var(--dst-fill-100)',
      fill200: 'var(--dst-fill-200)',

      // 状态
      success: 'var(--dst-success)',
      successBg: 'var(--dst-success-bg)',
      successBorder: 'var(--dst-success-border)',
      warning: 'var(--dst-warning)',
      warningBg: 'var(--dst-warning-bg)',
      warningBorder: 'var(--dst-warning-border)',
      error: 'var(--dst-error)',
      errorBg: 'var(--dst-error-bg)',
      errorBorder: 'var(--dst-error-border)',
      info: 'var(--dst-info)',
    };

    /* 风险状态映射：与源码 OVERALL_RISK_STYLE_MAP 一一对应 */
    const RISK_MAP = {
      NOT_AUDITED: { label: '未审计', token: 'neutral', icon: 'circleDashed' },
      AUDITING: { label: '审计中', token: 'primary', icon: 'scan' },
      RISKY: { label: '发现风险', token: 'error', icon: 'shieldAlert' },
      SUSPECTED: { label: '疑似风险', token: 'warning', icon: 'alert' },
      SAFE: { label: '安全', token: 'success', icon: 'shieldCheck' },
    };

    /* 六维图标：对应源码 DimensionCard 的 DIMENSION_ICONS */
    const DIMENSION_ICONS = {
      instruction_security: 'terminal',
      code_security: 'code',
      permission_security: 'lock',
      data_security: 'database',
      dependency_security: 'package',
      anomaly_detection: 'mask',
    };

    const RUNTIME_LABELS = {
      LOCAL: '本地运行',
      EXTERNAL_NO_CREDENTIAL: '外部服务(无需凭证)',
      EXTERNAL_WITH_CREDENTIAL: '外部服务(需凭证)',
    };
    const RUNTIME_ICONS = {
      LOCAL: 'laptop',
      EXTERNAL_NO_CREDENTIAL: 'lockOpen',
      EXTERNAL_WITH_CREDENTIAL: 'key',
    };

    const SORT_OPTIONS = [
      { value: 'COMPREHENSIVE', label: '全部' },
      { value: 'DOWNLOADS', label: '下载量' },
      { value: 'STARS', label: '收藏量' },
      { value: 'LATEST', label: '最近上新' },
    ];

    /**
     * 已安装页排序：纯前端重排，切换不重新请求。
     *
     * 只保留两档：
     *   - 安装时间（默认）：installedAt 优先，回退 SKILL.md 的 mtime，倒序
     *   - 名称：displayName || name || slug 升序
     *
     * 这里**没有**「来源」档：实测本机 43 个技能全部来自 ~/.agents/skills
     * （~/.claude/skills 的 15 个与之完全同名，已被 seen 去重），rootLabel
     * 只有一种取值，按它排序等于没排。rootLabel 仍作为**信息**显示在卡片
     * footer 上，只是不再作为排序依据。
     *
     * 「安装时间」依据的是文件时间，只能算**近似**安装时刻，所以这一档配一行
     * 「按文件时间近似」的小字说明，卡片上的时间也写「修改于」而不是「安装于」。
     */
    const LOCAL_SORT_OPTIONS = [
      { value: 'INSTALLED', label: '安装时间' },
      { value: 'NAME', label: '名称' },
    ];

    const SCENE_OPTIONS = [
      { value: '', label: '所有场景' },
      { value: '软件研发', label: '软件研发' },
      { value: '数据与分析', label: '数据与分析' },
      { value: '内容与创作', label: '内容与创作' },
      { value: '业务与管理', label: '业务与管理' },
      { value: 'AI与自动化', label: 'AI与自动化' },
      { value: '其他', label: '其他' },
    ];

    const STATUS_OPTIONS = [
      { value: '', label: '所有状态' },
      { value: 'NOT_AUDITED', label: '未审计' },
      { value: 'AUDITING', label: '审计中' },
      { value: 'SAFE', label: '安全' },
      { value: 'SUSPECTED', label: '疑似风险' },
      { value: 'RISKY', label: '发现风险' },
    ];

    const RUNTIME_OPTIONS = [
      { value: '', label: '所有运行要求' },
      { value: 'LOCAL', label: '本地运行' },
      { value: 'EXTERNAL_NO_CREDENTIAL', label: '依赖外部服务 (无需凭证)' },
      { value: 'EXTERNAL_WITH_CREDENTIAL', label: '依赖外部服务 (需凭证)' },
    ];

    const NO_DATA = '—';

    /* ==================================================================== *
     * 样式
     * ==================================================================== */

    const styles = `
.dst-root {
  --dst-primary: #7260EB;
  --dst-primary-soft: color-mix(in srgb, #7260EB 14%, transparent);
  --dst-primary-border: color-mix(in srgb, #7260EB 30%, transparent);
  --dst-page: var(--dsw-alias-bg-base, #070707);
  --dst-container: var(--dsw-alias-bg-layer-2, #171718);
  --dst-text: var(--dsw-alias-label-primary, #f2f3f5);
  --dst-text-sub: var(--dsw-alias-label-secondary, #b4b8bf);
  --dst-text-tertiary: color-mix(in srgb, var(--dsw-alias-label-secondary, #b4b8bf) 78%, transparent);
  --dst-text-quaternary: color-mix(in srgb, var(--dsw-alias-label-secondary, #b4b8bf) 55%, transparent);
  --dst-narrow: var(--dsw-alias-border-l2, rgba(255,255,255,.06));
  --dst-split: var(--dsw-alias-border-l2, rgba(255,255,255,.08));
  --dst-fill-50: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.03));
  --dst-fill-100: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.05));
  --dst-fill-200: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.08));
  --dst-success: var(--dsw-alias-state-success-primary, #4ade80);
  --dst-success-bg: color-mix(in srgb, var(--dsw-alias-state-success-primary, #4ade80) 12%, transparent);
  --dst-success-border: color-mix(in srgb, var(--dsw-alias-state-success-primary, #4ade80) 30%, transparent);
  --dst-warning: var(--dsw-alias-state-warn-primary, #fbbf24);
  --dst-warning-bg: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #fbbf24) 12%, transparent);
  --dst-warning-border: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #fbbf24) 30%, transparent);
  --dst-error: var(--dsw-alias-state-error-primary, #f87171);
  --dst-error-bg: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f87171) 12%, transparent);
  --dst-error-border: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f87171) 30%, transparent);
  --dst-info: #60a5fa;
  background:var(--dst-page); color:var(--dst-text);
  width:100%; height:100%; overflow-y:auto; position:relative;
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size:13px;
}
.dst-root * { box-sizing:border-box; }
.dst-root ::-webkit-scrollbar { width:6px; height:6px; }
.dst-root ::-webkit-scrollbar-track { background:transparent; }
.dst-root ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.15); border-radius:9999px; }
.dst-root ::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.25); }

/* 顶部氛围光：源码用 primary/60 + blue-500/30 的双椭圆模糊 */
.dst-glow { pointer-events:none; position:absolute; inset:0 0 auto; height:600px; overflow:hidden; z-index:0;
  -webkit-mask-image:linear-gradient(to bottom, #fff 20%, transparent 100%);
  mask-image:linear-gradient(to bottom, #fff 20%, transparent 100%); }
.dst-glow::before, .dst-glow::after { content:''; position:absolute; border-radius:100%; }
.dst-glow::before { top:-20%; left:50%; transform:translateX(-50%); height:60%; width:70%; max-width:800px;
  background:var(--dst-primary); opacity:.30; filter:blur(100px); }
.dst-glow::after { top:-10%; left:20%; height:50%; width:40%;
  background:#3b82f6; opacity:.18; filter:blur(80px); }

.dst-shell { position:relative; z-index:1; width:100%; display:flex; flex-direction:column; }
.dst-wrap { width:100%; max-width:1152px; margin:0 auto; display:flex; flex-direction:column; min-height:100%; }

/* Hero */
.dst-hero { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 0 48px; }
.dst-hero-title { margin:0; font-size:48px; line-height:1.18; font-weight:500; letter-spacing:1px; color:var(--dst-text); text-align:center; }
.dst-hero-sub { margin:8px 0 32px; font-size:16px; line-height:1.5; color:var(--dst-text-sub); text-align:center; }

/* 搜索框：rounded-full + 毛玻璃 */
.dst-search { position:relative; width:100%; max-width:672px; }
.dst-search-box { display:flex; align-items:center; gap:6px; width:100%; padding:8px 14px 8px 16px;
  border-radius:9999px; border:1px solid var(--dst-narrow);
  background:var(--dst-fill-100); backdrop-filter:blur(12px); transition:border-color .3s, background .3s; }
.dst-search-box:focus-within { border-color:var(--dst-primary-border); background:var(--dst-fill-200); }
.dst-search-box svg { flex:none; color:var(--dst-text-tertiary); }
.dst-search input { flex:1; min-width:0; height:26px; border:0; outline:none; background:transparent;
  color:var(--dst-text); font:inherit; font-size:14px; }
.dst-search input::placeholder { color:var(--dst-text-quaternary); }
.dst-search-go { flex:none; display:flex; align-items:center; gap:4px; padding:4px 8px; border:0; border-radius:6px;
  background:var(--dst-fill-200); color:var(--dst-text-tertiary); font:inherit; font-size:12px; cursor:pointer; }
.dst-search-go:hover { background:var(--dst-fill-200); color:var(--dst-text); }

/* 筛选条 */
.dst-filters { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:0 24px 8px; flex-wrap:wrap; }
.dst-sorts { display:flex; align-items:center; gap:8px; }
.dst-sort { padding:6px 16px; border:0; border-radius:9999px; background:transparent;
  color:var(--dst-text-sub); font:inherit; font-size:14px; cursor:pointer; transition:color .2s, background .2s; white-space:nowrap; }
.dst-sort:hover { background:var(--dst-fill-200); color:var(--dst-text); }
.dst-sort[data-active='true'] { background:var(--dst-fill-200); color:var(--dst-text); }
.dst-selects { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

.dst-dd { position:relative; }
.dst-dd-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid var(--dst-narrow);
  border-radius:8px; background:transparent; color:var(--dst-text-sub); font:inherit; font-size:14px;
  cursor:pointer; white-space:nowrap; transition:background .2s, color .2s; }
.dst-dd-btn:hover { background:var(--dst-fill-100); }
.dst-dd-btn[data-open='true'], .dst-dd-btn[data-picked='true'] { color:var(--dst-text); }
.dst-dd-caret { display:flex; transition:transform .2s; }
.dst-dd-btn[data-open='true'] .dst-dd-caret { transform:rotate(180deg); }
.dst-dd-menu { position:absolute; z-index:50; top:calc(100% + 6px); right:0; min-width:100%; padding:6px;
  border-radius:12px; border:1px solid var(--dst-split); background:var(--dst-container);
  box-shadow:0 12px 32px rgba(0,0,0,.45); max-height:320px; overflow-y:auto; }
.dst-dd-item { display:block; width:100%; text-align:left; padding:8px 11px; border:0; border-radius:7px;
  background:transparent; color:var(--dst-text-sub); font:inherit; font-size:13px; cursor:pointer; white-space:nowrap; }
.dst-dd-item:hover { background:var(--dst-fill-200); color:var(--dst-text); }
.dst-dd-item[data-active='true'] { color:var(--dst-primary); background:var(--dst-primary-soft); }

/* 卡片网格：CARD_MIN_WIDTH 320 / GAP 24 */
.dst-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:24px; padding:0 24px 32px; }
.dst-card { display:flex; flex-direction:column; height:100%; padding:20px; border-radius:12px;
  border:1px solid var(--dst-narrow); background:var(--dst-container); cursor:pointer;
  transition:transform .3s cubic-bezier(.4,0,.2,1), border-color .3s, box-shadow .3s; text-align:left; }
.dst-card:hover { transform:scale(1.015); border-color:var(--dst-primary-border);
  box-shadow:0 16px 36px -8px rgba(114,96,235,.18); }
.dst-card-top { display:flex; align-items:center; gap:16px; }
.dst-card-logo { flex:none; width:48px; height:48px; border-radius:16px; overflow:hidden;
  display:grid; place-items:center; font-size:16px; font-weight:700; color:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); }
.dst-card-logo img { width:100%; height:100%; object-fit:cover; }
.dst-card-head { min-width:0; display:flex; flex-direction:column; gap:2px; }
.dst-card-name { margin:0 0 4px; font-size:15px; font-weight:500; color:var(--dst-text);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dst-card-tags { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.dst-pill-mini { height:20px; display:inline-flex; align-items:center; padding:1px 8px; border-radius:9999px;
  border:1px solid var(--dst-narrow); color:var(--dst-text-sub); font-size:10px; white-space:nowrap; }
.dst-card-desc { margin:0; padding-top:12px; font-size:13px; line-height:20px; color:var(--dst-text-sub);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:40px; }
.dst-card-foot { margin-top:auto; display:flex; align-items:center; justify-content:space-between; padding-top:12px; gap:8px; }
.dst-card-stats { display:flex; align-items:center; gap:16px; color:var(--dst-text-sub); }
.dst-stat { display:inline-flex; align-items:center; gap:6px; font-size:12px; }
.dst-stat svg { opacity:.7; }
.dst-card-right { display:flex; align-items:center; gap:8px; }
.dst-ver { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; color:var(--dst-text-tertiary); }

/* 风险徽章 */
.dst-risk { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:9999px;
  font-size:11px; white-space:nowrap; }

/* 骨架 */
.dst-skel { height:184px; border-radius:12px; border:1px solid var(--dst-narrow);
  background:var(--dst-container); animation:dst-pulse 1.6s ease-in-out infinite; }
@keyframes dst-pulse { 0%,100% { opacity:1 } 50% { opacity:.55 } }

/* 详见 / 空态 / 错误 */
.dst-empty { padding:56px 20px; text-align:center; color:var(--dst-text-sub); font-size:14px; }
.dst-error { margin:16px 24px; padding:13px 16px; border-radius:11px;
  border:1px solid var(--dst-error-border); background:var(--dst-error-bg); color:var(--dst-error);
  display:flex; align-items:center; justify-content:space-between; gap:12px; }
.dst-more { display:flex; justify-content:center; padding:0 24px 48px; }

/* 按钮 */
.dst-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:32px; padding:0 16px;
  border-radius:9999px; border:1px solid var(--dst-narrow); background:transparent;
  color:var(--dst-text-sub); font:inherit; font-size:13px; cursor:pointer; transition:background .2s, color .2s; }
.dst-btn:hover:not(:disabled) { background:var(--dst-fill-100); color:var(--dst-text); }
.dst-btn:disabled { opacity:.5; cursor:not-allowed; }
.dst-btn-primary { border-color:transparent; background:var(--dst-primary); color:#fff; }
.dst-btn-primary:hover:not(:disabled) { background:color-mix(in srgb, var(--dst-primary) 88%, #fff); color:#fff; }
.dst-btn-sm { height:26px; padding:0 12px; font-size:12px; }
.dst-btn-round { border-radius:9999px; }

/* 免责声明 footer */
.dst-footer { width:100%; margin-top:auto; border-top:1px solid var(--dst-narrow); padding-top:48px; padding-bottom:32px; }
.dst-footer-inner { max-width:1152px; margin:0 auto; padding:0 24px; display:flex; flex-direction:column; gap:24px;
  font-size:12px; line-height:1.7; color:var(--dst-text-quaternary); }
.dst-footer p { margin:0 0 8px; color:var(--dst-text-tertiary); }
.dst-footer a { color:var(--dst-text-tertiary); text-decoration:none; }
.dst-footer a:hover { color:var(--dst-text-sub); }
.dst-footer-line { display:flex; flex-wrap:wrap; align-items:center; gap:12px; border-top:1px solid var(--dst-narrow); padding-top:20px; }
.dst-dot { color:var(--dst-text-sub); }

/* ======================= 详情页 ======================= */
.dst-detail { position:relative; z-index:1; width:100%; display:flex; flex-direction:column; min-height:100%; }
.dst-crumb { max-width:1152px; width:100%; margin:0 auto; display:flex; align-items:center; gap:8px;
  padding:16px 24px 8px; font-size:13px; color:var(--dst-text-sub); }
.dst-crumb-link { border:0; background:transparent; padding:0; color:var(--dst-text-sub); font:inherit; cursor:pointer; }
.dst-crumb-link:hover { color:var(--dst-text); }
.dst-crumb-sep { color:var(--dst-text-quaternary); }
.dst-crumb-cur { color:var(--dst-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Header */
.dst-dhead { width:100%; padding-top:8px; }
.dst-dhead-inner { max-width:1152px; margin:0 auto; display:flex; align-items:flex-start; padding:0 24px; }
.dst-dhead-main { min-width:0; flex:1; display:flex; flex-direction:column; gap:16px; }
.dst-dhead-row { display:flex; align-items:center; gap:16px; width:100%; }
.dst-dhead-logo { flex:none; width:56px; height:56px; border-radius:12px; overflow:hidden;
  display:grid; place-items:center; font-size:20px; font-weight:700; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25); }
.dst-dhead-logo img { width:100%; height:100%; object-fit:cover; }
.dst-dhead-meta { min-width:0; flex:1; display:flex; flex-direction:column; gap:6px; }
.dst-dhead-title { margin:0; font-size:20px; line-height:28px; font-weight:500; color:var(--dst-text);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dst-dhead-sub { font-size:14px; color:var(--dst-text-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dst-dhead-facts { display:flex; align-items:center; gap:16px; font-size:12px; color:var(--dst-text-sub); flex-wrap:wrap; }
.dst-fact { display:inline-flex; align-items:center; gap:6px; }
.dst-dhead-desc { font-size:14px; line-height:1.7; color:var(--dst-text-sub);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.dst-chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
.dst-chip { padding:4px 10px; border-radius:9999px; border:1px solid var(--dst-narrow);
  background:var(--dst-container); font-size:12px; color:var(--dst-text-tertiary); }

/* 左右分栏：左内容 + 右 380px */
.dst-body { max-width:1152px; width:100%; margin:0 auto; display:flex; flex:1; align-items:stretch; }
.dst-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:40px; padding:32px 64px 32px 24px; }
.dst-side { width:380px; flex:none; padding:64px 24px 32px; display:flex; flex-direction:column; gap:24px; }

/* Tabs */
.dst-tabs { display:flex; align-items:center; gap:48px; border-bottom:1px solid var(--dst-split); }
.dst-tab { position:relative; padding:0 0 12px; border:0; background:transparent; color:var(--dst-text-sub);
  font:inherit; font-size:12px; font-weight:500; cursor:pointer; white-space:nowrap; transition:color .2s; }
.dst-tab:hover { color:var(--dst-text); }
.dst-tab[data-active='true'] { color:var(--dst-primary); }
.dst-tab[data-active='true']::after { content:''; position:absolute; left:0; right:0; bottom:0; height:2px;
  border-radius:9999px; background:color-mix(in srgb, var(--dst-primary) 80%, transparent); }

/* 表单/块 */
.dst-tabpanel { display:flex; flex-direction:column; gap:40px; padding-top:24px; }
.dst-sec { display:flex; flex-direction:column; gap:12px; }
.dst-sec-title { margin:0; font-size:14px; font-weight:500; color:var(--dst-text); }
.dst-prose { margin:0; font-size:13px; line-height:2; color:var(--dst-text-sub); text-align:justify; }
.dst-kv { display:grid; grid-template-columns:90px 1fr; gap:16px 0; font-size:13px; }
.dst-kv-k { color:var(--dst-text-tertiary); line-height:1.7; }
.dst-kv-v { display:flex; flex-wrap:wrap; gap:8px; align-items:center; color:var(--dst-text-sub); line-height:1.7; }
.dst-rule { border:0; border-top:1px solid var(--dst-narrow); margin:0; }
.dst-bullets { display:flex; flex-direction:column; gap:6px; }
.dst-bullet { display:flex; align-items:flex-start; gap:8px; font-size:13px; color:var(--dst-text-sub); line-height:1.7; }
.dst-bullet::before { content:''; flex:none; width:4px; height:4px; margin-top:9px; border-radius:9999px; background:var(--dst-text); }
.dst-scenarios { display:grid; grid-template-columns:1fr; gap:0 32px; }
.dst-scenario { display:flex; align-items:center; gap:10px; padding:12px 0;
  border-bottom:1px solid var(--dst-narrow); font-size:13px; color:var(--dst-text-sub); }
.dst-scenario::before { content:''; flex:none; width:6px; height:6px; border-radius:9999px;
  background:color-mix(in srgb, var(--dst-primary) 70%, transparent); }

/* 时间线 */
.dst-timeline { display:flex; flex-direction:column; gap:0; padding-left:4px; }
.dst-tl-item { position:relative; display:flex; gap:14px; padding-bottom:18px; }
.dst-tl-item:last-child { padding-bottom:4px; }
.dst-tl-dot { position:relative; flex:none; width:8px; height:8px; margin-top:7px; border-radius:9999px;
  background:var(--dst-primary); box-shadow:0 0 0 4px var(--dst-primary-soft); }
.dst-tl-item:not(:last-child) .dst-tl-dot::after { content:''; position:absolute; left:50%; top:100%;
  width:1px; height:calc(100% + 20px); transform:translateX(-50%); background:var(--dst-split); }
.dst-tl-text { font-size:13px; line-height:1.7; color:var(--dst-text-sub); }

/* 审计 */
.dst-audit-overview { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:40px; }
.dst-radar-wrap { display:flex; align-items:center; justify-content:center; flex:1; }
.dst-radar { width:100%; max-width:300px; }
.dst-verdict { border-radius:12px; border:1px solid var(--dst-narrow); background:var(--dst-fill-100);
  padding:12px; font-size:14px; line-height:1.7; color:var(--dst-text-sub); }

/* 维度卡 */
.dst-dims { display:flex; flex-direction:column; gap:16px; }
.dst-dim { border-radius:16px; border:1px solid var(--dst-narrow); background:var(--dst-container);
  overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.02); }
.dst-dim-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px;
  padding:16px; border-bottom:1px solid var(--dst-split); }
.dst-dim-head-l { display:flex; align-items:center; gap:8px; }
.dst-dim-name { margin:0; font-size:14px; font-weight:500; color:var(--dst-text); }
.dst-dim-engines { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dst-engine { padding:1px 8px; border-radius:4px; font-size:12px; border:1px solid transparent; }
.dst-dim-body { padding:16px; }
.dst-dim-note { margin:0; font-size:13px; color:var(--dst-text-sub); line-height:1.7; }

/* 风险项 */
.dst-finding { display:flex; flex-direction:column; gap:12px; }
.dst-finding-head { display:flex; align-items:center; gap:6px; }
.dst-finding-idx { font-size:14px; font-weight:700; color:var(--dst-text-quaternary); }
.dst-finding-title { margin:0; font-size:14px; font-weight:500; color:var(--dst-text); }
.dst-finding-desc { margin:0; font-size:13px; line-height:1.7; color:var(--dst-text-sub); }
.dst-evidence-label { font-size:12px; font-weight:500; color:var(--dst-text); }
.dst-evidence-list { display:flex; flex-direction:column; margin-top:8px; }
.dst-evidence { display:flex; flex-direction:column; gap:8px; padding:16px 0;
  border-bottom:1px dashed var(--dst-split); }
.dst-evidence:first-child { padding-top:0; }
.dst-evidence:last-child { border-bottom:0; padding-bottom:0; }
.dst-evidence-line { display:flex; align-items:center; gap:8px; min-width:0; font-size:12px; }
.dst-evidence-path { border:0; background:transparent; padding:0; color:var(--dst-primary);
  font:inherit; font-size:12px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
.dst-evidence-path:hover { text-decoration:underline; opacity:.7; }
.dst-evidence-code { border-radius:8px; border:0.5px solid var(--dst-narrow); background:var(--dst-fill-100);
  padding:8px 12px; overflow-x:auto; }
.dst-evidence-code pre { margin:0; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:13px; line-height:1.6; color:var(--dst-text-sub); white-space:pre-wrap; word-break:break-word; }
.dst-evidence-dot { color:var(--dst-text-sub); }
.dst-evidence-toggle-wrap { display:flex; justify-content:center; margin-top:12px; }
.dst-evidence-toggle { display:inline-flex; align-items:center; gap:4px; border:0; background:transparent;
  padding:0; color:var(--dst-text-sub); font:inherit; font-size:12px; cursor:pointer; }
.dst-evidence-toggle:hover { color:var(--dst-primary); }
.dst-dep-block { margin-top:8px; padding-top:12px; border-top:1px dashed var(--dst-split);
  display:flex; flex-direction:column; gap:4px; }
.dst-dep-summary { margin:0; font-size:13px; color:var(--dst-text-sub); }
.dst-dep-count { font-weight:500; color:var(--dst-text); }
.dst-dep-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
.dst-dim-extra { padding:16px; border-top:1px solid var(--dst-split); }
.dst-dim-more { display:flex; align-items:center; justify-content:center; gap:6px; width:100%;
  padding:10px 0; border:0; border-top:1px solid var(--dst-split); background:var(--dst-fill-100);
  color:var(--dst-text-sub); font:inherit; font-size:12px; cursor:pointer; transition:background .2s, color .2s; }
.dst-dim-more:hover { background:var(--dst-fill-50); color:var(--dst-text-tertiary); }

/* 审计中 / 空态 */
.dst-auditing { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px;
  padding:128px 0; }
.dst-auditing-orb { position:relative; width:80px; height:80px; border-radius:9999px; overflow:hidden;
  display:grid; place-items:center; color:#fff; border:1px solid rgba(96,165,250,.2);
  background:linear-gradient(45deg, #3b82f6, #6366f1); box-shadow:0 10px 15px -3px rgba(59,130,246,.3); }
.dst-auditing-orb::after { content:''; position:absolute; left:0; top:0; width:100%; height:100%;
  background:linear-gradient(to bottom, transparent, rgba(255,255,255,.2) 80%, rgba(255,255,255,.5) 100%);
  border-bottom:2px solid rgba(255,255,255,.9); animation:dst-scan 1.5s linear infinite; }
@keyframes dst-scan { 0% { transform:translateY(-100%) } 100% { transform:translateY(100%) } }
.dst-auditing-text { display:flex; flex-direction:column; align-items:center; gap:8px; }
.dst-auditing-title { font-size:14px; font-weight:500; color:var(--dst-text); }
.dst-auditing-step { font-size:14px; color:var(--dst-text-sub); }
.dst-empty-block { display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:8px; padding:96px 0; text-align:center; }
.dst-empty-title { font-size:14px; font-weight:500; color:var(--dst-text); }
.dst-empty-sub { font-size:14px; color:var(--dst-text-sub); }

/* 文件树 */
.dst-file-summary { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--dst-text-sub); }
.dst-tree { display:flex; flex-direction:column; }
.dst-tree-row { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
  color:var(--dst-text-sub); font-size:13px; cursor:pointer; transition:background .15s, color .15s; }
.dst-tree-row:hover { background:var(--dst-fill-100); color:var(--dst-text); }
.dst-tree-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dst-tree-size { flex:none; font-size:11px; color:var(--dst-text-quaternary); font-family:ui-monospace, monospace; }
.dst-back { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:0;
  color:var(--dst-text-sub); font:inherit; font-size:13px; cursor:pointer; }
.dst-back:hover { color:var(--dst-text); }
.dst-code { margin:0; padding:16px; border-radius:12px; border:1px solid var(--dst-narrow);
  background:var(--dst-fill-100); overflow:auto; max-height:560px; }
.dst-code code { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12.5px; line-height:1.7;
  color:var(--dst-text-sub); white-space:pre-wrap; word-break:break-word; }

/* 版本表 */
.dst-table { width:100%; border-collapse:collapse; font-size:13px; }
.dst-table th { text-align:left; font-weight:500; color:var(--dst-text-sub); padding:10px 12px;
  border-bottom:1px solid var(--dst-split); font-size:12px; }
.dst-table td { padding:12px; border-bottom:1px solid var(--dst-narrow); color:var(--dst-text-sub); vertical-align:middle; }
.dst-table tr:hover td { background:var(--dst-fill-50); }
.dst-table-ver { display:flex; align-items:center; gap:8px; }
.dst-tag-latest { padding:4px 8px; border-radius:9999px; background:color-mix(in srgb, var(--dst-primary) 90%, transparent);
  color:#fff; font-size:11px; line-height:1; white-space:nowrap; }
.dst-tag-current { padding:4px 8px; border-radius:9999px; background:var(--dst-fill-200);
  color:var(--dst-text-sub); font-size:11px; line-height:1; white-space:nowrap; }
.dst-icon-btn { display:grid; place-items:center; width:26px; height:26px; border-radius:6px; border:0;
  background:transparent; color:var(--dst-text-sub); cursor:pointer; }
.dst-icon-btn:hover:not(:disabled) { background:var(--dst-fill-200); color:var(--dst-text); }
.dst-icon-btn:disabled { opacity:.4; cursor:not-allowed; }

/* 右侧安装框：流光 + 渐变底（源码 BorderBeam + --trust-ai-prompt-glow） */
.dst-install { display:flex; flex-direction:column; gap:16px; }
.dst-install-beam { position:relative; padding:1px; border-radius:24px; overflow:hidden;
  background:linear-gradient(0deg, rgba(247,104,8,.3) 0%, rgba(233,61,130,.3) 33%,
    rgba(99,71,234,.3) 66%, rgba(0,145,255,.3) 100%); }
.dst-install-beam::before { content:''; position:absolute; inset:-40%; z-index:0;
  background:conic-gradient(from 0deg, transparent 0deg, rgba(247,104,8,.55) 40deg,
    rgba(233,61,130,.55) 80deg, rgba(0,145,255,.55) 120deg, transparent 160deg);
  animation:dst-beam 4s linear infinite; }
@keyframes dst-beam { to { transform:rotate(360deg) } }
.dst-install-inner { position:relative; z-index:1; display:flex; flex-direction:column; gap:12px;
  border-radius:23px; background:var(--dst-container); padding:8px; }
.dst-install-card { display:flex; flex-direction:column; gap:12px; border-radius:20px;
  background:var(--dst-container); padding:16px; }
.dst-install-hint { margin:0; font-size:12px; font-weight:500; color:var(--dst-text-sub); }
.dst-install-prompt { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  color:var(--dst-text-sub); word-break:break-all; line-height:1.6; }
.dst-install-copy { display:flex; align-items:center; justify-content:center; gap:8px; width:100%;
  padding:6px 16px; border:0; border-radius:9999px; background:var(--dst-fill-200);
  color:var(--dst-text-sub); font:inherit; font-size:13px; cursor:pointer; transition:background .2s, transform .1s; }
.dst-install-copy:hover { background:var(--dst-fill-200); color:var(--dst-text); }
.dst-install-copy:active { transform:scale(.9); }
.dst-install-dl { display:flex; align-items:center; justify-content:center; gap:8px; width:100%;
  padding:10px 16px; border-radius:9999px; border:1px solid var(--dst-narrow); background:transparent;
  color:var(--dst-text-sub); font:inherit; font-size:13px; font-weight:500; cursor:pointer;
  transition:background .2s, transform .1s; }
.dst-install-dl:hover:not(:disabled) { background:var(--dst-fill-100); }
.dst-install-dl:active:not(:disabled) { transform:scale(.9); }
.dst-install-dl:disabled { opacity:.6; cursor:not-allowed; }

/* 右侧属性面板：分隔线分组，不是卡片 */
.dst-props { display:flex; flex-direction:column; font-size:13px; }
.dst-props-group { display:flex; flex-direction:column; padding:4px 0 2px; }
.dst-props-title { margin:0 0 6px; font-size:12px; font-weight:600; color:var(--dst-text-sub); }
.dst-prop { display:flex; align-items:flex-start; padding:8px 10px; border-radius:12px; transition:background .2s; }
.dst-prop:hover { background:var(--dst-fill-50); }
.dst-prop-k { flex:none; width:96px; display:flex; align-items:center; gap:6px; color:var(--dst-text-sub); }
.dst-prop-k svg { opacity:.7; flex:none; }
.dst-prop-v { min-width:0; flex:1; color:var(--dst-text); word-break:break-word; }
.dst-prop-v code { font-family:ui-monospace, monospace; font-size:12px; color:var(--dst-text-tertiary); }
.dst-prop-ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dst-props-sep { margin:12px 10px; border:0; border-top:1px solid var(--dst-narrow); }

/* Banner */
.dst-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 24px 12px;
  padding:11px 15px; border-radius:11px; font-size:13px; }

/* 已安装列表 */
.dst-installed-entry { height:34px; font-size:13.5px; color:var(--dst-text-sub);
  border-color:var(--dst-narrow); }
.dst-installed-entry:hover:not(:disabled) { color:var(--dst-primary);
  border-color:var(--dst-primary-border); background:transparent; }
.dst-card-static { cursor:default; }
.dst-card-static:hover { transform:none; border-color:var(--dst-narrow); box-shadow:none; }
/* 已安装卡 footer 里的来源根目录可能很长，省略而不是撑破卡片 */
.dst-stat-ellipsis { min-width:0; max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dst-local { display:flex; flex-direction:column; gap:16px; padding:0 24px 32px; }
.dst-local-title-row { display:flex; align-items:baseline; gap:10px; padding:56px 0 0; }
.dst-local-title { margin:0; font-size:24px; font-weight:500; color:var(--dst-text); }
.dst-local-count { font-size:13px; color:var(--dst-text-quaternary); }
.dst-local-head { display:flex; align-items:center; gap:10px; }
.dst-local-sorts { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
/* 标签行：卡片里额外的 tags 徽章行，与头部徽章同样胶囊样式 */
.dst-card-tags-row { padding-top:10px; gap:6px; }
.dst-local-search { position:relative; flex:1; }
.dst-local-search svg { position:absolute; left:12px; top:50%; transform:translateY(-50%);
  color:var(--dst-text-quaternary); pointer-events:none; }
.dst-local-search input { width:100%; height:38px; border-radius:10px; border:1px solid var(--dst-narrow);
  background:var(--dst-fill-100); color:var(--dst-text); font:inherit; font-size:13px; padding:0 14px 0 38px; outline:none; }
.dst-local-search input::placeholder { color:var(--dst-text-quaternary); }
.dst-row { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:12px;
  border:1px solid var(--dst-narrow); background:var(--dst-container); }
.dst-row-main { flex:1; min-width:0; }
.dst-row-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dst-row-name { margin:0; font-size:14px; font-weight:600; color:var(--dst-text); }
.dst-row-meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:6px; font-size:12px; color:var(--dst-text-quaternary); }
.dst-note { margin:0; font-size:12px; color:var(--dst-text-quaternary); text-align:center; }
.dst-link { color:var(--dst-primary); text-decoration:none; }
.dst-link:hover { text-decoration:underline; }

@media (max-width: 1023px) {
  .dst-body { flex-direction:column; }
  .dst-side { width:100%; padding:0 24px 32px; }
  .dst-main { padding:24px; }
  .dst-hero-title { font-size:32px; }
  .dst-scenarios { grid-template-columns:1fr; }
}
`;

    /* ==================================================================== *
     * 工具函数
     * ==================================================================== */

    /** 风险样式：返回 CSS 变量组合，与源码 OVERALL_RISK_STYLE_MAP 一致。 */
    function riskStyle(status) {
      const entry = RISK_MAP[status] || RISK_MAP.NOT_AUDITED;
      switch (entry.token) {
        case 'success':
          return { label: entry.label, icon: entry.icon, color: C.success, bg: C.successBg, border: C.successBorder };
        case 'warning':
          return { label: entry.label, icon: entry.icon, color: C.warning, bg: C.warningBg, border: C.warningBorder };
        case 'error':
          return { label: entry.label, icon: entry.icon, color: C.error, bg: C.errorBg, border: C.errorBorder };
        case 'primary':
          return { label: entry.label, icon: entry.icon, color: C.primary, bg: C.primarySoft, border: C.primaryBorder };
        default:
          return { label: entry.label, icon: entry.icon, color: C.textSub, bg: C.fill100, border: C.narrow };
      }
    }

    /** 维度状态样式：对应源码 AUDIT_DIMENSION_STYLE_MAP。 */
    function dimensionStyle(status) {
      switch (status) {
        case 'RISKY': return { label: '发现风险', color: C.error, bg: C.errorBg, border: C.errorBorder, icon: 'shieldAlert' };
        case 'SUSPECTED': return { label: '疑似风险', color: C.warning, bg: C.warningBg, border: C.warningBorder, icon: 'alert' };
        case 'INCONCLUSIVE': return { label: '证据不足', color: C.textSub, bg: C.fill100, border: C.narrow, icon: 'help' };
        case 'SAFE': return { label: '安全', color: C.success, bg: C.successBg, border: C.successBorder, icon: 'shieldCheck' };
        default: return { label: '未知', color: C.textSub, bg: C.fill100, border: C.narrow, icon: 'help' };
      }
    }

    function formatCount(value) {
      if (value === null || value === undefined) return NO_DATA;
      const number = Number(value);
      if (!Number.isFinite(number)) return NO_DATA;
      if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
      return String(number);
    }

    function formatBytes(bytes) {
      if (bytes === null || bytes === undefined) return NO_DATA;
      const number = Number(bytes);
      if (!Number.isFinite(number) || number < 0) return NO_DATA;
      if (number < 1024) return `${number} B`;
      if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
      return `${(number / 1024 / 1024).toFixed(2)} MB`;
    }

    /** 日期 -> YYYY-MM-DD */
    function formatDate(iso) {
      if (typeof iso !== 'string' || iso === '') return NO_DATA;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return NO_DATA;
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    /** 日期 -> YYYY-MM-DD HH:mm:ss（侧栏"审计时间"用） */
    function formatDateTime(iso) {
      if (typeof iso !== 'string' || iso === '') return NO_DATA;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return NO_DATA;
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /** 相对时间：对应源码 formatSkillUpdateTime 的「N天前更新」*/
    function formatUpdateTime(iso) {
      if (typeof iso !== 'string' || iso === '') return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const diff = Date.now() - date.getTime();
      const days = Math.floor(diff / 86400000);
      if (days <= 0) return '今天更新';
      if (days < 30) return `${days}天前更新`;
      const months = Math.floor(days / 30);
      if (months < 12) return `${months}个月前更新`;
      return `${Math.floor(months / 12)}年前更新`;
    }

    /** 头像底色：按名称哈希取稳定的渐变色对。 */
    const ICON_COLORS = [
      ['#f97316', '#ea580c'], ['#3b82f6', '#2563eb'], ['#10b981', '#059669'],
      ['#8b5cf6', '#7c3aed'], ['#06b6d4', '#0891b2'], ['#ec4899', '#db2777'],
      ['#eab308', '#ca8a04'], ['#14b8a6', '#0d9488'],
    ];
    function iconGradient(name) {
      let hash = 0;
      const text = String(name || '');
      for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
      }
      const pair = ICON_COLORS[hash % ICON_COLORS.length];
      return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
    }

    /** 头像文字：中文取首字，英文取前两位大写（源码 getAvatarText）。 */
    function avatarText(title) {
      const text = String(title || '').trim();
      if (text === '') return 'SK';
      if (/^[\u4e00-\u9fa5]/.test(text)) return text.slice(0, 1);
      return text.slice(0, 2).toUpperCase();
    }

    /* ------------------------------------------------------------------ *
     * 已安装技能的元数据归一化
     *
     * 后端 scanInstalled 还没接 lib/frontmatter.js，现在只返回
     * slug/dir/root/rootLabel/skillMdSize/modifiedAt/version/securityStatus。
     * 浏览器半部只能 require('react')，拿不到 lib/frontmatter.js 的
     * pickSkillMeta，所以这里内联一份**等价的最小实现**：
     *   - 优先取后端直接摊平的 displayName/description/tags（接上后自动生效）
     *   - 否则回退到 item.frontmatter 的原始 YAML 键（驼峰与下划线两种写法都认）
     *   - 都没有就给 null，绝不让 "null"/"undefined" 漏到界面上
     * ------------------------------------------------------------------ */

    /** 标量转文本：非空字符串与有限数字可用，其余 null。 */
    function metaText(value) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      }
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      return null;
    }

    /** 标量转单行文本：折叠块拼好后仍可能含换行，统一压成空格。 */
    function metaSingleLine(value) {
      const text = metaText(value);
      if (text === null) return null;
      // 只做空白折叠。item.frontmatter 恒为后端 parseFrontmatter 的产物（已解析对象，
      // 不含 `|`/`>` 块指示符），裸值回退读的也是该对象的键。早先这里多了一步
      // /^[|>][+-]?\s*/ 替换，会把本身以 | 或 > 开头的值吞掉首字符，与后端
      // pickSkillMeta 产生静默分叉（见 test/parity.test.mjs 的「块指示符前缀」用例）。
      const collapsed = text
        .replace(/\s+/g, ' ')
        .trim();
      return collapsed === '' ? null : collapsed;
    }

    /**
     * 把「给模型看的触发式描述」改写成「给人看的直述句」。
     *
     * 大量 SKILL.md 的 description 是写给 AI 的触发条件，例如
     *   Use when the user needs to run GitNexus CLI commands like analyze a repo.
     *   Use this skill to create Codex Automations.
     * 对人不友好——开头几个词全是套话，看不出这东西干什么。
     *
     * 这里只做**有把握的**前缀剥离，剥完必须仍是一句成文的话，否则原样返回：
     * 宁可显示原描述，也不要切出半截句子。
     */
    function humanizeDescription(value) {
      const text = metaText(value);
      if (text === null) return null;

      // 逐条尝试。原则：只剥「纯套话前缀」，剥完必须仍是一句读得通的话。
      // 判断不出来的宁可返回原文——卡片上出现半截从句比留着 "Use when" 更糟。
      const rules = [
        // "Use this skill to X" / "Use this to X" → 祈使句 "X"，最安全的一类
        { re: /^use (?:this|the) skill to\s+/i },
        { re: /^use (?:this|it) to\s+/i },
        // "Use when the user needs to/wants to X" → 祈使句 "X"
        { re: /^use when the user (?:needs? to|wants? to)\s+/i },
        // 中文触发式："当用户需要 X" → "X"（中文无大小写）
        { re: /^当用户(?:需要|想要|希望|问|询问)\s*/, noCapitalize: true },
      ];

      for (const rule of rules) {
        const matched = text.match(rule.re);
        if (matched === null) continue;
        let rest = text.slice(matched[0].length).trim();
        if (rest.length < 12) break;
        if (rule.noCapitalize !== true) rest = rest.charAt(0).toUpperCase() + rest.slice(1);
        return rest;
      }
      return text;
    }

    /** 标量/数组转去重字符串数组。 */
    function metaList(value) {
      const out = [];
      const push = (candidate) => {
        const text = metaText(candidate);
        if (text !== null && !out.includes(text)) out.push(text);
      };
      if (Array.isArray(value)) {
        for (const entry of value) push(entry);
        return out;
      }
      if (typeof value === 'string') {
        for (const part of value.split(',')) {
          const text = part.trim();
          if (text !== '' && !out.includes(text)) out.push(text);
        }
        return out;
      }
      push(value);
      return out;
    }

    function metaRecord(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    /**
     * 把一条 /installed 记录归一成卡片要用的展示模型。
     *
     * 兼容「后端已接 frontmatter」与「未接」两种形态，逐字段回退：
     *   标题：displayName → name → slug
     *   描述：description → descriptionZh → dir 末段
     *   版本：version（_meta.json 优先，frontmatter 兜底）
     */
    function readInstalledMeta(item) {
      const raw = metaRecord(item.frontmatter);
      const metadata = metaRecord(raw.metadata);
      const hasFlat = (key) => item[key] !== undefined && item[key] !== null;

      // 后端接上 frontmatter 后会摊平出这些字段；没接时从 item.frontmatter 里捞。
      const displayName = hasFlat('displayName')
        ? metaText(item.displayName)
        : metaText(raw.display_name) ?? metaText(raw.displayName);
      const name = hasFlat('name') ? metaText(item.name) : metaText(raw.name);
      const description = hasFlat('description')
        ? metaSingleLine(item.description)
        : metaSingleLine(raw.description);
      const descriptionZh = hasFlat('descriptionZh')
        ? metaSingleLine(item.descriptionZh)
        : metaSingleLine(raw.description_zh);
      const version = hasFlat('version')
        ? metaText(item.version)
        : metaText(raw.version) ?? metaText(metadata.version);
      const tags = hasFlat('tags') ? metaList(item.tags) : metaList(raw.tags);
      const installedAt = hasFlat('installedAt')
        ? metaText(item.installedAt)
        : metaText(raw.installedAt);

      const slug = metaText(item.slug) ?? 'unknown';
      const dir = metaText(item.dir) ?? '';
      const rootLabel = metaText(item.rootLabel);

      const title = displayName ?? name ?? slug;
      // 没有 description 时用目录末段（如 C:\...\skills\foo → foo），比整条路径可读。
      const dirTail = dir === '' ? null : dir.split(/[\\/]/).filter((part) => part !== '').pop() ?? null;
      let desc = humanizeDescription(description) ?? humanizeDescription(descriptionZh) ?? dirTail;
      // 末段等于标题时，这一行等于把标题又说一遍（常见于 slug 与目录同名的技能），
      // 此时退回显示完整路径；连路径都没有就不渲染描述行。
      if (desc !== null && desc === title) desc = dir === '' ? null : dir;
      if (desc === null && dir !== '') desc = dir;

      return {
        slug,
        dir,
        rootLabel,
        title,
        // displayName 与 name 都缺失时，标题就是 slug，不必再重复一个 name 徽章。
        name: name !== null && name !== title ? name : null,
        desc,
        tags,
        version,
        installedAt,
        modifiedAt: metaText(item.modifiedAt),
        skillMdSize: item.skillMdSize,
        securityStatus: metaText(item.securityStatus),
      };
    }

    /** 排序用的比较键：displayName → name → slug 的小写形式。 */
    function metaSortKey(meta) {
      return (meta.title || meta.slug).toLowerCase();
    }

    function request(path, init) {
      return fetch(API + path, init).then(async (response) => {
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (!response.ok || payload === null || payload.ok !== true) {
          const message = payload && typeof payload.error === 'string'
            ? payload.error
            : `请求失败（HTTP ${response.status}）`;
          const error = new Error(message);
          error.status = response.status;
          error.retryAfter = payload && payload.retryAfter ? payload.retryAfter : undefined;
          throw error;
        }
        return payload;
      });
    }

    /* ==================================================================== *
     * 图标（lucide 风格的 24x24 线性图标，与源码保持一致的选型）
     * ==================================================================== */

    function Icon(props) {
      const size = props.size || 16;
      const paths = props.paths;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: props.strokeWidth || 2,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { flex: 'none', display: 'block' },
      }, paths.map((d, index) => (typeof d === 'string'
        ? h('path', { key: index, d })
        : h(d.tag, { key: index, ...d.attrs }))));
    }

    const PATHS = {
      search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
      star: ['M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3.2 10l6.1-.9z'],
      download: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 20h16'],
      chevronDown: ['M6 9l6 6 6-6'],
      chevronUp: ['M6 15l6-6 6 6'],
      chevronRight: ['M9 6l6 6-6 6'],
      arrowLeft: ['M19 12H5', 'M11 18l-6-6 6-6'],
      arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
      cornerDown: ['M9 10l-5 5 5 5', 'M20 4v7a4 4 0 0 1-4 4H4'],
      x: ['M18 6L6 18', 'M6 6l12 12'],
      globe: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } }, 'M3 12h18', 'M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z'],
      shieldCheck: ['M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', 'M9 12l2 2 4-4'],
      shieldAlert: ['M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', 'M12 9v4', 'M12 17h.01'],
      alert: ['M12 3l9.5 17H2.5z', 'M12 9v4', 'M12 17h.01'],
      circleDashed: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 9, strokeDasharray: '3 3' } }],
      scan: ['M4 8V5a1 1 0 0 1 1-1h3', 'M16 4h3a1 1 0 0 1 1 1v3', 'M20 16v3a1 1 0 0 1-1 1h-3', 'M8 20H5a1 1 0 0 1-1-1v-3', 'M4 12h16'],
      help: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } }, 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7', 'M12 17h.01'],
      terminal: ['M4 17l6-6-6-6', 'M12 19h8'],
      code: ['M8 6l-6 6 6 6', 'M16 6l6 6-6 6'],
      lock: ['M6 11h12v9H6z', 'M9 11V7a3 3 0 0 1 6 0v4'],
      lockOpen: ['M6 11h12v9H6z', 'M9 11V7a3 3 0 0 1 5.5-1.7'],
      database: ['M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
      package: ['M12 3l9 5v8l-9 5-9-5V8z', 'M3 8l9 5 9-5', 'M12 13v8'],
      mask: ['M3 8c3-1 6-1.5 9-1.5S18 7 21 8c0 6-4 11-9 11S3 14 3 8z', 'M8 12h.01', 'M16 12h.01'],
      laptop: ['M4 6h16v11H4z', 'M2 20h20'],
      key: [{ tag: 'circle', attrs: { cx: 8, cy: 8, r: 4 } }, 'M11 11l9 9', 'M17 17l2-2', 'M14 14l2-2'],
      copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
      tag: ['M3 12V4h8l9 9-8 8z', { tag: 'circle', attrs: { cx: 7.5, cy: 7.5, r: 1.2 } }],
      history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 8v4l3 2'],
      hash: ['M4 9h16', 'M4 15h16', 'M10 3L8 21', 'M16 3l-2 18'],
      scale: ['M12 3v18', 'M6 21h12', 'M4 8l4-2 4 2', 'M4 8l-2 5a4 4 0 0 0 8 0z', 'M16 8l4-2 4 2', 'M16 8l-2 5a4 4 0 0 0 8 0z'],
      user: [{ tag: 'circle', attrs: { cx: 12, cy: 8, r: 4 } }, 'M4 21a8 8 0 0 1 16 0'],
      calendar: ['M4 6h16v15H4z', 'M8 3v5', 'M16 3v5', 'M4 11h16'],
      clock: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } }, 'M12 7v5l3 2'],
      file: ['M6 3h8l5 5v13H6z', 'M14 3v5h5'],
      folder: ['M3 7h7l2 2h9v11H3z'],
      check: ['M4 12l5 5L20 6'],
      scanEngine: ['M4 8V5a1 1 0 0 1 1-1h3', 'M16 4h3a1 1 0 0 1 1 1v3', 'M20 16v3a1 1 0 0 1-1 1h-3', 'M8 20H5a1 1 0 0 1-1-1v-3', 'M9 12l2 2 4-4'],
    };

    function glyph(name, size, strokeWidth) {
      return h(Icon, { paths: PATHS[name] || PATHS.help, size, strokeWidth });
    }

    /* ==================================================================== *
     * 基础组件
     * ==================================================================== */

    function RiskBadge(props) {
      const style = riskStyle(props.status);
      return h('span', {
        className: 'dst-risk',
        style: { color: style.color, background: style.bg },
        title: props.title,
      }, props.showIcon === false ? null : glyph(style.icon, 11), style.label);
    }

    /** 下拉筛选：对应源码 FilterDropdown，显示选中值。 */
    function FilterDropdown(props) {
      const { value, options, onChange, placeholder } = props;
      const [open, setOpen] = React.useState(false);
      const ref = React.useRef(null);

      React.useEffect(() => {
        if (!open) return undefined;
        const onDocClick = (event) => {
          if (ref.current !== null && !ref.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
      }, [open]);

      const current = options.find((option) => option.value === value);
      const label = current !== undefined && current.value !== '' ? current.label : placeholder;

      return h('div', { className: 'dst-dd', ref },
        h('button', {
          type: 'button', className: 'dst-dd-btn',
          'data-open': open, 'data-picked': current !== undefined && current.value !== '',
          onClick: () => setOpen(!open),
        }, label, h('span', { className: 'dst-dd-caret' }, glyph('chevronDown', 13))),
        open
          ? h('div', { className: 'dst-dd-menu' },
            options.map((option) => h('button', {
              key: option.value === '' ? '__all' : option.value,
              type: 'button', className: 'dst-dd-item',
              'data-active': option.value === value,
              onClick: () => { onChange(option.value); setOpen(false); },
            }, option.label)))
          : null);
    }

    /* ==================================================================== *
     * 六维雷达图 —— 复刻源码 ECharts radar + polar scatter
     *   4 级：安全 4 / 证据不足 3 / 疑似风险 2 / 发现风险 1
     *   每个维度顶点单独着色，折线与填充取最差状态色
     * ==================================================================== */

    function levelOf(status) {
      switch (status) {
        case 'RISKY': return 1;
        case 'SUSPECTED': return 2;
        case 'INCONCLUSIVE': return 3;
        default: return 4;
      }
    }

    function colorOf(status) {
      switch (status) {
        case 'RISKY': return C.error;
        case 'SUSPECTED': return C.warning;
        case 'INCONCLUSIVE': return '#8c8c8c';
        default: return C.success;
      }
    }

    function Radar(props) {
      const dimensions = props.dimensions;
      const size = 300;
      const center = size / 2;
      const radius = 100;
      const count = dimensions.length > 0 ? dimensions.length : 6;

      // 顶点角度：源码 startAngle 90、clockwise false，即从正上方开始逆时针。
      const angleAt = (index) => (-Math.PI / 2) - (index * 2 * Math.PI) / count;

      const pointAt = (index, level) => {
        const ratio = level / 4;
        return [
          center + Math.cos(angleAt(index)) * radius * ratio,
          center + Math.sin(angleAt(index)) * radius * ratio,
        ];
      };

      // 四圈网格
      const rings = [1, 2, 3, 4].map((level) => {
        const points = Array.from({ length: count }, (unused, index) => pointAt(index, level).join(',')).join(' ');
        return h('polygon', {
          key: `ring-${level}`, points,
          fill: 'none', stroke: 'rgba(255,255,255,.10)',
          strokeWidth: 1, strokeDasharray: '4 4',
        });
      });

      // 轴线
      const spokes = Array.from({ length: count }, (unused, index) => {
        const [x, y] = pointAt(index, 4);
        return h('line', {
          key: `spoke-${index}`, x1: center, y1: center, x2: x, y2: y,
          stroke: 'rgba(255,255,255,.10)', strokeWidth: 1, strokeDasharray: '4 4',
        });
      });

      // 数据多边形：最差状态决定描边色
      const statuses = dimensions.map((dimension) => dimension.status);
      let worst = 'SAFE';
      if (statuses.includes('RISKY')) worst = 'RISKY';
      else if (statuses.includes('SUSPECTED')) worst = 'SUSPECTED';
      else if (statuses.includes('INCONCLUSIVE') && !statuses.includes('SAFE')) worst = 'INCONCLUSIVE';
      const worstColor = colorOf(worst);

      const dataPoints = dimensions.map((dimension, index) => pointAt(index, levelOf(dimension.status)));
      const area = dataPoints.map((point) => point.join(',')).join(' ');

      // 顶点散点：每个维度独立着色
      const dots = dimensions.map((dimension, index) => {
        const [x, y] = dataPoints[index];
        return h('circle', {
          key: `dot-${index}`, cx: x, cy: y, r: 4,
          fill: colorOf(dimension.status), stroke: '#141414', strokeWidth: 1.5,
        });
      });

      // 轴标签
      const labels = dimensions.map((dimension, index) => {
        const angle = angleAt(index);
        const lx = center + Math.cos(angle) * (radius + 26);
        const ly = center + Math.sin(angle) * (radius + 26);
        const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
        return h('text', {
          key: `label-${index}`, x: lx, y: ly,
          fill: C.textSub, fontSize: 12, textAnchor: anchor, dominantBaseline: 'middle',
        }, dimension.dimensionName);
      });

      return h('svg', {
        className: 'dst-radar', viewBox: `0 0 ${size} ${size}`,
        role: 'img', 'aria-label': '六维风险画像',
      },
      rings, spokes,
      dimensions.length > 0
        ? h('polygon', { points: area, fill: worstColor, fillOpacity: 0.1, stroke: worstColor, strokeWidth: 2, strokeLinejoin: 'round' })
        : null,
      dots, labels);
    }

    /* ==================================================================== *
     * 市场页
     * ==================================================================== */

    function SkillCard(props) {
      const { entry, onOpen } = props;
      const gradient = iconGradient(entry.displayName || entry.name);
      return h('div', {
        className: 'dst-card', role: 'button', tabIndex: 0,
        onClick: () => onOpen(entry),
        onKeyDown: (event) => { if (event.key === 'Enter') onOpen(entry); },
      },
      h('div', { className: 'dst-card-top' },
        h('div', { className: 'dst-card-logo', style: { background: gradient } },
          entry.logoUrl !== null ? h('img', { src: entry.logoUrl, alt: '' }) : avatarText(entry.displayName || entry.name)),
        h('div', { className: 'dst-card-head' },
          h('h3', { className: 'dst-card-name', title: entry.displayName }, entry.displayName),
          h('div', { className: 'dst-card-tags' },
            entry.category !== null && entry.category !== ''
              ? h('span', { className: 'dst-pill-mini' }, entry.category)
              : null,
            entry.runtimeType !== null
              ? h('span', { className: 'dst-pill-mini' }, RUNTIME_LABELS[entry.runtimeType] || entry.runtimeType)
              : null))),
      h('p', { className: 'dst-card-desc' }, entry.description !== '' ? entry.description : NO_DATA),
      h('div', { className: 'dst-card-foot' },
        h('div', { className: 'dst-card-stats' },
          h('span', { className: 'dst-stat' }, glyph('star', 14), formatCount(entry.starCount)),
          h('span', { className: 'dst-stat' }, glyph('download', 14), formatCount(entry.installs))),
        h('div', { className: 'dst-card-right' },
          entry.currentVersion !== null ? h('span', { className: 'dst-ver' }, `v${entry.currentVersion}`) : null,
          entry.securityStatus !== null ? h(RiskBadge, { status: entry.securityStatus, showIcon: false }) : null)));
    }

    function SkillSkeleton() {
      return h('div', { className: 'dst-skel' });
    }

    /**
     * 本机已安装卡片。
     *
     * 与市场卡片同一套 .dst-card 视觉。所有取值都先过 readInstalledMeta 归一，
     * 因此「后端已接 frontmatter」与「还没接」两种数据形态都能渲染，
     * 且 null / undefined / "vnull" / "[object Object]" 不会漏到界面上。
     *
     * 卡片信息与来源字段：
     *   标题      displayName → name → slug
     *   副名徽章  name（仅当它与标题不同时显示，避免与标题重复）
     *   描述行    description → description_zh → dir 末段（两行截断）
     *   标签行    tags 前 3 个，其余折叠成 +N
     *   版本徽章  version（合法非空字符串才渲染，否则整块不显示）
     *   大小徽章  skillMdSize
     *   footer    rootLabel（来源根）、修改日期（modifiedAt）、securityStatus 徽章
     */
    function InstalledCard(props) {
      const item = props.item;
      const meta = props.meta !== undefined ? props.meta : readInstalledMeta(item);
      const shownTags = meta.tags.slice(0, 3);
      const extraTags = meta.tags.length - shownTags.length;
      // 只写「修改于」：这是文件 mtime，不是真正的安装时刻。
      const modified = meta.modifiedAt === null ? null : formatDate(meta.modifiedAt);
      return h('div', { className: 'dst-card dst-card-static' },
        h('div', { className: 'dst-card-top' },
          h('div', {
            className: 'dst-card-logo',
            style: { background: iconGradient(meta.slug), width: 40, height: 40, borderRadius: 12, fontSize: 14 },
          }, avatarText(meta.title)),
          h('div', { className: 'dst-card-head' },
            h('h3', { className: 'dst-card-name', title: meta.title }, meta.title),
            h('div', { className: 'dst-card-tags' },
              // 有合法版本号才显示；没有就不留空占位。
              meta.version !== null
                ? h('span', { className: 'dst-pill-mini' }, `v${meta.version}`)
                : null,
              meta.name !== null
                ? h('span', { className: 'dst-pill-mini', title: meta.name }, meta.name)
                : null,
              h('span', { className: 'dst-pill-mini' }, formatBytes(meta.skillMdSize))))),
        shownTags.length > 0
          ? h('div', { className: 'dst-card-tags dst-card-tags-row' },
            shownTags.map((tag) => h('span', { className: 'dst-pill-mini', key: tag }, tag)),
            extraTags > 0 ? h('span', { className: 'dst-pill-mini' }, `+${extraTags}`) : null)
          : null,
        meta.desc !== null
          ? h('p', { className: 'dst-card-desc', title: meta.desc }, meta.desc)
          : null,
        h('div', { className: 'dst-card-foot' },
          h('div', { className: 'dst-card-stats' },
            meta.rootLabel !== null
              ? h('span', { className: 'dst-stat dst-stat-ellipsis', title: meta.rootLabel },
                glyph('package', 14), meta.rootLabel)
              : null,
            modified !== null
              ? h('span', { className: 'dst-stat', title: meta.modifiedAt }, glyph('clock', 14), `修改于 ${modified}`)
              : null),
          meta.securityStatus !== null
            ? h(RiskBadge, { status: meta.securityStatus, showIcon: false })
            : null));
    }

    function Footer() {
      return h('footer', { className: 'dst-footer' },
        h('div', { className: 'dst-footer-inner' },
          h('div', null,
            h('p', null, '来源声明：本站部分 Skill 来源于公开渠道或用户自主发布，相关内容及知识产权归原权利人所有。平台展示的安全审计结果仅供参考，使用前请结合 Skill 来源、权限要求、许可证以及安全审计信息自行评估风险。'),
            h('p', null, '侵权处理：如相关 Skill 涉及版权或其他权益问题，请发送邮件至 ',
              h('a', { href: 'mailto:yuandun@oschina.cn' }, 'yuandun@oschina.cn'),
              '，我们将在收到通知后及时核实，并视情况采取下架等处理措施。')),
          h('div', { className: 'dst-footer-line' },
            h('span', null, 'Copyright ©2026 开源共识（上海）网络技术有限公司'),
            h('span', { className: 'dst-dot' }, '·'),
            h('span', null, '技能数据来源于公开渠道和用户自主发布'),
            h('span', { className: 'dst-dot' }, '·'),
            h('span', null, '友情链接：'),
            h('a', { href: 'https://skillhub.cn/', target: '_blank', rel: 'noreferrer' }, 'SkillHub'),
            h('span', { className: 'dst-dot' }, '·'),
            h('a', { href: 'https://clawhub.ai', target: '_blank', rel: 'noreferrer' }, 'ClawHub'))));
    }

    /* ==================================================================== *
     * 审计维度与风险项
     *
     * 这三个组件必须定义在模块作用域：它们持有展开状态，若写在 DetailPage
     * 内部，每次渲染都会产生新的函数身份，React 会当成另一个组件重新挂载，
     * 展开状态随之丢失。
     * ==================================================================== */

    function EngineTag(props) {
      const label = props.label;
      let color = C.textSub;
      let bg = C.fill100;
      if (label.includes('AI')) { color = '#c084fc'; bg = 'rgba(168,85,247,.14)'; }
      else if (label.includes('情报') || label.includes('漏洞')) { color = C.info; bg = 'rgba(59,130,246,.14)'; }
      return h('span', { className: 'dst-engine', style: { color, background: bg } }, label);
    }

    function RiskItem(props) {
      const finding = props.finding;
      const [expanded, setExpanded] = React.useState(false);
      const evidences = finding.evidenceLocations || [];
      const visible = evidences.length > 2 && !expanded ? evidences.slice(0, 2) : evidences;
      const deps = finding.dependencyComponents || [];

      return h('div', { className: 'dst-finding' },
        h('div', { className: 'dst-finding-head' },
          props.index !== undefined ? h('span', { className: 'dst-finding-idx' }, `${props.index}.`) : null,
          h('h4', { className: 'dst-finding-title' }, finding.riskType)),
        h('p', { className: 'dst-finding-desc' }, finding.description),
        evidences.length > 0
          ? h('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 } },
            h('span', { className: 'dst-evidence-label' }, '风险证据'),
            h('div', { className: 'dst-evidence-list' },
              visible.map((evidence, index) => h('div', { key: index, className: 'dst-evidence' },
                h('div', { className: 'dst-evidence-line' },
                  h('button', {
                    type: 'button', className: 'dst-evidence-path',
                    onClick: () => props.onOpenFile(evidence.filePath),
                  }, evidence.filePath),
                  h('span', { className: 'dst-evidence-dot' }, '·'),
                  h('span', { className: 'dst-evidence-dot' },
                    `Line ${evidence.startLine !== null ? evidence.startLine : '?'}${
                      evidence.endLine !== null && evidence.endLine !== evidence.startLine ? ` - ${evidence.endLine}` : ''
                    }`)),
                evidence.snippet !== ''
                  ? h('div', { className: 'dst-evidence-code' }, h('pre', null, h('code', null, evidence.snippet)))
                  : null)),
              evidences.length > 2
                ? h('div', { className: 'dst-evidence-toggle-wrap' },
                  h('button', {
                    type: 'button', className: 'dst-evidence-toggle',
                    onClick: () => setExpanded(!expanded),
                  }, expanded ? '收起 ' : `展开剩余 ${evidences.length - 2} 条风险证据 `,
                    glyph(expanded ? 'chevronUp' : 'chevronDown', 14)))
                : null))
          : null,
        deps.length > 0
          ? h('div', { className: 'dst-dep-block' },
            h('span', { className: 'dst-evidence-label' }, '组件安全风险'),
            h('p', { className: 'dst-dep-summary' },
              '共发现 ', h('span', { className: 'dst-dep-count' }, String(deps.length)),
              ' 个存在安全风险的依赖组件'),
            h('div', { className: 'dst-dep-list' },
              deps.map((dep, index) => h('span', { key: index, className: 'dst-pill-mini' },
                `${dep.name}${dep.version !== null && dep.version !== undefined ? `@${dep.version}` : ''}`))))
          : null);
    }

    function DimensionCard(props) {
      const dimension = props.dimension;
      const [expanded, setExpanded] = React.useState(false);
      const style = dimensionStyle(dimension.status);
      const findings = dimension.findings || [];
      const remaining = findings.length - 1;
      const engines = ['静态扫描引擎', 'AI 引擎'];
      if (dimension.dimension === 'dependency_security') engines.push('漏洞情报引擎');

      return h('div', { className: 'dst-dim' },
        h('div', { className: 'dst-dim-head' },
          h('div', { className: 'dst-dim-head-l' },
            glyph(DIMENSION_ICONS[dimension.dimension] || 'help', 16),
            h('h3', { className: 'dst-dim-name' }, dimension.dimensionName),
            h('span', {
              className: 'dst-risk',
              style: { color: style.color, background: style.bg, border: `1px solid ${style.border}` },
            }, glyph(style.icon, 12), style.label)),
          h('div', { className: 'dst-dim-engines' },
            engines.map((engine) => h(EngineTag, { key: engine, label: engine })))),
        h('div', { className: 'dst-dim-body' },
          findings.length === 0
            ? h('p', { className: 'dst-dim-note' },
              dimension.status === 'INCONCLUSIVE'
                ? '当前维度证据不足，可能受限于运行环境或缺乏相应的分析文件。'
                : '当前维度暂未发现风险问题。')
            : h(RiskItem, { finding: findings[0], index: findings.length > 1 ? 1 : undefined, onOpenFile: props.onOpenFile })),
        remaining > 0
          ? h('button', {
            type: 'button', className: 'dst-dim-more',
            onClick: () => setExpanded(!expanded),
          }, expanded ? '收起 ' : `+ ${remaining} 项其它风险 `, glyph(expanded ? 'chevronUp' : 'chevronDown', 14))
          : null,
        remaining > 0 && expanded
          ? h('div', null, findings.slice(1).map((finding, index) => h('div', {
            key: index, className: 'dst-dim-extra',
          }, h(RiskItem, { finding, index: index + 2, onOpenFile: props.onOpenFile }))))
          : null);
    }

    /* ==================================================================== *
     * 详情页
     * ==================================================================== */

    function DetailPage(props) {
      const { entry, onBack, onInstall, installing, installed } = props;

      const [detail, setDetail] = React.useState({ status: 'loading' });
      const [tab, setTab] = React.useState('analysis');
      const [audit, setAudit] = React.useState({ status: 'idle' });
      const [files, setFiles] = React.useState({ status: 'idle' });
      const [versions, setVersions] = React.useState({ status: 'idle' });
      const [preview, setPreview] = React.useState({ status: 'idle' });
      const [openFile, setOpenFile] = React.useState(null);
      const [notice, setNotice] = React.useState(null);

      const name = entry.name;

      React.useEffect(() => {
        setDetail({ status: 'loading' });
        request(`/detail?name=${encodeURIComponent(name)}`).then(
          (payload) => setDetail({ status: 'ready', data: payload.data }),
          (error) => setDetail({ status: 'error', message: error.message }),
        );
      }, [name]);

      // 懒加载各页签数据
      React.useEffect(() => {
        if (tab === 'audit' && audit.status === 'idle') {
          setAudit({ status: 'loading' });
          request(`/security-audit?name=${encodeURIComponent(name)}`).then(
            (payload) => setAudit({ status: 'ready', data: payload.data }),
            (error) => setAudit({ status: 'error', message: error.message }),
          );
        }
        if (tab === 'files' && files.status === 'idle') {
          setFiles({ status: 'loading' });
          request(`/files?name=${encodeURIComponent(name)}`).then(
            (payload) => setFiles({ status: 'ready', data: payload.data }),
            (error) => setFiles({ status: 'error', message: error.message }),
          );
        }
        if (tab === 'history' && versions.status === 'idle') {
          setVersions({ status: 'loading' });
          request(`/versions?name=${encodeURIComponent(name)}`).then(
            (payload) => setVersions({ status: 'ready', data: payload.data }),
            (error) => setVersions({ status: 'error', message: error.message }),
          );
        }
      }, [tab, audit.status, files.status, versions.status, name]);

      const loadFile = React.useCallback((path) => {
        setPreview({ status: 'loading', path });
        request(`/file?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`).then(
          (payload) => setPreview({ status: 'ready', path, content: payload.content }),
          (error) => setPreview({ status: 'error', path, message: error.message }),
        );
      }, [name]);

      const data = detail.status === 'ready' ? detail.data : null;
      const capability = data !== null && data.capability !== null ? data.capability : null;
      const ready = capability !== null && capability.ready === true;
      const gradient = iconGradient(data !== null ? data.displayName : entry.displayName);

      /* ---------------- 能力分析（源码 analysis-tab） ---------------- */
      const renderAnalysis = () => {
        if (detail.status === 'loading') return h('div', { className: 'dst-empty' }, '加载中…');
        if (detail.status === 'error') return h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, detail.message));
        if (ready !== true) return h('div', { className: 'dst-empty-block' },
          h('span', { className: 'dst-empty-title' }, '暂无该 Skill 的能力分析数据'),
          h('span', { className: 'dst-empty-sub' }, '能力分析由源盾在制品入库后生成，稍后再试'));

        const scenarios = capability.usageScenarios || [];
        const workflow = capability.skillWorkflow || [];
        const inputTypes = capability.inputTypes || [];
        const inputContents = capability.inputContents || [];
        const outputTypes = capability.outputTypes || [];
        const outputContents = capability.outputContents || [];
        const deps = capability.runtimeDependencies || [];
        const environments = Array.isArray(capability.runtimeEnvironments) ? capability.runtimeEnvironments : [];

        return h('div', { className: 'dst-tabpanel' },
          // 功能概览
          h('div', { className: 'dst-sec' },
            h('h3', { className: 'dst-sec-title' }, '功能概览'),
            h('p', { className: 'dst-prose' },
              capability.skillDescription || capability.functionSummary || NO_DATA)),

          // 使用场景
          scenarios.length > 0
            ? h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '使用场景'),
              h('div', { className: 'dst-scenarios' },
                scenarios.map((scenario, index) => h('div', { key: index, className: 'dst-scenario' },
                  h('span', null, scenario)))))
            : null,

          // 输入要求
          inputTypes.length > 0 || inputContents.length > 0
            ? h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '输入要求'),
              h('div', { className: 'dst-kv' },
                inputTypes.length > 0
                  ? [h('span', { key: 'k', className: 'dst-kv-k' }, '输入类型'),
                    h('div', { key: 'v', className: 'dst-kv-v' },
                      inputTypes.map((type) => h('span', { key: type, className: 'dst-chip' }, type)))]
                  : null,
                inputContents.length > 0
                  ? [h('span', { key: 'k2', className: 'dst-kv-k' }, '输入内容'),
                    h('div', { key: 'v2', className: 'dst-kv-v' },
                      h('div', { className: 'dst-bullets' },
                        inputContents.map((content, index) => h('div', { key: index, className: 'dst-bullet' },
                          h('span', null, content)))))]
                  : null),
              h('hr', { className: 'dst-rule' }))
            : null,

          // 输出结果
          outputTypes.length > 0 || outputContents.length > 0
            ? h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '输出结果'),
              h('div', { className: 'dst-kv' },
                outputTypes.length > 0
                  ? [h('span', { key: 'k', className: 'dst-kv-k' }, '输出类型'),
                    h('div', { key: 'v', className: 'dst-kv-v' },
                      outputTypes.map((type) => h('span', { key: type, className: 'dst-chip' }, type)))]
                  : null,
                outputContents.length > 0
                  ? [h('span', { key: 'k2', className: 'dst-kv-k' }, '输出内容'),
                    h('div', { key: 'v2', className: 'dst-kv-v' },
                      h('div', { className: 'dst-bullets' },
                        outputContents.map((content, index) => h('div', { key: index, className: 'dst-bullet' },
                          h('span', null, content)))))]
                  : null))
            : null,

          // 执行工作流
          workflow.length > 0
            ? h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '执行工作流'),
              h('div', { className: 'dst-timeline' },
                workflow.map((step, index) => h('div', { key: index, className: 'dst-tl-item' },
                  h('span', { className: 'dst-tl-dot' }),
                  h('span', { className: 'dst-tl-text' }, String(step).replace(/^\d+\.\s*/, ''))))))
            : null,

          // 运行分析
          capability.executionMode !== null || deps.length > 0 || environments.length > 0
            ? h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '运行分析'),
              h('div', { className: 'dst-kv' },
                capability.executionMode !== null
                  ? [h('span', { key: 'k', className: 'dst-kv-k' }, '执行模式'),
                    h('div', { key: 'v', className: 'dst-kv-v' },
                      h('span', {
                        style: {
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          color: C.primary, background: C.primarySoft, border: `1px solid ${C.primaryBorder}`,
                        },
                      }, capability.executionMode),
                      capability.executionModeDescription !== null
                        ? h('span', null, capability.executionModeDescription)
                        : null)]
                  : null,
                deps.length > 0
                  ? [h('span', { key: 'k2', className: 'dst-kv-k' }, '运行依赖'),
                    h('div', { key: 'v2', className: 'dst-kv-v' },
                      deps.map((dep, index) => h('span', { key: index, style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                        h('span', null, dep.name),
                        dep.type !== null ? h('span', { className: 'dst-pill-mini' }, dep.type) : null)))]
                  : null,
                environments.length > 0
                  ? [h('span', { key: 'k3', className: 'dst-kv-k' }, '运行环境'),
                    h('div', { key: 'v3', className: 'dst-kv-v' },
                      environments.map((env, index) => h('span', { key: index }, env)))]
                  : null))
            : null);
      };

      /* ---------------- 安全审计（源码 audit-tab） ---------------- */
      const renderAudit = () => {
        if (audit.status === 'loading') {
          return h('div', { className: 'dst-auditing' },
            h('div', { className: 'dst-auditing-orb' }, glyph('scanEngine', 40, 1.5)),
            h('div', { className: 'dst-auditing-text' },
              h('span', { className: 'dst-auditing-title' }, '正在查询审计数据…')));
        }
        if (audit.status === 'error') return h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, audit.message));
        if (audit.status !== 'ready') return null;

        const report = audit.data;
        const dimensions = report.dimensions || [];
        const overall = riskStyle(report.securityStatus);

        // 审计中：源码每 3 秒轮询并轮播三步文案
        if (report.securityStatus === 'AUDITING') {
          return h('div', { className: 'dst-auditing' },
            h('div', { className: 'dst-auditing-orb' }, glyph('scanEngine', 40, 1.5)),
            h('div', { className: 'dst-auditing-text' },
              h('span', { className: 'dst-auditing-title' }, '安全审计中…'),
              h('span', { className: 'dst-auditing-step' }, '正在调用静态扫描引擎检测潜在指令风险')));
        }

        if (report.securityStatus === 'NOT_AUDITED' || dimensions.length === 0) {
          return h('div', { className: 'dst-empty-block' },
            h('span', { className: 'dst-empty-title' }, '暂无安全审计数据'),
            h('span', { className: 'dst-empty-sub' }, '当前 Skill 尚未执行安全审计'));
        }

        return h('div', { className: 'dst-tabpanel' },
          // 概览：雷达图 + 总体结论
          h('div', { className: 'dst-audit-overview' },
            h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '六维风险画像'),
              h('div', { className: 'dst-radar-wrap' },
                h(Radar, { dimensions }))),
            h('div', { className: 'dst-sec' },
              h('h3', { className: 'dst-sec-title' }, '总体风险结论'),
              h('span', {
                className: 'dst-risk',
                style: {
                  color: overall.color, background: overall.bg,
                  padding: '4px 8px', borderRadius: 6, fontSize: 12, width: 'fit-content',
                },
              }, overall.label),
              h('div', { className: 'dst-verdict' }, report.summary !== null ? report.summary : NO_DATA))),
          h('hr', { className: 'dst-rule' }),
          // 维度明细
          h('div', { className: 'dst-dims' },
            dimensions.map((dimension) => h(DimensionCard, {
              key: dimension.dimension, dimension, onOpenFile: openPathAndTab,
            }))));
      };

      // Skill.md 首次进入时加载：放在 effect 里，避免渲染期产生副作用。
      const skillMdPath = data !== null && data.skillMd !== null ? data.skillMd.path : null;
      React.useEffect(() => {
        if (tab !== 'skillmd') return;
        if (skillMdPath === null) return;
        if (preview.status !== 'idle') return;
        loadFile(skillMdPath);
      }, [tab, skillMdPath, preview.status, loadFile]);

      /* ---------------- Skill.md ---------------- */
      const renderSkillMd = () => {
        if (skillMdPath === null) return h('div', { className: 'dst-empty-block' },
          h('span', { className: 'dst-empty-sub' }, '当前暂无 Skill 包资源'));
        if (preview.status === 'idle' || preview.status === 'loading') {
          return h('div', { className: 'dst-empty' }, '加载中…');
        }
        if (preview.status === 'error') return h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, preview.message));
        return h('div', { className: 'dst-tabpanel', style: { paddingTop: 8 } },
          h('pre', { className: 'dst-code' }, h('code', null, preview.content)));
      };

      /* ---------------- Skill 文件 ---------------- */
      const renderFiles = () => {
        if (files.status === 'loading') return h('div', { className: 'dst-empty' }, '加载中…');
        if (files.status === 'error') return h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, files.message));
        if (files.status !== 'ready') return null;
        const all = files.data.files || [];
        if (all.length === 0) return h('div', { className: 'dst-empty-block' },
          h('span', { className: 'dst-empty-sub' }, '当前暂无 Skill 包资源'));

        if (openFile !== null) {
          return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 } },
            h('button', { type: 'button', className: 'dst-back', onClick: () => setOpenFile(null) },
              glyph('arrowLeft', 14), ' 返回文件列表'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              glyph('file', 14),
              h('span', { style: { fontSize: 13, color: C.text } }, openFile),
              h('span', { style: { fontSize: 12, color: C.textQuaternary } },
                formatBytes((all.find((file) => file.path === openFile) || {}).size))),
            preview.status === 'loading'
              ? h('div', { className: 'dst-empty' }, '加载中…')
              : preview.status === 'error'
                ? h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, preview.message))
                : h('pre', { className: 'dst-code' }, h('code', null, preview.content)));
        }

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 } },
          h('div', { className: 'dst-file-summary' },
            h('span', null, `共 ${files.data.fileCount !== null ? files.data.fileCount : all.length} 个文件`),
            files.data.totalFileSize !== null ? h('span', null, `总大小：${formatBytes(files.data.totalFileSize)}`) : null),
          h('div', { className: 'dst-tree' },
            all.map((file) => h('div', {
              key: file.path, className: 'dst-tree-row', role: 'button', tabIndex: 0,
              onClick: () => { setOpenFile(file.path); loadFile(file.path); },
              onKeyDown: (event) => { if (event.key === 'Enter') { setOpenFile(file.path); loadFile(file.path); } },
            },
            glyph('file', 14),
            h('span', { className: 'dst-tree-name' }, file.path),
            h('span', { className: 'dst-tree-size' }, formatBytes(file.size))))));
      };

      /* ---------------- 历史版本 ---------------- */
      const renderHistory = () => {
        if (versions.status === 'loading') return h('div', { className: 'dst-empty' }, '加载中…');
        if (versions.status === 'error') return h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, versions.message));
        if (versions.status !== 'ready') return null;
        const list = versions.data.versions || [];
        if (list.length === 0) return h('div', { className: 'dst-empty-block' },
          h('span', { className: 'dst-empty-sub' }, '暂无版本记录'));

        return h('div', { style: { paddingTop: 8, overflowX: 'auto' } },
          h('table', { className: 'dst-table' },
            h('thead', null, h('tr', null,
              h('th', null, '版本'),
              h('th', null, '发布时间'),
              h('th', null, '更新说明'),
              h('th', { style: { width: 60 } }, ''))),
            h('tbody', null, list.map((version) => {
              const isCurrent = version.version === versions.data.currentVersion && list.length > 1;
              return h('tr', { key: version.version },
                h('td', null, h('div', { className: 'dst-table-ver' },
                  h('span', { style: { fontWeight: 500, color: C.text } }, `v${version.version}`),
                  version.declaredLatest ? h('span', { className: 'dst-tag-latest' }, '最新') : null,
                  isCurrent ? h('span', { className: 'dst-tag-current' }, '当前') : null)),
                h('td', null, formatDate(version.releasedAt)),
                h('td', null, h('span', {
                  className: 'dst-prop-ellipsis',
                  style: { display: 'block', maxWidth: 320 },
                  title: version.releaseNotes || undefined,
                }, version.releaseNotes !== null ? version.releaseNotes : NO_DATA)),
                h('td', null, h('button', {
                  type: 'button', className: 'dst-icon-btn',
                  disabled: installing === true,
                  title: '下载安装包',
                  onClick: () => onInstall(entry),
                }, glyph('download', 14))));
            }))));
      };

      /** 点击风险证据的文件路径：切到文件页签并打开该文件。 */
      function openPathAndTab(path) {
        setTab('files');
        setOpenFile(path);
        loadFile(path);
      }

      if (detail.status === 'error') {
        return h('div', { className: 'dst-detail' },
          h('div', { className: 'dst-crumb' },
            h('button', { type: 'button', className: 'dst-crumb-link', onClick: onBack }, 'Skill 市场'),
            h('span', { className: 'dst-crumb-sep' }, '/'),
            h('span', { className: 'dst-crumb-cur' }, entry.displayName)),
          h('div', { className: 'dst-error', style: { margin: '24px auto', maxWidth: 1152 } },
            h('span', null, detail.message),
            h('button', { type: 'button', className: 'dst-btn dst-btn-sm', onClick: onBack }, '返回')));
      }

      const display = data !== null ? data.displayName : entry.displayName;
      const risk = riskStyle(data !== null ? data.securityStatus : entry.securityStatus);
      const origin = typeof window !== 'undefined' && window.location !== undefined
        ? window.location.origin
        : '';
      const promptText = `请根据 ${origin}/install/skillmarket.md， 安装 ${name}`;

      return h('div', { className: 'dst-detail' },
        // 面包屑
        h('div', { className: 'dst-crumb' },
          h('button', { type: 'button', className: 'dst-crumb-link', onClick: onBack }, 'Skill 市场'),
          h('span', { className: 'dst-crumb-sep' }, '/'),
          h('span', { className: 'dst-crumb-cur' }, display)),

        // Header
        h('div', { className: 'dst-dhead' },
          h('div', { className: 'dst-dhead-inner' },
            h('div', { className: 'dst-dhead-main' },
              h('div', { className: 'dst-dhead-row' },
                h('div', { className: 'dst-dhead-logo', style: { background: gradient } },
                  entry.logoUrl !== null
                    ? h('img', { src: entry.logoUrl, alt: '' })
                    : avatarText(display)),
                h('div', { className: 'dst-dhead-meta' },
                  h('h1', { className: 'dst-dhead-title', title: display }, display),
                  h('div', { className: 'dst-dhead-sub', title: name }, name),
                  h('div', { className: 'dst-dhead-facts' },
                    data !== null && data.source !== null && data.source.sourceType !== null
                      ? h('span', { className: 'dst-fact' }, glyph('globe', 13), data.source.sourceType)
                      : null,
                    // 运行要求只在列表卡片里返回，详情接口没有该字段，回退到 entry。
                    (capability !== null && capability.runtimeType !== null && capability.runtimeType !== undefined)
                      || (entry.runtimeType !== null && entry.runtimeType !== undefined)
                      ? (() => {
                        const runtime = (capability !== null && capability.runtimeType !== null && capability.runtimeType !== undefined)
                          ? capability.runtimeType
                          : entry.runtimeType;
                        return h('span', { className: 'dst-fact' },
                          glyph(RUNTIME_ICONS[runtime] || 'help', 13),
                          RUNTIME_LABELS[runtime] || runtime);
                      })()
                      : null,
                    data !== null && data.securityStatus !== null
                      ? h('span', { className: 'dst-fact', style: { color: risk.color } },
                        glyph(risk.icon, 14), risk.label)
                      : null))),
              // 描述
              h('p', { className: 'dst-dhead-desc' },
                capability !== null && capability.functionSummary !== null
                  ? capability.functionSummary
                  : (entry.description !== '' ? entry.description : NO_DATA)),
              // 标签 + 版本 + 更新时间
              h('div', { className: 'dst-chips' },
                ready === true
                  ? (capability.capabilityTags || []).map((tag) => h('span', { key: tag, className: 'dst-chip' }, tag))
                  : null,
                data !== null && data.version !== null
                  ? h('span', { className: 'dst-chip' }, `v${data.version}`)
                  : null,
                data !== null && formatUpdateTime(data.releasedAt) !== ''
                  ? h('span', { className: 'dst-chip' }, formatUpdateTime(data.releasedAt))
                  : null)))),

        // 左右分栏
        h('div', { className: 'dst-body' },
          h('div', { className: 'dst-main' },
            h('div', { className: 'dst-tabs' },
              [['analysis', '能力分析'], ['audit', '安全审计'], ['skillmd', 'Skill.md'],
                ['files', 'Skill 文件'], ['history', '历史版本']].map(([key, label]) => h('button', {
                key, type: 'button', className: 'dst-tab',
                'data-active': tab === key,
                onClick: () => setTab(key),
              }, label))),
            tab === 'analysis' ? renderAnalysis() : null,
            tab === 'audit' ? renderAudit() : null,
            tab === 'skillmd' ? renderSkillMd() : null,
            tab === 'files' ? renderFiles() : null,
            tab === 'history' ? renderHistory() : null),

          h('div', { className: 'dst-side' },
            // 安装框
            h('div', { className: 'dst-install' },
              h('div', { className: 'dst-install-beam' },
                h('div', { className: 'dst-install-inner' },
                  h('div', { className: 'dst-install-card' },
                    h('p', { className: 'dst-install-hint' }, '将提示词发送给你的 AI 安装该 skills'),
                    h('code', { className: 'dst-install-prompt' }, promptText),
                    h('button', {
                      type: 'button', className: 'dst-install-copy',
                      onClick: () => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
                          navigator.clipboard.writeText(promptText).then(
                            () => setNotice({ tone: 'ok', text: '已复制 Prompt 到剪贴板' }),
                            () => setNotice({ tone: 'warn', text: '复制失败，请手动选择文本' }),
                          );
                        } else {
                          setNotice({ tone: 'warn', text: '当前环境不支持剪贴板' });
                        }
                      },
                    }, glyph('copy', 14), ' 复制 Prompt')))),
              h('button', {
                type: 'button', className: 'dst-install-dl',
                disabled: installing === true || installed === true,
                onClick: () => onInstall(entry),
              }, glyph('download', 14),
                installed === true ? ' 已安装到本机' : installing === true ? ' 正在安装…' : ' 下载压缩包安装')),

            // 提示条
            notice !== null
              ? h('div', {
                className: 'dst-banner',
                style: notice.tone === 'ok'
                  ? { border: `1px solid ${C.successBorder}`, background: C.successBg, color: C.success, margin: 0 }
                  : { border: `1px solid ${C.warningBorder}`, background: C.warningBg, color: C.warning, margin: 0 },
              }, h('span', null, notice.text))
              : null,

            // 属性面板
            h('div', { className: 'dst-props' },
              // 安全状态
              h('div', { className: 'dst-props-group' },
                h('h3', { className: 'dst-props-title' }, '安全状态'),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('tag', 14), '最新版本'),
                  h('span', { className: 'dst-prop-v' },
                    data !== null && data.latestVersion !== null ? `v${data.latestVersion}` : NO_DATA)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('shieldCheck', 14), '状态'),
                  h('span', { className: 'dst-prop-v', style: { color: risk.color } }, risk.label)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('clock', 14), '审计时间'),
                  h('span', { className: 'dst-prop-v', style: { fontSize: 12 } },
                    data !== null ? formatDateTime(data.lastAuditAt) : NO_DATA)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('history', 14), '最近发布'),
                  h('span', { className: 'dst-prop-v', style: { fontSize: 12 } },
                    data !== null ? formatDateTime(data.releasedAt) : NO_DATA)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('hash', 14), 'SHA256'),
                  h('span', { className: 'dst-prop-v' },
                    h('code', {
                      className: 'dst-prop-ellipsis',
                      style: { display: 'block' },
                      title: data !== null && data.packageSha256 !== null ? data.packageSha256 : undefined,
                    }, data !== null && data.packageSha256 !== null ? data.packageSha256 : NO_DATA)))),

              h('hr', { className: 'dst-props-sep' }),

              // 许可合规
              h('div', { className: 'dst-props-group' },
                h('h3', { className: 'dst-props-title' }, '许可合规'),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('scale', 14), '许可证'),
                  h('span', { className: 'dst-prop-v' },
                    data !== null && data.licenseName !== null ? data.licenseName : NO_DATA)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('shieldAlert', 14), '合规风险'),
                  h('span', {
                    className: 'dst-prop-v',
                    style: {
                      color: data !== null
                        ? (data.licenseStatus === 'HIGH' ? C.error
                          : data.licenseStatus === 'MID' ? C.warning
                            : data.licenseStatus === 'LOW' ? C.success : C.textSub)
                        : C.textSub,
                    },
                  }, data !== null && data.licenseStatusName !== null ? data.licenseStatusName : NO_DATA))),

              h('hr', { className: 'dst-props-sep' }),

              // 活跃度
              h('div', { className: 'dst-props-group' },
                h('h3', { className: 'dst-props-title' }, '活跃度'),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('download', 14), '下载量'),
                  h('span', { className: 'dst-prop-v' },
                    data !== null ? formatCount(data.downloadCount) : NO_DATA)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('star', 14), 'Star'),
                  h('span', { className: 'dst-prop-v' },
                    data !== null ? formatCount(data.starCount) : NO_DATA))),

              h('hr', { className: 'dst-props-sep' }),

              // 来源信息
              h('div', { className: 'dst-props-group' },
                h('h3', { className: 'dst-props-title' }, '来源信息'),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('user', 14), '作者'),
                  h('span', { className: 'dst-prop-v' },
                    data !== null && data.source !== null && data.source.author !== null
                      ? data.source.author : NO_DATA)),
                h('div', { className: 'dst-prop' },
                  h('span', { className: 'dst-prop-k' }, glyph('calendar', 14), '发布时间'),
                  h('span', { className: 'dst-prop-v' },
                    data !== null ? formatDate(data.releasedAt) : NO_DATA)))))),

        h(Footer, null));
    }

    /* ==================================================================== *
     * 主体
     * ==================================================================== */

    function Market(props) {
      const [installedSlugs, setInstalledSlugs] = React.useState({});
      const [installing, setInstalling] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [view, setView] = React.useState('market');
      const [openEntry, setOpenEntry] = React.useState(null);

      const [keyword, setKeyword] = React.useState('');
      const [submitted, setSubmitted] = React.useState('');
      const [sortBy, setSortBy] = React.useState('COMPREHENSIVE');
      const [category, setCategory] = React.useState('');
      const [securityStatus, setSecurityStatus] = React.useState('');
      const [runtimeRequirement, setRuntimeRequirement] = React.useState('');
      const [catalog, setCatalog] = React.useState({ status: 'loading', items: [], nextCursor: null });

      const [localQuery, setLocalQuery] = React.useState('');
      // 排序默认「安装时间」；纯前端重排，切换不重新请求。
      const [localSort, setLocalSort] = React.useState('INSTALLED');
      // 初始即 loading：挂载时马上会发 /installed 请求，若初始写成 ready，
      // 首帧会先闪一下「本机还没有安装任何 Skill」空态再跳成列表。
      const [local, setLocal] = React.useState({ status: 'loading', installed: [], installRoot: '' });

      const loadCatalog = React.useCallback((append, cursor) => {
        setCatalog((prev) => (append ? prev : { status: 'loading', items: [], nextCursor: null }));
        const params = new URLSearchParams();
        if (submitted !== '') params.set('keyword', submitted);
        if (category !== '') params.set('category', category);
        if (securityStatus !== '') params.set('securityStatus', securityStatus);
        if (runtimeRequirement !== '') params.set('runtimeRequirement', runtimeRequirement);
        params.set('sortBy', sortBy);
        params.set('pageSize', String(PAGE_SIZE));
        if (typeof cursor === 'string' && cursor !== '') params.set('cursor', cursor);

        request(`/search?${params.toString()}`).then(
          (payload) => {
            setCatalog((prev) => ({
              status: 'ready',
              items: append ? [...prev.items, ...payload.items] : payload.items,
              nextCursor: payload.nextCursor !== null ? payload.nextCursor : null,
            }));
          },
          (error) => {
            setCatalog((prev) => ({
              status: 'error', items: append ? prev.items : [], nextCursor: null,
              message: error.message, retryAfter: error.retryAfter,
            }));
          },
        );
      }, [submitted, category, securityStatus, runtimeRequirement, sortBy]);

      React.useEffect(() => { loadCatalog(false, null); }, [loadCatalog]);

      const loadInstalled = React.useCallback(() => {
        setLocal((prev) => ({ ...prev, status: 'loading' }));
        request('/installed').then(
          (payload) => setLocal({ status: 'ready', installed: payload.installed || [], installRoot: payload.installRoot || '' }),
          (error) => setLocal({ status: 'error', installed: [], installRoot: '', message: error.message }),
        );
      }, []);

      React.useEffect(() => {
        request('/installed').then(
          (payload) => setLocal({ status: 'ready', installed: payload.installed || [], installRoot: payload.installRoot || '' }),
          (error) => setLocal({ status: 'error', installed: [], installRoot: '', message: error.message }),
        );
      }, []);

      const doInstall = React.useCallback((entry) => {
        setInstalling(entry.name);
        setNotice(null);
        request('/install', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: entry.name, overwrite: true }),
        }).then(
          (payload) => {
            setInstalling(null);
            setInstalledSlugs((prev) => ({ ...prev, [entry.slug]: payload.version || '已安装' }));
            setNotice({
              tone: 'ok',
              text: `已安装 ${entry.displayName}：${payload.fileCount} 个文件 · ${formatBytes(payload.totalBytes)}`,
            });
            loadInstalled();
          },
          (error) => {
            setInstalling(null);
            setNotice({ tone: 'error', text: `安装失败：${error.message}` });
          },
        );
      }, [loadInstalled]);

      /**
       * 已安装技能的展示模型 + 搜索 + 排序，一次算完。
       *
       * 先把每条记录归一成 readInstalledMeta 的展示模型（每项只算一次），
       * 再过滤、再排序，避免在渲染循环里重复归一。
       */
      const localView = React.useMemo(() => {
        const entries = local.installed.map((item) => ({ item, meta: readInstalledMeta(item) }));
        const query = localQuery.trim().toLowerCase();
        const matched = query === ''
          ? entries
          : entries.filter(({ meta, item }) => (
            // 搜索同时匹配 slug、标题（displayName/name）、描述、标签与目录。
            meta.slug.toLowerCase().includes(query)
            || meta.title.toLowerCase().includes(query)
            || (meta.name !== null && meta.name.toLowerCase().includes(query))
            || (meta.desc !== null && meta.desc.toLowerCase().includes(query))
            || meta.tags.some((tag) => tag.toLowerCase().includes(query))
            || String(item.dir ?? '').toLowerCase().includes(query)
          ));

        const byName = (left, right) => metaSortKey(left.meta).localeCompare(metaSortKey(right.meta), 'en');
        const sorted = matched.slice();
        if (localSort === 'NAME') {
          sorted.sort(byName);
        } else {
          // 默认「安装时间」：installedAt 优先，回退 SKILL.md 的 mtime，倒序。
          const timeOf = (entry) => {
            const raw = entry.meta.installedAt ?? entry.meta.modifiedAt;
            const parsed = raw === null ? Number.NaN : new Date(raw).getTime();
            return Number.isNaN(parsed) ? 0 : parsed;
          };
          sorted.sort((left, right) => {
            const byTime = timeOf(right) - timeOf(left);
            return byTime !== 0 ? byTime : byName(left, right);
          });
        }
        return sorted;
      }, [local.installed, localQuery, localSort]);

      const noticeBar = notice === null ? null : h('div', {
        className: 'dst-banner',
        style: notice.tone === 'ok'
          ? { border: `1px solid ${C.successBorder}`, background: C.successBg, color: C.success }
          : notice.tone === 'warn'
            ? { border: `1px solid ${C.warningBorder}`, background: C.warningBg, color: C.warning }
            : { border: `1px solid ${C.errorBorder}`, background: C.errorBg, color: C.error },
      }, h('span', null, notice.text));

      if (openEntry !== null) {
        return h('div', { className: 'dst-root' },
          h('style', null, styles),
          h(DetailPage, {
            entry: openEntry,
            onBack: () => setOpenEntry(null),
            onInstall: doInstall,
            installing: installing === openEntry.name,
            installed: installedSlugs[openEntry.slug] !== undefined,
          }));
      }

      const renderMarket = () => h(React.Fragment, null,
        // 筛选条
        h('div', { className: 'dst-filters' },
          h('div', { className: 'dst-sorts' },
            SORT_OPTIONS.map((option) => h('button', {
              key: option.value, type: 'button', className: 'dst-sort',
              'data-active': sortBy === option.value,
              onClick: () => setSortBy(option.value),
            }, option.label))),
          h('div', { className: 'dst-selects' },
            h(FilterDropdown, {
              value: category, options: SCENE_OPTIONS,
              placeholder: '所有场景', onChange: setCategory,
            }),
            h(FilterDropdown, {
              value: securityStatus, options: STATUS_OPTIONS,
              placeholder: '所有状态', onChange: setSecurityStatus,
            }),
            h(FilterDropdown, {
              value: runtimeRequirement, options: RUNTIME_OPTIONS,
              placeholder: '所有运行要求', onChange: setRuntimeRequirement,
            }),
            // 本机已安装入口：源码无此页（那是 Web 端没有的本地能力），
            // 放在筛选条右侧，与原有交互同一条水平线，不另起导航。
            // 数据在挂载时已拉过，这里直接用缓存，只有"重新扫描"才强制重查。
            h('button', {
              type: 'button', className: 'dst-btn dst-btn-round dst-installed-entry',
              onClick: () => setView('installed'),
            }, glyph('package', 14), ' 本机已安装'))),

        noticeBar,

        // 卡片
        catalog.status === 'loading'
          ? h('div', { className: 'dst-grid' }, Array.from({ length: 9 }, (unused, index) => h(SkillSkeleton, { key: index })))
          : null,
        catalog.status === 'error'
          ? h('div', { className: 'dst-error' },
            h('span', null, catalog.retryAfter !== undefined
              ? `请求过于频繁，请 ${catalog.retryAfter} 秒后重试`
              : `加载失败：${catalog.message}`),
            h('button', { type: 'button', className: 'dst-btn dst-btn-sm', onClick: () => loadCatalog(false, null) }, '重试'))
          : null,
        catalog.status === 'ready' && catalog.items.length === 0
          ? h('div', { className: 'dst-empty' }, '没有符合条件的 Skill')
          : null,
        catalog.items.length > 0
          ? h('div', { className: 'dst-grid' },
            catalog.items.map((entry) => h(SkillCard, { key: entry.name, entry, onOpen: setOpenEntry })))
          : null,
        catalog.nextCursor !== null
          ? h('div', { className: 'dst-more' },
            h('button', {
              type: 'button', className: 'dst-btn',
              onClick: () => loadCatalog(true, catalog.nextCursor),
            }, '加载更多'))
          : null,
        catalog.status === 'ready' && catalog.items.length > 0 && catalog.nextCursor === null
          ? h('p', { className: 'dst-note', style: { paddingBottom: 32 } }, '已经到底了')
          : null);

      const renderInstalled = () => h('div', { className: 'dst-local' },
        h('div', { className: 'dst-local-title-row' },
          h('h2', { className: 'dst-local-title' }, '本机已安装'),
          h('span', { className: 'dst-local-count' },
            local.status === 'loading'
              ? '扫描中…'
              : `共 ${local.installed.length} 个 Skill`)),
        h('div', { className: 'dst-local-head' },
          h('div', { className: 'dst-local-search' },
            glyph('search', 16),
            h('input', {
              value: localQuery,
              placeholder: '搜索名称、描述或标签',
              onChange: (event) => setLocalQuery(event.target.value),
            })),
          h('button', { type: 'button', className: 'dst-btn', disabled: local.status === 'loading', onClick: loadInstalled }, '重新扫描'),
          h('button', { type: 'button', className: 'dst-btn dst-btn-round', onClick: () => setView('market') }, '返回市场')),
        // 排序 pill：复用市场页 .dst-sort 样式，纯前端重排，切换不重新请求。
        h('div', { className: 'dst-local-sorts' },
          h('div', { className: 'dst-sorts' },
            LOCAL_SORT_OPTIONS.map((option) => h('button', {
              key: option.value, type: 'button', className: 'dst-sort',
              'data-active': localSort === option.value,
              onClick: () => setLocalSort(option.value),
            }, option.label))),
          // 文案要诚实：默认档依据的是文件 mtime，不是真正的安装时刻。
          localSort === 'INSTALLED'
            ? h('span', { className: 'dst-note', style: { textAlign: 'left' } }, '按文件时间近似')
            : null),
        local.installRoot !== ''
          ? h('p', { className: 'dst-note', style: { textAlign: 'left' } }, `安装目录：${local.installRoot}`)
          : null,
        // 错误态：沿用 .dst-error，带重试；已有数据时不清空列表。
        local.status === 'error' && local.installed.length === 0
          ? h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, local.message),
            h('button', { type: 'button', className: 'dst-btn dst-btn-sm', onClick: loadInstalled }, '重试'))
          : null,
        local.status === 'error' && local.installed.length > 0
          ? h('div', { className: 'dst-error', style: { margin: 0 } }, h('span', null, `刷新失败：${local.message}`),
            h('button', { type: 'button', className: 'dst-btn dst-btn-sm', onClick: loadInstalled }, '重试'))
          : null,
        // 加载中：骨架卡片，与市场页同一套 .dst-skel，不只显示文字。
        local.status === 'loading' && local.installed.length === 0
          ? h('div', { className: 'dst-grid', style: { padding: 0 } },
            Array.from({ length: 6 }, (unused, index) => h(SkillSkeleton, { key: index })))
          : null,
        // 空态：居中提示 + 去市场看看。
        local.status === 'ready' && local.installed.length === 0
          ? h('div', { className: 'dst-empty' },
            h('p', { style: { margin: '0 0 16px' } }, '本机还没有安装任何 Skill'),
            h('button', { type: 'button', className: 'dst-btn dst-btn-primary', onClick: () => setView('market') }, '去市场看看'))
          : null,
        local.status === 'ready' && local.installed.length > 0 && localView.length === 0
          ? h('div', { className: 'dst-empty' }, `没有匹配「${localQuery.trim()}」的 Skill`)
          : null,
        // 与市场页同一套卡片网格；外层 .dst-local 已有 padding，这里补 0 避免双重间距。
        localView.length > 0
          ? h('div', { className: 'dst-grid', style: { padding: 0 } },
            localView.map(({ meta }) => h(InstalledCard, { key: `${meta.slug}#${meta.dir}`, item: { slug: meta.slug }, meta })))
          : null);

      return h('div', { className: 'dst-root' },
        h('style', null, styles),
        h('div', { className: 'dst-glow' }),
        h('div', { className: 'dst-shell' },
          h('div', { className: 'dst-wrap' },
            // Hero 只属于市场页；已安装页有自己的标题行，不叠加。
            view === 'market'
              ? h('div', { className: 'dst-hero' },
                h('h1', { className: 'dst-hero-title' }, '可信 Skill，从发现到安全使用'),
                h('p', { className: 'dst-hero-sub' }, '从能力理解到安全审计，帮助你更安心地选择和使用开源 Skill'),
                h('div', { className: 'dst-search' },
                  h('div', { className: 'dst-search-box' },
                    glyph('search', 15),
                    h('input', {
                      value: keyword,
                      placeholder: '搜索名称、功能、应用场景',
                      onChange: (event) => {
                        setKeyword(event.target.value);
                        if (event.target.value === '') setSubmitted('');
                      },
                      onKeyDown: (event) => {
                        if (event.key !== 'Enter') return;
                        setSubmitted(keyword.trim());
                      },
                    }),
                    keyword !== ''
                      ? h('button', {
                        type: 'button', className: 'dst-search-go',
                        onClick: () => setSubmitted(keyword.trim()),
                      }, glyph('cornerDown', 13))
                      : null)))
              : null,
            view === 'market' ? renderMarket() : renderInstalled(),
            h(Footer, null))));
    }

    function PanelIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      const active = props.active === true;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: active ? 2 : 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      },
      h('path', { d: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', opacity: active ? 1 : 0.85 }),
      h('path', { d: 'M9 12l2 2 4-4', opacity: active ? 1 : 0.85 }));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const id = 'dsh-skill-trust';
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id, order: 25, label: () => '源盾 Skills',
        }, PanelIcon));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id }, Market));
      },
    };
  },
});
