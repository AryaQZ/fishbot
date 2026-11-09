# Panduan Pemain e-Fish

Selamat datang di kolam e-Fish! Panduan ini menjelaskan cara memancing, mengumpulkan koin, meningkatkan skill, memakai equipment, dan berdagang dengan pemain lain.

## 1. Mulai bermain

Semua command game memakai slash command Discord. Ketik `/` lalu pilih command e-Fish.

Urutan awal yang disarankan:

1. Jalankan `/daily` untuk mengambil 30 koin. Hadiah bisa diambil sekali setiap 24 jam.
2. Jalankan `/fish` untuk memancing.
3. Jalankan `/inventory` untuk melihat ikan yang terkumpul.
4. Jalankan `/sell` untuk menjual ikan ke shop bot dan memperoleh koin. Ikan yang dikunci atau difavoritkan terlindungi.
5. Buka `/shop browse` untuk melihat equipment, lalu beli dan pasang dengan `/shop buy` dan `/shop equip`.
6. Periksa level dan peluang saat ini dengan `/profile`, `/skills status`, dan `/wiki`. `/wiki` juga mencantumkan nama mutasi dan zona tempat mutasi bisa muncul. Ketik `/mutations` untuk melihat peluangmu setelah bonus equipment dan progres koleksi.

Saat mengetik nama ikan di `/inventory`, `/sell`, `/give fish`, `/trade offer`, atau `/market sell`, masukkan beberapa huruf lalu pilih saran yang muncul. Jual, give, dan trade hanya menampilkan ikan milikmu yang belum dikunci/difavoritkan atau dicadangkan. Gunakan `/give money` untuk mengirim koin atau `/give fish` untuk mengirim ikan langsung tanpa trade.

Untuk melindungi spesies, buka `/inventory`, pilih aksi **Favorite (protect)** atau **Lock (protect)**, lalu pilih ikan. Gunakan **Unfavorite** atau **Unlock** untuk melepas perlindungan. Salah satunya sudah cukup; proteksi berlaku untuk seluruh tumpukan spesies tersebut.

Kamu juga bisa mengelola Favorit dan Lock sekaligus lewat `/inventory action:favorite`, `unfavorite`, `lock`, atau `unlock`, lalu pilih `target`: semua ikan yang dimiliki, tier ikan, semua ikan bermutasi, tier mutasi, semua ikan Shiny, atau tier ikan Shiny. Isi `tier` jika diminta. **Tier ikan** memakai rarity dasar spesies (termasuk varian Shiny/mutasi); **tier mutasi** memakai rarity mutasinya; **tier ikan Shiny** membatasi berdasarkan rarity dasar ikan Shiny. Bot meminta konfirmasi sebelum mengubah banyak ikan. Favorite dan Lock melindungi ikan serta membatalkan trade/listing aktif yang cocok. Unfavorite hanya menghapus Favorit; Unlock hanya melepas Lock. Status proteksi lainnya tetap berlaku, dan listing yang dibatalkan tidak dipulihkan. Aksi massal berlaku untuk koleksi/favorit/lock yang ada saat itu, bukan aturan otomatis untuk tangkapan berikutnya.

Tangkapan **Shiny**, ikan **bermutasi**, serta rarity **Celestial atau lebih tinggi** otomatis dikunci saat didapat. Cek di `/inventory`; pilih **Unlock** jika ingin melepas proteksi. Jika varian yang sama tertangkap lagi, penguncian otomatis berlaku kembali.

Kamu bisa memancing sekali setiap 5 detik. Setiap cast selalu mendapatkan ikan; tidak ada cast yang gagal. Jenis ikan dan beratnya diundi secara acak. Setelah hasil muncul, klik **Mancing lagi** untuk cast berikutnya tanpa mengetik `/fish`; cooldown 5 detik tetap berlaku. Klik **Inventory** di sebelahnya untuk membuka inventory secara privat. Pemain lain juga bisa menekan tombol tersebut; masing-masing mendapat ikan dan memiliki cooldown sendiri.

