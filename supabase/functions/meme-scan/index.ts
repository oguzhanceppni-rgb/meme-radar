// Port of hermes/scripts/meme_scan.py for the web page: pump.fun migrations (Solana RPC) -> filters -> meme_scans row.
// X: followers/age via fxtwitter (no cookies, no account risk). Mutuals stay in the Telegram scan (needs X login).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

let MIN_MC = 35_000, MIN_LIQ = 1_000, MAX_MC_LIQ = 15, MIN_TX_H1 = 150; // overridden from meme_settings
const MIGRATOR = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg";
const QUOTES = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn",
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"]);
const HELIUS = Deno.env.get("HELIUS_API_KEY");
const RPC = HELIUS ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS}` : "https://api.mainnet-beta.solana.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc(method: string, params: unknown): Promise<any> {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Array.isArray(params) && method === "batch" ? params : { jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (method === "batch" ? Array.isArray(j) : "result" in j) return method === "batch" ? j : j.result;
    } catch { /* retry */ }
    await sleep(1500 * (i + 1)); // public RPC throttles
  }
  throw new Error("Solana RPC " + method);
}

let coverage = { read: 0, total: 0 };

async function migratedMints(since: number) {
  const sigs: any[] = [];
  let before: string | undefined;
  while (true) {
    const page = await rpc("getSignaturesForAddress", [MIGRATOR, { limit: 1000, ...(before ? { before } : {}) }]);
    sigs.push(...page.filter((s: any) => !s.err && (s.blockTime ?? 0) >= since));
    if (!page.length || (page.at(-1).blockTime ?? 0) < since) break;
    before = page.at(-1).signature;
  }
  const mints = new Map<string, number>(), seen = new Map<string, number>();
  // Single getTransaction calls through a small worker pool, retried until DEADLINE (newest first).
  // Helius key: ~8 parallel is within its free rate limit. Public RPC: 2 parallel, and it still 429s a lot.
  const DEADLINE = Date.now() + 100_000, WORKERS = HELIUS ? 8 : 2;
  const queue = sigs.map((_, i) => i), tries = new Map<number, number>();
  let read = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (queue.length && Date.now() < DEADLINE) {
      const i = queue.shift()!;
      let t: any = null;
      try {
        const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "getTransaction", params: [sigs[i].signature, { maxSupportedTransactionVersion: 1 }] }) });
        t = (await r.json())?.result;
      } catch { /* retry below */ }
      if (!t) {
        const n = (tries.get(i) ?? 0) + 1; tries.set(i, n);
        if (n < 6) queue.push(i);
        await sleep(400 * n); continue;
      }
      read++;
      const ms = new Set<string>((t.meta?.postTokenBalances ?? []).map((b: any) => b.mint));
      for (const m of ms) if (!QUOTES.has(m)) { if (!mints.has(m)) mints.set(m, sigs[i].blockTime); seen.set(m, (seen.get(m) ?? 0) + 1); }
    }
  }));
  coverage = { read, total: sigs.length };
  for (const [m, n] of seen) if (n > 2) mints.delete(m); // quote/fee tokens appear in many migrations
  return mints;
}

const STOCKY = /xstock|dividend|fund|trust|etf|exchange oil/i; // tokenized-stock spam

export function passes(p: any) {
  if (STOCKY.test(p.baseToken?.name ?? "")) return false;
  const mc = p.marketCap ?? 0, liq = p.liquidity?.usd ?? 0, tx = p.txns?.h1 ?? {};
  return mc >= MIN_MC && liq >= MIN_LIQ && mc <= MAX_MC_LIQ * liq && (tx.buys ?? 0) + (tx.sells ?? 0) >= MIN_TX_H1;
}

function xHandle(url: string) {
  const h = new URL(url).pathname.split("/").filter(Boolean)[0] ?? "";
  return ["", "i", "search", "intent", "home", "hashtag"].includes(h.toLowerCase()) ? null : h;
}

async function xInfo(handle: string) {
  try {
    const u = (await (await fetch(`https://api.fxtwitter.com/${handle}`)).json()).user;
    return u ? { handle, followers: u.followers, joined: new Date(u.joined).toISOString().slice(0, 7), verified: !!u.verification?.verified,
      bio: typeof u.description === "string" ? u.description.slice(0, 200) : null } : { handle, missing: true };
  } catch { return { handle, missing: true }; }
}

