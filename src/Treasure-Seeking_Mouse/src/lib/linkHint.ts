// 编号链接（IdLink）发现性提示：每个浏览器永久提示一次 + 同一会话只展示一次。
// 由「有资格的消息」（仅最后一条定稿的助手消息）里的全部编号参与抽签，
// 本轮消息定稿后随机点亮其中一个（游戏式任务感叹号），避免永远固定在第一个。
// 用 localStorage 记住，避免老用户被打扰。
//
// 测试开关：URL 加 ?reshow-hint=1 进入演示模式——每次刷新都重新抽签、且不落盘，
// 方便中英文反复验证效果（正常用户路径仍是永久一次）。
const KEY = "geo-idlink-hint-shown";
let consumedThisSession = false;
let demoMode = false;

let pendingClaims: Array<() => void> = [];
let drawScheduled = false;

function persist(): void {
  if (demoMode) return; // 演示模式不落盘
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

function scheduleDraw(): void {
  if (drawScheduled) return;
  drawScheduled = true;
  // 等本轮所有 IdLink 的 effect 都登记完（同一消息里可能有多个编号），再随机抽一个
  setTimeout(() => {
    drawScheduled = false;
    const claims = pendingClaims;
    pendingClaims = [];
    if (claims.length === 0) return;
    const winner = claims[Math.floor(Math.random() * claims.length)];
    consumedThisSession = true;
    persist();
    winner();
  }, 0);
}

/**
 * 登记一次抽签资格（由定稿助手消息里的每个 IdLink 调用）。
 * 本轮定稿后随机选中一个编号回调 win()；未被选中的静默忽略。
 * 已消费（永久一次）时立即返回 false，调用方不必登记。
 */
export function claimIdLinkHint(win: () => void): boolean {
  try {
    if (typeof location !== "undefined" && /[?&]reshow-hint=1/.test(location.search)) {
      localStorage.removeItem(KEY);
      localStorage.removeItem("geo-treasure-burst-fired");
      consumedThisSession = false;
      demoMode = true;
    }
  } catch {
    /* ignore */
  }
  if (consumedThisSession) return false;
  try {
    if (localStorage.getItem(KEY)) return false;
  } catch {
    /* ignore */
  }
  pendingClaims.push(win);
  scheduleDraw();
  return true;
}
