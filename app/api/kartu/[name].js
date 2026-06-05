/**
 * Vercel serverless function — /api/kartu/[name]
 * Looks up the image file by name in the Google Drive folder,
 * then redirects the browser directly to the Drive image URL.
 *
 * Requires env var in Vercel dashboard:
 *   DRIVE_API_KEY  — a Google Cloud API key with Drive API enabled
 *   DRIVE_FOLDER_ID — 1nm-RNERi0jW9DIZu5e2Xs8aR1GxDCN9Y
 */

const FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1nm-RNERi0jW9DIZu5e2Xs8aR1GxDCN9Y'

export default async function handler(req, res) {
  const { name } = req.query
  const apiKey = process.env.DRIVE_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'DRIVE_API_KEY not set' })
  }

  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name' })
  }

  const filename = name.endsWith('.png') ? name : `${name}.png`

  try {
    const q = encodeURIComponent(`name='${filename}' and '${FOLDER_ID}' in parents and trashed=false`)
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&key=${apiKey}`

    const resp = await fetch(url)
    if (!resp.ok) {
      const text = await resp.text()
      return res.status(502).json({ error: 'Drive API error', detail: text })
    }

    const data = await resp.json()
    const file = data.files?.[0]

    if (!file) {
      return res.status(404).json({ error: `${filename} not found in Drive folder` })
    }

    // Cache for 5 minutes — short enough to pick up Drive updates quickly
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    res.redirect(302, `https://drive.google.com/uc?export=view&id=${file.id}`)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
