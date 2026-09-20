// Summary route + service integration tests.
//
// Mirrors the testApp.js pattern but with the `kdtu_summary_entries` and
// `timetable_periods` tables the summary endpoints need. Reuses the real
// express app + auth middleware so the tests exercise full routing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import argon2 from 'argon2'

process.env.KDTU_DB_KEY    = 'test-db-key-must-be-at-least-32-characters-long-AA'
process.env.KDTU_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
process.env.KDTU_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'

// Deterministic seed mirroring kdtu-data/build_summary.py (Jan-Sep 2026).
// Format: [bulan, location, sesi, category, title, quantity].
// Grand totals (per spec): Majalah=73, Risalah=23, Buku=33, Brosur=18,
// Lainnya=2, Total=149 across 9 months.
const SEED = [
  // Januari — totals: Maj=12, Ris=1, Buku=6, Bros=3, Lain=2, T=24
  ['2026-01', 'Halte Jameson', '4 Jan, 12.00-14.00 (Zelza)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-01', 'Halte Jameson', '4 Jan, 12.00-14.00 (Zelza)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-01', 'Halte Jameson', '4 Jan, 12.00-14.00 (Zelza)', 'Buku', 'Buku Kaum Muda Jilid 2 - 10 Pertanyaan Kaum Muda', 1],
  ['2026-01', 'Halte Jameson', '4 Jan, 12.00-14.00 (Zelza)', 'Risalah', 'Apa Pendapat Anda Tentang Masa Depan?', 1],
  ['2026-01', 'Halte Jameson', '4 Jan, 12.00-14.00 (Zelza)', 'Majalah', 'Menara Pengawal - Membuat Keputusan', 2],
  ['2026-01', 'Halte Jameson', '10 Jan, Sabtu (Melan)', 'Buku', 'Buku Kaum Muda Jilid 2', 1],
  ['2026-01', 'Halte Jameson', '10 Jan, Sabtu (Melan)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-01', 'Halte Jameson', '17 Jan (Doddy)', 'Buku', 'Buku Kaum Muda', 1],
  ['2026-01', 'Halte Jameson', '17 Jan (Doddy)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 3],
  ['2026-01', 'Halte Jameson', '18 Jan, 12.00-14.00 (Zelza)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-01', 'Halte Jameson', '18 Jan, 12.00-14.00 (Zelza)', 'Buku', 'Buku Kaum Muda Jilid 2', 1],
  ['2026-01', 'Halte Jameson', '18 Jan, 12.00-14.00 (Zelza)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-01', 'Halte Jameson', '18 Jan, 12.00-14.00 (Zelza)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 2],
  ['2026-01', 'Halte Jameson', '25 Jan, 12.00-14.00 (Deka)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-01', 'Halte Jameson', '31 Jan, 11.30 (Bara/Yuli/Lidia)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 3],
  ['2026-01', 'Halte Jameson', '31 Jan, 11.30 (Bara/Yuli/Lidia)', 'Lainnya', 'Kartu kontak', 2],

  // Februari — Maj=5, Ris=0, Buku=4, Bros=1, T=10
  ['2026-02', 'Halte Jameson', '1 Feb, 12.00-14.00 (Hamin)', 'Buku', 'Buku Kaum Muda Jilid 2', 1],
  ['2026-02', 'Halte Jameson', '1 Feb, 12.00-14.00 (Hamin)', 'Majalah', 'Sedarlah! - Hidup Bahagia Selamanya', 1],
  ['2026-02', 'Halte Jameson', '1 Feb, 12.00-14.00 (Hamin)', 'Majalah', 'Sedarlah! - Apakah Pencipta Memang Ada?', 1],
  ['2026-02', 'Halte Jameson', '8 Feb, 14.00-16.00 (Timo)', 'Buku', 'Buku Kaum Muda', 2],
  ['2026-02', 'Halte Jameson', '8 Feb, 14.00-16.00 (Timo)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 2],
  ['2026-02', 'Halte Jameson', '8 Feb, 14.00-16.00 (Timo)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 2],
  ['2026-02', 'Halte Jameson', '18 Feb, 11.00-13.00 (Abel)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 2],

  // Maret — Maj=4, Ris=2, Buku=3, Bros=2, T=11
  ['2026-03', 'Halte Jameson', '8 Mar, 12.00-14.00 (Hamin)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-03', 'Halte Jameson', '8 Mar, 12.00-14.00 (Hamin)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-03', 'Halte Jameson', '11 Mar, 11.00-13.00 (Abel)', 'Risalah', 'Undangan Peringatan', 1],
  ['2026-03', 'Halte Jameson', '11 Mar, 11.00-13.00 (Abel)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-03', 'Halte Jameson', '14 Mar, 11.00-13.00 (Jefta)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-03', 'Halte Jameson', '14 Mar, 11.00-13.00 (Jefta)', 'Buku', '10 Pertanyaan Kaum Muda (Buku Kecil)', 1],
  ['2026-03', 'Halte Jameson', '15 Mar, 12.00-14.00 (Timo)', 'Buku', 'Buku Kaum Muda', 1],
  ['2026-03', 'Halte Jameson', '15 Mar, 12.00-14.00 (Timo)', 'Majalah', 'Menara Pengawal - Apakah Allah Peduli', 2],
  ['2026-03', 'Halte Jameson', '15 Mar, 12.00-14.00 (Timo)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-03', 'Halte Jameson', '15 Mar, 12.00-14.00 (Timo)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-03', 'Halte Jameson', '15 Mar, 12.00-14.00 (Timo)', 'Risalah', 'Undangan Peringatan', 1],

  // April — Maj=0, Ris=0, Buku=0, Bros=1, T=1
  ['2026-04', 'Indomaret AKR', '10 Apr (Zelza)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],

  // Mei — Maj=8, Ris=2, Buku=4, Bros=2, T=16
  ['2026-05', 'Halte Jameson', '23 Mei (Randy)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-05', 'Halte Jameson', '23 Mei (Randy)', 'Buku', 'Buku Kaum Muda Jilid 2', 1],
  ['2026-05', 'Halte Jameson', '23 Mei (Randy)', 'Majalah', 'Sedarlah! - Stres', 2],
  ['2026-05', 'Halte Jameson', '23 Mei (Randy)', 'Majalah', 'Sedarlah! - Perang', 1],
  ['2026-05', 'Halte Jameson', '23 Mei (Randy)', 'Risalah', 'Apa Kunci Kebahagiaan Keluarga?', 1],
  ['2026-05', 'Halte Jameson', '23 Mei (Randy)', 'Risalah', 'Mungkinkah Penderitaan Berakhir?', 1],
  ['2026-05', 'Halte Jameson', '24 Mei, 12.00-13.40 (Timo)', 'Buku', 'Buku Kaum Muda', 1],
  ['2026-05', 'Halte Jameson', '24 Mei, 12.00-13.40 (Timo)', 'Majalah', 'Majalah (3 eks, tidak dirinci)', 3],
  ['2026-05', 'Halte Jameson', '24 Mei, 12.00-13.40 (Timo)', 'Brosur', 'Brosur (2 eks, tidak dirinci)', 2],
  ['2026-05', 'Halte Jameson', '31 Mei, 12.00-14.00 (Restu)', 'Majalah', 'Majalah (2 eks, tidak dirinci)', 2],

  // Juni — Maj=10, Ris=7, Buku=2, T=19
  ['2026-06', 'Halte Jameson', '6 Jun, Sabtu (Melan)', 'Majalah', 'Majalah (2 eks, tidak dirinci)', 2],
  ['2026-06', 'Halte Jameson', '6 Jun, Sabtu (Melan)', 'Risalah', 'Undangan (6 eks)', 6],
  ['2026-06', 'Halte Jameson', '7 Jun, 14.00-16.00 (Orlando)', 'Majalah', 'Majalah (1 eks)', 1],
  ['2026-06', 'Halte Jameson', '7 Jun, 14.00-16.00 (Orlando)', 'Buku', 'Buku (1 eks, tidak dirinci)', 1],
  ['2026-06', 'Halte Jameson', '7 Jun, 12.00-14.00 (Hizkia)', 'Majalah', 'Majalah (1 eks)', 1],
  ['2026-06', 'Halte Jameson', '10 Jun, 11.00-13.00 (Restu)', 'Majalah', 'Majalah (1 eks)', 1],
  ['2026-06', 'Halte Jameson', '21 Jun, 14.00-16.00 (Zelza)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-06', 'Halte Jameson', '21 Jun, 14.00-16.00 (Zelza)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 2],
  ['2026-06', 'Halte Jameson', '21 Jun, 14.00-16.00 (Zelza)', 'Risalah', 'Mungkinkah Penderitaan Berakhir?', 1],
  ['2026-06', 'Halte Jameson', '21 Jun, 14.00-16.00 (Zelza)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-06', 'Halte Jameson', '21 Jun, 14.00-16.00 (Zelza)', 'Risalah', 'Undangan Pertemuan Regional', 1],

  // Juli — Maj=12, Ris=3, Buku=6, Bros=0, T=21
  ['2026-07', 'Halte Jameson', '6 Jul, 12.00-14.00 (Melan)', 'Buku', 'Buku Kaum Muda Jilid 1', 2],
  ['2026-07', 'Halte Jameson', '6 Jul, 12.00-14.00 (Melan)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-07', 'Halte Jameson', '15 Jul (Yunus)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 1],
  ['2026-07', 'Halte Jameson', '15 Jul (Yunus)', 'Majalah', 'Sedarlah! - Hidup Bahagia Selamanya', 2],
  ['2026-07', 'Halte Jameson', '15 Jul (Yunus)', 'Majalah', 'Menara Pengawal - Nasihat Terbaik', 1],
  ['2026-07', 'Halte Jameson', '19 Jul, 12.00-14.00 (Hamin)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-07', 'Halte Jameson', '19 Jul, 12.00-14.00 (Hamin)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-07', 'Halte Jameson', '19 Jul, 14.00-16.00 (Yohanes)', 'Buku', 'Buku Kaum Muda Jilid 2', 2],
  ['2026-07', 'Halte Jameson', '19 Jul, 14.00-16.00 (Yohanes)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-07', 'Halte Jameson', '19 Jul, 14.00-16.00 (Yohanes)', 'Majalah', 'Menara Pengawal - Membuat Keputusan', 1],
  ['2026-07', 'Halte Jameson', '19 Jul, 14.00-16.00 (Yohanes)', 'Risalah', 'Risalah Situs Web', 2],
  ['2026-07', 'Halte Jameson', '26 Jul, 14.00-16.00 (Randy)', 'Risalah', 'Apa Kunci Kebahagiaan Keluarga?', 2],
  ['2026-07', 'Halte Jameson', '29 Jul, 11.00-13.00 (Eka)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 2],
  ['2026-07', 'Halte Jameson', '29 Jul, 11.00-13.00 (Eka)', 'Majalah', 'Menara Pengawal - Apakah Allah Peduli', 1],

  // Agustus — Maj=14, Ris=4, Buku=3, Bros=4, T=25
  ['2026-08', 'Halte Jameson', '1 Aug (Zelza)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-08', 'Halte Jameson', '1 Aug (Zelza)', 'Majalah', 'Sedarlah! - Kenaikan Harga', 2],
  ['2026-08', 'Halte Jameson', '1 Aug (Zelza)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-08', 'Halte Jameson', '5 Aug (Yunus)', 'Buku', 'Kaum Muda Jilid 1', 2],
  ['2026-08', 'Halte Jameson', '5 Aug (Yunus)', 'Majalah', 'Menara Pengawal - Kenaikan Harga', 1],
  ['2026-08', 'Halte Jameson', '5 Aug (Yunus)', 'Majalah', 'Sedarlah! - Hidup Bahagia Selamanya', 3],
  ['2026-08', 'Halte Jameson', '5 Aug (Yunus)', 'Risalah', 'Risalah (1 eks)', 1],
  ['2026-08', 'Halte Jameson', '8 Aug, 11.00-13.00 (Harli)', 'Brosur', 'Benarkah Kehidupan diciptakan?', 1],
  ['2026-08', 'Halte Jameson', '8 Aug, 11.00-13.00 (Harli)', 'Majalah', 'Sedarlah! - Apakah Allah peduli kepada Anda?', 2],
  ['2026-08', 'Halte Jameson', '8 Aug, 11.00-13.00 (Harli)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-08', 'Halte Jameson', '9 Aug, 12.00-14.00 (Restu)', 'Buku', 'Kaum Muda Jilid 1', 1],
  ['2026-08', 'Halte Jameson', '9 Aug, 12.00-14.00 (Restu)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-08', 'Halte Jameson', '9 Aug, 12.00-14.00 (Restu)', 'Majalah', 'Sedarlah! - Apakah Allah peduli kepada Anda?', 1],
  ['2026-08', 'Halte Jameson', 'Backlog 26 Jul-9 Aug', 'Risalah', 'Apa Kunci Kebahagiaan Keluarga?', 1],
  ['2026-08', 'Halte Jameson', 'Backlog 26 Jul-9 Aug', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-08', 'Halte Jameson', 'Backlog 26 Jul-9 Aug', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-08', 'Halte Jameson', '19 Aug, 11.00-13.00 (Harli)', 'Majalah', 'Menara Pengawal - Apakah Pencipta Memang Ada?', 1],
  ['2026-08', 'Halte Jameson', '22 Aug, 11.00-13.00 (Hamin)', 'Majalah', 'Sedarlah! - Hidup Bahagia Selamanya', 1],
  ['2026-08', 'Halte Jameson', '22 Aug, 11.00-13.00 (Hamin)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-08', 'Halte Jameson', '30 Aug, 12.00-14.00 (Arkhelai)', 'Majalah', 'Sedarlah! - Mau Bebas dari Stres?', 1],
  ['2026-08', 'Halte Jameson', '30 Aug, 12.00-14.00 (Arkhelai)', 'Risalah', 'Siapa yang Bisa Memberi Kita Nasihat Terbaik?', 2],
  ['2026-08', 'Halte Jameson', '30 Aug, 12.00-14.00 (Arkhelai)', 'Risalah', 'Apa Kunci Kebahagiaan Keluarga?', 1],

  // September — Maj=8, Ris=4, Buku=5, Bros=5, T=22
  ['2026-09', 'Halte Gramedia', '2 Sep, 06.30-08.30 (Restu)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-09', 'Indomaret AKR', '4 Sep (Harli)', 'Buku', 'Pertanyaan Kaum Muda - Jawaban Praktis Jilid 1', 1],
  ['2026-09', 'Indomaret AKR', '4 Sep (Harli)', 'Risalah', 'Bagaimana caranya keluarga bisa bahagia? (edisi baru kecil)', 1],
  ['2026-09', 'Halte Gramedia', '9 Sep (Deka)', 'Majalah', 'Menara Pengawal - Apakah Pencipta memang ada?', 1],
  ['2026-09', 'Indomaret AKR', '11 Sep (Restu)', 'Buku', 'Pertanyaan Kaum Muda - Jawaban Praktis Jilid 2', 1],
  ['2026-09', 'Indomaret AKR', '11 Sep (Restu)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-09', 'Halte Jameson', '12 Sep, 11.00-13.00 (Melan)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-09', 'Halte Jameson', '12 Sep, 11.00-13.00 (Melan)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 1],
  ['2026-09', 'Halte Jameson', '13 Sep, 12.00-14.00 (Jordan)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia', 1],
  ['2026-09', 'Halte Jameson', '13 Sep, 12.00-14.00 (Jordan)', 'Majalah', 'Sedarlah! - 12 Kunci Keluarga Bahagia (extra)', 1],
  ['2026-09', 'Halte Jameson', '13 Sep, 12.00-14.00 (Jordan)', 'Buku', 'Alkitab (pengembalian)', 1],
  ['2026-09', 'Halte Jameson', '13 Sep Sore (Deka)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-09', 'Halte Jameson', '13 Sep Sore (Deka)', 'Brosur', 'Hidup Bahagia Selamanya! - Pengantar Pelajaran Alkitab', 2],
  ['2026-09', 'Halte Jameson', '6 Sep, 12.00-14.00 (Hamin)', 'Majalah', 'Menara Pengawal - Apakah Allah peduli kepada Anda?', 2],
  ['2026-09', 'Halte Jameson', '6 Sep, 12.00-14.00 (Hamin)', 'Majalah', 'Sedarlah! - Hidup Bahagia Selamanya', 2],
  ['2026-09', 'Halte Jameson', '6 Sep, 12.00-14.00 (Hamin)', 'Brosur', 'Siapa yang Memberi Kita Nasihat Terbaik', 1],
  ['2026-09', 'Halte Jameson', '6 Sep, 12.00-14.00 (Hamin)', 'Buku', 'Buku Kaum Muda Jilid 1', 1],
  ['2026-09', 'Halte Jameson', '6 Sep, 12.00-14.00 (Hamin)', 'Buku', 'Buku Kaum Muda Jilid 2', 1],
]

// ---- Mock DB --------------------------------------------------------------
// Mirrors the helper in tests/helpers/testApp.js but adds kdtu_summary_entries
// + timetable_periods so the summary router has the tables it needs.

const SCHEMA_TABLES = ['admins', 'members', 'refresh_tokens', 'audit_log', 'timetable_periods', 'kdtu_summary_entries']

function createMockDb () {
  const tables = Object.fromEntries(SCHEMA_TABLES.map(t => [t, []]))
  const autoInc = { admins: 0, members: 0, audit_log: 0, timetable_periods: 0, kdtu_summary_entries: 0 }

  function nextId (table) {
    if (!(table in autoInc)) throw new Error(`no autoinc for ${table}`)
    autoInc[table] += 1
    return autoInc[table]
  }

  function prepare (sql) {
    const trimmed = sql.trim()
    const upper = trimmed.toUpperCase()

    return {
      get (...params) { return this._get(...params) },
      all (...params) { return this._all(...params) },
      run (...params) { return this._run(...params) },

      _get (...params) {
        if (/FROM\s+ADMINS/i.test(trimmed) && /WHERE\s+USERNAME\s*=\s*\?/i.test(trimmed)) {
          return tables.admins.find(a => a.username === params[0])
        }
        if (/FROM\s+ADMINS/i.test(trimmed) && /WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
          return tables.admins.find(a => a.id === params[0])
        }
        if (/FROM\s+MEMBERS/i.test(trimmed) && /WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
          return tables.members.find(m => m.id === params[0])
        }
        if (/FROM\s+TIMETABLE_PERIODS/i.test(trimmed) && /WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
          return tables.timetable_periods.find(p => p.id === params[0])
        }
        if (/FROM\s+KDTU_SUMMARY_ENTRIES/i.test(trimmed) && /WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
          return tables.kdtu_summary_entries.find(e => e.id === params[0])
        }
        return undefined
      },

      _all (...params) {
        // Year aggregate
        if (/FROM\s+KDTU_SUMMARY_ENTRIES/i.test(trimmed) &&
            /SUM\(CASE/.test(upper) &&
            /GROUP\s+BY\s+BULAN/i.test(upper)) {
          const like = String(params[0]).replace(/%/g, '')
          const matching = tables.kdtu_summary_entries.filter(e => e.bulan.startsWith(like))
          const byMonth = {}
          for (const e of matching) {
            const b = byMonth[e.bulan] || { bulan: e.bulan, Majalah: 0, Risalah: 0, Buku: 0, Brosur: 0, Lainnya: 0, total: 0 }
            b[e.category] = (b[e.category] || 0) + e.quantity
            b.total += e.quantity
            byMonth[e.bulan] = b
          }
          return Object.keys(byMonth).sort().map(b => {
            const r = byMonth[b]
            return {
              bulan: r.bulan,
              majalah: r.Majalah, risalah: r.Risalah, buku: r.Buku,
              brosur: r.Brosur, lainnya: r.Lainnya, total: r.total,
            }
          })
        }
        // Detail entries (year or month)
        if (/FROM\s+KDTU_SUMMARY_ENTRIES/i.test(trimmed)) {
          if (/WHERE\s+BULAN\s+LIKE\s+\?/i.test(trimmed)) {
            const like = String(params[0]).replace(/%/g, '')
            return tables.kdtu_summary_entries.filter(e => e.bulan.startsWith(like))
          }
          if (/WHERE\s+BULAN\s+=\s*\?/i.test(trimmed)) {
            return tables.kdtu_summary_entries.filter(e => e.bulan === params[0])
          }
          return [...tables.kdtu_summary_entries]
        }
        return []
      },

      _run (...params) {
        if (upper.startsWith('INSERT INTO ADMINS')) {
          const id = nextId('admins')
          tables.admins.push({ id, username: params[0], password_hash: params[1], display_name: params[2] })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO MEMBERS')) {
          const id = nextId('members')
          tables.members.push({
            id, name_enc: params[0], pin_hash: params[1],
            active: params[2] === undefined ? 1 : params[2],
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO REFRESH_TOKENS')) {
          tables.refresh_tokens.push({
            jti: params[0], user_id: params[1], role: params[2],
            token_hash: params[3], expires_at: params[4], revoked_at: null,
          })
          return { changes: 1 }
        }
        if (upper.startsWith('INSERT INTO AUDIT_LOG')) {
          const id = nextId('audit_log')
          tables.audit_log.push({
            id, actor: params[0], action: params[1], resource: params[2],
            details: params[3], created_at: params[4],
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO TIMETABLE_PERIODS')) {
          const id = nextId('timetable_periods')
          tables.timetable_periods.push({ id, label: params[0], starts_on: params[1], ends_on: params[2], notes: params[3] })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO KDTU_SUMMARY_ENTRIES')) {
          const id = nextId('kdtu_summary_entries')
          tables.kdtu_summary_entries.push({
            id,
            period_id: params[0],
            bulan: params[1],
            location: params[2],
            sesi: params[3],
            category: params[4],
            title: params[5],
            quantity: params[6],
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('UPDATE KDTU_SUMMARY_ENTRIES')) {
          const id = params[params.length - 1]
          const entry = tables.kdtu_summary_entries.find(e => e.id === id)
          if (!entry) return { changes: 0 }
          entry.period_id = params[0]
          entry.bulan     = params[1]
          entry.location  = params[2]
          entry.sesi      = params[3]
          entry.category  = params[4]
          entry.title     = params[5]
          entry.quantity  = params[6]
          return { changes: 1 }
        }
        if (upper.startsWith('DELETE FROM KDTU_SUMMARY_ENTRIES')) {
          const id = params[0]
          const before = tables.kdtu_summary_entries.length
          tables.kdtu_summary_entries = tables.kdtu_summary_entries.filter(e => e.id !== id)
          return { changes: before - tables.kdtu_summary_entries.length }
        }
        if (upper.startsWith('UPDATE REFRESH_TOKENS')) {
          let changes = 0
          if (/WHERE\s+JTI\s*=\s*\?/i.test(trimmed)) {
            const jti = params[1], ts = params[0]
            for (const r of tables.refresh_tokens) if (r.jti === jti && !r.revoked_at) { r.revoked_at = ts; changes += 1 }
          } else if (/WHERE\s+TOKEN_HASH\s*=\s*\?/i.test(trimmed)) {
            const h = params[1], ts = params[0]
            for (const r of tables.refresh_tokens) if (r.token_hash === h && !r.revoked_at) { r.revoked_at = ts; changes += 1 }
          } else if (/WHERE\s+USER_ID\s*=\s*\?/i.test(trimmed)) {
            const uid = params[1], ts = params[0]
            for (const r of tables.refresh_tokens) if (r.user_id === uid && !r.revoked_at) { r.revoked_at = ts; changes += 1 }
          }
          return { changes }
        }
        throw new Error(`mock db: unhandled run(): ${trimmed}`)
      },
    }
  }

  return {
    prepare, exec: () => {}, transaction: (fn) => (...args) => fn(...args),
    close: () => {}, pragma: () => {}, _tables: tables,
  }
}

// ---- App setup ------------------------------------------------------------

let app, db, adminToken

beforeAll(async () => {
  process.env.KDTU_FIELD_KEY = 'test-field-key-test-field-key-test-field-AB'
  db = createMockDb()
  const hash = await argon2.hash('correct-horse-battery-staple', { type: argon2.argon2id })
  db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)').run('admin', hash, 'admin')

  // Seed a single timetable_period for 2026 (the FK target for all entries).
  db.prepare('INSERT INTO timetable_periods (id, label, starts_on, ends_on, notes) VALUES (?, ?, ?, ?, ?)')
    .run(1, '2026', '2026-01-01', '2026-12-31', null)
  // Reset autoinc to start after the seeded id so future inserts don't clash.
  // (Our mock always increments, so we skip 1 by inserting then never reusing.)

  // Bulk-insert entries (no FK check in mock, so direct insert is fine).
  for (const [bulan, location, sesi, category, title, quantity] of SEED) {
    db.prepare(`INSERT INTO kdtu_summary_entries
      (period_id, bulan, location, sesi, category, title, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(1, bulan, location, sesi, category, title, quantity)
  }

  const { createApp } = await import('../src/index.js')
  const { createSummaryRouter } = await import('../src/routes/summary.js')
  app = createApp({ db })
  app.use('/api', createSummaryRouter())

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'correct-horse-battery-staple' })
  adminToken = login.body.accessToken
})

afterAll(() => { if (db) db.close() })

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` })

// ---- Tests ----------------------------------------------------------------

describe('GET /api/summary/kdtu?year=2026', () => {
  it('returns 9 monthly rows with correct totals matching the xlsx seed', async () => {
    const res = await request(app).get('/api/summary/kdtu?year=2026').set(adminAuth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.months)).toBe(true)
    expect(res.body.months).toHaveLength(9)

    // Sum across all months and assert against the spec totals.
    const sum = res.body.months.reduce((acc, m) => {
      acc.majalah += m.majalah
      acc.risalah += m.risalah
      acc.buku    += m.buku
      acc.brosur  += m.brosur
      acc.lainnya += m.lainnya
      acc.total   += m.total
      return acc
    }, { majalah: 0, risalah: 0, buku: 0, brosur: 0, lainnya: 0, total: 0 })

    expect(sum.majalah).toBe(73)
    expect(sum.risalah).toBe(23)
    expect(sum.buku).toBe(33)
    expect(sum.brosur).toBe(18)
    expect(sum.lainnya).toBe(2)
    expect(sum.total).toBe(149)

    // First row should be 2026-01 and the last 2026-09, ordered ascending.
    expect(res.body.months[0].month).toBe('2026-01')
    expect(res.body.months[8].month).toBe('2026-09')

    // entries[] is the raw drill-down source.
    expect(Array.isArray(res.body.entries)).toBe(true)
    expect(res.body.entries.length).toBe(SEED.length)
  })

  it('returns 400 for an invalid year', async () => {
    const res = await request(app).get('/api/summary/kdtu?year=abc').set(adminAuth())
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })
})

describe('GET /api/summary/kdtu/:bulan', () => {
  it('returns entry rows for 2026-09', async () => {
    const res = await request(app).get('/api/summary/kdtu/2026-09').set(adminAuth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    for (const e of res.body) {
      expect(e.bulan).toBe('2026-09')
      expect(e).toHaveProperty('location')
      expect(e).toHaveProperty('sesi')
      expect(e).toHaveProperty('title')
      expect(e).toHaveProperty('quantity')
    }
  })

  it('returns 400 for a malformed bulan', async () => {
    const res = await request(app).get('/api/summary/kdtu/not-a-month').set(adminAuth())
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })
})

describe('POST /api/summary/kdtu (admin)', () => {
  it('creates a new entry and returns 201', async () => {
    const res = await request(app)
      .post('/api/summary/kdtu')
      .set(adminAuth())
      .send({
        periodId: 1, bulan: '2026-09', location: 'Test Loc', sesi: 'New session',
        category: 'Majalah', title: 'Test entry', quantity: 5,
      })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeGreaterThan(0)
    expect(res.body.title).toBe('Test entry')
    expect(res.body.quantity).toBe(5)
  })

  it('returns 400 for bad bulan format', async () => {
    const res = await request(app)
      .post('/api/summary/kdtu')
      .set(adminAuth())
      .send({
        periodId: 1, bulan: '2026-13', location: 'x', sesi: 'y',
        category: 'Majalah', title: 'z', quantity: 1,
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
    expect(res.body.fields?.bulan).toBeTruthy()
  })

  it('rejects an invalid category', async () => {
    const res = await request(app)
      .post('/api/summary/kdtu')
      .set(adminAuth())
      .send({
        periodId: 1, bulan: '2026-09', location: 'x', sesi: 'y',
        category: 'NotARealCategory', title: 'z', quantity: 1,
      })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/summary/kdtu/:id (admin)', () => {
  it('updates quantity', async () => {
    // Create an entry, then PATCH it.
    const created = await request(app)
      .post('/api/summary/kdtu').set(adminAuth()).send({
        periodId: 1, bulan: '2026-09', location: 'L', sesi: 'S',
        category: 'Buku', title: 'Original', quantity: 3,
      })
    const id = created.body.id
    const upd = await request(app)
      .put(`/api/summary/kdtu/${id}`).set(adminAuth()).send({ quantity: 10 })
    expect(upd.status).toBe(200)
    expect(upd.body.quantity).toBe(10)
    expect(upd.body.id).toBe(id)
  })

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .put('/api/summary/kdtu/99999').set(adminAuth()).send({ quantity: 1 })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/summary/kdtu/:id (admin)', () => {
  it('removes the entry', async () => {
    const created = await request(app)
      .post('/api/summary/kdtu').set(adminAuth()).send({
        periodId: 1, bulan: '2026-09', location: 'L', sesi: 'S',
        category: 'Brosur', title: 'Bye', quantity: 1,
      })
    const id = created.body.id
    const del = await request(app).delete(`/api/summary/kdtu/${id}`).set(adminAuth())
    expect(del.status).toBe(204)
    const get = await request(app).get(`/api/summary/kdtu/id/${id}`).set(adminAuth())
    expect(get.status).toBe(404)
  })
})
