// Seeds the KDTU database from the xlsx files at ../kdtu-data/.
//
// Idempotent: uses INSERT OR IGNORE on UNIQUE columns. Safe to re-run.
//
// Deterministic 4-digit PIN for each seeded member:
//   pin = ((name.length + sum(name.charCodeAt(i))) % 10000)
//   Zero-padded to 4 digits. Documented in tests/db.test.js + member docs.
//   Argon2id hash of that PIN is stored in pin_hash so plaintext PINs are
//   never written to disk.
//
// Usage: `node scripts/seed.js` (uses process.env KDTU_DB_KEY / KDTU_FIELD_KEY)
import { openDb, closeDb } from '../src/db/index.js'
import { encryptField, decryptField, deriveKey } from '../src/utils/crypto.js'
import argon2 from 'argon2'
import XLSX from 'xlsx'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', '..', '..', 'kdtu-data')
const TIMETABLE_XLSX = join(DATA_DIR, 'JADWAL PENUGASAN KDTU SIDANG SRENGSENG-3.xlsx')
const RINGKASAN_XLSX = join(DATA_DIR, 'Ringkasan_KDTU_2026.xlsx')

const TIMETABLE_MONTHS = [
  { sheet: 'February 2026',          label: 'Februari 2026', iso: '2026-02-01', ends: '2026-02-28' },
  { sheet: 'Maret 2026 (on Progress)', label: 'Maret 2026',   iso: '2026-03-01', ends: '2026-03-31' },
  { sheet: 'April 2026',             label: 'April 2026',    iso: '2026-04-01', ends: '2026-04-30' },
  { sheet: 'Mei 2026',               label: 'Mei 2026',      iso: '2026-05-01', ends: '2026-05-31' },
  { sheet: 'Juni 2026',              label: 'Juni 2026',     iso: '2026-06-01', ends: '2026-06-30' },
  { sheet: 'Juli 2026',              label: 'Juli 2026',     iso: '2026-07-01', ends: '2026-07-31' },
  { sheet: 'Agustus 2026',           label: 'Agustus 2026',  iso: '2026-08-01', ends: '2026-08-31' },
  { sheet: 'September 2026',         label: 'September 2026', iso: '2026-09-01', ends: '2026-09-30' },
]
// Master Data summary sheet also contains Januari 2026 rows; register that
// period so summary inserts satisfy the NOT NULL on period_id.
const SUMMARY_MONTHS = [
  { label: 'Januari 2026', iso: '2026-01-01', ends: '2026-01-31' },
  ...TIMETABLE_MONTHS,
]

const VALID_CATEGORIES = new Set(['Majalah', 'Risalah', 'Buku', 'Brosur', 'Lainnya'])

function deterministicPin(name) {
  let sum = name.length
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  const pin = (sum % 10000).toString().padStart(4, '0')
  return pin
}

function sheetRows(wb, sheetName) {
  const s = wb.Sheets[sheetName]
  if (!s) return []
  return XLSX.utils.sheet_to_json(s, { header: 1, defval: '', blankrows: false })
}

