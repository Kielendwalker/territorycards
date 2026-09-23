<template>
  <Teleport to="body">
    <div class="kdtu-toast-stack" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="kdtu-toast">
        <div
          v-for="t in state.items"
          :key="t.id"
          class="kdtu-toast"
          :class="`kdtu-toast--${t.kind}`"
          role="status"
          @click="dismiss(t.id)"
        >
          <span class="kdtu-toast__dot" aria-hidden="true"></span>
          <span class="kdtu-toast__message">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useToast } from '../composables/useToast.js'

const { state, dismiss } = useToast()
</script>

<style scoped>
.kdtu-toast-stack {
  position: fixed;
  top: var(--kdtu-space-5);
  right: var(--kdtu-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--kdtu-space-2);
  z-index: var(--kdtu-z-toast);
  max-width: 360px;
  pointer-events: none;
}

.kdtu-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--kdtu-space-3);
  background: var(--kdtu-color-surface);
  border: 1px solid var(--kdtu-color-border);
  border-left-width: 4px;
  border-radius: var(--kdtu-radius-md);
  box-shadow: var(--kdtu-shadow-md);
  padding: var(--kdtu-space-3) var(--kdtu-space-4);
  font-size: var(--kdtu-font-size-base);
  color: var(--kdtu-color-ink);
  cursor: pointer;
}

.kdtu-toast__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--kdtu-color-primary);
  flex: none;
}

.kdtu-toast--success .kdtu-toast__dot {
  background: var(--kdtu-color-success);
}
.kdtu-toast--error {
  border-left-color: var(--kdtu-color-danger);
}
.kdtu-toast--error .kdtu-toast__dot {
  background: var(--kdtu-color-danger);
}
.kdtu-toast--warning .kdtu-toast__dot {
  background: var(--kdtu-color-warning);
}
.kdtu-toast--info .kdtu-toast__dot {
  background: var(--kdtu-color-primary);
}

.kdtu-toast__message {
  flex: 1;
}

.kdtu-toast-enter-active,
.kdtu-toast-leave-active {
  transition: transform var(--kdtu-motion-base), opacity var(--kdtu-motion-base);
}
.kdtu-toast-enter-from {
  transform: translateX(20px);
  opacity: 0;
}
.kdtu-toast-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
</style>