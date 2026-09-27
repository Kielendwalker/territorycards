// Thin wrapper around the shared axios instance that maps the API's standard
// { error, message, fields? } envelope into a thrown Error so call sites can
// use try/catch normally. The interceptor in api/http.js still runs, so 401
// responses still clear the auth store.

import { http } from './http.js'

export class ApiError extends Error {
  constructor (status, body) {
    super(body?.message || `HTTP ${status}`)
    this.status = status
    this.code = body?.error || 'UNKNOWN'
    this.fields = body?.fields || null
    this.body = body
  }
}

function unwrap (promise) {
  return promise.then((res) => res.data).catch((err) => {
    if (err?.response) {
      throw new ApiError(err.response.status, err.response.data)
    }
    throw new ApiError(0, { message: err.message || 'Network error' })
  })
}

export const api = {
  get: (path, config) => unwrap(http.get(path, config)),
  post: (path, body, config) => unwrap(http.post(path, body, config)),
  put: (path, body, config) => unwrap(http.put(path, body, config)),
  patch: (path, body, config) => unwrap(http.patch(path, body, config)),
  delete: (path, config) => unwrap(http.delete(path, config)),
}