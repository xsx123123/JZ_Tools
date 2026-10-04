// 应用入口：样式在 ./styles.css（Tailwind v4 + design token），路由见 ./router.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initRevealEngine } from "./lib/reveal-engine";
import "./styles.css";

const router = getRouter();

// 全局滚动渐入引擎：业务组件用 reveal / data-reveal 类即可，需早于首帧渲染启动
initRevealEngine();

function reportFatalReactError(
  error: unknown,
  errorInfo: { componentStack?: string },
) {
  window.__MUSE_PREVIEW_ERROR_CAPTURE__?.reportError(error, {
    kind: "react-error-boundary",
    severity: "fatal",
  });
  console.error(error, errorInfo.componentStack);
}

ReactDOM.createRoot(document.getElementById("root")!, {
  onCaughtError: reportFatalReactError,
  onUncaughtError: reportFatalReactError,
}).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
