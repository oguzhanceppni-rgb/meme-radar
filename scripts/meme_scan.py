"""One-shot meme scan (on demand, no background bot).
pump.fun migrations (on-chain) -> TJR/Inentos Axiom 'Migrated' filters -> Telegram-ready text on stdout.
Run: python meme_scan.py [hours=2]"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
HOURS = float(sys.argv[1]) if len(sys.argv) > 1 else 2
MIN_MC, MIN_LIQ = 35_000, 1_000   # video: migrated MC >= 35K, liquidity >= 1K
MAX_MC_LIQ = 15                   # fake 'stock' coins: MC 20-150x liquidity; real pump coins ~3-5x
MIN_TX_H1 = 150                   # ponytail: proxy for Axiom 'global fees >= 1.5 SOL' (no free API); real check via Axiom link
MIGRATOR = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"  # pump.fun migration authority, signs every migrate tx
WSOL = "So11111111111111111111111111111111111111112"
QUOTES = {WSOL, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
          "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"}  # SOL, USDC, USDT, PUMP, USD1
def _helius():
    try:
        for line in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"), encoding="utf-8"):
            k, _, v = line.strip().partition("=")
            if k == "HELIUS_API_KEY" and v.strip(): return v.strip().strip("\"'")
    except OSError: pass
    return None


HELIUS = _helius()
RPC = f"https://mainnet.helius-rpc.com/?api-key={HELIUS}" if HELIUS else "https://api.mainnet-beta.solana.com"


def http(url, body=None):
    for i in range(4):
        try:
            req = urllib.request.Request(url, body and json.dumps(body).encode(),
                                         {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(req, timeout=40))
        except (urllib.error.HTTPError, TimeoutError) as e:
            if getattr(e, "code", 429) != 429: raise
            time.sleep(3 * (i + 1))
    raise RuntimeError("rate limit: " + url)


def rpc(method, params):
    for i in range(5):
        r = http(RPC, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        if "result" in r: return r["result"]
        time.sleep(2 * (i + 1))  # public RPC returns JSON errors when throttled
    raise RuntimeError(f"RPC {method}: {r.get('error')}")


def migrated_mints(since):
    sigs, before = [], None
    while True:  # page back until older than `since`
        page = rpc("getSignaturesForAddress", [MIGRATOR, {"limit": 200, **({"before": before} if before else {})}])
        sigs += [s for s in page if not s["err"] and (s["blockTime"] or 0) >= since]
        if not page or (page[-1]["blockTime"] or 0) < since: break
        before = page[-1]["signature"]
    mints, seen = {}, {}
    for s in sigs:
        tx = rpc("getTransaction", [s["signature"], {"maxSupportedTransactionVersion": 1}])
        for b in (tx or {}).get("meta", {}).get("postTokenBalances", []):
            if b["mint"] not in QUOTES:
                mints.setdefault(b["mint"], s["blockTime"])
                seen.setdefault(b["mint"], set()).add(s["signature"])
        time.sleep(0.02 if HELIUS else 0.15)
    # quote/fee tokens (USDC, PUMP...) show up in many migrations; a real coin migrates once
    return {m: t for m, t in mints.items() if len(seen[m]) <= 2}


STOCKY = re.compile(r"xstock|dividend|fund|trust|etf|exchange oil", re.I)  # tokenized-stock spam


def passes(p):
    if STOCKY.search(p.get("baseToken", {}).get("name", "")): return False
    tx = p.get("txns", {}).get("h1", {})
    mc, liq = p.get("marketCap") or 0, (p.get("liquidity") or {}).get("usd", 0)
    return (mc >= MIN_MC and liq >= MIN_LIQ and mc <= MAX_MC_LIQ * liq
            and tx.get("buys", 0) + tx.get("sells", 0) >= MIN_TX_H1)


def best_pairs(mints):
    best = {}
    ml = list(mints)
    for i in range(0, len(ml), 30):
        for p in http("https://api.dexscreener.com/tokens/v1/solana/" + ",".join(ml[i:i + 30])):
            m = p["baseToken"]["address"]
            if (p.get("liquidity") or {}).get("usd", 0) >= (best.get(m, {}).get("liquidity") or {}).get("usd", -1):
                best[m] = p
    return best


def fmt(n):
    return f"${n/1e6:.2f}M" if n >= 1e6 else f"${n/1e3:.0f}K"


# --- X (Twitter) check: followers + "mutuals" = known crypto accounts following the coin's X ---
HERMES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
KOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meme_kols.txt")


def x_env():
    e = dict(os.environ, PYTHONIOENCODING="utf-8")
    for line in open(os.path.join(HERMES, ".env"), encoding="utf-8"):
        k, _, v = line.strip().partition("=")
        if k in ("TWITTER_AUTH_TOKEN", "TWITTER_CT0") and v: e[k] = v.strip().strip('"\'')
    return e if "TWITTER_CT0" in e else None


XCACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meme_xcache.json")
X_PAUSE = 3  # seconds between X calls; read-only, low volume so the account doesn't get flagged
X_MAX_COINS = 5  # X lookups per scan


def twitter(env, *args, ttl=6 * 3600):
    """Read-only twitter-cli call, cached on disk (ttl seconds) to keep X traffic minimal."""
    try: cache = json.load(open(XCACHE, encoding="utf-8"))
    except (OSError, ValueError): cache = {}
    key = " ".join(args)
    if key in cache and time.time() - cache[key][0] < ttl: return cache[key][1]
    time.sleep(X_PAUSE)
    r = subprocess.run(["twitter", *args, "--json"], env=env, capture_output=True, text=True, encoding="utf-8", timeout=60)
    d = json.loads(r.stdout or "{}")
    data = d.get("data") if d.get("ok") else None
    if data is not None:
        cache[key] = [time.time(), data]
        json.dump(cache, open(XCACHE, "w", encoding="utf-8"))
    return data


def x_handle(url):
    """x.com/<handle>[/status/..] -> handle; communities/search links -> None."""
    path = urllib.parse.urlparse(url).path.strip("/").split("/")
    h = path[0] if path and path[0] else ""
    return None if h.lower() in ("", "i", "search", "intent", "home", "hashtag") else h


def kol_set(env):
    """KOL -> lowercase handles of their 200 most recent follows (new coin accounts show up here first)."""
    kols = [l.strip().lstrip("@") for l in open(KOLS, encoding="utf-8") if l.strip() and not l.startswith("#")]
    # ponytail: X broke the followers endpoint, so mutuals = KOLs whose recent follows include the coin; 4h cache keeps it ~18 calls per 4 hours
    return {k: {u["screenName"].lower() for u in twitter(env, "following", k, "-n", "200", ttl=4 * 3600) or []} for k in kols}


def x_check(env, kols, handle):
    u = twitter(env, "user", handle)
    if not u: return f"𝕏 @{handle}: bulunamadı ⚠️"
    mut = sorted(k for k, follows in kols.items() if handle.lower() in follows)
    age = (u.get("createdAtISO") or "")[:7]
    return (f"𝕏 @{handle}: {u['followers']:,} takipçi · açılış {age}" + (" ✅" if u.get("verified") else "")
            + (f"\n👥 Mutuals: {', '.join('@' + m for m in mut[:6])}" if mut else "\n👥 Mutuals: yok ⚠️"))


def render(hits, mints, now):
    if not hits:
        return f"🔍 Meme tarama: son {HOURS:g} saatte {len(mints)} migrate, filtreden geçen yok."
    out = [f"🔍 <b>Meme tarama</b>: {len(mints)} migrate → {len(hits)} geçti (son {HOURS:g}s)\n"]
    env = x_env()
    kols = kol_set(env) if env and hits else {}
    if not env: out.append("⚠️ X bağlı değil (cookie yok) — takipçi/mutuals atlandı\n")
    for p in hits[:8]:
        m, info, tx = p["baseToken"]["address"], p.get("info") or {}, p["txns"]["h1"]
        handles = [h for s in info.get("socials", []) if s.get("type") == "twitter" and (h := x_handle(s["url"]))]
        xline = ""
        if env and handles and hits.index(p) < X_MAX_COINS:
            try: xline = x_check(env, kols, handles[0]) + "\n"
            except Exception as e: xline = f"𝕏 kontrol hatası: {str(e)[:60]}\n"
        soc = [f'<a href="{s["url"]}">{s.get("type", "link")}</a>' for s in info.get("socials", [])]
        soc += [f'<a href="{w["url"]}">site</a>' for w in info.get("websites", [])]
        out.append(
            f"🚨 <b>${p['baseToken']['symbol']}</b> ({p['baseToken']['name']}) · {(now - mints[m]) / 60:.0f}dk önce migrate\n"
            f"MC {fmt(p['marketCap'])} · Liq {fmt(p['liquidity']['usd'])} · 1s hacim {fmt(p['volume'].get('h1', 0))}"
            f" ({p.get('priceChange', {}).get('h1', 0):+.0f}%)\n"
            f"1s alış/satış {tx['buys']}/{tx['sells']} · {' · '.join(soc) or 'sosyal yok ⚠️'}\n{xline}"
            f'<a href="https://axiom.trade/meme/{p["pairAddress"]}">Axiom</a> · '
            f'<a href="https://x.com/search?q={m}&f=live">X\'te CA</a> · <a href="{p["url"]}">DexS</a>\n<code>{m}</code>\n')
    out.append("☑️ Axiom: global fees ≥1.5 · narrative · trend\n🎯 2x'te %50 sat · stop −%25")
    return "\n".join(out)


def scan(hours=HOURS):
    now = int(time.time())
    mints = migrated_mints(now - int(hours * 3600))
    pairs = best_pairs(mints) if mints else {}
    hits = sorted((p for p in pairs.values() if passes(p)), key=lambda p: -p["volume"].get("h1", 0))
    return render(hits, mints, now)


if __name__ == "__main__":
    ok = {"marketCap": 40e3, "liquidity": {"usd": 5e3}, "txns": {"h1": {"buys": 100, "sells": 60}}}
    assert passes(ok)
    assert not passes({**ok, "marketCap": 20e3})
    assert not passes({**ok, "marketCap": 147e6, "liquidity": {"usd": 1e6}})
    assert not passes({**ok, "liquidity": {"usd": 500}})
    assert not passes({**ok, "txns": {"h1": {"buys": 50, "sells": 40}}})
    assert not passes({**ok, "baseToken": {"name": "Palantir xStock"}})
    assert x_handle("https://x.com/pandulabs/status/211?s=20") == "pandulabs"
    assert x_handle("https://x.com/otc_bargains") == "otc_bargains"
    assert x_handle("https://x.com/i/communities/123") is None
    print(scan())
