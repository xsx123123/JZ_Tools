// 编号发现提示 ⇆ 桌宠联动桥：IdLink 消费到提示资格时通知页面层，
// 由「阿寻」桌宠来讲"那里有宝藏"（气泡台词 + 挖宝动作），而不是在链接旁挂生硬的提示牌。
// 解耦成迷你 pub/sub，避免把 pet 状态钻进聊天组件。

type HintCallback = () => void;

const shownCbs = new Set<HintCallback>();
const dismissCbs = new Set<HintCallback>();

/** 提示亮起时调用（首个编号扫光开始） */
export function emitHintShown(): void {
  for (const cb of shownCbs) cb();
}

/** 提示消失时调用（6s 超时或用户已打开浮层） */
export function emitHintDismissed(): void {
  for (const cb of dismissCbs) cb();
}

export function onHintShown(cb: HintCallback): () => void {
  shownCbs.add(cb);
  return () => shownCbs.delete(cb);
}

export function onHintDismissed(cb: HintCallback): () => void {
  dismissCbs.add(cb);
  return () => dismissCbs.delete(cb);
}
