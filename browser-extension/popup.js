// popup.js — 抽取当前页正文（页面内 DOM 算法，与 app-electron/url-extract.cjs 同策略）→ 发送/复制/下载
const ENDPOINT = "http://127.0.0.1:47823/ingest";
const st = (msg, cls) => { const el = document.getElementById("st"); el.textContent = msg; el.className = cls || ""; };

// 在目标页上下文执行：必须是自包含函数（不能引用 popup 变量）
function pageExtract() {
  const DROP = "script,style,noscript,template,svg,iframe,nav,header,footer,aside,form,[aria-hidden='true'],[role=navigation]";
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(DROP).forEach((n) => n.remove());
  const scope = clone.querySelector("article") || clone.querySelector("main") || clone;
  const isHead = (t) => /^H[23]$/.test(t);
  let paras = [...scope.querySelectorAll("p,h2,h3,li,blockquote")].map((b) => {
    const t = (b.textContent || "").replace(/\s+/g, " ").trim();
    return { t, head: isHead(b.tagName) };
  }).filter((x) => x.t && (x.head ? x.t.length >= 3 : x.t.length >= 40)).map((x) => x.t);
  if (paras.join("\n\n").length < 300) {
    // 回退：块级分行
    const lines = scope.textContent.split(/\n|(?<=。)|<\/div>/g).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 25);
    paras = lines;
  }
  const og = document.querySelector("meta[property='og:title']")?.getAttribute("content");
  const title = (og || document.title || "").split(/\s*[|\-–—_·»]\s*/)[0].trim();
  return { title, text: paras.join("\n\n").trim(), url: location.href, paras: paras.length };
}

async function getArticle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("找不到当前标签页");
  if (!/^https?:/i.test(tab.url || "")) throw new Error("此页面不支持（浏览器内置页/扩展页无法抽取）");
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageExtract });
  if (!result || result.text.length < 100) throw new Error("正文抽取过短，请改用手动复制粘贴");
  return result;
}

document.getElementById("send").addEventListener("click", async () => {
  st("正在抽取并发送…");
  try {
    const a = await getArticle();
    const res = await fetch(ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: a.title, text: a.text, url: a.url }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || ("HTTP " + res.status));
    st(`已发送：${a.title}\n${a.paras} 段 / ${a.text.length} 字符，回桌面应用书库查看。`, "ok");
  } catch (e) {
    st("发送失败：" + (e.message || e) + "\n请确认桌面应用正在运行；也可先用复制/下载兜底。", "bad");
  }
});

document.getElementById("copy").addEventListener("click", async () => {
  try {
    const a = await getArticle();
    await navigator.clipboard.writeText(`# ${a.title}\n\n${a.text}\n`);
    st("正文已复制（Markdown），可粘贴进底座「粘贴新文章」。", "ok");
  } catch (e) { st("复制失败：" + (e.message || e), "bad"); }
});

document.getElementById("download").addEventListener("click", async () => {
  try {
    const a = await getArticle();
    const blob = new Blob([`# ${a.title}\n\n${a.text}\n`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const aTag = document.createElement("a");
    aTag.href = url; aTag.download = (a.title || "article").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) + ".md";
    aTag.click();
    URL.revokeObjectURL(url);
    st("已下载 .md，可拖入底座书库导入。", "ok");
  } catch (e) { st("下载失败：" + (e.message || e), "bad"); }
});