// Artifact pages can't load remote images (CSP), so ship a small data: URI.
// DexScreener's CDN only serves preset sizes: 64 works, 96 returns 422.
async function icon(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url);
    for (const [k, v] of [["width", "64"], ["height", "64"], ["fit", "crop"], ["quality", "95"], ["format", "auto"]]) u.searchParams.set(k, v);
    const r = await fetch(u); if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer()); if (b.length > 40_000) return null;
    let bin = ""; for (const x of b) bin += String.fromCharCode(x);
    return `data:${r.headers.get("content-type") ?? "image/jpeg"};base64,${btoa(bin)}`;
  } catch { return null; }
}

// The coin's own description from its token metadata (what the dev wrote on pump.fun), via GeckoTerminal.
async function about(mint: string) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/info`, { headers: { Accept: "application/json" } });
      if (r.status === 429) { await sleep(2500 * (k + 1)); continue; }
      const d = (await r.json())?.data?.attributes?.description;
      return typeof d === "string" && d.trim() ? d.trim().slice(0, 400) : null;
    } catch { return null; }
  }
  return null;
}

// Free translators, no key: Google's gtx endpoint first, MyMemory as fallback; original text if both fail.
let trUsed = { google: 0, mymemory: 0, failed: 0 };
async function tr(text: string | null | undefined) {
  if (!text) return text ?? null;
  try {
    const j = await (await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=" + encodeURIComponent(text))).json();
    const out = j?.[2] === "tr" ? text : (j[0] as any[]).map((x) => x[0]).join("");
    if (out) { trUsed.google++; return out; }
  } catch { /* try MyMemory */ }
  try {
    const j = await (await fetch("https://api.mymemory.translated.net/get?langpair=en|tr&q=" + encodeURIComponent(text.slice(0, 450)))).json();
    const out = j?.responseStatus == 200 ? j.responseData?.translatedText : null;
    if (out) { trUsed.mymemory++; return out; }
  } catch { /* keep original */ }
  trUsed.failed++;
  return text;
}

// Top holders straight from chain. Only real wallets count: pools and curves are program-owned PDAs, not System accounts.
const SYSTEM = "11111111111111111111111111111111";
async function holders(mint: string) {
  try {
    const [largest, supply] = await Promise.all([rpc("getTokenLargestAccounts", [mint]), rpc("getTokenSupply", [mint])]);
    const total = Number(supply.value.uiAmount) || 0, top = largest.value as any[];
    const accs = (await rpc("getMultipleAccounts", [top.map((a) => a.address), { encoding: "jsonParsed" }])).value as any[];
    const by = new Map<string, number>();
    accs.forEach((a, i) => { const o = a?.data?.parsed?.info?.owner; if (o) by.set(o, (by.get(o) ?? 0) + Number(top[i].uiAmount ?? 0)); });
    const owners = [...by.keys()];
    const info = (await rpc("getMultipleAccounts", [owners, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }])).value as any[];
    const wallets = owners.filter((_, i) => info[i]?.owner === SYSTEM)
      .map((o) => ({ wallet: o, pct: total ? (by.get(o)! / total) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { top10Pct: r1(wallets.slice(0, 10).reduce((s, w) => s + w.pct, 0)), top: wallets.slice(0, 10).map((w) => ({ wallet: w.wallet, pct: r1(w.pct) })) };
  } catch { return null; }
}

// Holder quality via Solana Tracker PnL (free tier: 2.5K req/month, 3 req/s). Cached 24h in meme_wallets.
//   pro   = realized and total (incl. open bags) profit, win rate >= 50%, >= 20 closed tokens, trading for 30+ days
//   lucky = in profit but either a fresh wallet (< 14 days) or a low win rate (< 35%): one hot streak, not a track record
// The key is a UUID; pull it out of whatever was pasted into the secret (quotes, "NAME=", stray characters).
const ST_KEY = Deno.env.get("SOLANATRACKER_API_KEY")?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
export function classify(d: any) {
  const realized = d?.summary?.pnl?.realized, win = d?.analysis?.winRate, closed = d?.analysis?.tokens?.closed ?? 0;
  if (typeof realized !== "number" || typeof win !== "number") return { kind: "unknown" };
  const days = Math.round((Date.now() - (d.summary.timing?.firstTrade ?? Date.now())) / 864e5);
  const total = d.summary.pnl?.total ?? realized;
  const kind = realized > 0 && total > 0 && win >= 50 && closed >= 20 && days >= 30 ? "pro"
    : realized > 0 && (days < 14 || win < 35) ? "lucky" : "meh";
  return { kind, realized: Math.round(realized), win: Math.round(win), closed, days, name: d.identity?.name ?? null };
}
let stDiag: Record<string, number> = {};
async function trader(db: any, wallet: string) {
  const { data: c } = await db.from("meme_wallets").select("info").eq("wallet", wallet)
    .gte("fetched_at", new Date(Date.now() - 864e5).toISOString()).maybeSingle();
  if (c) return c.info;
  if (!ST_KEY) { stDiag.noKey = (stDiag.noKey ?? 0) + 1; return { kind: "unknown" }; }
  try {
    await sleep(400); // stay under 3 req/s
    const r = await fetch(`https://data.solanatracker.io/v2/pnl/wallets/${wallet}`, { headers: { "x-api-key": ST_KEY } });
    stDiag["http" + r.status] = (stDiag["http" + r.status] ?? 0) + 1;
    const d = await r.json();
    if (d?.indexed === false) { stDiag.notIndexed = (stDiag.notIndexed ?? 0) + 1; return { kind: "unknown" }; } // queued by Solana Tracker; not cached so the next scan retries
    const info = classify(d);
    if (info.kind !== "unknown") await db.from("meme_wallets").upsert({ wallet, info, fetched_at: new Date().toISOString() }); // errors/quota: retry next scan
    return info;
  } catch (e) { stDiag.err = (stDiag.err ?? 0) + 1; stDiag.lastErr = String(e).slice(0, 80) as any; return { kind: "unknown" }; }
}

