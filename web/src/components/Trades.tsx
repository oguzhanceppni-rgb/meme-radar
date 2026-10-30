import { useState } from "react";
import { Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { closeTrade, deleteTrade, errText, type Trade } from "@/lib/api";
import { fomoUrl, usd } from "@/lib/score";
import { CoinIcon } from "./CoinCard";

export const pnlOf = (t: Trade) => (t.exit_mc == null ? 0 : t.size_usd * (t.exit_mc / t.entry_mc - 1));

export function stats(ts: Trade[]) {
  const closed = ts.filter((t) => t.exit_mc != null);
  const wins = closed.filter((t) => pnlOf(t) > 0).length;
  const pnl = closed.reduce((s, t) => s + pnlOf(t), 0);
  const avgR = closed.length ? closed.reduce((s, t) => s + pnlOf(t) / (t.size_usd * 0.25), 0) / closed.length : 0; // 1R = 25% stop
  return { open: ts.length - closed.length, closed: closed.length, winRate: closed.length ? wins / closed.length : 0, pnl, avgR };
}

function Row({ t, reload }: { t: Trade; reload: () => void }) {
  const [exit, setExit] = useState("");
  const [busy, setBusy] = useState(false);
  const open = t.exit_mc == null, pnl = pnlOf(t), x = open ? null : t.exit_mc! / t.entry_mc;
  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await f(); toast.success(ok); reload(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  return (
    <li className="glass rounded-[var(--radius)] p-3 grid gap-2 rise min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <CoinIcon src={t.image} symbol={t.symbol} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate">${t.symbol}</div>
          <div className="text-xs text-muted-foreground font-data">
            giriş {usd(t.entry_mc)} · {usd(t.size_usd)} · {new Date(t.opened_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        {open ? <span className="chip text-[hsl(var(--cyan))]">açık</span> : (
          <div className={`font-data font-bold text-right ${pnl >= 0 ? "text-[hsl(var(--gold))]" : "text-[hsl(var(--red))]"}`}>
            {pnl >= 0 ? "+" : ""}{usd(pnl)}<div className="text-[11px] opacity-80">{x!.toFixed(2)}x</div>
          </div>
        )}
      </div>
      {open && (
        <>
          <div className="flex flex-wrap gap-2 text-xs font-data">
            <span className="chip text-[hsl(var(--gold))]">🎯 2x: MC {usd(t.entry_mc * 2)} → %50 sat</span>
            <span className="chip text-[hsl(var(--red))]">⛔ stop −%25: MC {usd(t.entry_mc * 0.75)}</span>
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const v = Number(exit.replace(/[^\d.]/g, "")) * (/k$/i.test(exit.trim()) ? 1e3 : /m$/i.test(exit.trim()) ? 1e6 : 1);
            if (!(v > 0)) return toast.error("Çıkış MC'sini yaz (örn. 180k)"); run(() => closeTrade(t.id, v), "İşlem kapatıldı"); }}>
            <input id={`exit-${t.id}`} value={exit} onChange={(e) => setExit(e.target.value)} inputMode="decimal" placeholder="Çıkış MC (örn. 180k)"
              className="flex-1 min-w-0 rounded-xl bg-background/60 border border-border px-3 min-h-11 font-data" aria-label="Çıkış market cap" />
            <button disabled={busy} className="rounded-xl bg-secondary px-4 min-h-11 font-semibold hover:bg-accent disabled:opacity-50">Kapat</button>
            {t.mint && <a href={fomoUrl(t.mint)} target="_blank" rel="noopener" className="inline-grid place-items-center rounded-xl border border-border px-3 min-h-11" aria-label="FOMO'da aç"><Rocket size={16} /></a>}
          </form>
        </>
      )}
      {t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}
      <button type="button" disabled={busy} onClick={() => run(() => deleteTrade(t.id), "Silindi")}
        className="justify-self-end inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-[hsl(var(--red))]"><Trash2 size={12} /> sil</button>
    </li>
  );
}

export default function Trades({ list, reload }: { list: Trade[]; reload: () => void }) {
  const st = stats(list);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[["Toplam PnL", `${st.pnl >= 0 ? "+" : ""}${usd(st.pnl)}`, st.pnl >= 0 ? "--gold" : "--red"], ["Win-rate", `%${Math.round(st.winRate * 100)}`, "--cyan"],
          ["Ort. R", st.avgR.toFixed(2), st.avgR >= 0 ? "--gold" : "--red"], ["Açık / kapalı", `${st.open} / ${st.closed}`, "--text"]].map(([k, v, c]) => (
          <div key={k} className="glass rounded-[var(--radius)] p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="font-data text-xl font-bold" style={{ color: `hsl(var(${c}))` }}>{v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">2x hedef / −%25 stop ≈ 1:4 risk-ödül → masraflar hariç başabaş için işlemlerin ~%20'si 2x'e ulaşmalı. Win-rate bunun üstündeyse strateji çalışıyor.</p>
      {list.length ? <ul className="grid gap-3">{list.map((t) => <Row key={t.id} t={t} reload={reload} />)}</ul> : (
        <div className="glass rounded-[var(--radius)] p-8 text-center text-muted-foreground">Henüz işlem yok. Radar'da bir coinde <b>İşleme ekle</b>'ye bas.</div>
      )}
    </div>
  );
}
