import { useEffect, useRef } from "react";

const PX = 6; // one "pixel" = 6 CSS px; canvas is drawn at 1/PX resolution and scaled up with nearest-neighbour

// Pixel radar (neon colours): rings, a sweeping beam and blips rendered on a coarse pixel grid, plus a few drifting "stars".
export default function RadarBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, last = 0;
    const blips = Array.from({ length: 22 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.8, lit: 0, hue: Math.floor(Math.random() * 360) }));
    const stars = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), v: 0.002 + Math.random() * 0.006 }));
    // Wandering pac-men: white until the radar beam passes over them, then a new random colour on every pass.
    const DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const pacs = Array.from({ length: 6 }, () => ({ x: Math.random(), y: Math.random(), d: Math.floor(Math.random() * 4), ph: Math.random() * 9, hue: -1, swept: false, target: null as { x: number; y: number } | null }));
    // Green $ coins the pac-men chase; at most one per pac-man on screen, respawning at random spots.
    const DOLLAR = ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."];
    const cash: { x: number; y: number }[] = [];
    const eaten: { x: number; y: number; t: number; p: (typeof pacs)[number] }[] = []; // $ hopping into a mouth
    // Spawn in the side gutters beside the 768px main column when there is room, so the $ isn't hidden under cards.
    const spawn = () => {
      const g = (innerWidth - 768) / 2 / innerWidth, side = Math.random() < 0.5;
      const x = g > 0.06 ? (side ? 0.02 : 1 - g + 0.02) + Math.random() * (g - 0.04) : 0.05 + Math.random() * 0.9;
      cash.push({ x, y: 0.08 + Math.random() * 0.85 });
    };
    for (let i = 0; i < pacs.length / 2; i++) spawn();
    let nextCash = 0;
    const resize = () => {
      w = Math.ceil(innerWidth / PX); h = Math.ceil(innerHeight / PX);
      cv.width = w; cv.height = h; cv.style.width = w * PX + "px"; cv.style.height = h * PX + "px";
      ctx.imageSmoothingEnabled = false;
    };
    resize(); addEventListener("resize", resize);
    const dot = (x: number, y: number, a: number) => { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };

    const draw = (t: number) => {
      if (t - last < 50) { raf = requestAnimationFrame(draw); return; } // ~20 fps: chunky, retro, cheap
      last = t;
      const s = t / 1000;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      for (const st of stars) { st.y = (st.y + st.v) % 1; dot(st.x * w, st.y * h, 0.35); }

      const cx = w * 0.8, cy = Math.min(h * 0.22, 36), R = Math.max(w, h) * 0.8, sweep = (s * 0.6) % (Math.PI * 2);
      if (!still && cash.length < pacs.length && s > nextCash) { spawn(); nextCash = s + 0.6 + Math.random() * 1.4; }
      ctx.fillStyle = "#22E05A";
      for (const c of cash) {
        const x = Math.round(c.x * w) - 2, y = Math.round(c.y * h) - 3;
        DOLLAR.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === "#") ctx.fillRect(x + i, y + j, 1, 1); });
      }
      for (const p of pacs) if (p.target && !cash.includes(p.target)) p.target = null;
      const claimed = new Set(pacs.map((p) => p.target)); // each $ belongs to at most one pac-man
      for (const p of pacs) {
        if (!still) {
          // Keep its own $ or claim the nearest unclaimed one; move along one axis at a time (grid-style), eat on contact,
          // wander when every $ is taken.
          if (!p.target) {
            let bd = Infinity;
            for (const c of cash) { const d = Math.hypot(c.x * w - p.x * w, c.y * h - p.y * h); if (!claimed.has(c) && d < bd) { bd = d; p.target = c; } }
            if (p.target) claimed.add(p.target);
          }
          const best = p.target, bd = best ? Math.hypot(best.x * w - p.x * w, best.y * h - p.y * h) : Infinity;
          if (best && bd < 3) { cash.splice(cash.indexOf(best), 1); eaten.push({ ...best, t: s, p }); p.target = null; }
          else if (best) {
            const dx = best.x * w - p.x * w, dy = best.y * h - p.y * h;
            let horiz = p.d % 2 === 0;
            if ((horiz ? Math.abs(dx) : Math.abs(dy)) < 1) horiz = !horiz;
            p.d = horiz ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
          } else if (Math.random() < 0.02) p.d = Math.floor(Math.random() * 4);
          p.x = (p.x + Math.cos(DIRS[p.d]) * 0.6 / w + 1) % 1; p.y = (p.y + Math.sin(DIRS[p.d]) * 0.6 / h + 1) % 1;
        }
        const px = Math.round(p.x * w), py = Math.round(p.y * h), mouth = 0.15 + 0.6 * Math.abs(Math.sin(s * 9 + p.ph));
        let ang = (sweep - Math.atan2(py - cy, px - cx)) % (Math.PI * 2); if (ang < 0) ang += Math.PI * 2;
        if (ang < 0.1 && !p.swept) { p.hue = Math.floor(Math.random() * 360); p.swept = true; } else if (ang > 0.5) p.swept = false;
        ctx.fillStyle = p.hue < 0 ? "rgba(255,255,255,0.85)" : `hsl(${p.hue},100%,60%)`;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          if (dx * dx + dy * dy > 17) continue;
          let a = Math.atan2(dy, dx) - DIRS[p.d]; a = Math.atan2(Math.sin(a), Math.cos(a));
          if (Math.abs(a) < mouth && (dx || dy)) continue;
          ctx.fillRect(px + dx, py + dy, 1, 1);
        }
      }

      for (let k = eaten.length - 1; k >= 0; k--) { // eaten $: hops up, shrinks and gets pulled into the mouth
        const e = eaten[k], q = (s - e.t) / 0.5;
        if (q >= 1) { eaten.splice(k, 1); continue; }
        const pull = q * q, sc = 1 - 0.75 * q;
        const ex = (e.x + (e.p.x - e.x) * pull) * w, ey = (e.y + (e.p.y - e.y) * pull) * h - Math.sin(q * Math.PI) * 5;
        ctx.fillStyle = `rgba(34,224,90,${1 - 0.7 * q})`;
        DOLLAR.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === "#") ctx.fillRect(Math.round(ex + (i - 2) * sc), Math.round(ey + (j - 3) * sc), 1, 1); });
        if (q < 0.4) { ctx.fillStyle = "rgba(255,255,255,0.8)"; for (const [sx, sy] of [[-4, -4], [4, -4], [-5, 1], [5, 1]]) ctx.fillRect(Math.round(ex + sx * (1 + q * 2)), Math.round(ey + sy * (1 + q * 2)), 1, 1); }
      }

      // Neon radar: hue cycles over time, the trail fans out through the spectrum, blips flash in their own colour.
      const hue0 = (s * 40) % 360;
      const glow = (x: number, y: number, hue: number, a: number, l = 60) => {
        ctx.fillStyle = `hsla(${hue},100%,${l}%,${a})`; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      };
      for (let i = 1; i <= 5; i++) {               // dotted rings, each its own drifting hue
        const r = (R / 5) * i, steps = Math.floor(r * 1.2), hue = (hue0 + i * 55) % 360;
        for (let k = 0; k < steps; k += 2) { const a = (k / steps) * Math.PI * 2; glow(cx + Math.cos(a) * r, cy + Math.sin(a) * r, hue, 0.28); }
      }
      for (let n = 0; n < 2; n++) {                // two expanding pulse rings, half a cycle apart
        const ping = (s * 0.5 + n * 0.5) % 1, r = ping * R, steps = Math.floor(r * 1.2), hue = (hue0 + 180 + n * 90) % 360;
        for (let k = 0; k < steps; k += 2) { const a = (k / steps) * Math.PI * 2; glow(cx + Math.cos(a) * r, cy + Math.sin(a) * r, hue, 0.55 * (1 - ping)); }
      }
      for (let k = 0; k < 26; k++) {               // beam: white-hot edge, then a rainbow fan that fades and crackles
        const a = sweep - k * 0.022, fade = 1 - k / 26, hue = (hue0 + k * 11) % 360;
        for (let r = 2; r < R; r += 1.1) {
          if (k > 3 && Math.random() > fade + 0.2) continue;
          const wave = 0.6 + 0.4 * Math.sin(r * 0.5 - s * 12 + k); // bands running outward along the beam
          glow(cx + Math.cos(a) * r, cy + Math.sin(a) * r, hue, (k < 2 ? 0.95 : 0.6 * fade) * wave, k < 2 ? 88 : 58);
        }
      }
      for (const b of blips) {
        let d = (sweep - b.a) % (Math.PI * 2); if (d < 0) d += Math.PI * 2;
        if (d < 0.08) b.lit = 1; else b.lit *= 0.95;
        if (b.lit < 0.05) continue;
        const x = Math.round(cx + Math.cos(b.a) * b.r * R), y = Math.round(cy + Math.sin(b.a) * b.r * R), sz = b.lit > 0.7 ? 2 : 1;
        ctx.fillStyle = `hsla(${b.hue},100%,62%,${b.lit})`;
        ctx.fillRect(x - sz, y, sz * 2 + 1, 1); ctx.fillRect(x, y - sz, 1, sz * 2 + 1); // plus-shaped blip, bigger while fresh
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis); };
  }, []);

  return <canvas ref={ref} aria-hidden className="fixed inset-0 -z-10 pointer-events-none" style={{ imageRendering: "pixelated" }} />;
}