// The coin's own team: its creator plus the insider wallets Solana Tracker flags. 1 request per coin, cached 6h.
async function team(db: any, mint: string): Promise<Set<string>> {
  const key = "team:" + mint;
  const { data: c } = await db.from("meme_wallets").select("info").eq("wallet", key)
    .gte("fetched_at", new Date(Date.now() - 6 * 36e5).toISOString()).maybeSingle();
  if (c) return new Set(c.info.wallets);
  if (!ST_KEY) return new Set();
  try {
    await sleep(400);
    const r = await fetch(`https://data.solanatracker.io/tokens/${mint}`, { headers: { "x-api-key": ST_KEY } });
    stDiag["tok" + r.status] = (stDiag["tok" + r.status] ?? 0) + 1;
    if (!r.ok) return new Set();
    const d = await r.json();
    const addr = (w: any) => typeof w === "string" ? w : w?.address ?? w?.wallet ?? w?.owner;
    const wallets = [d?.token?.creation?.creator, ...(d?.risk?.insiders?.wallets ?? []).map(addr)].filter(Boolean);
    await db.from("meme_wallets").upsert({ wallet: key, info: { wallets }, fetched_at: new Date().toISOString() });
    return new Set(wallets);
  } catch { return new Set(); }
}

async function scan(hours: number, db: any) {
  const now = Math.floor(Date.now() / 1000);
  trUsed = { google: 0, mymemory: 0, failed: 0 }; stDiag = {};
  const mints = await migratedMints(now - hours * 3600);
  const list = [...mints.keys()], best = new Map<string, any>();
  for (let i = 0; i < list.length; i += 30) {
    const pairs = await (await fetch("https://api.dexscreener.com/tokens/v1/solana/" + list.slice(i, i + 30).join(","))).json();
    for (const p of pairs) {
      const m = p.baseToken.address;
      if ((p.liquidity?.usd ?? 0) >= (best.get(m)?.liquidity?.usd ?? -1)) best.set(m, p);
    }
  }
  const hits = [...best.values()].filter(passes).sort((a, b) => (b.volume?.h1 ?? 0) - (a.volume?.h1 ?? 0)).slice(0, 12);
  const abouts = new Map<string, string | null>();
  for (let i = 0; i < hits.length; i += 3) // GeckoTerminal allows ~30 req/min
    await Promise.all(hits.slice(i, i + 3).map(async (p) => abouts.set(p.baseToken.address, await about(p.baseToken.address))));
  const coins = await Promise.all(hits.map(async (p) => {
    const info = p.info ?? {}, m = p.baseToken.address;
    const tw = (info.socials ?? []).filter((s: any) => s.type === "twitter").map((s: any) => xHandle(s.url)).find(Boolean);
    const x: any = tw ? await xInfo(tw) : null;
    if (x?.bio) x.bio = await tr(x.bio);
    return {
      symbol: p.baseToken.symbol, name: p.baseToken.name, mint: m, pair: p.pairAddress, dex: p.url,
      migratedMin: Math.round((now - mints.get(m)!) / 60), mc: p.marketCap, liq: p.liquidity.usd,
      volH1: p.volume?.h1 ?? 0, chgH1: p.priceChange?.h1 ?? 0, buys: p.txns.h1.buys, sells: p.txns.h1.sells,
      socials: [...(info.socials ?? []).map((s: any) => ({ type: s.type, url: s.url })),
                ...(info.websites ?? []).map((w: any) => ({ type: "site", url: w.url }))],
      x,
      image: await icon(info.imageUrl),
      about: await tr(abouts.get(m)),
      holders: await holders(m),
    };
  }));
  for (const c of coins as any[]) { // sequential: Solana Tracker rate limit
    if (!c.holders) continue;
    const t = await team(db, c.mint), all = c.holders.top as { wallet: string; pct: number }[];
    c.holders.teamPct = Math.round(all.filter((h) => t.has(h.wallet)).reduce((s, h) => s + h.pct, 0) * 10) / 10;
    c.holders.top = all.filter((h) => !t.has(h.wallet)).slice(0, 3); // judge only outside holders
    for (const h of c.holders.top) (h as any).trader = await trader(db, h.wallet);
  }
  return { migrations: mints.size, coins, coverage, rpc: HELIUS ? "helius" : "public", tr: trUsed, st: stDiag };
}

