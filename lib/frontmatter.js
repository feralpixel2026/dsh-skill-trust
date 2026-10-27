/**
 * SKILL.md frontmatter 的最小解析器（零依赖）。
 *
 * 为什么需要它：本机技能目录里只有本插件自己安装的技能带 `_meta.json`，其余技能来自其它
 * 工具，元数据只存在于 SKILL.md 的 YAML frontmatter 里。为了不引入 js-yaml（插件要能离线
 * 安装，且需求只有几十行），这里手写一个**够用即止**的子集解析器。
 *
 * 支持（覆盖本机 43 个真实技能的全部用法）：
 * - 文件开头的 `---` … `---` 块；容忍 BOM 与前导空行；CRLF / CR 统一为 LF
 * - 单行标量：双引号（含常用反斜杠转义）、单引号（含 `''` 转义）、数字、布尔、null
 * - 块标量 `|` `>` 及 `-`/`+` 修饰符；按统一缩进去缩进，`>` 把换行折叠为空格、`|` 保留换行
 * - flow 数组 `[a, b]`（可跨行）与块数组（每行一个 `- a`）
 * - 嵌套 map（`metadata:\n  version: "1.0"`）；递归实现，因此多深一层也能读
 *
 * 明确不支持（真实数据里不存在，实现成本远超收益）：
 * - 锚点 / 别名、多文档、多行 plain 标量、序列里的嵌套 map
 * - `|+` / `>+`（keep）的尾部空行保真——按 clip 处理，只保证调用方看到的文本正确
 * - 重复键按 YAML 规范应报错，这里后写覆盖先写
 *
 * 设计取舍：解析器**永不抛异常**。SKILL.md 来自第三方，任何奇怪内容都只能降级为
 * `hasFrontmatter: false`，绝不能让调用方的整轮扫描崩掉。
 */

const BO = '|';
const FOLD = '>';

/** 值字符串是否为空行（仅空白）。 */
function isBlank(line) {
  return line.trim() === '';
}

/** 行首缩进宽度（空格与制表符各记 1，YAML 禁止 tab 缩进，这里只求不崩）。 */
function indentOf(line) {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  return i;
}

/** 从 from 开始找第一条非空行，找不到返回 -1。 */
function nextNonBlank(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    if (!isBlank(lines[i])) return i;
  }
  return -1;
}

/** 双引号内容的反斜杠转义还原；无法识别的转义原样保留。 */
function unescapeDouble(body) {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    i += 1;
    if (next === undefined) {
      out += '\\';
      continue;
    }
    switch (next) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '0': out += '\0'; break;
      case '"': out += '"'; break;
      case '\\': out += '\\'; break;
      case '/': out += '/'; break;
      case 'u': {
        const hex = body.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += 'u';
        }
        break;
      }
      default: out += next; break;
    }
  }
  return out;
}

/** 去掉成对的引号；不成对时原样返回。 */
function unquote(text) {
  const t = text.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return unescapeDouble(t.slice(1, -1));
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/**
 * 在引号外找第一个「后接空白或行尾」的冒号，切成 key / value。
 * 这是「值里含冒号不被截断」的关键：`description: "Use when: (1) ..."` 只切第一个冒号，
 * 剩下的 `Use when: (1) ...` 整体作为值；而且引号内的冒号根本不参与比较。
 */
function splitKeyValue(content) {
  let quote = '';
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quote !== '') {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        // 单引号内的 '' 是转义的单引号，不算闭合
        if (quote === "'" && content[i + 1] === "'") {
          i += 1;
          continue;
        }
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':' && (i + 1 >= content.length || /\s/.test(content[i + 1]))) {
      return { key: unquote(content.slice(0, i)), value: content.slice(i + 1).trim() };
    }
  }
  return null;
}

/** 去掉行尾 ` # 注释`（引号内不算）；value 形如 `abc # x` → `abc`。 */
function stripTrailingComment(value) {
  let quote = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote !== '') {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && value[i + 1] === "'") {
          i += 1;
          continue;
        }
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trim();
  }
  return value;
}

/** `[` 与 `]` 在引号外是否配平（用于跨行 flow 数组）。 */
function flowBalanced(text) {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== '') {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
  }
  return depth === 0 && !quote;
}

/** 把 `[a, "b, c", [d]]` 拆成元素并逐个类型化。 */
function parseFlowArray(text) {
  const body = text.trim().slice(1, -1);
  const parts = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote !== '') {
      current += ch;
      if (quote === '"' && ch === '\\') {
        current += body[i + 1] ?? '';
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  const out = [];
  for (const part of parts) {
    const item = part.trim();
    if (item === '') continue;
    out.push(parseScalar(item));
  }
  return out;
}

/** 单行值类型化：引号串 / flow 数组 / 布尔 / null / 数字 / 普通字符串。 */
function parseScalar(raw) {
  const text = raw.trim();
  if (text === '') return null;
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first === '"' && last === '"') return unescapeDouble(text.slice(1, -1));
    if (first === "'" && last === "'") return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text[0] === '[' && text[text.length - 1] === ']' && flowBalanced(text)) return parseFlowArray(text);
  if (/^(?:true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  if (/^(?:null|~)$/i.test(text)) return null;
  // 只认规范数字写法：`0.0.3` 这种两段点号会落到字符串分支，正是版本号想要的行为
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);
  return text;
}

