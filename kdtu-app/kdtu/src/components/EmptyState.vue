<template>
  <div class="kdtu-empty">
    <div class="kdtu-empty__icon" aria-hidden="true">{{ icon }}</div>
    <h3 class="kdtu-empty__title">{{ title }}</h3>
    <p v-if="message" class="kdtu-empty__message">{{ message }}</p>
    <div v-if="$slots.action" class="kdtu-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Tidak ada data' },
  message: { type: String, default: '' },
  icon: { type: String, default: '\u{1F4ED}' },
})
</script>

<style scoped>
.kdtu-empty {
  text-align: center;
  padding: var(--kdtu-space-10) var(--kdtu-space-5);
  color: var(--kdtu-color-ink-muted);
}

.kdtu-empty__icon {
  font-size: 36px;
  margin-bottom: var(--kdtu-space-3);
}

.kdtu-empty__title {
  font-size: var(--kdtu-font-size-lg);
  margin: 0 0 var(--kdtu-space-2);
  color: var(--kdtu-color-ink);
}

.kdtu-empty__message {
  max-width: 360px;
  margin: 0 auto var(--kdtu-space-4);
  line-height: 1.5;
}

.kdtu-empty__action {
  margin-top: var(--kdtu-space-3);
}
</style>