## 2. Ikan, rarity, peluang, dan berat

Peluang dasar setiap cast:

- **Common:** 77,94% — Minnow, Bluegill, Pond Perch, Mudskipper.
- **Uncommon:** 18% — Rainbow Trout, Silver Catfish, River Pike.
- **Rare:** 3% — Golden Koi, Crystal Sturgeon.
- **Epic:** 0,8% — Thunder Eel, Sapphire Gar.
- **Legendary:** 0,15% — Moonlit Sturgeon, Frostfin Whale.
- **Mythic:** 0,1% — Ancient Sea Serpent, Ember Leviathan.
- **Celestial:** 0,001% — Starfall Ray, Void Kraken, and other zone fish.
- **Astral:** 0,00002% base — available from Deep Sea Trench onward.
- **Eternal:** 0,0000002% base — available in Abyssal Chasm and Astral Expanse.

Luck meningkatkan peluang rarity secara bertahap dan dibatasi. Nilai `/wiki` menyesuaikan skill, equipment, serta tier yang tersedia di zona. Setiap tier memilih salah satu spesiesnya secara merata. Astral dan Eternal tetap sangat langka; setiap cast independen tanpa pity atau jaminan jumlah tertentu.
Berat dasar dan nilai jual ikan:

| Ikan | Rarity | Berat dasar | Koin / XP |
|---|---|---:|---:|
| Minnow | Common | 0,05–0,30 kg | 4 |
| Bluegill | Common | 0,10–1,20 kg | 6 |
| Pond Perch | Common | 0,15–0,90 kg | 7 |
| Mudskipper | Common | 0,05–0,60 kg | 8 |
| Rainbow Trout | Uncommon | 0,40–5 kg | 18 |
| Silver Catfish | Uncommon | 0,50–7 kg | 22 |
| River Pike | Uncommon | 0,80–8 kg | 26 |
| Golden Koi | Rare | 1–12 kg | 65 |
| Crystal Sturgeon | Rare | 2–20 kg | 95 |
| Thunder Eel | Epic | 3–35 kg | 150 |
| Sapphire Gar | Epic | 5–45 kg | 190 |
| Moonlit Sturgeon | Legendary | 5–70 kg | 240 |
| Frostfin Whale | Legendary | 20–150 kg | 400 |
| Ancient Sea Serpent | Mythic | 15–250 kg | 900 |
| Ember Leviathan | Mythic | 40–500 kg | 1.500 |
| Starfall Ray | Celestial | 80–1.000 kg | 3.000 |
| Void Kraken | Celestial | 100–2.000 kg | 6.000 |

Power memperbesar kemungkinan mendapatkan ikan yang lebih berat dan dapat memperluas batas berat tertinggi. Berat hasil cast terlihat pada balasan `/fish`; rekor tangkapan terberatmu terlihat di `/skills status`.

## 3. Level, XP, dan skill point

Setiap ikan memberi XP sebesar nilai jualnya. Pemain naik satu level setiap memperoleh 100 XP; pemain mulai dari level 1. Skill point didapat setiap 5 level pemain (level 5, 10, 15, dan seterusnya), maksimal 1 poin dari satu tangkapan. Jika ikan besar menaikkan banyak level sekaligus, poin tambahan dari beberapa milestone dalam tangkapan itu tidak ditumpuk.

Skill mulai dari level 1 dan maksimal level 1000. Gunakan:

- `/skills status` untuk melihat level, poin yang belum dipakai, rekor berat, serta peluang Mythic dan Celestial per cast.
- `/skills upgrade` lalu pilih **Luck** atau **Power** dan wajib isi `levels` dengan jumlah level yang ingin dibeli. Jumlahnya dibatasi oleh poin tersedia dan batas level 1000.

