// Diagnostic 4: worker protocol lifecycle (translate -> reinit -> translate) with logging.
const path = require("path");
const { Worker } = require("worker_threads");
const ROOT = __dirname;
const w = new Worker(path.join(ROOT, "bergamot-worker.cjs"));
let step = 0;
w.on("message", (m) => {
  console.log("[main] msg:", m.type, m.type === "result" ? `${m.id} ${m.ms}ms` : "");
  (async () => {
    if (m.type === "ready") {
      w.postMessage({ type: "translate", id: "t1", texts: ["First translation before reinit."] });
    } else if (m.type === "result" && m.id === "t1") {
      console.log("t1 zh:", m.zh[0]);
      w.postMessage({ type: "reinit" });
    } else if (m.type === "reinited") {
      w.postMessage({ type: "translate", id: "t2", texts: ["Second translation after reinit."] });
    } else if (m.type === "result" && m.id === "t2") {
      console.log("t2 zh:", m.zh[0]);
      console.log("LIFECYCLE OK");
      await w.terminate();
      process.exit(0);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
});
w.on("error", (e) => { console.error("worker error:", e); process.exit(1); });
setTimeout(() => { console.error("TIMEOUT"); process.exit(2); }, 60000);
