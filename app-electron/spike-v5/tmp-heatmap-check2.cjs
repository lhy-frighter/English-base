const { Core } = require("../core.cjs");
const path = require("node:path");
const dataDir = path.join(__dirname, "..", "data");
const core = new Core(dataDir);
for (const range of [7, 30, 90]) {
  const ins = core.insights(range);
  const active = ins.days.filter((d) => {
    const s = d.minutes.read + d.minutes.shadow + d.minutes.review + d.minutes.exam;
    return s > 0;
  });
  console.log(`range=${range} days=${ins.days.length} active=${active.length} streak=${ins.streak.current}/${ins.streak.longest}`);
  active.forEach((d) => console.log("   ", d.key, d.minutes, "valid=" + d.valid,
    "counts:", d.counts, "readWords=" + d.readWords));
}
core.user.close();
