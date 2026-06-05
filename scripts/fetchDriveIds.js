#!/usr/bin/env node
/**
 * fetchDriveIds.js
 *
 * Fetches file IDs from the public Google Drive folder "KARTU DAERAH 2026"
 * and writes them to app/src/data/driveIds.js
 *
 * Usage (run from the territorycards project root on your Mac):
 *   node scripts/fetchDriveIds.js
 *
 * Or with an API key for more reliable results:
 *   DRIVE_API_KEY=your_key node scripts/fetchDriveIds.js
 *
 * The script tries three strategies in order:
 *   1. Google Drive API v3 with an API key (most reliable)
 *   2. Google Drive API v3 without a key (works for public folders)
 *   3. Scraping the folder HTML page (fallback)
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FOLDER_ID = '1nm-RNERi0jW9DIZu5e2Xs8aR1GxDCN9Y';
const OUTPUT_PATH = path.join(__dirname, '..', 'app', 'src', 'data', 'driveIds.js');
const API_KEY = process.env.DRIVE_API_KEY || '';

// ---- helpers ----------------------------------------------------------------

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,application/json',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        resolve(httpsGet(res.headers.location));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// ---- strategy 1: Drive API v3 -----------------------------------------------

async function fetchViaApi(apiKey) {
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  let url = `https://www.googleapis.com/drive/v3/files?q=%27${FOLDER_ID}%27+in+parents&fields=nextPageToken%2Cfiles(id%2Cname)&pageSize=200&orderBy=name${keyParam}`;
  const files = [];

  while (url) {
    const { status, body } = await httpsGet(url);
    if (status !== 200) throw new Error(`API returned status ${status}: ${body.substring(0, 200)}`);
    const json = JSON.parse(body);
    if (json.error) throw new Error(`API error: ${JSON.stringify(json.error)}`);
    files.push(...(json.files || []));
    url = json.nextPageToken
      ? `https://www.googleapis.com/drive/v3/files?q=%27${FOLDER_ID}%27+in+parents&fields=nextPageToken%2Cfiles(id%2Cname)&pageSize=200&orderBy=name&pageToken=${json.nextPageToken}${keyParam}`
      : null;
  }
  return files;
}

// ---- strategy 2: scrape HTML ------------------------------------------------

async function fetchViaHtml() {
  const { status, body } = await httpsGet(
    `https://drive.google.com/drive/folders/${FOLDER_ID}`
  );
  if (status !== 200 && status !== 0) throw new Error(`HTML fetch returned ${status}`);

  // Google Drive embeds file data as JSON in the HTML. The pattern is:
  // ["<name>",<stuff>,"<id>",...]
  // We look for IDs that appear near known filenames like "001.png"
  const fileMap = {};

  // Pattern: ["filename.png", ..., "fileId", ...]
  // The Drive page embeds arrays like: ["001.png","image/png","1AbcXyz..."]
  const re = /\["(\d{3}|U\d{2})\.png"[^\]]*?"(1[A-Za-z0-9_-]{28,})"/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    fileMap[match[1]] = match[2];
  }

  if (Object.keys(fileMap).length === 0) {
    // Try a broader pattern
    const re2 = /\[((?:"[^"]*",?\s*){1,10})\]/g;
    // Also try looking for all 1xxx IDs near filenames
    const re3 = /"((?:\d{3}|U\d{2})\.png).*?"(1[A-Za-z0-9_-]{28,})"/g;
    while ((match = re3.exec(body)) !== null) {
      const name = match[1].replace('.png', '');
      fileMap[name] = match[2];
    }
  }

  if (Object.keys(fileMap).length === 0) {
    throw new Error('Could not extract file IDs from HTML (page may require sign-in or use dynamic rendering)');
  }

  return Object.entries(fileMap).map(([name, id]) => ({ name: name + '.png', id }));
}

// ---- write output -----------------------------------------------------------

function buildOutput(files) {
  // Build a key -> id map from the file list
  const idMap = {};
  for (const file of files) {
    const name = file.name.replace(/\.png$/i, '');
    idMap[name] = file.id;
  }

  // Expected keys
  const keys = [];
  for (let i = 1; i <= 150; i++) keys.push(String(i).padStart(3, '0'));
  for (let i = 1; i <= 3; i++) keys.push(`U${String(i).padStart(2, '0')}`);

  const missing = keys.filter(k => !idMap[k]);
  if (missing.length > 0) {
    console.warn(`Warning: missing IDs for ${missing.length} keys: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
  }

  const lines = ['// Auto-generated by scripts/fetchDriveIds.js', 'export const DRIVE_FILE_IDS = {'];
  for (const k of keys) {
    lines.push(`  "${k}": "${idMap[k] || ''}",`);
  }
  lines.push('};', '');
  return lines.join('\n');
}

// ---- main -------------------------------------------------------------------

async function main() {
  console.log('Fetching file IDs from Google Drive folder:', FOLDER_ID);

  let files = null;

  // Strategy 1: API with key
  if (API_KEY) {
    console.log('Trying Drive API v3 with API key...');
    try {
      files = await fetchViaApi(API_KEY);
      console.log(`Got ${files.length} files via API (with key)`);
    } catch (e) {
      console.warn('API with key failed:', e.message);
    }
  }

  // Strategy 2: API without key (works for some public folders)
  if (!files) {
    console.log('Trying Drive API v3 without key...');
    try {
      files = await fetchViaApi('');
      console.log(`Got ${files.length} files via API (no key)`);
    } catch (e) {
      console.warn('API without key failed:', e.message);
    }
  }

  // Strategy 3: HTML scrape
  if (!files) {
    console.log('Trying HTML scrape...');
    try {
      files = await fetchViaHtml();
      console.log(`Got ${files.length} files via HTML scrape`);
    } catch (e) {
      console.warn('HTML scrape failed:', e.message);
    }
  }

  if (!files || files.length === 0) {
    console.error('All strategies failed. Please try:');
    console.error('  1. Get a Google API key at https://console.cloud.google.com/');
    console.error('     Enable the Google Drive API, create an API key, then run:');
    console.error('     DRIVE_API_KEY=your_key node scripts/fetchDriveIds.js');
    console.error('  2. Or manually copy IDs from the Drive folder (open a file,');
    console.error('     the ID is the long string in the URL after /file/d/)');
    process.exit(1);
  }

  const output = buildOutput(files);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
  console.log(`Written to: ${OUTPUT_PATH}`);

  // Print a sample
  const sample = files.slice(0, 3);
  console.log('Sample entries:');
  for (const f of sample) {
    const key = f.name.replace('.png', '');
    const url = `https://drive.google.com/uc?export=view&id=${f.id}`;
    console.log(`  ${key}: ${url}`);
  }
}

main().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
