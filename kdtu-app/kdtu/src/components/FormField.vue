<template>
  <div class="kdtu-field">
    <label v-if="label" :for="fieldId" class="kdtu-field__label">
      {{ label }}
      <span v-if="required" class="kdtu-field__required" aria-hidden="true">*</span>
    </label>
    <slot :id="fieldId" :describedby="error ? errorId : undefined" />
    <p v-if="hint && !error" :id="`${fieldId}-hint`" class="kdtu-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="kdtu-field__error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  id: { type: String, default: '' },
})

const fieldId = computed(
  () => props.id || `kdtu-field-${Math.random().toString(36).slice(2, 8)}`,
)
const errorId = computed(() => `${fieldId.value}-error`)
</script>

<style scoped>
.kdtu-field {
  display: flex;
  flex-direction: column;
  gap: var(--kdtu-space-1);
}

.kdtu-field__label {
  font-size: var(--kdtu-font-size-sm);
  font-weight: 500;
  color: var(--kdtu-color-ink);
}

.kdtu-field__required {
  color: var(--kdtu-color-danger);
  margin-left: 2px;
}

.kdtu-field__hint {
  font-size: var(--kdtu-font-size-xs);
  color: var(--kdtu-color-ink-subtle);
  margin: 0;
}

.kdtu-field__error {
  font-size: var(--kdtu-font-size-xs);
  color: var(--kdtu-color-danger);
  margin: 0;
}
</style>