// 【小程序版】本机存储适配层：统一替代网页版的 localStorage
//
// 网页版有 7 个文件、36 处直接调 localStorage；小程序无此 API，一律走 wx.getStorageSync/
// setStorageSync（同步 API，与 localStorage 的调用形态最接近，改动量最小）。
// 集中在此文件，便于以后统一加容量兜底 / 迁移逻辑。
import Taro from "@tarojs/taro";

/** 读字符串；不存在或异常返回 null（对齐 localStorage.getItem 语义） */
export function getItem(key: string): string | null {
  try {
    const v = Taro.getStorageSync(key);
    return v === "" || v === undefined || v === null ? null : String(v);
  } catch {
    return null;
  }
}

/** 写字符串；容量满等异常静默（对齐网页版「容量满时静默丢弃」的既定行为） */
export function setItem(key: string, value: string): void {
  try {
    Taro.setStorageSync(key, value);
  } catch {
    /* ignore */
  }
}

export function removeItem(key: string): void {
  try {
    Taro.removeStorageSync(key);
  } catch {
    /* ignore */
  }
}

/** 读 JSON；解析失败返回 null */
export function getJSON<T>(key: string): T | null {
  const raw = getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJSON(key: string, value: unknown): void {
  try {
    setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** 本机匿名设备指纹：首次生成后长期存本地，作为访客榜主键（与网页版同 key，便于日后打通） */
const KEY_DEVICE = "seqout-device-id";
const DEVICE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function getDeviceId(): string {
  const old = getItem(KEY_DEVICE);
  if (old) return old;
  let s = "";
  for (let i = 0; i < 16; i++) s += DEVICE_CHARS[Math.floor(Math.random() * DEVICE_CHARS.length)];
  setItem(KEY_DEVICE, s);
  return s;
}
