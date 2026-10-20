// 平台账号会话封装：QMuse 登录用户经 custom-token 建立 Appwrite session；未登录为匿名会话（游客）
import { getCurrentAppwriteUser, getQmusePlatformUserId } from "./appwrite";

export interface AuthUser {
  id: string;
  label: string;
}

let cachedUser: AuthUser | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 2000;

function readPlatformLabel(id: string): string {
  const clientUser = window.__TERN__?.user?.clientUser;
  const label =
    clientUser?.displayName?.trim() ||
    clientUser?.nickName?.trim() ||
    clientUser?.userName?.trim();
  return label || id.slice(0, 8);
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedUser;

  const platformUserId = getQmusePlatformUserId();
  let user: AuthUser | null = null;
  if (platformUserId) {
    try {
      const appwriteUser = await getCurrentAppwriteUser();
      if (appwriteUser) {
        user = { id: platformUserId, label: readPlatformLabel(platformUserId) };
      }
    } catch {
      user = null;
    }
  }
  cachedUser = user;
  cachedAt = now;
  return user;
}

export function subscribeAuth(cb: (user: AuthUser | null) => void): () => void {
  let cancelled = false;
  let current: AuthUser | null = null;

  void (async () => {
    try {
      current = await getAuthUser();
    } catch {
      current = null;
    }
    if (!cancelled) cb(current);
  })();

  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
      try {
        const next = await getAuthUser();
        const changed =
          next?.id !== current?.id || next?.label !== current?.label;
        if (changed) {
          current = next;
          if (!cancelled) cb(next);
        }
      } catch {
        /* ignore */
      } finally {
        ticking = false;
      }
    })();
  }, 2000);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}
