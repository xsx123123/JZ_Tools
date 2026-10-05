// 跨上下文复制剪贴板。
//
// 坑：`navigator.clipboard` 只在**安全上下文**（HTTPS 或 localhost）才存在。本应用 nginx 仅监听
// HTTP（deploy/nginx.docker.conf: listen 80），局域网里用 `http://<ip>:<port>` 打开时它是
// undefined；旧代码写成 `navigator.clipboard?.writeText(...)`，`?.` 会静默跳过——表现为
// "点了复制没反应、也没有报错"。即便在 localhost，writeText 也可能因瞬时用户激活失效抛
// NotAllowedError，又被 `.catch(() => undefined)` 吞掉。
//
// 这里：优先用 Clipboard API，不可用/失败时降级到隐藏 textarea + execCommand('copy')，
// 并返回布尔值，让调用方能给出反馈。
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 落到 execCommand 兜底 */
    }
  }
  return execCommandCopy(text);
}

/** 隐藏 textarea + document.execCommand('copy')：非安全上下文下唯一可用的同步复制通道 */
function execCommandCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  let ok = false;
  const ta = document.createElement('textarea');
  try {
    ta.value = text;
    ta.setAttribute('readonly', '');
    // 固定定位 + 透明，避免滚动跳动与闪烁；不能 display:none（那样无法选中）
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    // 保存并恢复用户原有的选区，避免复制动作把页面上的选中状态弄丢
    const sel = document.getSelection();
    const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    ok = document.execCommand('copy');

    if (savedRange && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  } catch {
    ok = false;
  } finally {
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  }
  return ok;
}
