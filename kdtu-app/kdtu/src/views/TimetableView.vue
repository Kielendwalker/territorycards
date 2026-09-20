<template>
  <AppLayout>
    <h1>Jadwal Lengkap</h1>
    <p class="kdtu-muted">Seluruh periode pelayanan KDTU SIDANG SRENGSENG-3.</p>

    <div v-if="loading" class="kdtu-card kdtu-card__body">Memuat jadwal…</div>

    <EmptyState
      v-else-if="!periods.length"
      title="Belum ada periode"
      message="Belum ada jadwal yang dipublikasikan."
      icon="\u{1F4C5}"
    />

    <div v-else class="kdtu-stack">
      <section v-for="period in periods" :key="period.id" class="kdtu-card">
        <header class="kdtu-card__header">{{ period.label }}</header>
        <div class="kdtu-card__body">
          <p class="kdtu-muted">
            {{ formatDate(period.startsOn) }} – {{ formatDate(period.endsOn) }}
          </p>
          <ol class="kdtu-timetable">
            <li v-for="row in rowsFor(period.id)" :key="row.id">
              <span class="kdtu-timetable__date">{{ row.date }}</span>
              <span class="kdtu-timetable__day">{{ row.day }}</span>
              <span class="kdtu-timetable__slot">{{ row.jam }}</span>
              <span class="kdtu-timetable__lokasi">{{ row.lokasiJaga }}</span>
            </li>
          </ol>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import EmptyState from '../components/EmptyState.vue'
import { http } from '../api/http.js'
import {
  TIMETABLE_PERIODS,
  TIMETABLE_ASSIGNMENTS,
} from '../../../../shared/index.js'

const loading = ref(true)
const periods = ref([])
const assignmentsByPeriod = ref({})

onMounted(async () => {
  try {
    const { data: list } = await http.get(TIMETABLE_PERIODS)
    periods.value = list
    const buckets = {}
    for (const p of list) {
      const { data } = await http.get(TIMETABLE_ASSIGNMENTS(p.id))
      buckets[p.id] = data || []
    }
    assignmentsByPeriod.value = buckets
  } catch {
    periods.value = []
  } finally {
    loading.value = false
  }
})

function rowsFor(periodId) {
  return assignmentsByPeriod.value[periodId] || []
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}
</script>

<style scoped>
.kdtu-timetable {
  list-style: none;
  padding: 0;
  margin: var(--kdtu-space-3) 0 0;
  display: flex;
  flex-direction: column;
}

.kdtu-timetable li {
  display: grid;
  grid-template-columns: 110px 80px 120px 1fr;
  gap: var(--kdtu-space-3);
  align-items: center;
  padding: var(--kdtu-space-2) 0;
  border-bottom: 1px solid var(--kdtu-color-border);
  font-size: var(--kdtu-font-size-sm);
}

.kdtu-timetable li:last-child {
  border-bottom: 0;
}

.kdtu-timetable__date {
  font-variant-numeric: tabular-nums;
  color: var(--kdtu-color-ink-muted);
}

.kdtu-timetable__day {
  color: var(--kdtu-color-primary);
  font-weight: 600;
}

.kdtu-timetable__slot {
  color: var(--kdtu-color-ink-muted);
  font-variant-numeric: tabular-nums;
}

.kdtu-timetable__lokasi {
  color: var(--kdtu-color-ink);
}
</style>