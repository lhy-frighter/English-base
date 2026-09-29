const { Core } = require("../core.cjs");
const core = new Core(require("path").join(__dirname, ".."));
for (const range of [7, 30, 90]) {
  const ins = core.insights(range);
  const active = ins.days.filter((d) => {
    const s = d.minutes.read + d.minutes.shadow + d.minutes.review + d.minutes.exam;
    return s > 0;
  });
  console.log(`range=${range} days=${ins.days.length} active=${active.length}`,
    active.map((d) => `${d.key}:${d.minutes.read + d.minutes.shadow + d.minutes.review + d.minutes.exam}m`).slice(0, 6));
}
// 热力图列数核验（复刻 Heatmap 算法）
function checkCols(range) {
  const today = new Date(); today.setHours(0,0,0,0);
  const rs = new Date(today); rs.setDate(rs.getDate() - (range - 1));
  rs.setDate(rs.getDate() - ((rs.getDay() + 6) % 7));
  let weeks = 0; const c = new Date(rs);
  while (c.getTime() <= today.getTime()) {
    weeks++;
    c.setDate(c.getDate() + 7);
  }
  const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  console.log(`range=${range} weeks=${weeks} todayCell=${keyOf(today)} startCell=${keyOf(rs)}`);
}
checkCols(7); checkCols(30); checkCols(90);
core.user.close();