Deno.serve(async (req) => {
  const { id } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // No JWT: a call only works by claiming a fresh 'queued' row the owner inserted via meme_start(); anything else is ignored.
  const { data: row } = await db.from("meme_scans").update({ status: "running" })
    .eq("id", Number(id)).eq("status", "queued").gte("created_at", new Date(Date.now() - 120_000).toISOString())
    .select("hours").maybeSingle();
  if (!row) return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "Content-Type": "application/json" } });
  const { data: st } = await db.from("meme_settings").select("*").eq("id", 1).maybeSingle();
  if (st) { MIN_MC = Number(st.min_mc); MIN_LIQ = Number(st.min_liq); MAX_MC_LIQ = Number(st.max_mc_liq); MIN_TX_H1 = Number(st.min_tx_h1); }
  const work = (async () => {
    try {
      const result = await scan(Math.min(Math.max(Number(row.hours) || 2, 0.25), 6), db);
      await db.from("meme_scans").update({ status: "done", result, finished_at: new Date().toISOString() }).eq("id", id);
    } catch (e) {
      await db.from("meme_scans").update({ status: "error", error: String(e).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", id);
    }
  })();
  // @ts-ignore EdgeRuntime exists on Supabase: keep scanning after replying
  EdgeRuntime.waitUntil(work);
  return new Response(JSON.stringify({ ok: true, id }), { headers: { "Content-Type": "application/json" } });
});
