<template>
  <main class="admin-page">
    <header class="page-head">
      <div>
        <h1>Jadwal KDTU</h1>
        <p class="muted">
          Kelola daftar terbitan yang dipasang di setiap periode jadwal. Pilih
          periode di bawah ini — gunakan periode "Berikutnya" untuk menambah
          terbitan pada bulan depan.
        </p>
      </div>
    </header>

    <section class="toolbar">
      <label class="period-picker">
        <span>Periode</span>
        <select v-model="selectedPeriodId" :disabled="loadingPeriods || periods.length === 0">
          <option v-for="p in periods" :key="p.id" :value="p.id">
            {{ p.label }}
          </option>
        </select>
      </label>
      <button
        class="primary"
        type="button"
        :disabled="!selectedPeriodId || loading"
        @click="openCreate"
      >
        + Tambah Terbitan
      </button>
      <button
        class="ghost"
        type="button"
        :disabled="!selectedPeriodId"
        @click="reload"
      >
        Segarkan
      </button>
      <span v-if="selectedPeriod" class="toolbar__meta">
        {{ selectedPeriod.startsOn }} → {{ selectedPeriod.endsOn }}
      </span>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="selectedPeriodId === null && !loadingPeriods" class="empty">
      Belum ada periode jadwal. Klik "Tambah Periode" di bawah untuk
      membuat bulan pertama.
    </section>

    <table v-else-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>Kategori</th>
          <th>Judul</th>
          <th>Edisi</th>
          <th>Stok</th>
          <th>Jumlah dipasang</th>
          <th class="actions-col">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.publicationId">
          <td>
            <span class="badge" :class="`kind-${categorySlug(row.category)}`">
              {{ row.category }}
            </span>
          </td>
          <td class="title-cell">{{ row.title }}</td>
          <td class="muted-cell">{{ row.edition || '—' }}</td>
          <td class="num">{{ row.stock }}</td>
          <td class="num">
            <input
              v-model.number="row.quantity"
              type="number"
              min="0"
              class="inline-num"
              :disabled="!canEdit"
              @change="saveQuantity(row)"
            />
          </td>
          <td class="actions-col">
            <button class="ghost" type="button" :disabled="!canEdit" @click="openEdit(row)">Edit</button>
            <button class="danger" type="button" :disabled="!canEdit" @click="askDetach(row)">Lepas</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="selectedPeriodId" class="empty">
      Belum ada terbitan yang dipasang di periode ini.
    </p>

    <details class="period-admin">
      <summary>Kelola periode</summary>
      <ul>
        <li v-for="p in periods" :key="p.id">
          <strong>{{ p.label }}</strong> ({{ p.startsOn }} → {{ p.endsOn }})
          <button class="ghost" type="button" @click="openPeriodEdit(p)">Edit</button>
          <button class="danger" type="button" @click="askPeriodDelete(p)">Hapus</button>
        </li>
        <li>
          <button class="primary" type="button" @click="openPeriodCreate">+ Periode baru</button>
        </li>
      </ul>
    </details>

    <!-- Publication add/edit modal -->
    <AdminModal
      :open="pubForm.open"
      :title="pubForm.editing ? 'Edit Terbitan' : 'Tambah Terbitan ke Periode'"
      @update:open="onPubFormClose"
    >
      <FormField label="Kategori" :error="pubForm.errors.category">
        <template #default="{ id }">
          <select :id="id" v-model="pubForm.category" :disabled="pubForm.saving">
            <option value="" disabled>— pilih —</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </template>
      </FormField>
      <FormField label="Judul" :error="pubForm.errors.title">
        <template #default="{ id }">
          <input :id="id" v-model="pubForm.title" :disabled="pubForm.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Edisi (opsional)" :error="pubForm.errors.edition">
        <template #default="{ id }">
          <input :id="id" v-model="pubForm.edition" :disabled="pubForm.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Stok (opsional)" :error="pubForm.errors.stock">
        <template #default="{ id }">
          <input :id="id" v-model.number="pubForm.stock" type="number" min="0" :disabled="pubForm.saving" />
        </template>
      </FormField>
      <FormField v-if="!pubForm.editing" label="Jumlah dipasang" :error="pubForm.errors.quantity">
        <template #default="{ id }">
          <input :id="id" v-model.number="pubForm.quantity" type="number" min="0" :disabled="pubForm.saving" />
        </template>
      </FormField>
      <p v-if="pubForm.serverError" class="error server">{{ pubForm.serverError }}</p>
      <template #footer="{ close }">
        <button class="ghost" type="button" :disabled="pubForm.saving" @click="close">Batal</button>
        <button class="primary" type="button" :disabled="pubForm.saving" @click="submitPubForm(close)">
          {{ pubForm.saving ? 'Menyimpan…' : (pubForm.editing ? 'Simpan' : 'Tambah') }}
        </button>
      </template>
    </AdminModal>

    <!-- Period add/edit modal -->
    <AdminModal
      :open="periodForm.open"
      :title="periodForm.editing ? 'Edit Periode' : 'Periode Baru'"
      @update:open="onPeriodFormClose"
    >
      <FormField label="Label" :error="periodForm.errors.label">
        <template #default="{ id }">
          <input :id="id" v-model="periodForm.label" :disabled="periodForm.saving" placeholder="contoh: Oktober 2026" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Mulai" :error="periodForm.errors.startsOn">
        <template #default="{ id }">
          <input :id="id" v-model="periodForm.startsOn" type="date" :disabled="periodForm.saving" />
        </template>
      </FormField>
      <FormField label="Selesai" :error="periodForm.errors.endsOn">
        <template #default="{ id }">
          <input :id="id" v-model="periodForm.endsOn" type="date" :disabled="periodForm.saving" />
        </template>
      </FormField>
      <FormField label="Catatan (opsional)">
        <template #default="{ id }">
          <textarea :id="id" v-model="periodForm.notes" rows="3" :disabled="periodForm.saving" maxlength="5000"></textarea>
        </template>
      </FormField>
      <p v-if="periodForm.serverError" class="error server">{{ periodForm.serverError }}</p>
      <template #footer="{ close }">
        <button class="ghost" type="button" :disabled="periodForm.saving" @click="close">Batal</button>
        <button class="primary" type="button" :disabled="periodForm.saving" @click="submitPeriodForm(close)">
          {{ periodForm.saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </AdminModal>

    <ConfirmDialog
      :open="confirm.open"
      :title="confirm.title"
      :message="confirm.message"
      @update:open="(v) => !v && (confirm.open = false)"
      @confirm="confirm.handler"
    />
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '../api/index.js'
import AdminModal from '../components/AdminModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FormField from '../components/FormField.vue'
import { PUBLICATION_CATEGORY } from '@kdtu/shared'

const CATEGORIES = Object.values(PUBLICATION_CATEGORY)

const periods = ref([])
const loadingPeriods = ref(false)
const selectedPeriodId = ref(null)
const loading = ref(false)
const error = ref('')
const rows = ref([])

const selectedPeriod = computed(() =>
  periods.value.find((p) => p.id === selectedPeriodId.value) || null
)

function categorySlug (cat) {
  if (!cat) return ''
  return cat.toString().toLowerCase().replace(/\s+/g, '-')
}

function emptyPubForm () {
  return {
    open: false,
    editing: null,
    category: '',
    title: '',
    edition: '',
    stock: 0,
    quantity: 0,
    errors: {},
    serverError: '',
    saving: false,
  }
}
function emptyPeriodForm () {
  return {
    open: false,
    editing: null,
    label: '',
    startsOn: '',
    endsOn: '',
    notes: '',
    errors: {},
    serverError: '',
    saving: false,
  }
}
const pubForm = reactive(emptyPubForm())
const periodForm = reactive(emptyPeriodForm())
const confirm = reactive({ open: false, title: '', message: '', handler: null })

// Admin can always edit here; future-proof the role check so a future
// "viewer" role gets a read-only mode without rewriting this template.
const canEdit = computed(() => true)

async function loadPeriods (autoSelect = true) {
  loadingPeriods.value = true
  try {
    const list = await api.get('/api/timetable/periods')
    periods.value = Array.isArray(list) ? list : []
    if (autoSelect && selectedPeriodId.value === null && periods.value.length > 0) {
      // Default to the first (most-recent) period; the operator can switch.
      selectedPeriodId.value = periods.value[0].id
    }
  } catch (err) {
    error.value = `Gagal memuat daftar periode: ${err.message}`
  } finally {
    loadingPeriods.value = false
  }
}

async function loadRows () {
  if (!selectedPeriodId.value) {
    rows.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    const joinRows = await api.get(`/api/timetable/periods/${selectedPeriodId.value}/publications`)
    // joinRows: [{ periodId, publicationId, quantity }]
    const ids = joinRows.map((r) => r.publicationId)
    const details = await Promise.all(
      ids.map((id) => api.get(`/api/publications/${id}`).catch(() => null))
    )
    rows.value = joinRows.map((r, i) => {
      const det = details[i]
      return {
        publicationId: r.publicationId,
        quantity: r.quantity,
        category: det?.category ?? '—',
        title: det?.title ?? `(id ${r.publicationId})`,
        edition: det?.edition ?? null,
        stock: det?.stock ?? 0,
      }
    })
  } catch (err) {
    error.value = `Gagal memuat daftar terbitan: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function reload () { await loadRows() }

watch(selectedPeriodId, loadRows)

async function saveQuantity (row) {
  if (!selectedPeriodId.value) return
  try {
    await api.put(
      `/api/timetable/periods/${selectedPeriodId.value}/publications/${row.publicationId}`,
      { quantity: Number(row.quantity) || 0 }
    )
  } catch (err) {
    error.value = `Gagal menyimpan jumlah: ${err.message}`
    await loadRows()
  }
}

function openCreate () {
  Object.assign(pubForm, emptyPubForm(), { open: true })
}

function openEdit (row) {
  Object.assign(pubForm, emptyPubForm(), {
    open: true,
    editing: row,
    category: row.category,
    title: row.title,
    edition: row.edition || '',
    stock: row.stock || 0,
    quantity: row.quantity || 0,
  })
}

function onPubFormClose (open) {
  pubForm.open = open
  if (!open) Object.assign(pubForm, emptyPubForm())
}

async function submitPubForm (close) {
  pubForm.errors = {}
  pubForm.serverError = ''
  if (!pubForm.category) pubForm.errors.category = 'Wajib dipilih'
  if (!pubForm.title.trim()) pubForm.errors.title = 'Wajib diisi'
  if (Object.keys(pubForm.errors).length > 0) return

  pubForm.saving = true
  try {
    // Always create the publication first (or update existing by title match
    // — simpler: create). Then attach it to the current period with the
    // requested quantity.
    const pub = await api.post('/api/publications', {
      category: pubForm.category,
      title: pubForm.title.trim(),
      edition: pubForm.edition.trim() || null,
      stock: Number(pubForm.stock) || 0,
    })
    await api.post(
      `/api/timetable/periods/${selectedPeriodId.value}/publications`,
      { publicationId: pub.id, quantity: Number(pubForm.quantity) || 0 }
    )
    close()
    await loadRows()
  } catch (err) {
    if (err instanceof ApiError && err.fields) {
      pubForm.errors = err.fields
    }
    pubForm.serverError = err.message
  } finally {
    pubForm.saving = false
  }
}

function askDetach (row) {
  confirm.title = 'Lepas terbitan?'
  confirm.message = `Lepas "${row.title}" dari periode ini? Data terbitan di katalog tidak dihapus.`
  confirm.handler = async () => {
    try {
      await api.delete(`/api/timetable/periods/${selectedPeriodId.value}/publications/${row.publicationId}`)
      await loadRows()
    } catch (err) {
      error.value = `Gagal melepas terbitan: ${err.message}`
    }
  }
  confirm.open = true
}

// ---- Period CRUD ----------------------------------------------------------

function openPeriodCreate () {
  const today = new Date()
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const yyyy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  Object.assign(periodForm, emptyPeriodForm(), {
    open: true,
    label: `${monthName(next.getMonth())} ${yyyy}`,
    startsOn: `${yyyy}-${mm}-01`,
    endsOn: `${yyyy}-${mm}-${String(new Date(yyyy, next.getMonth() + 1, 0).getDate()).padStart(2, '0')}`,
  })
}

function openPeriodEdit (p) {
  Object.assign(periodForm, emptyPeriodForm(), {
    open: true,
    editing: p,
    label: p.label,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    notes: p.notes || '',
  })
}

function onPeriodFormClose (open) {
  periodForm.open = open
  if (!open) Object.assign(periodForm, emptyPeriodForm())
}

function monthName (idx) {
  return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][idx]
}

async function submitPeriodForm (close) {
  periodForm.errors = {}
  periodForm.serverError = ''
  if (!periodForm.label.trim()) periodForm.errors.label = 'Wajib diisi'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodForm.startsOn)) periodForm.errors.startsOn = 'Tanggal tidak valid'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodForm.endsOn)) periodForm.errors.endsOn = 'Tanggal tidak valid'
  if (Object.keys(periodForm.errors).length > 0) return

  periodForm.saving = true
  try {
    const payload = {
      label: periodForm.label.trim(),
      startsOn: periodForm.startsOn,
      endsOn: periodForm.endsOn,
      notes: periodForm.notes.trim() || null,
    }
    if (periodForm.editing) {
      await api.put(`/api/timetable/periods/${periodForm.editing.id}`, payload)
    } else {
      const created = await api.post('/api/timetable/periods', payload)
      selectedPeriodId.value = created.id
    }
    close()
    await loadPeriods(false)
  } catch (err) {
    if (err instanceof ApiError && err.fields) periodForm.errors = err.fields
    periodForm.serverError = err.message
  } finally {
    periodForm.saving = false
  }
}

function askPeriodDelete (p) {
  confirm.title = 'Hapus periode?'
  confirm.message = `Hapus "${p.label}"? Penugasan, terbitan, dan ringkasan di periode ini akan hilang karena CASCADE.`
  confirm.handler = async () => {
    try {
      await api.delete(`/api/timetable/periods/${p.id}`)
      if (selectedPeriodId.value === p.id) selectedPeriodId.value = null
      await loadPeriods(false)
      await loadRows()
    } catch (err) {
      error.value = `Gagal menghapus periode: ${err.message}`
    }
  }
  confirm.open = true
}

// Vue's `watch` is auto-imported in <script setup> from the helpers it
// recognizes, but to be explicit + safe in dev environments where the build
// optimizes unused helpers, we import it directly.
import { watch } from 'vue'

onMounted(loadPeriods)
</script>

<style scoped>
.admin-page {
  max-width: 1080px;
  margin: 2rem auto;
  padding: 0 1.5rem 4rem;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: #0f172a;
}
.page-head { margin-bottom: 1.25rem; }
.page-head h1 { margin: 0 0 0.25rem; font-size: 1.7rem; }
.muted { color: #475569; margin: 0; line-height: 1.5; max-width: 70ch; }
.error {
  background: #fef2f2; color: #991b1b;
  padding: 0.65rem 0.9rem; border-radius: 6px;
  border: 1px solid #fecaca; margin: 0.75rem 0;
}
.error.server { margin-top: 0.5rem; }
.empty {
  background: white; border: 1px dashed #cbd5e1; border-radius: 10px;
  padding: 2rem; text-align: center; color: #475569;
}
.toolbar {
  display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap;
  background: white; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 0.9rem 1.1rem; margin-bottom: 1rem;
}
.period-picker { display: grid; gap: 0.3rem; min-width: 220px; }
.period-picker span { font-size: 0.78rem; color: #475569; }
.period-picker select {
  padding: 0.4rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px;
  background: white; font: inherit;
}
.toolbar__meta { color: #475569; font-size: 0.85rem; margin-left: auto; }

button.primary, button.ghost, button.danger {
  border: 0; padding: 0.45rem 0.95rem; border-radius: 6px;
  font-weight: 600; cursor: pointer; font-family: inherit;
}
button.primary  { background: #4338ca; color: white; }
button.primary:hover:not(:disabled) { background: #3730a3; }
button.ghost    { background: transparent; color: #475569; border: 1px solid #cbd5e1; }
button.ghost:hover:not(:disabled) { background: #f1f5f9; }
button.danger   { background: white; color: #b91c1c; border: 1px solid #fecaca; }
button.danger:hover:not(:disabled) { background: #fef2f2; }
button:disabled { opacity: 0.55; cursor: not-allowed; }

.data-table {
  width: 100%; border-collapse: collapse; background: white;
  border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
}
.data-table th, .data-table td {
  text-align: left; padding: 0.55rem 0.8rem; font-size: 0.92rem;
  border-bottom: 1px solid #f1f5f9;
}
.data-table th { background: #f8fafc; color: #334155; font-weight: 600; }
.data-table tbody tr:last-child td { border-bottom: 0; }
.title-cell { max-width: 36ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted-cell { color: #64748b; font-size: 0.85rem; }
.num { font-variant-numeric: tabular-nums; }
.actions-col { display: flex; gap: 0.4rem; align-items: center; }
.inline-num {
  width: 80px; padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1;
  border-radius: 4px; font: inherit; text-align: right;
}

.badge {
  display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px;
  font-size: 0.78rem; font-weight: 500; background: #e2e8f0; color: #334155;
}
.badge.kind-majalah { background: #dbeafe; color: #1e40af; }
.badge.kind-risalah { background: #ede9fe; color: #5b21b6; }
.badge.kind-buku    { background: #fef3c7; color: #92400e; }
.badge.kind-brosur  { background: #dcfce7; color: #166534; }
.badge.kind-lainnya { background: #f1f5f9; color: #475569; }

.period-admin {
  margin-top: 2rem; background: white; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 0.9rem 1.1rem;
}
.period-admin summary {
  font-weight: 600; cursor: pointer; color: #334155;
}
.period-admin ul {
  list-style: none; padding: 0; margin: 0.7rem 0 0;
  display: grid; gap: 0.4rem;
}
.period-admin li {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.4rem 0; border-bottom: 1px solid #f1f5f9;
}
.period-admin li:last-child { border-bottom: 0; }
</style>