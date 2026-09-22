// Tiny axios instance shared across kdtu-admin.
//
// All requests hit /api/* which the Vite dev server (and Vercel in
// production) proxies to the Express server. The Authorization header is
// attached from the Pinia auth store; on 401 we clear the store so the router
// guard can bounce the caller to /login.

import axios from 'axios'
import { useAdminAuthStore } from '../stores/auth.js'

export const http = axios.create({
  baseURL: '/',
  // The Express API uses an httpOnly cookie for refresh tokens in addition
  // to the bearer access token. We must send cookies so /api/auth/refresh can
  // rotate them on first request.
  withCredentials: true,
  headers: { 'content-type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const auth = useAdminAuthStore()
  if (auth.accessToken) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

http.interceptors.response.use(
  (r) => r,
  (err) => {
    // On 401 we drop the local session so the router guard can redirect.
    // 403 PASSWORD_RESET_REQUIRED is intentionally NOT cleared: the caller
    // can still inspect err.response.data.message and decide to render a
    // "rotate password" form.
    if (err?.response?.status === 401) {
      const auth = useAdminAuthStore()
      auth.clear()
    }
    return Promise.reject(err)
  }
)