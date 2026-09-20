// Axios instance for kdtu. Points at the local KDTU API and attaches the
// bearer token from the Pinia auth store. On 401 the caller is redirected
// to /login and the session is cleared.

import axios from 'axios'
import { useAuthStore } from '../stores/auth.js'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5180/api'

export const http = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    if (status === 401 && typeof window !== 'undefined') {
      const auth = useAuthStore()
      auth.logout()
      if (window.location.pathname !== '/login') {
        const next = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.replace(`/login?next=${next}`)
      }
    }
    return Promise.reject(error)
  },
)

export default http