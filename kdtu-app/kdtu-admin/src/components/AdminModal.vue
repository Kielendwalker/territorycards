<template>
  <dialog ref="dialogEl" class="admin-modal" @close="onNativeClose">
    <header class="admin-modal__head">
      <h2>{{ title }}</h2>
      <button class="ghost" type="button" aria-label="Tutup" @click="close">×</button>
    </header>
    <div class="admin-modal__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="admin-modal__foot">
      <slot name="footer" :close="close" />
    </footer>
  </dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue'

// Generic modal built on the native <dialog> element. We use showModal() so
// the browser handles focus trap + Escape-to-close + backdrop for free.
// `open` is a one-shot trigger — flip it true once to display, the caller
// is responsible for resetting it after `close` fires.
const props = defineProps({
  title: { type: String, required: true },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'close'])

const dialogEl = ref(null)

function close () {
  if (dialogEl.value && typeof dialogEl.value.close === 'function') {
    dialogEl.value.close()
  } else {
    emit('update:open', false)
    emit('close')
  }
}

function onNativeClose () {
  emit('update:open', false)
  emit('close')
}

onMounted(() => {
  if (props.open && dialogEl.value?.showModal) {
    dialogEl.value.showModal()
  }
})

// Re-open if the parent flips `open` to true after mount (e.g. clicking "Edit"
// on a different row).
import { watch } from 'vue'
watch(() => props.open, (v) => {
  if (v && dialogEl.value && !dialogEl.value.open && typeof dialogEl.value.showModal === 'function') {
    dialogEl.value.showModal()
  }
})
</script>

<style scoped>
.admin-modal {
  border: 0;
  border-radius: 12px;
  padding: 0;
  max-width: min(96vw, 640px);
  width: 100%;
  max-height: 90vh;
  background: white;
  color: #0f172a;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
}
.admin-modal::backdrop {
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}
.admin-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid #e2e8f0;
}
.admin-modal__head h2 {
  margin: 0;
  font-size: 1.05rem;
}
.admin-modal__head button {
  font-size: 1.4rem;
  line-height: 1;
  padding: 0 0.5rem;
}
.admin-modal__body {
  padding: 1.1rem;
  overflow: auto;
}
.admin-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.1rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 12px 12px;
}
</style>