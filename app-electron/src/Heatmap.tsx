import { type InsightDay } from "./api";

// S10-2 改造：ChatGPT/GitHub 贡献图式学习热力图
// 颜色明暗 = 当天四类主活动总分钟数；点击某天 → 下钻当天完整报告
const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function keyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function levelOf(min: number): number {
  if (min <= 0) return 0;
  if (min < 15) return 1;
  if (min < 30) return 2;
  if (min < 60) return 3;
  return 4;
}

export function Heatmap({
  days, range, selDay, onPick,
}: {
  days: InsightDay[];
  range: number;
  selDay: string | null;
  onPick: (key: string) => void;
}) {
  const byKey = new Map(days.map((d) => [d.key, d]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - (range - 1));
  // 回退到本周一（周一为一周起点）
  const back = (rangeStart.getDay() + 6) % 7;
  rangeStart.setDate(rangeStart.getDate() - back);

  // 按周切列
  const weeks: Date[][] = [];
  const cursor = new Date(rangeStart);
  while (cursor.getTime() <= today.getTime()) {
    const col: Date[] = [];
    for (let i = 0; i < 7; i++) {
      col.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(col);
  }

  // 月份标签：该列第一天与上一列第一天不同月时显示
  const monthAt: (string | null)[] = weeks.map((col, i) => {
    const d = col[0];
    if (i === 0) return MONTH_LABELS[d.getMonth()];
    const prev = weeks[i - 1][0];
    return d.getMonth() !== prev.getMonth() ? MONTH_LABELS[d.getMonth()] : null;
  });

  const tip = (d: InsightDay | undefined, date: Date): string => {
    const k = keyOf(date);
    if (!d) return `${k}：无学习记录`;
    const sum = d.minutes.read + d.minutes.shadow + d.minutes.review + d.minutes.exam;
    return `${k}${d.valid ? "（有效学习日）" : ""}｜共 ${sum} 分钟：精读 ${d.minutes.read} · 复习 ${d.minutes.review} · 跟读 ${d.minutes.shadow} · 考试 ${d.minutes.exam}｜查词 ${d.counts.lookup} · 成卡 ${d.counts.note} · 翻译 ${d.counts.translation}`;
  };

  return (
    <div className="hm-wrap">
      <div className="hm-scroll">
        <div className="hm-grid">
          <div className="hm-dow">
            {DAY_LABELS.map((w, i) => (
              <span key={w} className="hm-dow-cell">{i % 2 === 0 ? w : ""}</span>
            ))}
          </div>
          <div className="hm-body">
            <div className="hm-months">
              {monthAt.map((m, i) => (
                <span key={i} className="hm-month-cell">{m ?? ""}</span>
              ))}
            </div>
            <div className="hm-cols">
              {weeks.map((col, ci) => (
                <div key={ci} className="hm-col">
                  {col.map((date) => {
                    const k = keyOf(date);
                    const future = date.getTime() > today.getTime();
                    if (future) return <span key={k} className="hm-cell hm-future" />;
                    const d = byKey.get(k);
                    const sum = d ? d.minutes.read + d.minutes.shadow + d.minutes.review + d.minutes.exam : 0;
                    const lv = levelOf(sum);
                    return (
                      <button
                        key={k}
                        className={"hm-cell hm-l" + lv + (selDay === k ? " hm-sel" : "") + (d?.valid ? " hm-valid" : "")}
                        title={tip(d, date)}
                        onClick={() => onPick(k)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="hm-legend">
        <span className="muted">少</span>
        {[0, 1, 2, 3, 4].map((lv) => <span key={lv} className={"hm-cell hm-l" + lv} />)}
        <span className="muted">多</span>
        <span className="muted hm-legend-note">明暗按当天学习总分钟（15/30/60 分钟分档）· 点击格子看当天报告</span>
      </div>
    </div>
  );
}