**Luck** meningkatkan peluang mendapatkan ikan dengan rarity lebih tinggi dan memberi peluang mendapat ikan bonus dalam satu cast. Peluang ikan bonus bertambah 0,05 poin persentase per Luck efektif hingga maksimum 15% per cast. Setiap ikan bonus diundi tersendiri, sehingga spesiesnya bisa berbeda. Efek Luck biasa dibatasi. Admin Abuse menambahkan bonus rarity tersendiri dengan hasil yang makin melandai saat multiplier membesar. Ikan rarity tinggi tetap acak dan tidak dijamin. `/skills status` menampilkan peluang ikan bonus saat ini.

**Power** meningkatkan berat ikan. Bonus Power berasal dari skill Power, rod, dan bobber. Pelet memberi bonus Luck, bukan Power.

Poin skill yang sudah dipakai tidak dapat dipindahkan dengan command saat ini, jadi pilih peningkatan sesuai gaya bermainmu.

## 4. Mutasi ikan

Mutasi hanya bisa muncul saat memancing di **Deep Sea Trench, Twilight Reef, Abyssal Chasm, atau Astral Expanse**. Di Server Pond dan Silver River mutasi tidak di-roll. Setiap tangkapan di zona yang mengaktifkannya melakukan satu roll mutasi terpisah dari rarity ikan dan Shiny; satu ikan mendapat paling banyak satu mutasi, dan Shiny dapat muncul bersamaan. Luck tidak meningkatkan mutasi; gear tingkat tinggi memberi bonus relatif pada peluang dasar. Tidak ada pity system.

Mutasi menaikkan nilai jual. Nama varian tersimpan di inventory sehingga dapat dikunci, difavoritkan, dijual, ditrade, atau dipasang di marketplace. `/wiki` menampilkan nama mutasi dan semua zona tempat mutasi aktif; semua jenis mutasi bisa muncul di Deep Sea Trench, Twilight Reef, Abyssal Chasm, dan Astral Expanse. `/mutations` menampilkan peluangmu setelah bonus equipment dan progres koleksi. Setiap hasil `/fish` menyebutkan nama mutasi, atau menjelaskan bahwa mutasi tidak muncul/tidak aktif di zona tersebut.

- Saltworn (Common): 3% dasar, x1,15 nilai jual.
- Albino (Uncommon): 1,2% dasar, x1,3.
- Gilded (Rare): 0,45% dasar, x1,6.
- Spectral (Epic): 0,16% dasar, x2,1.
- Electric (Legendary): 0,05% dasar, x3.
- Galaxy (Mythic): 0,01% dasar, x5.
- Prismatic (Celestial): 0,0025% dasar, x8.
- Starborn (Astral): 0,0005% dasar, x12.
- Timeless (Eternal): 0,00005% dasar, x20.

## 5. Shop dan equipment

Gunakan `/shop browse` untuk melihat katalog, `/shop buy` untuk membeli, `/shop inventory` untuk mengecek barang, lalu `/shop equip` untuk memasang barang yang dimiliki. Saat membeli pelet, isi `quantity` agar bisa membeli stok sekaligus; perlengkapan permanen dibeli satu buah. `/sell`, `/trade offer`, dan `/market sell` juga menerima jumlah agar banyak ikan bisa diproses dalam satu command. Satu rod, satu bobber, dan satu jenis pelet dapat dipasang pada slot masing-masing. Memasang barang lain pada slot yang sama akan menggantikan yang sedang dipakai. Gunakan `/shop unequip` untuk melepas barang.

### Rod