/**
 * 读块标量（`|` / `>`）。返回 { value, next }。
 * header 形如 `>-`、`|`、`>+2`；缩进由显式数字或首个非空行的缩进决定。
 */
function readBlockScalar(lines, start, parentIndent, header) {
  const style = header[0];
  const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
  const digit = /[1-9]/.exec(header);

  const collected = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      collected.push('');
      i += 1;
      continue;
    }
    if (indentOf(line) > parentIndent) {
      collected.push(line);
      i += 1;
      continue;
    }
    break;
  }

  // 尾部空行属于 chomp 语义，不进入正文
  let end = collected.length;
  while (end > 0 && collected[end - 1] === '') end -= 1;
  const content = collected.slice(0, end);

  let base = digit ? parentIndent + Number(digit[0]) : 0;
  if (base === 0) {
    base = Infinity;
    for (const line of content) {
      if (line === '') continue;
      base = Math.min(base, indentOf(line));
    }
    if (base === Infinity) base = parentIndent + 1;
  }
  const dedented = content.map((line) => (line === '' ? '' : line.slice(Math.min(base, indentOf(line)))));

  let text;
  if (style === FOLD) {
    // `>`：连续非空行之间的换行变空格；空行序列变 n 个换行（YAML 折叠语义）
    let out = '';
    let pendingBlank = 0;
    let started = false;
    for (const line of dedented) {
      if (line === '') {
        pendingBlank += 1;
        continue;
      }
      if (!started) {
        out = line;
        started = true;
      } else if (pendingBlank === 0) {
        out += ` ${line}`;
      } else {
        out += `${'\n'.repeat(pendingBlank)}${line}`;
      }
      pendingBlank = 0;
    }
    text = out;
  } else {
    text = dedented.join('\n');
  }

  if (chomp === 'strip') {
    text = text.replace(/\n+$/, '');
  } else if (text !== '' && !text.endsWith('\n')) {
    // clip（含降级处理的 keep）：保留单个结尾换行
    text += '\n';
  }

  return { value: text, next: i };
}

/** 读块数组（每行一个 `- 值`）。返回 { value, next }。 */
function readBlockSequence(lines, start, indent) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    const content = line.slice(lineIndent);
    if (lineIndent > indent) {
      // 序列项的更深缩进（嵌套 map 等）不支持：跳过而不污染上一个元素
      i += 1;
      continue;
    }
    if (content !== '-' && !content.startsWith('- ')) break;
    const rest = content === '-' ? '' : stripTrailingComment(content.slice(2).trim());
    items.push(rest === '' ? null : parseScalar(rest));
    i += 1;
  }
  return { value: items, next: i };
}

/** 解析同一缩进层的一组 key: value，返回 { map, next }。 */
function parseBlock(lines, start, indent) {
  const map = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      // 不属于任何已知 key 的更深缩进行：跳过，保持后续解析不受影响
      i += 1;
      continue;
    }
    const content = line.slice(lineIndent);
    if (content.startsWith('#')) {
      i += 1;
      continue;
    }
    const split = splitKeyValue(content);
    if (split === null) {
      i += 1;
      continue;
    }
    const { key, value } = split;

    if (value === '') {
      // 空值：往下看是块数组、嵌套 map，还是真的空
      const child = nextNonBlank(lines, i + 1);
      const childIndent = child === -1 ? -1 : indentOf(lines[child]);
      const childContent = child === -1 ? '' : lines[child].slice(childIndent);
      const childIsSeq = child !== -1 && (childContent === '-' || childContent.startsWith('- '));
      if (child !== -1 && childIndent > indent) {
        if (childIsSeq) {
          const read = readBlockSequence(lines, child, childIndent);
          map[key] = read.value;
          i = read.next;
        } else {
          const read = parseBlock(lines, child, childIndent);
          map[key] = read.map;
          i = read.next;
        }
        continue;
      }
      // YAML 允许块数组与父键同缩进
      if (child !== -1 && childIndent === indent && childIsSeq) {
        const read = readBlockSequence(lines, child, indent);
        map[key] = read.value;
        i = read.next;
        continue;
      }
      map[key] = {};
      i += 1;
      continue;
    }

    const header = value.split(/\s+/)[0];
    if (/^[|>][+-]?[0-9]?[+-]?$/.test(header)) {
      const read = readBlockScalar(lines, i + 1, indent, header);
      map[key] = read.value;
      i = read.next;
      continue;
    }

    if (value[0] === '[' && !flowBalanced(value)) {
      // 跨行 flow 数组：续行拼到配平为止；配平失败则退回普通标量
      let merged = value;
      let probe = i + 1;
      while (!flowBalanced(merged) && probe < lines.length) {
        merged += ` ${lines[probe].trim()}`;
        probe += 1;
      }
      if (flowBalanced(merged)) {
        map[key] = parseFlowArray(merged);
        i = probe;
        continue;
      }
    }

    map[key] = parseScalar(stripTrailingComment(value));
    i += 1;
  }
  return { map, next: i };
}

