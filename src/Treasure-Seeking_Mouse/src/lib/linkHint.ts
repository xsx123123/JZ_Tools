// 编号链接（IdLink）发现性提示：每个浏览器永久提示一次 + 同一会话只消费一次。
// 首次渲染含编号的消息时，给第一个编号加高亮动画 + 气泡提示，引导新用户发现
// 「悬停看文献 / 点查看证据链」能力。用 localStorage 记住，避免老用户被打扰。
const KEY = "geo-idlink-hint-shown";
let consumedThisSession = false;

/** 返回 true 表示本次应展示提示（并立即记为已展示） */
export function consumeIdLinkHint(): boolean {
  if (consumedThisSession) return false;
  try {
    if (localStorage.getItem(KEY)) return false;
  } catch {
    /* ignore */
  }
  consumedThisSession = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  return true;
}
