import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Radar, Settings2, Wallet } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import RadarBackground from "@/components/RadarBackground";
import CoinCard from "@/components/CoinCard";
import Trades from "@/components/Trades";
import * as api from "@/lib/api";
import type { Coin, ScanResult, Settings, Trade } from "@/lib/api";
import { score, usd } from "@/lib/score";

const fmtTime = (s?: string) => (s ? new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const field = "w-full rounded-xl bg-background/60 border border-border px-3 min-h-11 font-data";

export default function App() {
  const [tab, setTab] = useState("radar");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [when, setWhen] = useState("");
  const [hours, setHours] = useState(2);
  const [minScore, setMinScore] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Bağlanıyor…");
  const [err, setErr] = useState("");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [hist, setHist] = useState<Awaited<ReturnType<typeof api.history>>>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tradeCoin, setTradeCoin] = useState<Coin | null>(null);
  const t0 = useRef(0);

  const loadTrades = useCallback(() => api.trades().then(setTrades).catch((e) => toast.error(api.errText(e))), []);

  useEffect(() => {
    (async () => {
      if (!(await api.getMcp())) { setStatus("Bu görünüm Supabase'e bağlanamıyor — sayfayı claude.ai'de aç."); return; }
      try {
        const last = await api.lastScan();
        if (last) { setResult(last.result); setWhen(last.finished_at); setStatus(`Son tarama ${fmtTime(last.finished_at)}`); }
        else setStatus("Henüz tarama yok — Tara'ya bas.");
        loadTrades();
      } catch (e) { setStatus("İlk taramada izin istenecek."); setErr(api.errText(e)); }
    })();
  }, [loadTrades]);

  useEffect(() => {
    if (tab === "history") api.history().then(setHist).catch((e) => toast.error(api.errText(e)));
    if (tab === "settings" && !settings) api.getSettings().then(setSettings).catch((e) => toast.error(api.errText(e)));
    if (tab === "trades") loadTrades();
  }, [tab, settings, loadTrades]);

  const scan = async () => {
    setScanning(true); setErr(""); t0.current = Date.now();
    try {
      setStatus("Tarama başlıyor…");
      const id = await api.startScan(hours);
      while (Date.now() - t0.current < 6 * 60e3) {
        await new Promise((r) => setTimeout(r, 7000));
        setStatus(`Zincir taranıyor… ${Math.round((Date.now() - t0.current) / 1000)} sn (genelde 1–2 dk)`);
        const row = await api.scanRow(id);
        if (row?.status === "done" && row.result) {
          setResult(row.result); setWhen(row.finished_at); setStatus(`Bitti · ${fmtTime(row.finished_at)}`);
          toast.success(`${row.result.coins.length} coin bulundu`); return;
        }
        if (row?.status === "error") { setErr("Tarama hatası: " + row.error); setStatus(""); return; }
      }
      setErr("Tarama 6 dakikada bitmedi, tekrar dene.");
    } catch (e) { setErr(api.errText(e)); setStatus(""); }
    finally { setScanning(false); }
  };

  const ranked = useMemo(() => (result?.coins ?? []).map((c) => ({ c, s: score(c).pts })).sort((a, b) => b.s - a.s), [result]);
  const shown = ranked.filter((r) => r.s >= minScore);
  const best = ranked[0];

  return (
    <>
      <RadarBackground />
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: "#000", color: "#fff", border: "2px solid #fff", borderRadius: 0, fontFamily: "Pixelify Sans, monospace" } }} />
      <main className="mx-auto max-w-3xl py-6 pb-16 grid gap-5" style={{ paddingTop: "max(24px, env(safe-area-inset-top, 0px))" }}>
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            
            <h1 className="font-display text-2xl sm:text-4xl leading-tight">
              Meme Radar<span className="cursor">_</span>
            </h1>
          </div>
          {best && (
            <div className="glass rounded-[var(--radius)] px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Şu an en iyi</div>
              <div className="font-display">${best.c.symbol} <span className="text-[hsl(var(--gold))] font-data">{best.s}/10</span></div>
            </div>
          )}
        </header>

        <Tabs value={tab} onValueChange={setTab} className="grid gap-4">
          <TabsList className="glass grid grid-cols-4 h-auto p-1 rounded-2xl sticky z-10" style={{ top: "env(safe-area-inset-top, 0px)" }}>
            {[["radar", Radar, "Radar"], ["trades", Wallet, "İşlemler"], ["history", History, "Geçmiş"], ["settings", Settings2, "Ayarlar"]].map(([v, Icon, l]: any) => (
              <TabsTrigger key={v} value={v} className="rounded-xl min-h-11 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Icon size={16} className="hidden sm:block" /><span className="hidden sm:inline">{l}</span><span className="sm:hidden text-[13px]">{l}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="radar" className="grid gap-4 mt-0">
            <section className="glass rounded-[var(--radius)] p-4 grid gap-3">
              <div className="flex flex-wrap gap-2 items-stretch">
                <button type="button" onClick={scan} disabled={scanning}
                  className={`flex-1 min-w-[160px] rounded-xl bg-primary text-primary-foreground font-display text-lg min-h-12 disabled:cursor-progress ${scanning ? "pulse-ring" : "glow-pink"}`}>
                  {scanning ? "Taranıyor…" : "Tara"}
                </button>
                <label htmlFor="hours" className="sr-only">Tarama penceresi</label>
                <select id="hours" value={hours} onChange={(e) => setHours(+e.target.value)}
                  className="bg-black text-white border-2 border-white px-3 min-h-12 font-sans text-base font-semibold" style={{ fontFamily: "system-ui, 'Segoe UI', sans-serif" }}>
                  {[1, 2, 4, 6].map((h) => <option key={h} value={h}>Son {h} saat</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <label htmlFor="minScore" className="text-muted-foreground shrink-0">Min. puan</label>
                <input id="minScore" type="range" min={0} max={9} value={minScore} onChange={(e) => setMinScore(+e.target.value)} className="flex-1 accent-[hsl(var(--pink))]" />
                <span className="font-data w-8 text-right">{minScore}+</span>
              </div>
              <div role="status" className={`font-data text-xs ${err ? "text-[hsl(var(--red))]" : "text-muted-foreground"}`}>
                {err || status}{result && !err ? ` · ${result.coverage && result.coverage.read < result.coverage.total ? `${result.coverage.read}/${result.coverage.total} migrate okundu (Solana sunucusu yavaşlattı)` : `${result.migrations} migrate`} → ${result.coins.length} coin` : ""}
              </div>
            </section>

            {shown.length ? shown.map(({ c }, i) => <CoinCard key={c.mint} c={c} onTrade={setTradeCoin} delay={i * 40} />) : (
              <div className="glass rounded-[var(--radius)] p-8 text-center text-muted-foreground">
                {result ? `Bu puan eşiğinde coin yok (${result.coins.length} coin tarandı).` : "Tara'ya bas — coinler puanlı kartlar olarak burada çıkar."}
              </div>
            )}

            <footer className="text-xs text-muted-foreground grid gap-1 px-1">
              <div>🔢 Puan: alış baskısı 2 · hacim/MC 2 · X takipçi 2 · X+site 1 · taze 1 · MC ≤ $300K 1 · likidite ≥ %15 1 · −%40 düşüş −2. 🟢 Alınır: 7+ ve kırmızı bayrak yok · 🟡 Kararsız: 4–6 ya da bayraklı · 🔴 Alınmaz: 0–3. Kendi X/site kontrolünü yine yap.</div>
              <div>☑️ Kendin bak: Axiom'da global fees ≥ 1.5 SOL · narrative · trend. Mutuals → Telegram'da “tara”.</div>
              <div>🚀 “FOMO'da aç” CA'yı kopyalar ve FOMO'yu açar; telefonda uygulama açılmazsa FOMO'da arama kutusuna yapıştır.</div>
            </footer>
          </TabsContent>

          <TabsContent value="trades" className="mt-0"><Trades list={trades} reload={loadTrades} /></TabsContent>

          <TabsContent value="history" className="mt-0">
            <ul className="grid gap-2">
              {hist.map((h) => (
                <li key={h.id}>
                  <button type="button" disabled={h.status !== "done"} className="glass rounded-[var(--radius)] p-3 w-full text-left grid gap-1 hover:border-primary disabled:opacity-60"
                    onClick={async () => { const r = await api.scanById(h.id).catch(() => null); if (r) { setResult(r); setWhen(h.finished_at); setStatus(`Geçmiş tarama ${fmtTime(h.finished_at)}`); setTab("radar"); } }}>
                    <div className="flex justify-between gap-2 font-data text-sm">
                      <span>{fmtTime(h.finished_at) || "—"} · son {+h.hours}s</span>
                      <span className={h.status === "done" ? "text-[hsl(var(--cyan))]" : h.status === "error" ? "text-[hsl(var(--red))]" : ""}>{h.status === "done" ? `${h.migrations} → ${h.coins}` : h.status}</span>
                    </div>
                    {h.top && <div className="text-xs text-muted-foreground truncate">{h.top}</div>}
                  </button>
                </li>
              ))}
              {!hist.length && <li className="glass rounded-[var(--radius)] p-8 text-center text-muted-foreground">Geçmiş yükleniyor…</li>}
            </ul>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            {settings ? <SettingsForm s={settings} onSaved={setSettings} /> : <div className="glass rounded-[var(--radius)] p-8 text-center text-muted-foreground">Ayarlar yükleniyor…</div>}
          </TabsContent>
        </Tabs>
        {when && <span className="sr-only">Son veri {when}</span>}
      </main>

      <TradeDialog coin={tradeCoin} onClose={() => setTradeCoin(null)} onSaved={() => { setTradeCoin(null); loadTrades(); setTab("trades"); }} />
    </>
  );
}

function SettingsForm({ s, onSaved }: { s: Settings; onSaved: (s: Settings) => void }) {
  const [v, setV] = useState(s);
  const [busy, setBusy] = useState(false);
  const rows: [keyof Settings, string, string][] = [
    ["min_mc", "Min. market cap ($)", "Videodaki Axiom filtresi: 35000"],
    ["min_liq", "Min. likidite ($)", "Video: 1000"],
    ["max_mc_liq", "Maks. MC / likidite", "Sahte hisse coinlerini eler. Normal pump coin 3–5"],
    ["min_tx_h1", "Min. işlem / saat", "Axiom 'global fees ≥ 1.5' yerine yaklaşık ölçü"],
  ];
  return (
    <form className="glass rounded-[var(--radius)] p-4 grid gap-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try { await api.saveSettings(v); onSaved(v); toast.success("Filtreler kaydedildi — sonraki tarama bunları kullanır"); }
      catch (er) { toast.error(api.errText(er)); } finally { setBusy(false); }
    }}>
      <h2 className="font-display text-xl">Tarama filtreleri</h2>
      {rows.map(([k, label, hint]) => (
        <div key={k} className="grid gap-1">
          <label htmlFor={k} className="text-sm font-semibold">{label}</label>
          <input id={k} type="number" min={0} step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: +e.target.value })} className={field} />
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <button disabled={busy} className="rounded-xl bg-primary text-primary-foreground font-bold px-5 min-h-11 disabled:opacity-50">Kaydet</button>
        <button type="button" onClick={() => setV({ min_mc: 35000, min_liq: 1000, max_mc_liq: 15, min_tx_h1: 150 })} className="rounded-xl border border-border px-4 min-h-11">Videodaki değerler</button>
      </div>
      <p className="text-xs text-muted-foreground">Telegram'daki “tara” kendi filtrelerini bilgisayardaki script'ten alır; bu ayarlar sadece siteyi etkiler.</p>
    </form>
  );
}

function TradeDialog({ coin, onClose, onSaved }: { coin: Coin | null; onClose: () => void; onSaved: () => void }) {
  const [size, setSize] = useState("50");
  const [mc, setMc] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (coin) { setMc(String(Math.round(coin.mc))); setNote(""); } }, [coin]);
  return (
    <Dialog open={!!coin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">${coin?.symbol} işlemi</DialogTitle>
          <DialogDescription>FOMO'da aldıktan sonra kaydet. Giriş MC, taramadaki değerle dolu.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); if (!coin) return; setBusy(true);
          try { await api.addTrade({ symbol: coin.symbol, mint: coin.mint, image: coin.image, entry_mc: +mc, size_usd: +size, note }); toast.success("İşlem eklendi"); onSaved(); }
          catch (er) { toast.error(api.errText(er)); } finally { setBusy(false); }
        }}>
          <label className="grid gap-1 text-sm font-semibold" htmlFor="t-size">Tutar ($)<input id="t-size" required type="number" min={1} step="any" value={size} onChange={(e) => setSize(e.target.value)} className={field} /></label>
          <label className="grid gap-1 text-sm font-semibold" htmlFor="t-mc">Giriş MC ($)<input id="t-mc" required type="number" min={1} step="any" value={mc} onChange={(e) => setMc(e.target.value)} className={field} /></label>
          <label className="grid gap-1 text-sm font-semibold" htmlFor="t-note">Not<input id="t-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="narrative, neden aldın…" className={field} /></label>
          {+mc > 0 && <div className="flex gap-2 flex-wrap text-xs font-data">
            <span className="chip text-[hsl(var(--gold))]">🎯 2x MC {usd(+mc * 2)}</span><span className="chip text-[hsl(var(--red))]">⛔ stop MC {usd(+mc * 0.75)}</span></div>}
          <button disabled={busy} className="rounded-xl bg-primary text-primary-foreground font-bold min-h-11 disabled:opacity-50">Kaydet</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
