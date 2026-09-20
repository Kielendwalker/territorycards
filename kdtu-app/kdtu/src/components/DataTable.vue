<template>
  <div class="kdtu-table">
    <div v-if="loading" class="kdtu-table__loading">Memuat…</div>
    <table v-else class="kdtu-table__el">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :class="['kdtu-table__th', { 'kdtu-table__th--sortable': col.sortable }]"
            :aria-sort="ariaSortFor(col)"
            @click="col.sortable ? toggleSort(col) : null"
          >
            <span>{{ col.label }}</span>
            <span v-if="col.sortable" class="kdtu-table__sort" aria-hidden="true">
              {{ sortKey === col.key ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u21F5' }}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!paginatedRows.length">
          <td :colspan="columns.length" class="kdtu-table__empty">
            <slot name="empty">Tidak ada data</slot>
          </td>
        </tr>
        <tr v-for="(row, i) in paginatedRows" :key="rowKeyValue(row, i)">
          <td v-for="col in columns" :key="col.key">
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ row[col.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="paginated && rows.length > pageSize" class="kdtu-table__pagination">
      <span class="kdtu-table__page-info">
        Halaman {{ page }} dari {{ totalPages }} ({{ rows.length }} baris)
      </span>
      <div class="kdtu-table__page-actions">
        <button
          type="button"
          class="kdtu-btn kdtu-btn--ghost kdtu-btn--sm"
          :disabled="page <= 1"
          @click="page = Math.max(1, page - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="kdtu-btn kdtu-btn--ghost kdtu-btn--sm"
          :disabled="page >= totalPages"
          @click="page = Math.min(totalPages, page + 1)"
        >
          Berikutnya
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  rowKey: { type: [String, Function], default: 'id' },
  pageSize: { type: Number, default: 10 },
  paginated: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
})

const sortKey = ref('')
const sortDir = ref('asc')
const page = ref(1)

watch(
  () => props.rows,
  () => {
    page.value = 1
  },
)

function toggleSort(col) {
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = col.key
    sortDir.value = 'asc'
  }
}

function ariaSortFor(col) {
  if (!col.sortable) return undefined
  if (sortKey.value !== col.key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

function compare(a, b, key) {
  const av = a?.[key]
  const bv = b?.[key]
  if (av == null && bv == null) return 0
  if (av == null) return -1
  if (bv == null) return 1
  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  return String(av).localeCompare(String(bv), 'id', { numeric: true })
}

const sortedRows = computed(() => {
  if (!sortKey.value) return props.rows
  const copy = props.rows.slice()
  copy.sort((a, b) => {
    const r = compare(a, b, sortKey.value)
    return sortDir.value === 'asc' ? r : -r
  })
  return copy
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(sortedRows.value.length / props.pageSize)),
)

const paginatedRows = computed(() => {
  if (!props.paginated) return sortedRows.value
  const start = (page.value - 1) * props.pageSize
  return sortedRows.value.slice(start, start + props.pageSize)
})

function rowKeyValue(row, i) {
  if (typeof props.rowKey === 'function') return props.rowKey(row)
  return row?.[props.rowKey] ?? i
}
</script>

<style scoped>
.kdtu-table {
  background: var(--kdtu-color-surface);
  border: 1px solid var(--kdtu-color-border);
  border-radius: var(--kdtu-radius-lg);
  overflow: hidden;
}

.kdtu-table__el {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--kdtu-font-size-base);
}

.kdtu-table__th {
  text-align: left;
  padding: var(--kdtu-space-3) var(--kdtu-space-4);
  background: var(--kdtu-color-surface-alt);
  font-size: var(--kdtu-font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdtu-color-ink-muted);
  border-bottom: 1px solid var(--kdtu-color-border);
  user-select: none;
}

.kdtu-table__th--sortable {
  cursor: pointer;
}

.kdtu-table__th--sortable:hover {
  color: var(--kdtu-color-ink);
}

.kdtu-table__sort {
  display: inline-block;
  margin-left: var(--kdtu-space-2);
  color: var(--kdtu-color-ink-subtle);
}

.kdtu-table tbody td {
  padding: var(--kdtu-space-3) var(--kdtu-space-4);
  border-bottom: 1px solid var(--kdtu-color-border);
  color: var(--kdtu-color-ink);
}

.kdtu-table tbody tr:last-child td {
  border-bottom: 0;
}

.kdtu-table tbody tr:hover {
  background: var(--kdtu-color-surface-alt);
}

.kdtu-table__empty {
  padding: var(--kdtu-space-6);
  text-align: center;
  color: var(--kdtu-color-ink-muted);
}

.kdtu-table__loading {
  padding: var(--kdtu-space-6);
  text-align: center;
  color: var(--kdtu-color-ink-muted);
}

.kdtu-table__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--kdtu-space-3);
  padding: var(--kdtu-space-3) var(--kdtu-space-4);
  border-top: 1px solid var(--kdtu-color-border);
  background: var(--kdtu-color-surface-alt);
  font-size: var(--kdtu-font-size-sm);
}

.kdtu-table__page-actions {
  display: flex;
  gap: var(--kdtu-space-2);
}
</style>