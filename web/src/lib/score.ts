import type { Coin } from "./api";

// 0-10 opportunity score; each reason = [points, label]. Mirrors the video's checks with on-chain proxies.
export function score(c: Coin) {
  const r: [number, string][] = [];
  const add = (p: number, t: string) => { if (p) r.push([p, t]); };
  const ratio = c.buys / Math.max(c.sells, 1), turn = c.volH1 / Math.max(c.mc, 1), liqPct = c.liq / Math.max(c.mc, 1);
  const f = c.x && !c.x.missing ? c.x.followers ?? 0 : 0, types = (c.socials ?? []).map((s) => s.type);
  add(ratio >= 1.5 ? 2 : ratio >= 1.15 ? 1 : 0, `alış baskısı ${ratio.toFixed(1)}x`);
  add(turn >= 1.5 ? 2 : turn >= 0.5 ? 1 : 0, `hacim/MC ${turn.toFixed(1)}`);
  add(f >= 5000 ? 2 : f >= 500 ? 1 : 0, `${f.toLocaleString("tr-TR")} takipçi`);
  add(types.includes("twitter") && types.includes("site") ? 1 : 0, "X + site");
  add(c.migratedMin <= 30 ? 1 : 0, "taze migrate");
  add(c.mc <= 300e3 ? 1 : 0, "2x için yer var");
  add(liqPct >= 0.15 ? 1 : 0, "likidite sağlam");
  add(c.chgH1 <= -40 ? -2 : 0, "sert düşüş");
  add(!c.about && !c.x?.bio ? -1 : 0, "proje hakkında bilgi yok");
  const kinds = (c.holders?.top ?? []).map((h) => h.trader?.kind);
  add(kinds.includes("pro") ? 1 : 0, "başarılı trader holder");
  add(!kinds.includes("pro") && kinds.includes("lucky") ? -1 : 0, "holder yeni/şanslı cüzdan");
  add(c.holders && c.holders.top10Pct > 30 ? -1 : 0, `ilk 10 holder %${c.holders?.top10Pct}`); // concentrated supply = dump risk
  const pts = Math.max(0, Math.min(10, r.reduce((s, [p]) => s + p, 0)));
  // Verdict: green needs a high score AND no red flags; any red flag caps it at "kararsız".
  const verdict: Verdict = pts >= 7 && !r.some(([p]) => p < 0) ? "al" : pts <= 3 ? "alma" : "kararsiz";
  return { pts, why: r, verdict };
}

export type Verdict = "al" | "kararsiz" | "alma";
export const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  al: { label: "ALINIR", cls: "text-[hsl(var(--green))] border-[hsl(var(--green))]" },
  kararsiz: { label: "KARARSIZ", cls: "text-[hsl(var(--yellow))] border-[hsl(var(--yellow))]" },
  alma: { label: "ALINMAZ", cls: "text-[hsl(var(--red))] border-[hsl(var(--red))]" },
};

export const usd = (v: number) =>
  Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? "$" + (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + "K" : "$" + v.toFixed(0);

// FOMO app universal link (apple-app-site-association lists /tokens/*): opens the app on phone, web page on desktop.
export const fomoUrl = (mint: string) => `https://fomo.family/tokens/solana/${encodeURIComponent(mint)}`;
