// Pinia store for kdtu-admin auth (username + password, argon2id on server).
//
// Token + admin identity are persisted in localStorage so a hard refresh keeps
// the admin signed in. The http client in `src/api/http.js` reads the token
// from this store and attaches it as `Authorization: Bearer <token>`. On 401,
// http.js clears the store and the caller can redirect to /login.

import { defineStore } from 'pinia'

const STORAGE_KEY = 'kdtu.admin.auth'

function readPersisted () {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persist (state) {
  if (typeof window === 'undefined') return
  try {
    if (state.accessToken && state.user) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          user: state.user,
          mustChangePassword: state.mustChangePassword,
        })
      )
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore quota / privacy-mode failures
  }
}

export const useAdminAuthStore = defineStore('kdtu-admin-auth', {
  state: () => {
    const persisted = readPersisted()
    return {
      accessToken: persisted?.accessToken || '',
      refreshToken: persisted?.refreshToken || '',
      user: persisted?.user || null,
      // True when the seeded password has not been rotated yet. The admin must
      // hit POST /api/auth/change-password before any other protected route
      // returns 200. The UI should redirect to a "rotate password" form.
      mustChangePassword: persisted?.mustChangePassword ?? false,
    }
  },
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    displayName: (state) => state.user?.name || state.user?.username || '',
  },
  actions: {
    setSession ({ accessToken, refreshToken, user, mustChangePassword = false }) {
      this.accessToken = accessToken
      this.refreshToken = refreshToken
      this.user = user
      this.mustChangePassword = mustChangePassword
      persist(this.$state)
    },
    clear () {
      this.accessToken = ''
      this.refreshToken = ''
      this.user = null
      this.mustChangePassword = false
      persist(this.$state)
    },
  },
})