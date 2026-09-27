// Pinia store for kdtu member auth (PIN-based).
//
// Token + member identity are kept in memory only. The http interceptor in
// `src/api/http.js` reads the token from this store; on a hard refresh the
// caller is redirected back to /login by the router guard.

import { defineStore } from 'pinia'

const STORAGE_KEY = 'kdtu.auth.member'

function readPersisted() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persist(state) {
  if (typeof window === 'undefined') return
  try {
    if (state.token && state.member) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: state.token, member: state.member }),
      )
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore quota / privacy mode failures
  }
}

export const useAuthStore = defineStore('kdtu-auth', {
  state: () => {
    const persisted = readPersisted()
    return {
      token: persisted?.token || '',
      member: persisted?.member || null,
    }
  },
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.member),
    displayName: (state) => state.member?.name || '',
  },
  actions: {
    setSession({ token, member }) {
      this.token = token || ''
      this.member = member || null
      persist(this)
    },
    updateMember(member) {
      this.member = member
      persist(this)
    },
    logout() {
      this.token = ''
      this.member = null
      persist(this)
    },
  },
})