#!/usr/bin/env node
/**
 * Download kartu daerah images from Google Drive folder.
 * Run: node scripts/download-cards.js
 *
 * Requires: npm install -D node-fetch@2
 * Images are saved to: public/kartu/
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const FOLDER_ID = '1nm-RNERi0jW9DIZu5e2Xs8aR1GxDCN9Y'
const OUT_DIR = path.join(__dirname, '..', 'public', 'kartu')

// All expected area names from AREA_DATA
const AREA_NAMES = [
  '001','002','003','004','005','006','007','008','009','010',
  '011','012','013','014','015','016','017','018','019','020',
  '021','022','023','024','025','026','027','028','029','030',
  '031','032','033','034','035','036','037','038','039','040',
  '041','042','043','044','045','046','047','048','049','050',
  '051','052','053','054','055','056','057','058','059','060',
  '061','062','063','064','065','066','067','068','069','070',
  '071','072','073','074','075','076','077','078','079','080',
  '081','082','083','084','085','086','087','088','089','090',
  '091','092','093','094','095','096','097','098','099','100',
  '101','102','103','104','105','106','107','108','109','110',
  '111','112','113','114','115','116','117','118','119','120',
  '121','122','123','124','125','126','127','128','129','130',
  '131','132','133','134','135','136','137','138','139','140',
  '141','142','143','144','145','146','147','148','149','150',
  'U01','U02','U03',
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const protocol = url.startsWith('https') ? https : http

    function get(url) {
      protocol.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close()
          return get(res.headers.location)
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlink(dest, () => {})
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      }).on('error', (err) => {
        file.close()
        fs.unlink(dest, () => {})
        reject(err)
      })
    }

    get(url)
  })
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`Downloading ${AREA_NAMES.length} images to ${OUT_DIR}\n`)
  console.log('NOTE: This script uses Google Drive direct-download URLs.')
  console.log('If files fail (quota / auth), download them manually from:')
  console.log(`  https://drive.google.com/drive/folders/${FOLDER_ID}\n`)

  let ok = 0, skip = 0, fail = 0

  for (const name of AREA_NAMES) {
    const dest = path.join(OUT_DIR, `${name}.png`)
    if (fs.existsSync(dest)) {
      console.log(`  SKIP  ${name}.png (exists)`)
      skip++
      continue
    }

    // Try Google Drive export URL — requires the file to be shared "Anyone with link"
    // You must fill in FILE_IDS below after getting them from the Drive folder.
    const fileId = FILE_IDS[name]
    if (!fileId) {
      console.log(`  MISS  ${name}.png (no file ID — add it to FILE_IDS below)`)
      fail++
      continue
    }

    const url = `https://drive.google.com/uc?export=download&id=${fileId}`
    try {
      await download(url, dest)
      console.log(`  OK    ${name}.png`)
      ok++
    } catch (e) {
      console.log(`  FAIL  ${name}.png — ${e.message}`)
      fail++
    }
  }

  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} missing/failed`)
}

// ─────────────────────────────────────────────────────────────
// Fill in Google Drive file IDs here.
// To get IDs: open the folder in Drive → right-click each file
// → "Get link" → copy the ID from the URL
//   https://drive.google.com/file/d/FILE_ID/view
//
// Or use the Google Drive API:
//   https://developers.google.com/drive/api/v3/reference/files/list
// ─────────────────────────────────────────────────────────────
const FILE_IDS = {
  // '001': 'PASTE_FILE_ID_HERE',
  // '002': 'PASTE_FILE_ID_HERE',
  // ...add all 153 entries
}

main().catch(console.error)
