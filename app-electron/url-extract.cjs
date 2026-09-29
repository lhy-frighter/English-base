// url-extract.cjs — 网页 HTML → 可读正文（纯 JS，无第三方依赖；供 URL 导入与浏览器扩展共用算法）
// 策略：去脚本/导航噪声 → article/main 优先取容器 → 按段落密度抽取 → 不足时块级回退
const { decodeEntities, MAX_CHARS } = require("./import-tools.cjs");
const MAX_HTML = 5 * 1024 * 1024;

const DROP_BLOCKS = /<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

function stripInline(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/[ \t\f\v]+/g, " ").trim();
}

function cleanTitle(t) {
  return decodeEntities(String(t || "")).replace(/\s+/g, " ").trim()
    .split(/\s*[|–—_·»]\s*/)[0].trim(); // 注意：不按 ASCII 连字符切，避免切断 Pan-American 这类标题
}

function pickTitle(html) {
  let m;
  const og = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of og) if ((m = html.match(re))) return cleanTitle(m[1]);
  if ((m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i))) { const t = stripInline(m[1]); if (t) return t; }
  if ((m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i))) {
    const t = cleanTitle(m[1]);
    if (t) return t;
  }
  return "";
}

// 图片/图表来源说明行（媒体站常见噪声）：短行内出现署名关键词即判为图注
const CAPTION_RE = /courtesy|getty images|afp\/getty|shutterstock|alamy|all images?|images? from|photo(?:graph)?s? (?:by|credit)|^credit:|^source:/i;
function isCaption(t) { return t.length < 240 && CAPTION_RE.test(t); }

// 相关推荐卡片网格：新闻站长文末尾的"你可能还喜欢"卡片区，命中即截断其后内容
const CARD_GRID_RE = /<(?:div|li|article|section)\b[^>]*class=["'][^"']*(?:group\/card|related[-_ ]?card|story[-_ ]?card|article[-_ ]?card|post[-_ ]?card|teaser[-_ ]|card[-_ ]?(?:list|grid|row)|more[-_ ]?from|you[-_ ]?might|recommended[-_ ]?stories)[^"']*["'][^>]*>/i;
function cutCardGrid(scope) {
  const m = scope.match(CARD_GRID_RE);
  if (m && m.index > 3000) return scope.slice(0, m.index); // 正文不足 3000 字符时不切，防误杀
  return scope;
}

// 剔除尾部"相关推荐"式短标题行：连续短于 120 字且不以句末标点收尾的尾块
function trimTrailingTails(paras) {
  const out = paras.slice();
  while (out.length && out[out.length - 1].length < 220 && !/[.!?]["')”’]?$/.test(out[out.length - 1])) out.pop();
  return out;
}

// 在给定 HTML 片段内按顺序收集 p/h2/h3/li/blockquote 文本
function harvestBlocks(scope) {
  const out = [];
  const re = /<(p|h2|h3|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let m;
  while ((m = re.exec(scope))) {
    const tag = m[1].toLowerCase();
    const t = stripInline(m[2]);
    if (!t || isCaption(t)) continue;
    if (tag === "p" || tag === "blockquote") { if (t.length >= 40) out.push(t); }
    else if (tag === "li") { if (t.length >= 40) out.push(t); }
    else if (t.length >= 3) out.push(t); // 小标题
  }
  return out;
}

// 回退：块级边界转换行后按行过滤
function fallbackLines(scope) {
  const txt = scope
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|section|article|td|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(txt)
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .filter((l) => l.length >= 25);
}

function bestScope(html) {
  const arts = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map((m) => m[1]);
  if (arts.length) return arts.sort((a, b) => b.length - a.length)[0];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  if (main) return main[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return body ? body[1] : html;
}

function extractReadable(rawHtml, url) {
  let html = String(rawHtml || "").slice(0, MAX_HTML);
  html = html.replace(COMMENTS, "").replace(DROP_BLOCKS, "");
  const title = pickTitle(html) || (url ? safeHost(url) : "网页导入");
  const scope = cutCardGrid(bestScope(html));

  let paras = trimTrailingTails(harvestBlocks(scope));
  if (paras.join("\n\n").length < 300) {
    // 回退 1：容器内块级分行
    let lines = fallbackLines(scope);
    if (lines.join("\n\n").length < 300) {
      // 回退 2：整个清洗后页面
      lines = fallbackLines(html);
    }
    // 合并过短的相邻行（标题粘连），保留段落感
    paras = mergeShort(lines);
  }
  paras = trimTrailingTails(paras).filter((p) => !isCaption(p));
  let text = paras.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  return { title, text, truncated, paragraphs: paras.length, chars: text.length };
}

function mergeShort(lines) {
  const out = [];
  for (const l of lines) {
    const i = out.length - 1;
    const prev = out[i];
    // 仅当上一行本身是断行（未以句末标点收尾）才粘连，避免把独立小标题并进来
    if (prev && l.length < 60 && prev.length < 200 && !/[.!?]["')”’]?$/.test(prev)) out[i] = prev + " " + l;
    else out.push(l);
  }
  return out;
}

function safeHost(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "网页导入"; }
}

module.exports = { extractReadable, pickTitle, harvestBlocks, MAX_HTML };
