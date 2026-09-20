<template>
  <AppLayout>
    <h1>Profil &amp; Ketersediaan</h1>
    <p class="kdtu-muted">
      Pilih hari-hari ketika Anda tersedia untuk pelayanan KDTU.
    </p>

    <section class="kdtu-card">
      <header class="kdtu-card__header">{{ auth.displayName }}</header>
      <div class="kdtu-card__body kdtu-stack">
        <FormField label="KDL" hint="Kelompok Pelayanan Anda">
          <template #default="{ id }">
            <input :id="id" class="kdtu-input" :value="auth.member?.kdlName || '-'" readonly />
          </template>
        </FormField>

        <FormField label="Hari tersedia">
          <template #default>
            <div class="kdtu-row kdtu-row--wrap">
              <label v-for="d in days" :key="d" class="kdtu-chip">
                <input type="checkbox" :value="d" v-model="availability" />
                <span>{{ d }}</span>
              </label>
            </div>
          </template>
        </FormField>

        <div class="kdtu-row">
          <button
            type="button"
            class="kdtu-btn kdtu-btn--primary"
            :disabled="saving"
            @click="onSave"
          >
            {{ saving ? 'Menyimpan…' : 'Simpan ketersediaan' }}
          </button>
          <span v-if="status" class="kdtu-muted">{{ status }}</span>
        </div>
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import FormField from '../components/FormField.vue'
import { useAuthStore } from '../stores/auth.js'
import { useToast } from '../composables/useToast.js'

const auth = useAuthStore()
const toast = useToast()

const days = ['RABU', 'JUMAT', 'SABTU', 'MINGGU']
const availability = ref([...(auth.member?.availabilityDays || [])])
const saving = ref(false)
const status = ref('')

async function onSave() {
  saving.value = true
  status.value = ''
  // local-only persistence — server endpoint owned by other agents
  auth.updateMember({ ...auth.member, availabilityDays: availability.value })
  toast.success('Ketersediaan disimpan')
  status.value = 'Tersimpan di perangkat ini.'
  saving.value = false
}
</script>

<style scoped>
.kdtu-row--wrap {
  flex-wrap: wrap;
}

.kdtu-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--kdtu-space-2);
  padding: var(--kdtu-space-2) var(--kdtu-space-3);
  border: 1px solid var(--kdtu-color-border);
  border-radius: var(--kdtu-radius-pill);
  background: var(--kdtu-color-surface);
  font-size: var(--kdtu-font-size-sm);
  cursor: pointer;
}

.kdtu-chip input {
  accent-color: var(--kdtu-color-primary);
}
</style>