- **Reed Rod** — Common, 100 koin: +1 Luck, +1 Power.
- **Carbon Rod** — Uncommon, 400 koin: +2 Luck, +3 Power.
- **Tidecaller Rod** — Rare, 1.300 koin: +4 Luck, +7 Power.
- **Abyss Rod** — Legendary, 3.500 koin: +7 Luck, +12 Power.
- **Leviathan Rod** — Mythic, 12.000 koin: +8 Luck, +15 Power.
- **Starfall Rod** — Celestial, 40.000 koin: +10 Luck, +20 Power.
- **Starforged Rod** — Astral, 95.000 koin: +13 Luck, +28 Power.
- **Eonbreaker Rod** — Eternal, 270.000 koin: +17 Luck, +38 Power.

Rod adalah equipment permanen. Pemain hanya dapat memiliki satu dari tiap rod.

### Bobber

- **Cork Bobber** — Common, 50 koin: +1 Luck.
- **Pearl Bobber** — Uncommon, 220 koin: +2 Luck.
- **Starlight Bobber** — Rare, 700 koin: +4 Luck, +1 Power.
- **Abyssal Bobber** — Mythic, 8.000 koin: +7 Luck, +2 Power.
- **Cosmic Bobber** — Celestial, 30.000 koin: +9 Luck, +4 Power.
- **Nebula Bobber** — Astral, 62.000 koin: +11 Luck, +5 Power.
- **Eventide Bobber** — Eternal, 160.000 koin: +15 Luck, +9 Power.

Bobber juga permanen; pemain hanya dapat memiliki satu dari tiap bobber.

### Pelet

- **Plain Pellets** — Common, 10 koin: +1 Luck selama 10 menit.
- **Glimmer Pellets** — Uncommon, 25 koin: +2 Luck selama 15 menit.
- **Golden Pellets** — Rare, 80 koin: +5 Luck selama 25 menit.
- **Mythic Roe Pellets** — Legendary, 180 koin: +10 Luck selama 40 menit.
- **Void Roe Pellets** — Mythic, 500 koin: +12 Luck selama 60 menit.
- **Celestial Roe Pellets** — Celestial, 1.500 koin: +15 Luck selama 90 menit.
- **Astral Roe Pellets** — Astral, 7.000 koin: +18 Luck selama 120 menit.
- **Eternal Roe Pellets** — Eternal, 25.000 koin: +25 Luck selama 180 menit.

Satu pelet dikonsumsi pada cast pertama setelah dipasang; bonus Luck berlaku pada setiap cast selama durasi tier-nya. Setelah efek habis, cast berikutnya otomatis memakai pelet berikutnya jika masih ada. Waktu aktif terlihat di `/profile` dan `/shop inventory`. Beli stok tambahan melalui `/shop buy`.

Gunakan `/shop refund item:<pellet> quantity:<jumlah>` untuk mengembalikan stok pelet yang belum dipakai dengan refund 80% dari harga toko. Jumlah boleh dikosongkan untuk refund satu pelet. Pelet yang sudah dikonsumsi dan equipment permanen tidak bisa direfund.

Rarity equipment menunjukkan tier barang. Itu berbeda dari rarity ikan yang kamu dapat saat memancing.

## 6. Menjual ikan dan mendapatkan koin

`/sell` menjual semua ikan yang tersedia dan tidak dilindungi ke bot dengan harga dasar masing-masing ikan. Isi opsi `amount` untuk menjual sejumlah ikan termurah; isi opsi `fish` untuk hanya menjual satu spesies. Jika `fish` diisi dan `amount` dikosongkan, seluruh ikan spesies itu yang tersedia akan dijual.

Nilai jual ikan sekaligus jumlah XP sama seperti tabel di atas.


Ikan yang sedang ditawarkan melalui trade atau marketplace dicadangkan dan tidak ikut dijual oleh `/sell`. Ikan berstatus Favorite atau Locked tidak bisa dijual, ditrade, atau dipasang di marketplace. Proteksi berlaku untuk semua salinan spesies itu dalam inventory. Saat proteksi dinyalakan, penawaran trade dan listing marketplace aktif untuk spesies tersebut dibatalkan.

## 7. Marketplace dan trade langsung

### Marketplace terbuka

