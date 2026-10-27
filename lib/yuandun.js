/**
 * 源盾 Skill 市场匿名接口客户端。
 *
 * A faithful mapping of the published anonymous API. Every endpoint, query
 * parameter, and error code here comes from that document; this module adds no
 * meaning of its own beyond normalising nullable fields for the UI.
 *
 * Transport notes:
 * - All responses use `{ result, message, data, traceId }` except file preview
 *   (plain text) and download (binary ZIP).
 * - Anonymous quotas are per IP: query 60/min, file 30/min, zip 5/min. A 429
 *   carries `Retry-After` in seconds, which we surface instead of retrying.
 * - Cursors are opaque and bound to the `sortBy` that produced them.
 */
const DEFAULT_BASE = 'https://yuandun.gitee.com';
const TIMEOUT_MS = 25000;
const MAX_PAGE_SIZE = 30;
const MAX_ZIP_BYTES = 64 * 1024 * 1024;

/** sortBy 允许值。 */
const SORT_VALUES = ['COMPREHENSIVE', 'DOWNLOADS', 'STARS', 'LATEST'];
/** category 仅接受中文名。 */
const CATEGORY_VALUES = ['软件研发', '数据与分析', '内容与创作', '业务与管理', 'AI与自动化', '其他'];
/** securityStatus 允许值，ALL 或不传表示不筛选。 */
const SECURITY_VALUES = ['SAFE', 'RISKY', 'SUSPECTED', 'NOT_AUDITED', 'AUDITING'];
/** runtimeRequirement 允许值。 */
const RUNTIME_VALUES = ['LOCAL', 'EXTERNAL_NO_CREDENTIAL', 'EXTERNAL_WITH_CREDENTIAL'];

/** 安全状态中文名，与 securityStatusName 对齐；用于本地兜底显示。 */
const SECURITY_LABELS = {
  SAFE: '安全',
  RISKY: '有风险',
  SUSPECTED: '疑似风险',
  NOT_AUDITED: '未审计',
  AUDITING: '审计中',
};

/** 六维审计编码 → 中文名，文档固定六个。 */
const DIMENSION_LABELS = {
  instruction_security: '指令安全',
  code_security: '代码安全',
  permission_security: '权限安全',
  data_security: '数据安全',
  dependency_security: '依赖安全',
  anomaly_detection: '异常行为',
};

/** 运行时要求中文名。 */
const RUNTIME_LABELS = {
  LOCAL: '本地运行',
  EXTERNAL_NO_CREDENTIAL: '外部服务(无需凭证)',
  EXTERNAL_WITH_CREDENTIAL: '外部服务(需凭证)',
};

function text(value, limit = 2000) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

function optionalText(value, limit = 2000) {
  return typeof value === 'string' && value.trim() !== '' ? text(value, limit) : null;
}

function integer(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => text(item, 400)) : [];
}

/** 一个可读的错误对象，保留 HTTP 状态与 Retry-After。 */
export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.retryAfter = options.retryAfter;
  }
}

function codeOf(message) {
  if (typeof message !== 'string') return undefined;
  const prefix = message.split(':')[0].trim();
  return /^[A-Z][A-Z0-9_]{3,}$/.test(prefix) ? prefix : undefined;
}

/** 发一个 JSON 请求并拆开统一信封。 */
async function requestJson(base, pathname, params, signal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const target = `${base}${pathname}${query.size === 0 ? '' : `?${query.toString()}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (signal !== undefined) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || payload === null || payload.result !== true) {
      const message = text(payload?.message, 500) || `HTTP ${response.status}`;
      throw new ApiError(message, {
        status: response.status,
        code: codeOf(payload?.message),
        retryAfter: response.headers.get('retry-after'),
      });
    }
    return payload.data ?? {};
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('请求超时或被取消', { status: 504 });
    throw new ApiError(error instanceof Error ? error.message : String(error), { status: 502 });
  } finally {
    clearTimeout(timer);
    if (signal !== undefined) signal.removeEventListener('abort', forwardAbort);
  }
}

