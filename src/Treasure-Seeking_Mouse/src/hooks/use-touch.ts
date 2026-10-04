import * as React from "react";

/**
 * 触摸设备判定：以「主输入设备是否具备 hover 能力」为准。
 *
 * 比 UA 字符串可靠：触屏笔记本（有 hover）判为 false，保持桌面交互；
 * 手机 / 平板（无 hover、粗指针）判为 true，走触摸交互。
 *
 * 与 useIsMobile 的分工：
 *   useIsMobile  → 控制布局（侧栏形态、尺寸、间距）
 *   useIsTouch   → 控制交互方式（hover 浮层 vs 点击浮层、按钮常显 vs 悬停显）
 * 两者相互独立：大屏平板是 isMobile=false + isTouch=true，桌面窄窗口是 isMobile=true + isTouch=false。
 */
const TOUCH_QUERY = "(hover: none), (pointer: coarse)";

export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mql = window.matchMedia(TOUCH_QUERY);
    const onChange = () => setIsTouch(mql.matches);
    mql.addEventListener("change", onChange);
    setIsTouch(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}
