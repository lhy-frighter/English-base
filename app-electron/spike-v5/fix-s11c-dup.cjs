const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
const dup = `  const openShadowReview = () => { setShadowReviewNonce((n) => n + 1); setTab("shadow"); };
  const refreshToday = useCallback(() => { void api.todayBrief().then(setToday).catch(() => {}); }, []);
`;
const one = `  const openShadowReview = () => { setShadowReviewNonce((n) => n + 1); setTab("shadow"); };
`;
if (!s.includes(dup)) { console.error("dup block missing"); process.exit(1); }
s = s.replace(dup, one);
fs.writeFileSync(fp, s, "utf8");
console.log("dup removed");
