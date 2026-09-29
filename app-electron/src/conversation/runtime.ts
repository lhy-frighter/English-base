// 引擎单例：页面切换/重挂载时复用会话级常驻引擎（V8-3 再接入推理租约协调）。
import { LocalConversationEngine, DEFAULT_LOCAL_MODEL } from "./local-engine";
import { CloudConversationEngine } from "./cloud-engine";

export const localEngine = new LocalConversationEngine();
export const cloudEngine = new CloudConversationEngine();
export const CURRENT_MODEL = DEFAULT_LOCAL_MODEL;
