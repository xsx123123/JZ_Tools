// 页面层 ⇆ 桌宠的轻量桥：设置项变更通知 + 「找回阿寻」召回 + 静默指令。
// 桌宠挂在路由层、设置入口在顶栏/悬浮齿轮，两边不直传 props，走迷你 pub/sub（同 hintBus 模式）。

type Cb = () => void;

const settingsCbs = new Set<Cb>();
const recallCbs = new Set<Cb>();
const quietCbs = new Set<Cb>();

/** 尺寸 / 常驻等设置被改写后调用，桌宠据此重读偏好 */
export function emitPetSettingsChanged(): void {
  for (const cb of settingsCbs) cb();
}

/** 找回阿寻：退出静默 / 取消隐藏 */
export function emitPetRecall(): void {
  for (const cb of recallCbs) cb();
}

/** 让阿寻进入静默（等价右键菜单） */
export function emitPetQuiet(): void {
  for (const cb of quietCbs) cb();
}

export function onPetSettingsChanged(cb: Cb): () => void {
  settingsCbs.add(cb);
  return () => settingsCbs.delete(cb);
}

export function onPetRecall(cb: Cb): () => void {
  recallCbs.add(cb);
  return () => recallCbs.delete(cb);
}

export function onPetQuiet(cb: Cb): () => void {
  quietCbs.add(cb);
  return () => quietCbs.delete(cb);
}
