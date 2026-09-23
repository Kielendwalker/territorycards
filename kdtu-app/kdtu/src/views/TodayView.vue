<template>
  <AppLayout>
    <h1>Hari Ini</h1>
    <p class="kdtu-muted">
      {{ greeting }}, {{ auth.displayName }}.
      <span v-if="auth.member?.kdlName">KDL {{ auth.member.kdlName }}.</span>
    </p>

    <section v-if="loading" class="kdtu-card kdtu-card__body">Memuat jadwal…</section>

    <EmptyState
      v-else-if="!assignments.length"
      title="Tidak ada penugasan hari ini"
      :message="emptyMessage"
      icon="\u{1F389}"
    >
      <template #action>
        <RouterLink to="/timetable" class="kdtu-btn kdtu-btn--ghost">
          Lihat jadwal lengkap
        </RouterLink>
      </template>
    </EmptyState>

    <div v-else class="kdtu-stack">
      <article v-for="a in assignments" :key="a.id" class="kdtu-card">
        <header class="kdtu-card__header">
          <span class="kdtu-card__day">{{ a.day }}</span>
          &middot; {{ a.jam }}
        </header>
        <div class="kdtu-card__body">
          <p><strong>Lokasi Jaga:</strong> {{ a.lokasiJaga }}</p>
          <p v-if="a.lokasiRakBeroda"><strong>Rak Beroda:</strong> {{ a.lokasiRakBeroda }}</p>
          <p v-if="a.posterRakBeroda"><strong>Poster:</strong> {{ a.posterRakBeroda }}</p>
          <p v-if="a.setRakrod"><strong>Set Rakrod:</strong> {{ a.setRakrod }}</p>
          <p v-if="a.memberIds?.length">
            <strong>Bersama:</strong> {{ a.memberIds.join(', ') }}
          </p>
        </div>
      </article>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import EmptyState from '../components/EmptyState.vue'
import { http } from '../api/http.js'
import { TIMETABLE_PERIODS, TIMETABLE_ASSIGNMENTS } from '@kdtu/shared'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const loading = ref(true)
const assignments = ref([])

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
})

const emptyMessage = computed(() => {
  const days = auth.member?.availabilityDays || []
  if (!days.length) {
    return 'Anda belum mengatur ketersediaan. Buka Profil untuk memilih hari pelayanan.'
  }
  return 'Nikmati hari libur Anda. Sampai jumpa di jadwal berikutnya.'
})

onMounted(async () => {
  try {
    const { data: periods } = await http.get(TIMETABLE_PERIODS)
    const today = new Date().toISOString().slice(0, 10)
    const current = periods.find(
      (p) => today >= p.startsOn.slice(0, 10) && today <= p.endsOn.slice(0, 10),
    ) || periods[0]
    if (!current) {
      assignments.value = []
    } else {
      const { data } = await http.get(TIMETABLE_ASSIGNMENTS(current.id))
      assignments.value = (data || []).filter((a) => {
        const memberIds = a.memberIds || []
        return auth.member && memberIds.includes(auth.member.id)
      })
    }
  } catch {
    assignments.value = []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.kdtu-card__day {
  display: inline-block;
  padding: 2px var(--kdtu-space-2);
  background: var(--kdtu-color-primary-soft);
  color: var(--kdtu-color-primary);
  font-size: var(--kdtu-font-size-xs);
  font-weight: 600;
  border-radius: var(--kdtu-radius-pill);
  margin-right: var(--kdtu-space-2);
}
</style>