/* -------------------------------------------------------------------------- *
 * 搜索技能
 * -------------------------------------------------------------------------- */
function normalizeCard(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const name = text(raw.name, 200);
  if (name === '') return undefined;
  const slash = name.indexOf('/');
  const status = typeof raw.securityStatus === 'string' ? raw.securityStatus : 'NOT_AUDITED';
  const runtimeType = optionalText(raw.runtimeType, 60);
  return {
    name,
    owner: slash < 0 ? '' : name.slice(0, slash),
    slug: slash < 0 ? name : name.slice(slash + 1),
    displayName: text(raw.displayName, 200) || text(raw.nameZh, 200) || name,
    nameZh: optionalText(raw.nameZh, 200),
    logoUrl: typeof raw.logoUrl === 'string' && /^https?:\/\//.test(raw.logoUrl) ? raw.logoUrl : null,
    status: text(raw.status, 40),
    securityStatus: status,
    securityStatusName: text(raw.securityStatusName, 40) || SECURITY_LABELS[status] || status,
    description: text(raw.description, 600),
    category: text(raw.category, 60),
    runtimeType,
    runtimeLabel: runtimeType === null ? null : RUNTIME_LABELS[runtimeType] ?? runtimeType,
    starCount: integer(raw.starCount) ?? 0,
    installs: integer(raw.installs) ?? 0,
    currentVersion: optionalText(raw.currentVersion, 60),
  };
}

/**
 * GET /yuandun/ui/skills
 *
 * @param options { keyword, category, runtimeRequirement, securityStatus, sortBy, cursor, pageSize }
 */
export async function searchSkills(base, options = {}, signal) {
  const sortBy = SORT_VALUES.includes(options.sortBy) ? options.sortBy : 'COMPREHENSIVE';
  const category = CATEGORY_VALUES.includes(options.category) ? options.category : '';
  const securityStatus = SECURITY_VALUES.includes(options.securityStatus) ? options.securityStatus : '';
  const runtimeRequirement = RUNTIME_VALUES.includes(options.runtimeRequirement) ? options.runtimeRequirement : '';
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(options.pageSize) || 20)));

  const data = await requestJson(base, '/yuandun/ui/skills', {
    keyword: typeof options.keyword === 'string' ? options.keyword.trim() : '',
    category,
    securityStatus,
    runtimeRequirement,
    sortBy,
    cursor: typeof options.cursor === 'string' ? options.cursor : '',
    pageSize,
  }, signal);

  const items = Array.isArray(data.items) ? data.items.map(normalizeCard).filter(Boolean) : [];
  return {
    items,
    // 文档：以 nextCursor 为准，hasMore 仅为便利标志。
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
    hasMore: data.hasMore === true,
    query: { sortBy, category, securityStatus, runtimeRequirement, pageSize },
  };
}

/* -------------------------------------------------------------------------- *
 * 技能详情
 * -------------------------------------------------------------------------- */
function normalizeSource(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  return {
    sourceType: optionalText(raw.sourceType, 80),
    sourceUrl: optionalText(raw.sourceUrl, 500),
    repositoryUrl: optionalText(raw.repositoryUrl, 500),
    author: optionalText(raw.author, 120),
    organization: optionalText(raw.organization, 120),
  };
}

function normalizeDependency(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const name = text(raw.name, 200);
  if (name === '') return undefined;
  return { name, type: optionalText(raw.type, 60) };
}

