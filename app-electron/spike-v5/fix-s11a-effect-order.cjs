// S11-a：把回语境 effect 移到 scrollToPara 声明之后（TS2448）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
const startMark = "  // 文章渲染后回语境：优先定位例句所在段";
const endMark = "  }, [jumpCtx, tab, ann, scrollToPara]);";
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 < i0) throw new Error("effect 定位失败");
const block = s.slice(i0, i1 + endMark.length) + "\n\n";
s = s.slice(0, i0) + s.slice(i1 + endMark.length);
// 插到 scrollToPara useCallback 之后
const anchor = `    } else {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, []);`;
if (!s.includes(anchor)) throw new Error("scrollToPara 锚点缺失");
s = s.replace(anchor, anchor + "\n\n" + block.trimEnd());
fs.writeFileSync(fp, s, "utf8");
console.log("moved");
