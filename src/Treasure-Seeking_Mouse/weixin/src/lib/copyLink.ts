// 【小程序版】「弹窗确认 → 复制链接」公共交互
// 小程序不能用网页版的新窗口打开跳外站（web-view 又需配置业务域名），
// 所有外站链接统一走：showModal 展示地址 → 确认后复制到剪贴板，由用户粘贴到浏览器打开。
import Taro from "@tarojs/taro";
import type { TFunc } from "@/i18n";

export function copyLinkWithConfirm(t: TFunc, title: string, url: string): void {
  void Taro.showModal({
    title,
    content: url,
    confirmText: t("idlink.copyId"),
    cancelText: t("board.cancel"),
    success: (r) => {
      if (r.confirm) void Taro.setClipboardData({ data: url });
    },
  });
}