export function normalizeCapability(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const status = text(raw.capabilityStatus, 40) || 'PROCESSING';
  // 文档：非 SUCCEEDED 时其余分析字段均为 null，客户端应显示「分析中/待完成」。
  if (status !== 'SUCCEEDED') {
    return { capabilityStatus: status, ready: false };
  }
  return {
    capabilityStatus: status,
    ready: true,
    skillDescription: optionalText(raw.skillDescription, 4000),
    functionSummary: optionalText(raw.functionSummary, 1000),
    executionMode: optionalText(raw.executionMode, 120),
    executionModeDescription: optionalText(raw.executionModeDescription, 2000),
    skillCategory: optionalText(raw.skillCategory, 80),
    capabilityTags: stringArray(raw.capabilityTags),
    usageScenarios: stringArray(raw.usageScenarios),
    skillWorkflow: stringArray(raw.skillWorkflow),
    requiresApiKey: optionalText(raw.requiresApiKey, 10),
    runtimeDependencies: Array.isArray(raw.runtimeDependencies)
      ? raw.runtimeDependencies.map(normalizeDependency).filter(Boolean)
      : [],
    inputTypes: stringArray(raw.inputTypes),
    inputContents: stringArray(raw.inputContents),
    outputTypes: stringArray(raw.outputTypes),
    outputContents: stringArray(raw.outputContents),
    analyzedAt: optionalText(raw.analyzedAt, 40),
  };
}

/** GET /yuandun/ui/skills/detail?name= */
export async function getSkillDetail(base, name, signal) {
  const data = await requestJson(base, '/yuandun/ui/skills/detail', { name }, signal);
  const status = text(data.securityStatus, 40) || 'NOT_AUDITED';
  return {
    name: text(data.name, 200),
    displayName: text(data.displayName, 200) || text(data.nameZh, 200) || text(data.name, 200),
    nameZh: optionalText(data.nameZh, 200),
    logoUrl: typeof data.logoUrl === 'string' && /^https?:\/\//.test(data.logoUrl) ? data.logoUrl : null,
    status: text(data.status, 40),
    securityStatus: status,
    securityStatusName: text(data.securityStatusName, 40) || SECURITY_LABELS[status] || status,
    lastAuditAt: optionalText(data.lastAuditAt, 40),
    version: optionalText(data.version, 60),
    latestVersion: optionalText(data.latestVersion, 60),
    releaseNotes: optionalText(data.releaseNotes, 4000),
    releasedAt: optionalText(data.releasedAt, 40),
    source: normalizeSource(data.source),
    starCount: integer(data.starCount) ?? 0,
    // 详情用 downloadCount，搜索卡片用 installs，同义不同名。
    downloadCount: integer(data.downloadCount) ?? 0,
    licenseName: optionalText(data.licenseName, 120),
    licenseStatus: optionalText(data.licenseStatus, 20),
    licenseStatusName: optionalText(data.licenseStatusName, 40),
    packageSha256: optionalText(data.packageSha256, 80),
    packageSize: integer(data.packageSize),
    fileCount: integer(data.fileCount),
    totalFileSize: integer(data.totalFileSize),
    downloadDecision: optionalText(data.downloadDecision, 20),
    requiresConfirmation: data.requiresConfirmation === true,
    downloadUrl: optionalText(data.downloadUrl, 1000),
    capability: normalizeCapability(data.capability),
    skillMd: data.skillMd && typeof data.skillMd === 'object'
      ? {
        path: text(data.skillMd.path, 300),
        size: integer(data.skillMd.size),
        streamUrl: optionalText(data.skillMd.streamUrl, 1000),
      }
      : null,
  };
}

/* -------------------------------------------------------------------------- *
 * 能力分析 / 安全审计 / 版本历史 / 文件树
 * -------------------------------------------------------------------------- */
/** GET /yuandun/ui/skills/capability?name= */
export async function getCapability(base, name, signal) {
  return normalizeCapability(await requestJson(base, '/yuandun/ui/skills/capability', { name }, signal));
}

function normalizeEvidence(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  return {
    filePath: text(raw.filePath, 400),
    startLine: integer(raw.startLine),
    endLine: integer(raw.endLine),
    snippet: text(raw.snippet, 2000),
  };
}