function cellDate(row, idx) {
  const v = row[idx]
  if (v === '' || v === null || v === undefined) return null
  // xlsx decodes Excel serial dates into JS Date objects when cellDates is set.
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    // Excel serial -> JS Date (1900 system, with the 1900 leap-year bug)
    const ms = (v - 25569) * 86400 * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function cellText(row, idx) {
  const v = row[idx]
  if (v === '' || v === null || v === undefined) return null
  return String(v).trim() || null
}

async function seed() {
  if (!existsSync(TIMETABLE_XLSX)) throw new Error(`Missing xlsx: ${TIMETABLE_XLSX}`)
  if (!existsSync(RINGKASAN_XLSX)) throw new Error(`Missing xlsx: ${RINGKASAN_XLSX}`)

  const db = openDb()
  const fieldKey = deriveKey(process.env.KDTU_FIELD_KEY)

  // --- admin ---
  const adminHash = await argon2.hash('admin12345', { type: argon2.argon2id })
  db.prepare(
    `INSERT OR IGNORE INTO admins (username, password_hash, display_name)
     VALUES (?, ?, ?)`
  ).run('admin', adminHash, 'Administrator')

  const ttWb = XLSX.readFile(TIMETABLE_XLSX, { cellDates: true })
  const rkWb = XLSX.readFile(RINGKASAN_XLSX, { cellDates: true })

  // --- participants + locations + periods + assignments ---
  const partSheet = ttWb.Sheets['Participants & Locations']
  const memberNames = []
  if (partSheet) {
    const rows = XLSX.utils.sheet_to_json(partSheet, { header: 1, defval: '', blankrows: false })
    for (let i = 1; i < rows.length; i++) {
      const name = cellText(rows[i], 0)
      const loc  = cellText(rows[i], 1)
      if (!name) continue
      memberNames.push({ name, loc })
      if (loc) {
        db.prepare(
          `INSERT OR IGNORE INTO locations (name, type) VALUES (?, 'JAGA')`
        ).run(loc)
      }
    }
  }

  const insertMember = db.prepare(
    `INSERT OR IGNORE INTO members (name_enc, phone_enc, pin_hash) VALUES (?, NULL, ?)`
  )
  // name_enc is a per-row nonced BLOB so INSERT OR IGNORE can't dedup by it.
  // Pre-load existing decrypted names and skip inserts that already exist.
  const existingNames = new Set()
  for (const row of db.prepare(`SELECT name_enc FROM members`).all()) {
    try { existingNames.add(decryptField(row.name_enc, fieldKey)) } catch {}
  }
  for (const { name } of memberNames) {
    if (existingNames.has(name)) continue
    const nameEnc = encryptField(name, fieldKey)
    const pin = deterministicPin(name)
    const pinHash = await argon2.hash(pin, { type: argon2.argon2id })
    insertMember.run(nameEnc, pinHash)
  }

  // name_enc is a per-row nonced BLOB so we cannot SELECT by encryptField(name)
  // and expect a match. Build a plaintext name -> id map by decrypting every row.
  const memberIdByName = new Map()
  for (const row of db.prepare(`SELECT id, name_enc FROM members`).all()) {
    try { memberIdByName.set(decryptField(row.name_enc, fieldKey), row.id) } catch {}
  }

  // --- periods ---
  const insertPeriod = db.prepare(
    `INSERT OR IGNORE INTO timetable_periods (label, starts_on, ends_on, notes)
     VALUES (?, ?, ?, ?)`
  )
  for (const m of SUMMARY_MONTHS) insertPeriod.run(m.label, m.iso, m.ends, null)

  const findPeriodId = db.prepare(`SELECT id FROM timetable_periods WHERE label = ?`)
  const periodIdByLabel = new Map()
  for (const m of SUMMARY_MONTHS) {
    periodIdByLabel.set(m.label, findPeriodId.get(m.label).id)
  }

  // --- assignments + assignment_members ---
  // Layout (per month sheet):
  //   row 4 (0-indexed) = column header. Columns:
  //     0 HARI/JAM, 1 LOKASI JAGA, 2 JAM,
  //     3,5,7,9,11  = TANGGAL PENUGASAN (5 dates per RABU block, alternating groups)
  //     4,6,8,10,12 = participant names under each date (or "TIDAK DIADAKAN")
  //     13 = LOKASI RAK BERODA/ STAND, 14 = POSTER RAK BERODA/STAND, 15 = SET RAKROD
  //   Pattern repeats for JUMAT/SABTU/MINGGU groups.
  // We treat each non-empty date as one assignment in 'EARLY' slot, with the
  // participant under it. (The xlsx does not actually distinguish EARLY/LATE
  // explicitly; we default to 'EARLY' which satisfies the schema CHECK.)
  const insertAssign = db.prepare(
    `INSERT INTO timetable_assignments
       (period_id, day, slot, jam, date, lokasi_jaga,
        lokasi_rak_beroda, poster_rak_beroda, set_rakrod)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertAssignMember = db.prepare(
    `INSERT OR IGNORE INTO timetable_assignment_members
       (assignment_id, member_id, position) VALUES (?, ?, ?)`
  )

  // Pre-load existing assignments so re-runs don't duplicate them.
  // Key by (period_id, day, date, lokasi_jaga, jam) which is the natural
  // uniqueness of a timetable slot.
  const existingAssign = new Set()
  for (const a of db.prepare(
    `SELECT period_id, day, date, lokasi_jaga, jam FROM timetable_assignments`
  ).all()) {
    existingAssign.add(`${a.period_id}\u0000${a.day}\u0000${a.date}\u0000${a.lokasi_jaga}\u0000${a.jam}`)
  }
  // Pre-load existing assignment_members to keep this idempotent too.
  const existingAssignMembers = new Set()
  for (const am of db.prepare(
    `SELECT assignment_id, member_id FROM timetable_assignment_members`
  ).all()) {
    existingAssignMembers.add(`${am.assignment_id}\u0000${am.member_id}`)
  }
  let assignmentsCount = 0
  for (const m of TIMETABLE_MONTHS) {
    const rows = sheetRows(ttWb, m.sheet)
    if (!rows.length) continue
    // The 'TANGGAL PENUGASAN' header is one merged cell covering multiple
    // date columns, so we detect date columns by scanning a known data row
    // for cells whose value is a JS Date instance.
    let dateCols = []
    for (let r = 2; r < Math.min(rows.length, 6); r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        if (rows[r][c] instanceof Date && !Number.isNaN(rows[r][c].getTime())) {
          dateCols.push(c)
        }
      }
      if (dateCols.length) break
    }
    const dayCol = 0, locCol = 1, jamCol = 2
    const rakLocCol = (rows[2] || []).length - 3
    const rakPosterCol = (rows[2] || []).length - 2
    const rakSetCol = (rows[2] || []).length - 1
    const periodId = periodIdByLabel.get(m.label)

    // Walk rows. A 'day block' starts on the row whose col 0 is a day label
    // and contains the dates + primary participant for the block. Subsequent
    // rows under it have empty col 0 and put participant names in the same
    // columns as the dates (the "TIDAK DIADAKAN" rows mean a date was skipped).
    let curDay = null, curLokasi = null, curJam = null, curRak = { loc: null, poster: null, set: null }
    let lastAssignIdByCol = {} // col index -> assignment id of the last day-header row in this block

    for (let r = 2; r < rows.length; r++) {
      const row = rows[r]
      const day = cellText(row, dayCol)
      const lokasi = cellText(row, locCol)
      const jam = cellText(row, jamCol)

      if (day && ['RABU','JUMAT','SABTU','MINGGU'].includes(day)) {
        // Start a new day block. Persist day/lokasi/jam and create assignments.
        curDay = day
        curLokasi = lokasi
        curJam = jam
        curRak.loc = cellText(row, rakLocCol)
        curRak.poster = cellText(row, rakPosterCol)
        curRak.set = cellText(row, rakSetCol)
        lastAssignIdByCol = {}
        if (!curLokasi || !curJam) continue

        for (const dc of dateCols) {
          const date = cellDate(row, dc)
          if (!date) continue
          const key = `${periodId}\u0000${curDay}\u0000${date}\u0000${curLokasi}\u0000${curJam}`
          if (existingAssign.has(key)) {
            // Find the existing assignment id so subsequent participant rows
            // can still link members to it.
            lastAssignIdByCol[dc] = db.prepare(
              `SELECT id FROM timetable_assignments
               WHERE period_id=? AND day=? AND date=? AND lokasi_jaga=? AND jam=?`
            ).get(periodId, curDay, date, curLokasi, curJam)?.id
            continue
          }
          const name = cellText(row, dc)
          const res = insertAssign.run(
            periodId, curDay, 'EARLY', curJam, date, curLokasi,
            curRak.loc, curRak.poster, curRak.set
          )
          assignmentsCount++
          existingAssign.add(key)
          lastAssignIdByCol[dc] = res.lastInsertRowid
          if (name && name !== 'TIDAK DIADAKAN') {
            const mid = memberIdByName.get(name) ?? null
            if (mid !== null) {
              const amKey = `${res.lastInsertRowid}\u0000${mid}`
              if (!existingAssignMembers.has(amKey)) {
                insertAssignMember.run(res.lastInsertRowid, mid, 0)
                existingAssignMembers.add(amKey)
              }
            }
          }
        }
        continue
      }

      // Participant row in the current day block.
      if (!curDay) continue
      for (const dc of dateCols) {
        const name = cellText(row, dc)
        if (!name || name === 'TIDAK DIADAKAN') continue
        const aid = lastAssignIdByCol[dc]
        if (!aid) continue
        const mid = memberIdByName.get(name) ?? null
        if (mid !== null) {
          const amKey = `${aid}\u0000${mid}`
          if (!existingAssignMembers.has(amKey)) {
            insertAssignMember.run(aid, mid, 0)
            existingAssignMembers.add(amKey)
          }
        }
      }
    }
  }

  // --- publications + summary entries from Ringkasan Master Data ---
  const masterRows = sheetRows(rkWb, 'Master Data')
  // Header is at row index 3: Bulan | Lokasi | Sesi | Kategori | Judul | Jumlah
  const insertPub = db.prepare(
    `INSERT OR IGNORE INTO publications (category, title, edition, stock) VALUES (?, ?, ?, ?)`
  )
  const findPubId = db.prepare(
    `SELECT id FROM publications WHERE category = ? AND title = ? AND IFNULL(edition, '') = ? LIMIT 1`
  )
  const insertSummary = db.prepare(
    `INSERT INTO kdtu_summary_entries
       (period_id, bulan, location, sesi, category, title, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  // SQLite UNIQUE treats NULL as distinct, so INSERT OR IGNORE alone lets
  // duplicate (category, title, edition=NULL) rows accumulate. Pre-load
  // existing publications and skip duplicates explicitly.
  const existingPubs = new Set()
  for (const p of db.prepare(`SELECT category, title, edition FROM publications`).all()) {
    existingPubs.add(`${p.category}\u0000${p.title}\u0000${p.edition ?? ''}`)
  }
  let pubCount = 0, summaryCount = 0
  for (let r = 4; r < masterRows.length; r++) {
    const row = masterRows[r]
    const bulan    = cellText(row, 0)
    const location = cellText(row, 1)
    const sesi     = cellText(row, 2)
    const category = cellText(row, 3)
    const title    = cellText(row, 4)
    const qtyRaw   = row[5]
    const qty = Number.isFinite(Number(qtyRaw)) ? Math.max(0, Math.trunc(Number(qtyRaw))) : 0
    if (!bulan || !title) continue
    if (!VALID_CATEGORIES.has(category)) continue

    // Normalize title (strip trailing "--" noise) and edition (after last " - ")
    let cleanTitle = title, edition = null
    const dashIdx = title.lastIndexOf(' - ')
    if (dashIdx > 0) {
      cleanTitle = title.slice(0, dashIdx).trim()
      edition = title.slice(dashIdx + 3).trim() || null
    }
    const key = `${category}\u0000${cleanTitle}\u0000${edition ?? ''}`
    if (!existingPubs.has(key)) {
      insertPub.run(category, cleanTitle, edition, 0)
      existingPubs.add(key)
      pubCount++
    }

    const pid = findPubId.get(category, cleanTitle, edition || '')?.id
    if (!pid) continue

    // Map bulan string -> period id (best effort)
    const periodId = periodIdByLabel.get(bulan) ?? null
    insertSummary.run(periodId, bulan, location, sesi, category, cleanTitle, qty)
    summaryCount++
  }

  const memberCount = db.prepare(`SELECT COUNT(*) AS c FROM members`).get().c
  const periodCount = db.prepare(`SELECT COUNT(*) AS c FROM timetable_periods`).get().c
  const pubTotal = db.prepare(`SELECT COUNT(*) AS c FROM publications`).get().c

  console.log(
    `Seeded ${memberCount} members, ${periodCount} periods, ${pubTotal} publications, ${summaryCount} summary rows`
  )
  console.log(`  (inserted ${assignmentsCount} assignments, ${pubCount} new publications)`)

  closeDb()
}

seed().catch((err) => {
  console.error('[seed] failed:', err)
  closeDb()
  process.exit(1)
})
