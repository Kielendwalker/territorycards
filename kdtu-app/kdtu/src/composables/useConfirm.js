// useConfirm — promise-based wrapper around <ConfirmDialog>.
//
// Usage:
//   const confirm = useConfirm()
//   if (await confirm({ title: 'Hapus?', message: 'Tidak bisa dibatalkan', danger: true })) {
//     await doDelete()
//   }

import { reactive } from 'vue'

const state = reactive({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Konfirmasi',
  cancelLabel: 'Batal',
  danger: false,
  resolver: null,
})

function close(result) {
  const resolver = state.resolver
  state.open = false
  state.title = ''
  state.message = ''
  state.confirmLabel = 'Konfirmasi'
  state.cancelLabel = 'Batal'
  state.danger = false
  state.resolver = null
  if (resolver) resolver(result)
}

export function useConfirm() {
  return {
    state,
    confirm(options = {}) {
      state.open = true
      state.title = options.title || 'Konfirmasi'
      state.message = options.message || ''
      state.confirmLabel = options.confirmLabel || 'Konfirmasi'
      state.cancelLabel = options.cancelLabel || 'Batal'
      state.danger = Boolean(options.danger)
      return new Promise((resolve) => {
        state.resolver = resolve
      })
    },
    onConfirm() {
      close(true)
    },
    onCancel() {
      close(false)
    },
  }
}