function normalizeVulnerability(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const cveId = optionalText(raw.cveId, 60);
  const vulnId = optionalText(raw.vulnId, 120);
  if (cveId === null && vulnId === null) return undefined;
  return {
    cveId,
    vulnId,
    riskLevel: optionalText(raw.riskLevel, 20),
    riskLevelName: optionalText(raw.riskLevelName, 40),
  };
}

function normalizeDependencyComponent(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const name = text(raw.name, 200);
  if (name === '') return undefined;
  return {
    platform: optionalText(raw.platform, 60),
    name,
    version: optionalText(raw.version, 60),
    vulnerabilities: Array.isArray(raw.vulnerabilities)
      ? raw.vulnerabilities.map(normalizeVulnerability).filter(Boolean)
      : [],
  };
}

function normalizeFinding(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  return {
    riskType: text(raw.riskType, 200),
    description: text(raw.description, 3000),
    detectionMethods: stringArray(raw.detectionMethods),
    evidenceLocations: Array.isArray(raw.evidenceLocations)
      ? raw.evidenceLocations.map(normalizeEvidence).filter(Boolean)
      : [],
    dependencyComponents: Array.isArray(raw.dependencyComponents)
      ? raw.dependencyComponents.map(normalizeDependencyComponent).filter(Boolean)
      : [],
  };
}

/**
 * GET /yuandun/ui/skills/security-audit?name=
 * 六维审计：每维 status 取 SAFE/RISKY/SUSPECTED/INCONCLUSIVE。
 */
export async function getSecurityAudit(base, name, signal) {
  const data = await requestJson(base, '/yuandun/ui/skills/security-audit', { name }, signal);
  const status = text(data.securityStatus, 40) || 'NOT_AUDITED';
  const dimensions = Array.isArray(data.dimensions)
    ? data.dimensions.filter((item) => item !== null && typeof item === 'object').map((item) => {
      const code = text(item.dimension, 60);
      return {
        dimension: code,
        dimensionName: text(item.dimensionName, 60) || DIMENSION_LABELS[code] || code,
        status: text(item.status, 30),
        statusName: text(item.statusName, 40),
        summary: optionalText(item.summary, 2000),
        findings: Array.isArray(item.findings) ? item.findings.map(normalizeFinding).filter(Boolean) : [],
      };
    })
    : [];
  return {
    name: text(data.name, 200),
    version: optionalText(data.version, 60),
    securityStatus: status,
    securityStatusName: text(data.securityStatusName, 40) || SECURITY_LABELS[status] || status,
    summary: optionalText(data.summary, 4000),
    dimensions,
  };
}

/** GET /yuandun/ui/skills/versions?name= */
export async function getVersions(base, name, signal) {
  const data = await requestJson(base, '/yuandun/ui/skills/versions', { name }, signal);
  return {
    name: text(data.name, 200),
    currentVersion: optionalText(data.currentVersion, 60),
    versions: Array.isArray(data.versions)
      ? data.versions.filter((item) => item !== null && typeof item === 'object').map((item) => ({
        version: text(item.version, 60),
        releasedAt: optionalText(item.releasedAt, 40),
        releaseNotes: optionalText(item.releaseNotes, 3000),
        declaredLatest: item.declaredLatest === true,
        sourceType: optionalText(item.sourceType, 80),
        downloadUrl: optionalText(item.downloadUrl, 1000),
      }))
      : [],
  };
}

/** GET /yuandun/ui/skills/files?name= */
export async function getFiles(base, name, signal) {
  const data = await requestJson(base, '/yuandun/ui/skills/files', { name }, signal);
  return {
    name: text(data.name, 200),
    version: optionalText(data.version, 60),
    files: Array.isArray(data.files)
      ? data.files.filter((item) => item !== null && typeof item === 'object')
        .map((item) => ({ path: text(item.path, 500), size: integer(item.size) ?? 0 }))
        .filter((item) => item.path !== '')
      : [],
    fileCount: integer(data.fileCount) ?? 0,
    totalFileSize: integer(data.totalFileSize) ?? 0,
  };
}

