<template>
  <Teleport to="body">
    <Transition name="kdtu-fade">
      <div
        v-if="open"
        class="kdtu-confirm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
        @keydown.esc.stop="emit('cancel')"
      >
        <div class="kdtu-confirm__backdrop" @click="emit('cancel')"></div>
        <div ref="panel" class="kdtu-confirm__panel" tabindex="-1">
          <h3 :id="titleId" class="kdtu-confirm__title">{{ title }}</h3>
          <p :id="messageId" class="kdtu-confirm__message">{{ message }}</p>
          <div class="kdtu-confirm__actions">
            <button
              type="button"
              class="kdtu-btn kdtu-btn--ghost"
              @click="emit('cancel')"
            >
              {{ cancelLabel }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="kdtu-btn"
              :class="danger ? 'kdtu-btn--danger' : 'kdtu-btn--primary'"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Konfirmasi' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Konfirmasi' },
  cancelLabel: { type: String, default: 'Batal' },
  danger: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm', 'cancel'])

const titleId = computed(() => `kdtu-confirm-title-${Math.random().toString(36).slice(2, 8)}`)
const messageId = computed(() => `kdtu-confirm-msg-${Math.random().toString(36).slice(2, 8)}`)

const panel = ref(null)
const confirmBtn = ref(null)

function focusConfirm() {
  nextTick(() => {
    confirmBtn.value?.focus()
  })
}

function onKey(e) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('cancel')
  }
  if (e.key === 'Tab' && panel.value) {
    // simple focus trap: cycle inside the panel
    const focusables = panel.value.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.open,
  (val) => {
    if (typeof document === 'undefined') return
    if (val) {
      document.addEventListener('keydown', onKey)
      focusConfirm()
    } else {
      document.removeEventListener('keydown', onKey)
    }
  },
  { immediate: true, flush: 'sync' },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKey)
  }
})
</script>

<style scoped>
.kdtu-confirm {
  position: fixed;
  inset: 0;
  z-index: var(--kdtu-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--kdtu-space-4);
}

.kdtu-confirm__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}

.kdtu-confirm__panel {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: var(--kdtu-color-surface);
  border-radius: var(--kdtu-radius-lg);
  box-shadow: var(--kdtu-shadow-lg);
  padding: var(--kdtu-space-6);
  outline: none;
}

.kdtu-confirm__title {
  font-size: var(--kdtu-font-size-lg);
  font-weight: 600;
  margin: 0 0 var(--kdtu-space-2);
  color: var(--kdtu-color-ink);
}

.kdtu-confirm__message {
  margin: 0 0 var(--kdtu-space-5);
  color: var(--kdtu-color-ink-muted);
  line-height: 1.5;
}

.kdtu-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--kdtu-space-3);
}

.kdtu-fade-enter-active,
.kdtu-fade-leave-active {
  transition: opacity var(--kdtu-motion-base);
}
.kdtu-fade-enter-from,
.kdtu-fade-leave-to {
  opacity: 0;
}
</style>
