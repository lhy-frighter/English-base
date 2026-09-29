const fs = require("fs");
const fp = "src/DashPage.tsx";
let s = fs.readFileSync(fp, "utf8");
let n = 0;

if (!s.includes(`import { Heatmap } from "./Heatmap"`)) {
  const anchor = `import { api, type Insights, type DayTimeline, type Dashboard } from "./api";`;
  if (!s.includes(anchor)) throw new Error("import anchor missing");
  s = s.replace(anchor, anchor + `
import { Heatmap } from "./Heatmap";`);
  n++;
}

// 替换整张柱状图卡片为热力图卡片
const startMark = `          <div className="dcard wide">
            <div className="d2-legend">`;
const endMark = `            </div>
          </div>

          <div className="d2-actions">`;
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 < i0) throw new Error("chart card anchors missing");
const newCard = `          <div className="dcard wide">
            <Heatmap days={days} range={range} selDay={selDay}
              onPick={(k) => setSelDay(selDay === k ? null : k)} />
          </div>

          <div className="d2-actions">`;
s = s.slice(0, i0) + newCard + s.slice(i1 + endMark.length);
n++;

fs.writeFileSync(fp, s, "utf8");
console.log("DashPage heatmap swapped, edits:", n);
