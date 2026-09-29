import React from "react";

interface Props {
  resetKey: string;
  /** 外层（.main 之外）渲染时没有布局留白，需要自带 padding */
  bare?: boolean;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

// 任一 tab 渲染抛错会让整棵 React 树卸载——用户看到的是整个应用白屏且无法自救。
// 边界按 resetKey（当前 tab）复位：切到别的 tab 就能继续用，坏的那个 tab 单独降级。
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 走 console.error，主进程的 console-message 钩子（冒烟/截图）能把它捞出来
    console.error("PAGEERROR " + (error?.stack || error?.message || String(error)) + "\n" + info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={this.props.bare ? "page error-page bare" : "page error-page"}>
        <h2>这个页面出错了</h2>
        <p className="muted">
          你的学习数据没有受到影响。切到左侧其他页面即可继续使用；本页重试看看是否只是一次性的读取失败。
        </p>
        <p className="err">{String(error.message || error)}</p>
        <div className="row">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>重试本页</button>
          <button onClick={() => location.reload()}>重启应用</button>
        </div>
      </div>
    );
  }
}
