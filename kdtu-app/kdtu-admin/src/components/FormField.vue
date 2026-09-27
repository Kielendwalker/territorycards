<template>
  <div class="form-field" :class="{ 'has-error': !!error }">
    <label v-if="label" :for="fieldId">{{ label }}</label>
    <slot :id="fieldId" />
    <p v-if="error" class="form-field__error">{{ error }}</p>
    <p v-else-if="hint" class="form-field__hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, useId } from 'vue'

// Tiny wrapper around <input>/<select>/<textarea> that owns the label, error
// and id wiring so each view can focus on layout, not boilerplate.
const props = defineProps({
  label: { type: String, default: '' },
  error: { type: [String, Boolean], default: '' },
  hint: { type: String, default: '' },
})
const autoId = useId()
const fieldId = computed(() => `ff-${autoId}`)
</script>

<style scoped>
.form-field {
  display: grid;
  gap: 0.3rem;
  margin-bottom: 0.85rem;
}
.form-field label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #334155;
}
.form-field input,
.form-field select,
.form-field textarea {
  padding: 0.5rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  background: white;
  width: 100%;
  box-sizing: border-box;
}
.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  outline: 2px solid #6366f1;
  outline-offset: 0;
  border-color: #6366f1;
}
.form-field.has-error input,
.form-field.has-error select,
.form-field.has-error textarea {
  border-color: #ef4444;
}
.form-field__error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.8rem;
}
.form-field__hint {
  margin: 0;
  color: #64748b;
  font-size: 0.8rem;
}
</style>