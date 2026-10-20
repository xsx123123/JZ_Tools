// 页面层 ⇆ 桌宠的轻量桥：设置项变更通知 + 「找回阿寻」召回 + 静默指令 + 位置复位。
// 桌宠挂在页面层、设置入口在顶栏 ⚙️ / 宠物角落常驻齿轮，两边不直传 props，走迷你 pub/sub（同 evidenceBus 模式）。
// 纯 TS 零平台依赖（resetPos 通道与主仓库对齐；主仓库另有 typing 输入联动通道，属另一轮改造，未同步）。

type Cb = () => void;

const settingsCbs = new Set<Cb>();
const recallCbs = new Set<Cb>();
const quietCbs = new Set<Cb>();
const resetPosCbs = new Set<Cb>();

/** 尺寸 / 常驻等设置被改写后调用，桌宠据此重读偏好 */
export function emitPetSettingsChanged(): void {
  for (const cb of settingsCbs) cb();
}

/** 找回阿寻：退出静默 / 取消隐藏 */
export function emitPetRecall(): void {
  for (const cb of recallCbs) cb();
}

/** 让阿寻进入静默（等价长按 600ms） */
export function emitPetQuiet(): void {
  for (const cb of quietCbs) cb();
}

/** 位置复位：把阿寻放回默认位置。网页版为右下角坐标复位；小程序版桌宠位置固定在 CSS
 *  （R3 起无拖拽/无 pos 存储），通道保留作 API 对齐，面板侧不展示该行（见 MIGRATION.md R8）。 */
export function emitPetResetPos(): void {
  for (const cb of resetPosCbs) cb();
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

export function onPetResetPos(cb: Cb): () => void {
  resetPosCbs.add(cb);
  return () => resetPosCbs.delete(cb);
}
