import { Copy, ExternalLink, Plus, Rocket } from "lucide-react";
import { toast } from "sonner";
import type { Coin } from "@/lib/api";
import { fomoUrl, score, usd, VERDICT } from "@/lib/score";

export function CoinIcon({ src, symbol, size = 52 }: { src?: string | null; symbol: string; size?: number }) {
  // Remote images are blocked in artifacts; the scan embeds icons as data: URIs. Fallback = monogram.
  const hue = [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return src?.startsWith("data:") ? (
    <img src={src} alt="" width={size} height={size} className="object-cover shrink-0 border-2 border-white" style={{ width: size, height: size }} />
  ) : (
    <div className="shrink-0 grid place-items-center font-display text-white border-2 border-white"
      style={{ width: size, height: size, fontSize: size * 0.3, background: `repeating-linear-gradient(${hue % 2 ? 45 : -45}deg,#000 0 3px,#222 3px 6px)` }}>
      {symbol.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

export default function CoinCard({ c, onTrade, delay = 0 }: { c: Coin; onTrade: (c: Coin) => void; delay?: number }) {
  const s = score(c);
  const copy = () => navigator.clipboard.writeText(c.mint).then(() => toast.success("Contract adresi kopyalandı"), () => toast.error("Kopyalanamadı, adresi elle seç"));
  const extra = (c.socials ?? []).filter((x) => x.type !== "twitter");
  return (
    <article className="glass rounded-[var(--radius)] p-4 grid gap-3 rise min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <header className="flex items-center gap-3 min-w-0">
        <CoinIcon src={c.image} symbol={c.symbol} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-tight truncate">${c.symbol}</div>
          <div className="text-xs text-muted-foreground truncate">{c.name} · {c.migratedMin} dk önce migrate</div>
        </div>
        <div className={`font-data font-bold rounded-xl border-2 px-2.5 py-1 leading-none text-center ${VERDICT[s.verdict].cls}`} title="Puan ve karar">
          <div className="text-xl">{s.pts}<span className="text-[10px] opacity-70">/10</span></div>
          <div className="text-[9px] tracking-wider mt-0.5">{VERDICT[s.verdict].label}</div>
        </div>
      </header>

      <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-2 font-data">
        {[["MC", usd(c.mc)], ["Likidite", usd(c.liq)], ["1s hacim", usd(c.volH1)],
          ["1s", `${c.chgH1 >= 0 ? "+" : ""}${Math.round(c.chgH1)}%`], ["Al/Sat", `${c.buys}/${c.sells}`]].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className={`text-sm font-bold ${k === "1s" ? (c.chgH1 >= 0 ? "text-[hsl(var(--cyan))]" : "text-[hsl(var(--red))]") : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>

      {(c.about || c.x?.bio) && (
        <div className="border-l-2 border-white pl-3 text-[15px] leading-relaxed text-white/90" style={{ fontFamily: "system-ui, 'Segoe UI', sans-serif" }}>
          <div className="text-xs text-muted-foreground mb-0.5">{c.about ? "Proje notu (geliştiricinin yazdığı, Türkçe çeviri)" : "X profil açıklaması (Türkçe çeviri)"}</div>
          {c.about || c.x?.bio}
        </div>
      )}
      {!c.about && !c.x?.bio && <div className="text-sm text-muted-foreground">Proje açıklaması yok: geliştirici bir şey yazmamış.</div>}

      <div className="flex flex-wrap gap-1.5">
        {s.why.map(([p, t]) => (
          <span key={t} className={`chip ${p < 0 ? "text-[hsl(var(--red))]" : ""}`}>{p > 0 ? "+" : ""}{p} {t}</span>
        ))}
      </div>

      <div className="text-sm">
        {c.x && !c.x.missing ? (
          <a href={`https://x.com/${c.x.handle}`} target="_blank" rel="noopener" className="hover:underline">
            𝕏 <b>@{c.x.handle}</b> · {(c.x.followers ?? 0).toLocaleString("tr-TR")} takipçi · açılış {c.x.joined}{c.x.verified ? " · ✓ onaylı" : ""}
          </a>
        ) : <span className="text-[hsl(var(--gold))]">⚠ X hesabı {c.x ? `@${c.x.handle} bulunamadı` : "yok"}</span>}
      </div>

      {c.holders && (
        <div className="text-sm">
          İlk 10 holder arzın <b className={c.holders.top10Pct > 30 ? "text-[hsl(var(--red))]" : ""}>%{c.holders.top10Pct}</b>'ini tutuyor
          {!!c.holders.teamPct && <> (ekip cüzdanları %{c.holders.teamPct}, trader kontrolüne katılmadı)</>}
          {c.holders.top.length > 0 && <> · Cielo'da incele: {c.holders.top.map((h, i) => (
            <a key={h.wallet} href={`https://app.cielo.finance/profile/${h.wallet}`} target="_blank" rel="noopener" className="underline mr-2">
              #{i + 1} {h.trader?.name ?? `${h.wallet.slice(0, 4)}…${h.wallet.slice(-4)}`} (%{h.pct})
              {h.trader && h.trader.kind !== "unknown" && (
                <span className={`no-underline ml-1 ${h.trader.kind === "pro" ? "text-[hsl(var(--cyan))]" : h.trader.kind === "lucky" ? "text-[hsl(var(--red))]" : "text-muted-foreground"}`}
                  title={`Gerçekleşen kâr $${h.trader.realized?.toLocaleString("tr-TR")} · kazanma %${h.trader.win} · ${h.trader.closed} token · ${h.trader.days} gün`}>
                  {h.trader.kind === "pro" ? "✓ başarılı" : h.trader.kind === "lucky" ? "⚠ yeni/şanslı" : "vasat"} · %{h.trader.win} kazanma
                </span>
              )}
            </a>))}</>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={fomoUrl(c.mint)} target="_blank" rel="noopener" onClick={copy}
          className="glow-pink inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 min-h-11 font-bold">
          <Rocket size={16} /> FOMO'da aç
        </a>
        <button type="button" onClick={() => onTrade(c)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 min-h-11 font-semibold hover:bg-accent">
          <Plus size={16} /> İşleme ekle
        </button>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 min-h-11 hover:bg-accent" aria-label="Contract adresini kopyala">
          <Copy size={16} /> CA
        </button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[hsl(var(--cyan))]">
        <a href={`https://axiom.trade/meme/${c.pair}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline">Axiom <ExternalLink size={12} /></a>
        <a href={c.dex} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline">DexScreener <ExternalLink size={12} /></a>
        <a href={`https://x.com/search?q=${c.mint}&f=live`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline">X'te CA <ExternalLink size={12} /></a>
        {extra.map((x) => /^https:\/\//.test(x.url) && (
          <a key={x.url} href={x.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline">{x.type} <ExternalLink size={12} /></a>
        ))}
      </div>
    </article>
  );
}
