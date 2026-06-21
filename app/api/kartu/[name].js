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

  // Direct fetch for 013 — Drive search doesn't return this file despite it existing
  if (name === '013') {
    try {
      const imgResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/1NqmnAoyXy8kQfzJf-xkTt95nqnu5bTzX?alt=media&key=${apiKey}`
      )
      if (!imgResp.ok) {
        const text = await imgResp.text()
        return res.status(502).json({ error: 'Drive download error', detail: text })
      }
      res.setHeader('Content-Type', imgResp.headers.get('content-type') || 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400')
      const buffer = await imgResp.arrayBuffer()
      return res.status(200).send(Buffer.from(buffer))
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

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

    // Proxy via Drive API v3 — reliable, no virus-scan redirect
    const imgResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`
    )
    if (!imgResp.ok) {
      const text = await imgResp.text()
      return res.status(502).json({ error: 'Drive download error', detail: text })
    }
    res.setHeader('Content-Type', imgResp.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400')
    const buffer = await imgResp.arrayBuffer()
    res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
