<template>
  <main class="admin-page">
    <header class="page-head">
      <div>
        <h1>Ringkasan KDTU</h1>
        <p class="muted">
          Entri ringkasan pemasangan terbitan per bulan. Setiap entri mencatat
          satu lokasi + sesi + kategori + judul + jumlah.
        </p>
      </div>
    </header>

    <section class="toolbar">
      <label class="filter">
        <span>Bulan</span>
        <input v-model="bulan" type="month" />
      </label>
      <button class="primary" type="button" @click="openCreate">+ Tambah Entri</button>
      <button class="ghost" type="button" @click="reload">Segarkan</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <table v-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>Bulan</th>
          <th>Lokasi</th>
          <th>Sesi</th>
          <th>Kategori</th>
          <th>Judul</th>
          <th class="num-cell">Jumlah</th>
          <th class="actions-col">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.bulanLabel || r.bulan }}</td>
          <td>{{ r.location }}</td>
          <td>{{ r.sesi }}</td>
          <td><span class="badge" :class="`kind-${categorySlug(r.category)}`">{{ r.category }}</span></td>
          <td class="title-cell">{{ r.title }}</td>
          <td class="num-cell">{{ r.quantity }}</td>
          <td class="actions-col">
            <button class="ghost" type="button" @click="openEdit(r)">Edit</button>
            <button class="danger" type="button" @click="askDelete(r)">Hapus</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">Belum ada entri untuk bulan ini.</p>

    <AdminModal
      :open="form.open"
      :title="form.editing ? 'Edit Entri' : 'Tambah Entri Ringkasan'"
      @update:open="onFormClose"
    >
      <FormField label="Periode (id)" :error="form.errors.periodId" hint="ID dari tabel timetable_periods">
        <template #default="{ id }">
          <input :id="id" v-model.number="form.periodId" type="number" min="1" :disabled="form.saving" />
        </template>
      </FormField>
      <FormField label="Bulan" :error="form.errors.bulan">
        <template #default="{ id }">
          <input :id="id" v-model="form.bulan" type="month" :disabled="form.saving" />
        </template>
      </FormField>
      <FormField label="Lokasi" :error="form.errors.location">
        <template #default="{ id }">
          <input :id="id" v-model="form.location" :disabled="form.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Sesi" :error="form.errors.sesi">
        <template #default="{ id }">
          <input :id="id" v-model="form.sesi" :disabled="form.saving" maxlength="200" placeholder="contoh: Sesi 1 / Sesi 2" />
        </template>
      </FormField>
      <FormField label="Kategori" :error="form.errors.category">
        <template #default="{ id }">
          <select :id="id" v-model="form.category" :disabled="form.saving">
            <option value="" disabled>— pilih —</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </template>
      </FormField>
      <FormField label="Judul" :error="form.errors.title">
        <template #default="{ id }">
          <input :id="id" v-model="form.title" :disabled="form.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Jumlah" :error="form.errors.quantity">
        <template #default="{ id }">
          <input :id="id" v-model.number="form.quantity" type="number" min="0" :disabled="form.saving" />
        </template>
      </FormField>
      <p v-if="form.serverError" class="error server">{{ form.serverError }}</p>
      <template #footer="{ close }">
        <button class="ghost" type="button" :disabled="form.saving" @click="close">Batal</button>
        <button class="primary" type="button" :disabled="form.saving" @click="submit(close)">
          {{ form.saving ? 'Menyimpan…' : 'Simpan' }}
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
import { onMounted, reactive, ref, watch } from 'vue'
import { api, ApiError } from '../api/index.js'
import AdminModal from '../components/AdminModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FormField from '../components/FormField.vue'
import { PUBLICATION_CATEGORY } from '@kdtu/shared'

const CATEGORIES = Object.values(PUBLICATION_CATEGORY)

