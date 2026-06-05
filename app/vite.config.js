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

              res.statusCode = 302
              res.setHeader('Location', `https://drive.google.com/uc?export=view&id=${file.id}`)
              res.end()
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
