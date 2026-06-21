import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      {
        name: 'drive-api',
        configureServer(server) {
          server.middlewares.use('/api/kartu', async (req, res) => {
            const name = req.url.replace(/^\//, '').replace(/\.png$/, '')
            const apiKey = env.DRIVE_API_KEY
            const folderId = env.DRIVE_FOLDER_ID || '1nm-RNERi0jW9DIZu5e2Xs8aR1GxDCN9Y'

            if (!apiKey) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'DRIVE_API_KEY not set in .env.local' }))
              return
            }

            if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid name' }))
              return
            }

            const filename = `${name}.png`
            const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`)
            const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&key=${apiKey}`

            try {
              const resp = await fetch(url)
              const data = await resp.json()
              const file = data.files?.[0]

              if (!file) {
                res.statusCode = 404
                res.end(JSON.stringify({ error: `${filename} not found`, data }))
                return
              }

              // Proxy via Drive API v3 — reliable, no virus-scan redirect
              const imgResp = await fetch(
                `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`
              )
              if (!imgResp.ok) {
                res.statusCode = 502
                res.end(JSON.stringify({ error: 'Drive download error', status: imgResp.status }))
                return
              }
              res.statusCode = 200
              res.setHeader('Content-Type', imgResp.headers.get('content-type') || 'image/png')
              res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400')
              const buffer = await imgResp.arrayBuffer()
              res.end(Buffer.from(buffer))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        }
      }
    ]
  }
})