function currentMonth () {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const bulan = ref(currentMonth())
const rows = ref([])
const loading = ref(false)
const error = ref('')

function emptyForm () {
  return {
    open: false, editing: null,
    periodId: null, bulan: currentMonth(),
    location: '', sesi: '', category: '', title: '', quantity: 0,
    errors: {}, serverError: '', saving: false,
  }
}
const form = reactive(emptyForm())
const confirm = reactive({ open: false, title: '', message: '', handler: null })

function categorySlug (cat) {
  if (!cat) return ''
  return cat.toString().toLowerCase().replace(/\s+/g, '-')
}

async function reload () {
  loading.value = true
  error.value = ''
  try {
    rows.value = await api.get(`/api/summary/kdtu/${bulan.value}`)
  } catch (err) {
    error.value = `Gagal memuat ringkasan: ${err.message}`
  } finally {
    loading.value = false
  }
}

watch(bulan, reload)

function openCreate () {
  Object.assign(form, emptyForm(), { open: true, bulan: bulan.value })
}
function openEdit (r) {
  Object.assign(form, emptyForm(), {
    open: true, editing: r,
    periodId: r.periodId, bulan: r.bulan,
    location: r.location, sesi: r.sesi,
    category: r.category, title: r.title, quantity: r.quantity,
  })
}
function onFormClose (open) {
  form.open = open
  if (!open) Object.assign(form, emptyForm())
}

async function submit (close) {
  form.errors = {}
  form.serverError = ''
  if (!form.periodId) form.errors.periodId = 'Wajib diisi'
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(form.bulan)) form.errors.bulan = 'Format YYYY-MM'
  if (!form.location.trim()) form.errors.location = 'Wajib diisi'
  if (!form.sesi.trim()) form.errors.sesi = 'Wajib diisi'
  if (!form.category) form.errors.category = 'Wajib dipilih'
  if (!form.title.trim()) form.errors.title = 'Wajib diisi'
  if (Object.keys(form.errors).length > 0) return

  form.saving = true
  try {
    const payload = {
      periodId: Number(form.periodId),
      bulan: form.bulan,
      location: form.location.trim(),
      sesi: form.sesi.trim(),
      category: form.category,
      title: form.title.trim(),
      quantity: Number(form.quantity) || 0,
    }
    if (form.editing) await api.put(`/api/summary/kdtu/${form.editing.id}`, payload)
    else await api.post('/api/summary/kdtu', payload)
    close()
    await reload()
  } catch (err) {
    if (err instanceof ApiError && err.fields) form.errors = err.fields
    form.serverError = err.message
  } finally {
    form.saving = false
  }
}

function askDelete (r) {
  confirm.title = 'Hapus entri ringkasan?'
  confirm.message = `Hapus entri "${r.title}" (${r.bulan}, ${r.location})?`
  confirm.handler = async () => {
    try {
      await api.delete(`/api/summary/kdtu/${r.id}`)
      await reload()
    } catch (err) {
      error.value = `Gagal menghapus: ${err.message}`
    }
  }
  confirm.open = true
}

onMounted(reload)
</script>

<style scoped>
.admin-page {
  max-width: 1080px; margin: 2rem auto; padding: 0 1.5rem 4rem;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a;
}
.page-head h1 { margin: 0 0 0.25rem; font-size: 1.7rem; }
.muted { color: #475569; margin: 0; line-height: 1.5; max-width: 70ch; }
.error { background: #fef2f2; color: #991b1b; padding: 0.65rem 0.9rem; border-radius: 6px; border: 1px solid #fecaca; margin: 0.75rem 0; }
.error.server { margin-top: 0.5rem; }
.empty { background: white; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 2rem; text-align: center; color: #475569; }
.toolbar {
  display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap;
  background: white; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 0.9rem 1.1rem; margin-bottom: 1rem;
}
.filter { display: grid; gap: 0.3rem; min-width: 200px; }
.filter span { font-size: 0.78rem; color: #475569; }
.filter input { padding: 0.4rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px; background: white; font: inherit; }
button.primary, button.ghost, button.danger {
  border: 0; padding: 0.45rem 0.95rem; border-radius: 6px;
  font-weight: 600; cursor: pointer; font-family: inherit;
}
button.primary { background: #4338ca; color: white; }
button.primary:hover:not(:disabled) { background: #3730a3; }
button.ghost { background: transparent; color: #475569; border: 1px solid #cbd5e1; }
button.ghost:hover:not(:disabled) { background: #f1f5f9; }
button.danger { background: white; color: #b91c1c; border: 1px solid #fecaca; }
button.danger:hover:not(:disabled) { background: #fef2f2; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
.data-table {
  width: 100%; border-collapse: collapse; background: white;
  border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
}
.data-table th, .data-table td {
  text-align: left; padding: 0.55rem 0.8rem; font-size: 0.92rem; border-bottom: 1px solid #f1f5f9;
}
.data-table th { background: #f8fafc; color: #334155; font-weight: 600; }
.data-table tbody tr:last-child td { border-bottom: 0; }
.num-cell { font-variant-numeric: tabular-nums; text-align: right; }
.title-cell { max-width: 30ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-col { display: flex; gap: 0.4rem; align-items: center; }
.badge {
  display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px;
  font-size: 0.78rem; font-weight: 500; background: #e2e8f0; color: #334155;
}
.badge.kind-majalah { background: #dbeafe; color: #1e40af; }
.badge.kind-risalah { background: #ede9fe; color: #5b21b6; }
.badge.kind-buku    { background: #fef3c7; color: #92400e; }
.badge.kind-brosur  { background: #dcfce7; color: #166534; }
.badge.kind-lainnya { background: #f1f5f9; color: #475569; }
</style>