/** 输入统一成字符串；非字符串一律当空文本，避免上层传错类型就崩。 */
function coerceText(input) {
  if (typeof input === 'string') return input;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return input.toString('utf8');
  return '';
}

/**
 * 解析 SKILL.md 文本的 YAML frontmatter。
 *
 * @param {string} text 文件全文
 * @returns {{ frontmatter: Record<string, unknown>, body: string, hasFrontmatter: boolean }}
 *   - `frontmatter`：解析出的顶层键值；键名大小写与连字符原样保留
 *   - `body`：`---` 结束行之后的内容（行尾统一为 `\n`）；失败时为原始输入
 *   - `hasFrontmatter`：只有「开头 `---` + 找到结束 `---`」才算 true
 * 永不抛异常：无 frontmatter、只有开头没有结尾、空文件、非字符串输入都降级返回。
 */
export function parseFrontmatter(text) {
  const original = coerceText(text);
  if (original === '') return { frontmatter: {}, body: original, hasFrontmatter: false };

  let normalized = original.replace(/\r\n?/g, '\n');
  if (normalized.charCodeAt(0) === 0xfeff) normalized = normalized.slice(1);

  const lines = normalized.split('\n');
  let open = 0;
  while (open < lines.length && isBlank(lines[open])) open += 1;
  if (open >= lines.length || lines[open].trim() !== '---') {
    return { frontmatter: {}, body: original, hasFrontmatter: false };
  }

  let close = -1;
  for (let i = open + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) return { frontmatter: {}, body: original, hasFrontmatter: false };

  const inner = lines.slice(open + 1, close);
  const body = lines.slice(close + 1).join('\n');
  let frontmatter = {};
  try {
    frontmatter = parseBlock(inner, 0, 0).map;
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body, hasFrontmatter: true };
}

/** 标量转文本：非空字符串与有限数字可用，其余 null。 */
function asText(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** 标量转**单行**文本：折叠块拼好后仍可能含换行（`|` 字面块），统一压成空格。 */
function asSingleLine(value) {
  const text = asText(value);
  if (text === null) return null;
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? null : collapsed;
}

/** 标量转布尔：兼容引号包起来的 "true" / "false"。无法判定返回 null。 */
function asBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === 'yes' || text === 'on') return true;
    if (text === 'false' || text === 'no' || text === 'off') return false;
  }
  return null;
}

/** 标量/数组转去重字符串数组，元素值不改写。 */
function asStringList(value) {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const text = asText(item);
      if (text !== null && !out.includes(text)) out.push(text);
    }
    return out;
  }
  if (typeof value === 'string') {
    const out = [];
    for (const part of value.split(',')) {
      const text = part.trim();
      if (text !== '' && !out.includes(text)) out.push(text);
    }
    return out;
  }
  const single = asText(value);
  return single === null ? [] : [single];
}

/** 只接受普通对象，数组 / null / 标量一律退回空对象。 */
function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 从 parseFrontmatter 的结果里抽取标准化技能元数据。
 *
 * @param {object} frontmatter parseFrontmatter 返回的 frontmatter（或任何对象）
 * @returns {{
 *   name: string|null,
 *   displayName: string|null,
 *   description: string|null,
 *   descriptionZh: string|null,
 *   version: string|null,
 *   tags: string[],
 *   userInvocable: boolean|null,
 *   modelInvocable: boolean|null,
 *   environments: string[],
 *   visibility: string|null,
 *   raw: object
 * }}
 *
 * 约定：
 * - `description` 一定是**单行**（折叠块已由解析器合并，字面块的换行在这里压成空格）
 * - `version` 顶层优先，其次 `metadata.version`；数字统一转字符串（`0.0.3` 无引号也保持原文）
 * - `modelInvocable` 是 `disable-model-invocation` 的取反；键不存在时是 null 而非 true
 * - `environments` 合并 `environments` 与 `disabled-environments` 的值并去重、不改写原文；
 *   需要区分两者时读 `raw['disabled-environments']`
 * - `raw` 保留原始解析结果，未识别的键（changelog、display_name_en 等）从这里取
 */
export function pickSkillMeta(frontmatter) {
  const fm = asRecord(frontmatter);
  const metadata = asRecord(fm.metadata);
  const name = asText(fm.name);
  const displayInvocable = asBool(fm['disable-model-invocation']);
  const environments = asStringList(fm.environments);
  for (const env of asStringList(fm['disabled-environments'])) {
    if (!environments.includes(env)) environments.push(env);
  }

  return {
    name,
    displayName: asText(fm.display_name) ?? name,
    description: asSingleLine(fm.description),
    descriptionZh: asSingleLine(fm.description_zh),
    version: asText(fm.version) ?? asText(metadata.version),
    tags: asStringList(fm.tags),
    userInvocable: asBool(fm['user-invocable']),
    modelInvocable: displayInvocable === null ? null : !displayInvocable,
    environments,
    visibility: asText(fm.visibility),
    raw: fm,
  };
}
