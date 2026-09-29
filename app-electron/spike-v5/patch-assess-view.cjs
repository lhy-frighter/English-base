const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
let n = 0;

// 1) 今日页在测评视图打开时隐藏
{
  const anchor = `        {/* ============ 今日：唯一下一步 ============ */}
        {tab === "today" && (`;
  if (!s.includes(anchor)) throw new Error("today anchor missing");
  if (!s.includes('{tab === "today" && !assessView && (')) {
    s = s.replace(anchor, `        {/* ============ 今日：唯一下一步 ============ */}
        {tab === "today" && !assessView && (`);
    n++;
  }
}

// 2) 仪表盘在测评视图打开时隐藏
{
  const anchor = `        {tab === "dash" && <DashPage onAssess={() => setAssessView(true)} />}`;
  if (!s.includes(anchor)) throw new Error("dash anchor missing");
  s = s.replace(anchor, `        {tab === "dash" && !assessView && <DashPage onAssess={() => setAssessView(true)} />}`);
  n++;
}

// 3) 打开测评时把滚动容器拉回顶部（否则页面在下方渲染，看起来“点了没反应”）
{
  const anchor = `  const [assessView, setAssessView] = useState(false);`;
  if (!s.includes(anchor)) throw new Error("state anchor missing");
  if (!s.includes("assessView) { document.querySelector")) {
    s = s.replace(anchor, anchor + `
  useEffect(() => {
    if (assessView) document.querySelector<HTMLElement>(".main")?.scrollTo({ top: 0 });
  }, [assessView]);`);
    n++;
  }
}

fs.writeFileSync(fp, s, "utf8");
console.log("assess view fixed, edits:", n);