Pakai `/market sell` lalu isi nama ikan, jumlah, dan **harga total** listing. Contoh: 3 ikan dengan harga 90 berarti ketiga ikan itu dijual bersama seharga 90 koin.

- `/market browse` — lihat listing pemain lain.
- `/market buy` — beli listing berdasarkan ID; ikan dan koin langsung berpindah.
- `/market mine` — lihat listing milikmu.
- `/market cancel` — batalkan listing aktif milikmu.

Listing berlaku selama 7 hari. Maksimal ada 20 listing aktif per pemain. Ikan yang dipasang dicadangkan sampai listing dibeli, dibatalkan, atau kedaluwarsa.

### Trade langsung

`/trade offer` membuat penawaran ikan dan harga untuk satu pemain tertentu. Penerima dapat melihat penawaran dengan `/trade inbox`, lalu menerima melalui `/trade accept`. Pengirim bisa melihat penawaran dengan `/trade sent` dan membatalkannya dengan `/trade cancel`; penerima bisa menolak dengan `/trade decline`. Penawaran kedaluwarsa setelah 24 jam. Jumlah harga adalah total untuk seluruh ikan dalam penawaran.

## 8. Profil, leaderboard, dan konten komunitas

- `/profile` — lihat level, XP, koin, dan jumlah tangkapan.
- `/leaderboard` — lihat pemain dengan saldo koin tertinggi.
- `/submit` — ajukan ide ikan, lokasi, atau event untuk game.
- `/my-submissions` — cek pengajuanmu.

Moderator meninjau pengajuan melalui `/ugc queue`, `/ugc approve`, dan `/ugc reject`. Persetujuan mencatat keputusan moderator; konten yang disetujui belum otomatis ditambahkan ke gameplay.

## 9. Locations, Fishdex, dan daily contracts

- `/zone list` menampilkan semua zona, level minimum, saldo, status unlock, dan apakah mutasi aktif. Zona baru harus dibuka berurutan; biaya di bawah dibayar sekali, lalu perjalanan gratis.
  - **Server Pond** — level 1, gratis; awal permainan.
  - **Silver River** — level 10, 1.500 koin.
  - **Deep Sea Trench** — level 25, 12.000 koin; mutasi mulai aktif, ikan Astral pertama muncul.
  - **Twilight Reef** — level 35, 35.000 koin; ikan Astral lebih beragam.
  - **Abyssal Chasm** — level 55, 120.000 koin; spesies Eternal mulai muncul.
  - **Astral Expanse** — level 80, 300.000 koin; zona endgame untuk ikan Astral dan Eternal.
- Setiap zona punya kumpulan ikan eksklusif. `/wiki` menunjukkan semua spesies dan peluang per zona setelah Luck dan equipment dihitung. Untuk mencari ikan, gunakan `/zone unlock`, lalu `/zone travel`.
- `/dex` menampilkan spesies yang sudah pernah ditangkap, rekor berat terbaik, dan shiny yang ditemukan. Catatan Fishdex permanen meskipun ikannya dijual atau ditrade; tangkapan yang sudah ada di inventory akan dikenali saat pertama kali membuka Fishdex.
- `/contracts view` menampilkan tiga target harian. Progres bertambah otomatis saat memancing; selesaikan objective lalu klaim satu target dengan `/contracts claim`, atau pilih **Claim all completed** untuk mengambil semua hadiah yang siap sekaligus. Target lokasi harian diambil dari lokasi aktif saat kontrak pertama kali dibuat (oleh /contracts view atau saat memancing) dan tidak berubah sampai reset.
- Kontrak reset setiap hari pukul 00:00 Asia/Bangkok. Target bergilir tiap tiga hari: 30-40 tangkapan total, 3-5 ikan Rare atau lebih, dan 15-25 tangkapan di lokasi target. Hadiah koin berbeda untuk tiap kontrak.

Selamat memancing - semoga beruntung di setiap cast!
