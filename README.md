# Taskforce Dashboard on Cloudflare

Full-stack Cloudflare Worker untuk dashboard sales Nabati Malaysia.

## Isi project

- `/` — viewer dashboard; otomatis membaca snapshot terbaru dari D1.
- `/admin/` — upload XLSX harian dengan progress dan validasi.
- `/api/*` — API Worker untuk status, pembacaan data, staging, dan publish.
- `migrations/0001_initial.sql` — schema D1.
- `public/operations.html` — modul Warehouse Rental yang sudah ada.

Tidak ada sample sales data di source code.

## Cara update data

Admin mengunggah sales report kumulatif melalui `/admin/`. File diparsing di browser, dikirim per chunk ke tabel staging, lalu dipublikasikan setelah seluruh baris selesai. Saat publish, data pada `Posting Date` minimum–maksimum di file diganti. Periode lain tetap disimpan.

Contoh: upload report 1–18 September akan mengganti data 1–18 September, tanpa menyentuh Agustus.

## Setup Cloudflare

1. Buat D1 database bernama `taskforce-dashboard-db`.
2. Salin `database_id` dari D1 ke `wrangler.jsonc`, menggantikan `REPLACE_WITH_D1_DATABASE_ID`.
3. Terapkan migration melalui CLI:

   ```bash
   npx wrangler d1 migrations apply taskforce-dashboard-db --remote
   ```

   Atau, setelah deploy buka `/admin/`, masukkan token, lalu klik **Initialize database**. Tombol ini menjalankan schema yang sama secara idempotent.

4. Tambahkan encrypted secret `ADMIN_TOKEN` di Worker settings. Gunakan secret panjang dan unik.
5. Deploy:

   ```bash
   npm install
   npm run deploy
   ```

Untuk Cloudflare Builds via GitHub, gunakan:

- Build command: kosong
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

Migration perlu dijalankan satu kali sebelum upload pertama.

## Development lokal

1. Salin `.dev.vars.example` menjadi `.dev.vars`, lalu isi token.
2. Jalankan:

   ```bash
   npm install
   npm run db:local
   npm run dev
   ```

## Kolom XLSX yang wajib

`Posting Date`, `Branch Name`, `Distribution Channel`, `Customer/Vendor Code`, `Customer/Vendor Name`, `Billing Number`, `Item Code`, `Description.`, `Sales`, `CTN Qty`, `Cancel Bill. Doc.`, `Billing Type`, `Salesman ID`, `Salesman Name`.

## Catatan keamanan

Viewer API saat ini bersifat public. Endpoint upload memerlukan `ADMIN_TOKEN`. Setelah deploy stabil, lindungi `/admin/*` dengan Cloudflare Access untuk login email perusahaan; token tetap dapat dipertahankan sebagai lapisan tambahan atau dihapus pada versi berikutnya.
