---
name: meme-tara
description: "Meme coin tarama: kullanıcı 'tara', 'meme tara', 'coin tara' derse pump.fun migrated coinleri TJR/Inentos Axiom filtreleriyle tarar."
version: 1.0.0
author: Claude
metadata:
  hermes:
    tags: [crypto, memecoin, solana, axiom, tarama]
---

# Meme Tara

Kullanıcı "tara", "meme tara", "coin tara", "tarama yap" (veya "tara 4" gibi saat sayısıyla) dediğinde:

1. Terminalde çalıştır (saat verildiyse sona ekle, yoksa boş bırak; varsayılan 2 saat):
   `python "%LOCALAPPDATA%\hermes\scripts\meme_scan.py"`
   Tarama 1–3 dakika sürebilir; önce kullanıcıya "Tarıyorum…" yaz.
2. Script çıktısını **olduğu gibi** (HTML linkleri dahil) kullanıcıya gönder. Yorum ekleme, coin önerme, çıktıyı kısaltma veya yeniden yazma.
3. Script hata verirse hatanın son satırını kısaca ilet.

Filtreler (scriptte): migrate son N saat, MC ≥ $35K, likidite ≥ $1K, 1 saatte ≥150 işlem (Axiom "global fees ≥ 1.5 SOL" yerine yaklaşık ölçü). Global fees'i kullanıcı Axiom linkinden kendisi kontrol eder. X satırları (takipçi, açılış tarihi, mutuals) script tarafından twitter-cli ile eklenir; X tarafı bu yüzden 1-2 dk daha sürebilir.
