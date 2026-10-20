import * as React from "react";

/**
 * 软键盘适配：把 visualViewport 的可视高度写入 CSS 变量 --vvh。
 *
 * 为什么需要：iOS / Android 弹出软键盘时，`dvh` / `vh` 不会收缩，底部输入框会被键盘压住。
 * `visualViewport.height` 则如实反映被键盘压缩后的可视区高度，据此设容器高度即可保证
 * 输入框始终可见（配合 index.html 的 interactive-widget=resizes-content 覆盖 Android Chrome）。
 *
 * 用法：在应用根调用一次，容器高度写 `var(--vvh, 100dvh)`——变量未设置时自动回退，
 * 不支持 visualViewport 的旧浏览器不受影响。
 */
export function useVisualViewport(): void {
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // 旧浏览器：不设变量，容器继续用 100dvh

    const root = document.documentElement;
    let raf = 0;

    const apply = () => {
      raf = 0;
      // 只写高度；宽度交给 CSS。高度为 0 的瞬态（切后台等）跳过，避免容器塌陷
      if (vv.height > 0) root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    };

    // resize / scroll 在 iOS 上会高频触发（键盘动画、地址栏收缩），用 rAF 合并
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      root.style.removeProperty("--vvh");
    };
  }, []);
}
