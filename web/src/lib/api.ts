// All data goes through the viewer's Supabase connector (execute_sql) — the page itself can't reach any API (CSP).
const SERVER = "Supabase", PROJECT = "dewbnadsgvpmpiezmfgt";

export type XInfo = { handle: string; followers?: number; joined?: string; verified?: boolean; missing?: boolean; bio?: string | null };
export type Coin = {
  symbol: string; name: string; mint: string; pair: string; dex: string; migratedMin: number;
  mc: number; liq: number; volH1: number; chgH1: number; buys: number; sells: number;
  socials: { type: string; url: string }[]; x: XInfo | null; image?: string | null; about?: string | null;
  holders?: { top10Pct: number; teamPct?: number; top: { wallet: string; pct: number; trader?: Trader }[] } | null;
};
export type Trader = { kind: "pro" | "lucky" | "meh" | "unknown"; realized?: number; win?: number; closed?: number; days?: number; name?: string | null };
export type ScanResult = { migrations: number; coins: Coin[]; coverage?: { read: number; total: number } };
export type Settings = { min_mc: number; min_liq: number; max_mc_liq: number; min_tx_h1: number };
export type Trade = {
  id: number; symbol: string; mint: string | null; image: string | null; entry_mc: number; size_usd: number;
  exit_mc: number | null; note: string | null; opened_at: string; closed_at: string | null;
};

type Mcp = { callTool: (s: string, t: string, i: unknown, o?: unknown) => Promise<any> };
let mcpP: Promise<Mcp | null> | null = null;
export const getMcp = () => (mcpP ??= (window as any).claude?.use?.("mcp") ?? Promise.resolve(null));

export const q = (s: unknown) => "'" + String(s ?? "").replace(/'/g, "''") + "'"; // SQL string literal
export const n = (v: unknown) => { const x = Number(v); if (!Number.isFinite(x)) throw new Error("Geçersiz sayı"); return x; };

export async function sql<T = any>(query: string): Promise<T[]> {
  const mcp = await getMcp();
  if (!mcp) throw { code: "not_granted" };
  const r = await mcp.callTool(SERVER, "execute_sql", { project_id: PROJECT, query }, { cache: false });
  let t: any = typeof r.payload === "string" ? r.payload : r.payload?.result ?? r.content?.[0]?.text ?? "";
  try { const j = JSON.parse(t); if (Array.isArray(j)) return j; if (typeof j?.result === "string") t = j.result; } catch { /* envelope text */ }
  // execute_sql wraps rows in <untrusted-data-ID>[...]</untrusted-data-ID>; the intro sentence also names the tag
  const m = String(t).match(/<untrusted-data-([\w-]+)>\s*(\[[\s\S]*?\])\s*<\/untrusted-data-\1>/);
  return m ? JSON.parse(m[2]) : [];
}

const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

export async function startScan(hours: number) {
  const [{ id }] = await sql<{ id: number }>(`select meme_start(${n(hours)}) as id`);
  return id;
}
export async function scanRow(id: number) {
  const [r] = await sql(`select status, error, result, finished_at from meme_scans where id = ${n(id)}`);
  return r && { status: r.status as string, error: r.error as string | null, finished_at: r.finished_at, result: r.result ? parse<ScanResult>(r.result) : null };
}
export async function lastScan() {
  const [r] = await sql("select id, result, finished_at, hours from meme_scans where status = 'done' order by id desc limit 1");
  return r ? { ...r, result: parse<ScanResult>(r.result) } : null;
}
export async function history() {
  return sql<{ id: number; hours: number; status: string; finished_at: string; migrations: number; coins: number; top: string }>(
    `select id, hours, status, finished_at, (result->>'migrations')::int migrations,
       coalesce(jsonb_array_length(result->'coins'),0) coins,
       (select string_agg(c->>'symbol', ' · ') from (select * from jsonb_array_elements(result->'coins') limit 4) x(c)) top
     from meme_scans order by id desc limit 15`);
}
export async function scanById(id: number) {
  const [r] = await sql(`select result from meme_scans where id = ${n(id)}`);
  return r?.result ? parse<ScanResult>(r.result) : null;
}

export async function getSettings() {
  const [s] = await sql<Settings>("select min_mc, min_liq, max_mc_liq, min_tx_h1 from meme_settings where id = 1");
  return { min_mc: +s.min_mc, min_liq: +s.min_liq, max_mc_liq: +s.max_mc_liq, min_tx_h1: +s.min_tx_h1 };
}
export async function saveSettings(s: Settings) {
  await sql(`update meme_settings set min_mc=${n(s.min_mc)}, min_liq=${n(s.min_liq)}, max_mc_liq=${n(s.max_mc_liq)},
    min_tx_h1=${Math.round(n(s.min_tx_h1))}, updated_at=now() where id = 1 returning id`);
}

export async function trades() {
  return (await sql<Trade>("select * from meme_trades order by closed_at is not null, opened_at desc limit 200"))
    .map((t) => ({ ...t, entry_mc: +t.entry_mc, size_usd: +t.size_usd, exit_mc: t.exit_mc == null ? null : +t.exit_mc }));
}
export async function addTrade(t: { symbol: string; mint?: string; image?: string | null; entry_mc: number; size_usd: number; note?: string }) {
  await sql(`insert into meme_trades (symbol, mint, image, entry_mc, size_usd, note) values
    (${q(t.symbol)}, ${q(t.mint)}, ${t.image ? q(t.image) : "null"}, ${n(t.entry_mc)}, ${n(t.size_usd)}, ${q(t.note)}) returning id`);
}
export async function closeTrade(id: number, exit_mc: number) {
  await sql(`update meme_trades set exit_mc=${n(exit_mc)}, closed_at=now() where id=${n(id)} returning id`);
}
export async function deleteTrade(id: number) {
  await sql(`delete from meme_trades where id=${n(id)} returning id`);
}

export function errText(e: any): string {
  const c = e?.code;
  if (c === "server_not_connected" || c === "not_granted" || c === "capability_disabled")
    return "Supabase bağlantısı yok: claude.ai → Ayarlar → Connectors'tan Supabase'i ekle.";
  if (c === "needs_reauth") return "Supabase bağlantısının süresi dolmuş: Connectors'tan yeniden bağlan.";
  if (c === "approval_required" || c === "not_in_manifest" || c === "consent_required")
    return "Sayfanın Supabase'e erişimine izin verilmedi. Tekrar dene ve izin ver.";
  if (c === "server_unavailable") return "Supabase şu an yanıt vermiyor (proje duraklamış olabilir). Biraz sonra dene.";
  return String(e?.message ?? e);
}
