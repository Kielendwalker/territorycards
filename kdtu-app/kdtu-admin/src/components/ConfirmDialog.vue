<template>
  <AdminModal :open="open" :title="title" @update:open="(v) => !v && close()">
    <p class="confirm__body">{{ message }}</p>
    <template #footer="{ close: doClose }">
      <button class="ghost" type="button" :disabled="busy" @click="doClose">Batal</button>
      <button class="danger" type="button" :disabled="busy" @click="onConfirm(doClose)">
        {{ busy ? 'Menghapus…' : 'Hapus' }}
      </button>
    </template>
  </AdminModal>
</template>

<script setup>
import { ref } from 'vue'
import AdminModal from './AdminModal.vue'

// Wraps AdminModal with a fixed two-button layout for destructive actions.
// The parent passes an async onConfirm() that returns when the API call
// finishes — the modal stays open until then, then auto-closes.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Konfirmasi' },
  message: { type: String, default: 'Yakin?' },
})
const emit = defineEmits(['update:open', 'confirm', 'close'])
const busy = ref(false)

function close () {
  emit('update:open', false)
  emit('close')
}

async function onConfirm (doClose) {
  busy.value = true
  try {
    await emit('confirm')
    doClose()
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.confirm__body {
  margin: 0;
  color: #334155;
  line-height: 1.5;
}
button.danger {
  background: #dc2626;
  color: white;
  border: 0;
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
button.danger:hover:not(:disabled) { background: #b91c1c; }
button.danger:disabled { opacity: 0.6; cursor: progress; }
button.ghost {
  background: transparent;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  cursor: pointer;
}
button.ghost:hover:not(:disabled) { background: #f1f5f9; }
</style>