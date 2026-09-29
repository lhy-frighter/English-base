import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./styles.css";
import "./theme.css"; // DESIGN.md v2 分区混合主题层

// V8-1 spike 钩子：index.html?spike=v8 时运行 WebLLM 真机测试（开发/测试用）
const params = new URLSearchParams(location.search);
if (params.get("spike") === "v8") {
  import("./spike-v8/run-spike")
    .then((m) => m.run())
    .catch((e) => console.log("V8SPIKE FATAL " + (e?.message || String(e))));
} else if (params.get("offline") === "v8") {
  import("./spike-v8/offline-smoke");
} else if (params.get("lease") === "v8") {
  import("./spike-v8/lease-smoke");
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    // 外层兜底：11 个 tab 的 JSX 大多内联在 App 自己的 render 里，抛错者就是 App 本身，
    // 放在 App 内部的边界接不到——没有这一层就是整应用白屏，连侧栏和"重启应用"按钮都不剩
    <ErrorBoundary resetKey="app" bare>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </ErrorBoundary>
  );
}
