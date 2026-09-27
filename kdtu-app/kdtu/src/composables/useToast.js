// useToast — global toast queue, max 3 visible at a time, auto-dismiss after 4s.
//
// Usage:
//   import { useToast } from '@/composables/useToast'
//   const toast = useToast()
//   toast.success('Tersimpan')
//   toast.error('Gagal menyimpan')

import { reactive } from 'vue'

const MAX = 3
const TTL_MS = 4000

const state = reactive({
  items: [],
})

let nextId = 1

function push(kind, message) {
  const id = nextId++
  const item = { id, kind, message }
  state.items.push(item)
  if (state.items.length > MAX) {
    state.items.shift()
  }
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(id), TTL_MS)
  }
  return id
}

function dismiss(id) {
  const idx = state.items.findIndex((t) => t.id === id)
  if (idx >= 0) state.items.splice(idx, 1)
}

export function useToast() {
  return {
    state,
    success(message) {
      return push('success', message)
    },
    error(message) {
      return push('error', message)
    },
    info(message) {
      return push('info', message)
    },
    warning(message) {
      return push('warning', message)
    },
    dismiss,
  }
}