/* -------------------------------------------------------------------------- *
 * 文件预览 / 下载
 * -------------------------------------------------------------------------- */
/** GET /yuandun/ui/skills/file —— 纯文本流，不是 JSON 信封。 */
export async function getFileText(base, name, filePath, signal) {
  const query = new URLSearchParams({ name, path: filePath });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (signal !== undefined) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    const response = await fetch(`${base}/yuandun/ui/skills/file?${query.toString()}`, {
      signal: controller.signal,
      headers: { accept: 'text/plain' },
    });
    const body = await response.text();
    if (!response.ok) {
      // 错误仍是 JSON 信封，但响应头是 text/plain。
      let message = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed?.message === 'string') message = parsed.message;
      } catch {
        if (body.trim() !== '') message = body.trim().slice(0, 300);
      }
      throw new ApiError(message, { status: response.status, code: codeOf(message) });
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('请求超时或被取消', { status: 504 });
    throw new ApiError(error instanceof Error ? error.message : String(error), { status: 502 });
  } finally {
    clearTimeout(timer);
    if (signal !== undefined) signal.removeEventListener('abort', forwardAbort);
  }
}

/**
 * GET /yuandun/ui/skill-downloads —— ZIP 二进制流。
 *
 * `packageSha256` 钉住具体制品；响应头 `X-Skill-SHA256` 是实际下发制品的摘要，
 * 调用方据此校验后再落盘。
 */
export async function downloadPackage(base, options = {}, signal) {
  const query = new URLSearchParams();
  if (typeof options.name !== 'string' || options.name === '') throw new ApiError('缺少 name 参数', { status: 400 });
  query.set('name', options.name);
  if (typeof options.version === 'string' && options.version !== '') query.set('version', options.version);
  if (typeof options.packageSha256 === 'string' && options.packageSha256 !== '') {
    query.set('packageSha256', options.packageSha256);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 3);
  const forwardAbort = () => controller.abort();
  if (signal !== undefined) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    const headers = { accept: 'application/octet-stream' };
    // 可选来源标识，用于按来源累计下载量（最长 32 字符）。
    if (typeof options.clientSource === 'string' && options.clientSource !== '') {
      headers['X-Client-Source'] = options.clientSource.slice(0, 32);
    }
    const response = await fetch(`${base}/yuandun/ui/skill-downloads?${query.toString()}`, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      let message = `HTTP ${response.status}`;
      let code;
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed?.message === 'string') message = parsed.message;
        code = codeOf(parsed?.message);
      } catch {
        if (body.trim() !== '') message = body.trim().slice(0, 300);
      }
      throw new ApiError(message, {
        status: response.status,
        code,
        retryAfter: response.headers.get('retry-after'),
      });
    }

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_ZIP_BYTES) {
      throw new ApiError(`制品超过 ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB 上限`, { status: 413 });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_ZIP_BYTES) {
      throw new ApiError(`制品超过 ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB 上限`, { status: 413 });
    }
    return {
      bytes: buffer,
      // 文档：X-Skill-SHA256 可校验下载结果。
      sha256: optionalText(response.headers.get('x-skill-sha256'), 80),
      contentType: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('下载超时或被取消', { status: 504 });
    throw new ApiError(error instanceof Error ? error.message : String(error), { status: 502 });
  } finally {
    clearTimeout(timer);
    if (signal !== undefined) signal.removeEventListener('abort', forwardAbort);
  }
}

export {
  DEFAULT_BASE,
  SORT_VALUES,
  CATEGORY_VALUES,
  SECURITY_VALUES,
  RUNTIME_VALUES,
  SECURITY_LABELS,
  DIMENSION_LABELS,
  RUNTIME_LABELS,
  MAX_PAGE_SIZE,
};
