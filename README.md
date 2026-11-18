# Meme Radar

pump.fun'dan Raydium/PumpSwap'a migrate olan Solana meme coin'lerini tarar, filtreler (MC, likidite, işlem sayısı, holder dağılımı, X hesabı) ve puanlar.

| Klasör | Ne |
|---|---|
| `web/` | Site (React + Vite + shadcn). claude.ai artifact olarak çalışır, veriyi açanın Supabase connector'ı üzerinden çeker. |
| `supabase/` | `meme-scan` edge function'ı + tablo şeması (`schema.sql`) |
| `scripts/meme_scan.py` | Telegram/terminal taraması: `python scripts/meme_scan.py 2` (son 2 saat) |
| `hermes-skill/` | Hermes'te "tara" komutu için skill |

## Kurulum

```bash
cp .env.example .env    # kendi anahtarlarını yaz
```

**Kendi Supabase projen için:**
1. `supabase/schema.sql` dosyasında `<PROJE_ID>` yerine kendi proje ID'ni yaz ve SQL Editor'da çalıştır.
2. `supabase functions deploy meme-scan --no-verify-jwt`
3. `supabase secrets set HELIUS_API_KEY=... SOLANATRACKER_API_KEY=...`
4. `web/src/lib/api.ts` dosyasındaki `PROJECT` değerini kendi proje ID'nle değiştir, sonra build al:
   ```bash
   cd web && pnpm i && npx vite build --base ./
   ```

## Güncel site (2026-11-18)
`web/dist/meme-radar.html` = yayındaki Meme Radar artifact'ının derlenmiş son hali (Takip sekmesi dahil). `web/src` 30.10 kaynak anlık görüntüsüdür; sonraki kaynak değişiklikleri yerelde korunmadı.
