// test/url.cjs — URL 正文抽取器回归
const { extractReadable } = require("../url-extract.cjs");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra ?? ""); }
}

// 1. 典型新闻页：导航噪声 + article 正文
const ART = `<!doctype html><html><head>
<meta property="og:title" content="The Quiet Comeback of Urban Rail">
<title>The Quiet Comeback of Urban Rail - Example News</title>
</head><body>
<header><nav>Home World Tech Login Subscribe</nav></header>
<div class="ad">Advertisement</div>
<article>
<h1>The Quiet Comeback of Urban Rail</h1>
<p>After two decades in which cities across the world poured money into new highways, a quiet reversal is underway. Transit agencies report that light-rail and tram lines are being planned or extended in more than forty metropolitan areas, many of them in regions that had all but abandoned fixed-guideway transport.</p>
<p>The reasons are partly economic. Operating a bus fleet through congested streets grows more expensive every year, while a dedicated rail lane carries predictable volumes at a marginal cost that falls as ridership rises. Planners also point to demand from employers, who increasingly locate offices near stations that promise reliable commute times.</p>
<p>Sceptics remain. Critics note that construction bills have a habit of tripling before the first train runs, and that cheaper bus rapid transit can deliver most of the speed advantage on a fraction of the budget. Whether the comeback endures may depend less on romance with rails than on cities' ability to build without the cost overruns that killed an earlier generation of projects.</p>
</article>
<footer>Copyright 2026 · About · Privacy</footer>
</body></html>`;
const r1 = extractReadable(ART, "https://example.com/news/rail");
check("og:title 优先且去站点后缀", r1.title === "The Quiet Comeback of Urban Rail", r1.title);
check("三个正文段全部抽出", r1.paragraphs === 3, String(r1.paragraphs));
check("导航/页脚噪声被剔除", !/Subscribe|Copyright|Advertisement/.test(r1.text));
check("正文包含关键句", r1.text.includes("forty metropolitan areas"));

// 2. 实体解码与空白归一
const ENT = `<html><body><article><p>Cities &amp; regions spend&nbsp;billions&mdash;about &#36;40 per resident&mdash;on tracks that   run    through dense corridors of the metropolitan core every single year without interruption.</p></article></body></html>`;
const r2 = extractReadable(ENT);
check("实体解码", r2.text.includes("&") && r2.text.includes("40") && r2.text.includes("—") && !/&[a-z#0-9]+;/.test(r2.text), r2.text.slice(0, 80));
check("多空白归一", !/  /.test(r2.text));

// 3. 无 p 标签的 div 排版 → 块级回退
const DIV = `<html><body><header>menu short</header><main>
<div class="post">
<div>Researchers have long suspected that morning light calibrates the internal clock, but only recent wearable data showed how strong the effect really is across thousands of ordinary people living ordinary lives in different latitudes.</div>
<div>Exposure within an hour of waking shifted sleep schedules earlier by roughly an hour in the cohort, an effect comparable to a moderate dose of melatonin but without any of the side effects that sometimes accompany supplementation.</div>
</div></main></body></html>`;
const r3 = extractReadable(DIV);
check("div 排版回退抽出两段长文", r3.chars > 200 && r3.text.includes("wearable data") && r3.text.includes("melatonin"), String(r3.chars));
check("回退剔除短菜单行", !r3.text.includes("menu short"));

// 4. 短 p（导航/按钮）被丢弃
const SHORT = `<article><p>Login</p><p>Share</p><p>A genuinely long paragraph needs enough words to clear the forty-character threshold used by the extractor when deciding whether a paragraph is real article content or interface chrome that should be discarded.</p></article>`;
const r4 = extractReadable(SHORT);
check("短段落被过滤只留正文", !/Login|Share/.test(r4.text) && r4.text.includes("threshold"), r4.text.slice(0, 60));

// 5. 无 og/h1 时 title 标签去后缀
const T = `<html><head><title>Deep Currents | Ocean Magazine</title></head><body><article><p>Oceanographers deploying a new generation of drifting sensors have found that the deepest currents in the Pacific respond to surface winds far faster than classical models predicted, forcing a revision of estimates of how quickly the ocean stores heat.</p></article></body></html>`;
const r5 = extractReadable(T);
check("title 去站点后缀", r5.title === "Deep Currents", r5.title);

// 6. 空输入不崩
const r6 = extractReadable("", "https://x.test/a");
check("空输入安全降级", r6.chars === 0 && r6.title === "x.test");

// 7. og:title 也去站点后缀
const OG = `<html><head><meta property="og:title" content="Real Story Title | Aeon Essays"></head><body><article><p>A sufficiently long opening paragraph that clears the threshold for real content and establishes that this page does in fact carry an article body worth extracting for study purposes.</p></article></body></html>`;
check("og:title 去后缀", extractReadable(OG).title === "Real Story Title", extractReadable(OG).title);

// 8. 图片说明行被剔除
const CAP = `<article><p>Photo by Oliver Contreras/AFP/Getty Images, a mass snowball fight scene in winter</p><p>The main argument of the essay begins here with a properly long paragraph that contains actual analysis rather than merely crediting the photographer who shot the picture above it.</p></article>`;
const r8 = extractReadable(CAP);
check("图片来源说明被剔除", !/Getty|Photo by/.test(r8.text) && r8.text.includes("main argument"), r8.text.slice(0, 80));

// 9. 尾部相关推荐短标题被裁剪
const TAIL = `<article>
<p>The concluding paragraph of the real article is long enough to look like genuine prose and ends with a proper sentence terminator right here.</p>
<h3>But life is about more than material benefits</h3>
<h3>Why the highway only half exists</h3>
</article>`;
const r9 = extractReadable(TAIL);
check("尾部推荐短标题被裁剪", !/material benefits|highway only half/.test(r9.text) && r9.text.includes("concluding paragraph"), r9.text.slice(-160));

// 10. 相关推荐卡片网格在 3000 字后整体截断
const GRID = `<article><p>${"Long body paragraph about the actual argument of the article, repeated enough times to push past the safety threshold so that the truncation rule knows this is a real article body rather than a tiny stub page. ".repeat(20)}</p>
<div class="group/card relative cursor-pointer"><p class="title">An unrelated recommended story title</p><p class="dek">A description of the other story that must not appear in extracted text.</p></div></article>`;
const r10 = extractReadable(GRID);
check("卡片网格推荐区被截断", !/unrelated recommended|other story/.test(r10.text) && r10.text.includes("actual argument"));

// 11. courtesy 类图注剔除
const C2 = `<article><p>All images from the Codex Manesse (1300-40) and courtesy Heidelberg University Library</p><p>A genuine body paragraph long enough to survive the minimum length filter, discussing the historical treatment of mental distress in medieval European households and infirmaries.</p></article>`;
check("courtesy 图注剔除", !/Codex Manesse|courtesy/i.test(extractReadable(C2).text));

// 12. 标题含 ASCII 连字符不被误切
const HY = `<html><head><title>Why the Pan-American Highway Only Half Exists | Aeon</title></head><body><article><p>A long enough opening paragraph to clear the extraction threshold and establish the article body exists for real this time around.</p></article></body></html>`;
check("连字符标题不误切", extractReadable(HY).title === "Why the Pan-American Highway Only Half Exists", extractReadable(HY).title);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
