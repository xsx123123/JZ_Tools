// 编号链接（IdLink）发现性提示：每台设备永久提示一次 + 同一会话只消费一次。
// 首次渲染含编号的消息时，给第一个编号加高亮动画 + 气泡提示，引导新用户发现
// 「点编号看文献 / 追证据链」能力。存储走 device.ts 本机存储层（禁网页版 KV 存储 API 硬约束），
// key 与网页版一致（geo-idlink-hint-shown），语义对齐 src/lib/linkHint.ts。
import { getItem, setItem } from "@/services/device";

const KEY = "geo-idlink-hint-shown";
let consumedThisSession = false;

/** 返回 true 表示本次应展示提示（并立即记为已展示） */
export function consumeIdLinkHint(): boolean {
  if (consumedThisSession) return false;
  if (getItem(KEY)) return false;
  consumedThisSession = true;
  setItem(KEY, "1");
  return true;
}
