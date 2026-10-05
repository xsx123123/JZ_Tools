// 「找到宝藏」全屏烟花庆祝：canvas 粒子爆发，零依赖，约 2s 自动清理。
// 触发时机 = 用户顺着首次发现提示悬停/点开编号、且真的挖到文献（lit.status === 'ok'）。
// 每个浏览器永久只放一次（localStorage 记录），老用户不受打扰。

let fired = false;

/** 触发一次全屏宝藏烟花（重复调用与已放过的浏览器均为 no-op；?reshow-hint=1 可重置） */
export function fireTreasureBurst(): void {
  if (fired || typeof document === "undefined") return;
  let demoMode = false;
  try {
    if (/[?&]reshow-hint=1/.test(location.search)) {
      // 演示模式：每次都放、不落盘
      localStorage.removeItem("geo-treasure-burst-fired");
      fired = false;
      demoMode = true;
    }
    if (!demoMode && localStorage.getItem("geo-treasure-burst-fired")) {
      fired = true;
      return;
    }
    if (!demoMode) localStorage.setItem("geo-treasure-burst-fired", "1");
  } catch {
    /* 隐私模式下静默失败，但至少本次会话不再放 */
  }
  if (fired) return;
  fired = true;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  };
  resize();

  // 主题色：青绿 helix + 琥珀金 pet-amber + 点缀白
  const COLORS = ["#0d9488", "#2dd4bf", "#f59e0b", "#fbbf24", "#ffffff"];
  const W = () => canvas.width;
  const H = () => canvas.height;

  interface Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number; size: number; color: string; spark: boolean;
  }
  const particles: Particle[] = [];

  function explode(x: number, y: number, big: boolean) {
    const n = big ? 72 : 48;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.25;
      const speed = (big ? 5.2 : 3.8) * (0.55 + Math.random() * 0.7) * dpr;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 55 + Math.random() * 30,
        size: (big ? 2.4 : 1.9) * dpr * (0.7 + Math.random() * 0.6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        spark: Math.random() < 0.35,
      });
    }
  }

  // 三发：底部中点一发大的 + 左下/右下两发小的，错峰引爆
  const cx = W() / 2;
  const cy = H() * 0.42;
  setTimeout(() => explode(cx, cy, true), 120);
  setTimeout(() => explode(W() * 0.2, H() * 0.55, false), 380);
  setTimeout(() => explode(W() * 0.8, H() * 0.55, false), 600);

  let raf = 0;
  let frame = 0;
  const tick = () => {
    frame += 1;
    ctx.clearRect(0, 0, W(), H());
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += 1;
      if (p.life > p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += 0.055 * dpr; // 重力
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      const fade = 1 - p.life / p.maxLife;
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      if (p.spark) {
        // 闪烁粒：偶数帧留白，制造烟花碎闪感
        if (p.life % 4 < 2) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (particles.length > 0 && frame < 240) {
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.remove();
    }
  };
  raf = requestAnimationFrame(tick);
  window.addEventListener("resize", resize);
}
