<template>
  <main class="admin-page">
    <header class="page-head">
      <div>
        <h1>Penugasan</h1>
        <p class="muted">
          Item penugasan yang melekat pada satu KDL. Filter per KDL untuk
          fokus pada satu kelompok.
        </p>
      </div>
    </header>

    <section class="toolbar">
      <label class="filter">
        <span>KDL</span>
        <select v-model.number="filterKdlId">
          <option :value="null">— Semua —</option>
          <option v-for="k in kdls" :key="k.id" :value="k.id">{{ k.name }}</option>
        </select>
      </label>
      <button class="primary" type="button" :disabled="kdls.length === 0" @click="openCreate">+ Tambah Penugasan</button>
      <button class="ghost" type="button" @click="reload">Segarkan</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <table v-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>KDL</th>
          <th>Judul</th>
          <th>Deskripsi</th>
          <th>Batas</th>
          <th>Status</th>
          <th class="actions-col">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ kdlName(r.kdlId) }}</td>
          <td class="title-cell">{{ r.title }}</td>
          <td class="muted-cell">{{ r.description || '—' }}</td>
          <td>{{ r.dueOn || '—' }}</td>
          <td><span class="status" :class="`s-${r.status}`">{{ r.status }}</span></td>
          <td class="actions-col">
            <button v-if="r.status !== 'DONE'" class="ghost" type="button" @click="markDone(r)">Selesai</button>
            <button class="ghost" type="button" @click="openEdit(r)">Edit</button>
            <button class="danger" type="button" @click="askDelete(r)">Hapus</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">Belum ada penugasan.</p>

    <AdminModal
      :open="form.open"
      :title="form.editing ? 'Edit Penugasan' : 'Tambah Penugasan'"
      @update:open="onFormClose"
    >
      <FormField label="KDL" :error="form.errors.kdlId">
        <template #default="{ id }">
          <select :id="id" v-model.number="form.kdlId" :disabled="form.saving">
            <option :value="null" disabled>— pilih KDL —</option>
            <option v-for="k in kdls" :key="k.id" :value="k.id">{{ k.name }}</option>
          </select>
        </template>
      </FormField>
      <FormField label="Judul" :error="form.errors.title">
        <template #default="{ id }">
          <input :id="id" v-model="form.title" :disabled="form.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Deskripsi">
        <template #default="{ id }">
          <textarea :id="id" v-model="form.description" rows="3" :disabled="form.saving" />
        </template>
      </FormField>
      <FormField label="Batas (tanggal)" :error="form.errors.dueOn">
        <template #default="{ id }">
          <input :id="id" v-model="form.dueOn" type="date" :disabled="form.saving" />
        </template>
      </FormField>
      <FormField label="Status" :error="form.errors.status">
        <template #default="{ id }">
          <select :id="id" v-model="form.status" :disabled="form.saving">
            <option value="PENDING">PENDING</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
          </select>
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

const kdls = ref([])
const rows = ref([])
const loading = ref(false)
const error = ref('')
const filterKdlId = ref(null)

function emptyForm () {
  return {
    open: false, editing: null, kdlId: null, title: '', description: '',
    dueOn: '', status: 'PENDING',
    errors: {}, serverError: '', saving: false,
  }
}
const form = reactive(emptyForm())
const confirm = reactive({ open: false, title: '', message: '', handler: null })

function kdlName (id) {
  return kdls.value.find((k) => k.id === id)?.name || `#${id}`
}

async function loadKdls () {
  try {
    kdls.value = await api.get('/api/kdl')
  } catch (err) {
    error.value = `Gagal memuat daftar KDL: ${err.message}`
  }
}

async function reload () {
  loading.value = true
  error.value = ''
  try {
    const url = filterKdlId.value
      ? `/api/penugasan?kdlId=${filterKdlId.value}`
      : '/api/penugasan'
    rows.value = await api.get(url)
  } catch (err) {
    error.value = `Gagal memuat penugasan: ${err.message}`
  } finally {
    loading.value = false
  }
}

watch(filterKdlId, reload)

function openCreate () { Object.assign(form, emptyForm(), { open: true, kdlId: filterKdlId.value }) }
function openEdit (r) {
  Object.assign(form, emptyForm(), {
    open: true, editing: r, kdlId: r.kdlId, title: r.title,
    description: r.description || '', dueOn: r.dueOn || '',
    status: r.status,
  })
}
function onFormClose (open) {
  form.open = open
  if (!open) Object.assign(form, emptyForm())
}

async function submit (close) {
  form.errors = {}
  form.serverError = ''
  if (!form.kdlId) form.errors.kdlId = 'Wajib dipilih'
  if (!form.title.trim()) form.errors.title = 'Wajib diisi'
  if (Object.keys(form.errors).length > 0) return

  form.saving = true
  try {
    const payload = {
      kdlId: form.kdlId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      dueOn: form.dueOn || null,
      status: form.status,
    }
    if (form.editing) await api.put(`/api/penugasan/${form.editing.id}`, payload)
    else await api.post('/api/penugasan', payload)
    close()
    await reload()
  } catch (err) {
    if (err instanceof ApiError && err.fields) form.errors = err.fields
    form.serverError = err.message
  } finally {
    form.saving = false
  }
}

function markDone (r) {
  confirm.title = 'Tandai selesai?'
  confirm.message = `Penugasan "${r.title}" akan ditandai DONE dan completed_at diisi dengan waktu sekarang.`
  confirm.handler = async () => {
    try {
      await api.post(`/api/penugasan/${r.id}/complete`)
      await reload()
    } catch (err) {
      error.value = `Gagal menandai selesai: ${err.message}`
    }
  }
  confirm.open = true
}

function askDelete (r) {
  confirm.title = 'Hapus penugasan?'
  confirm.message = `Hapus penugasan "${r.title}"?`
  confirm.handler = async () => {
    try {
      await api.delete(`/api/penugasan/${r.id}`)
      await reload()
    } catch (err) {
      error.value = `Gagal menghapus: ${err.message}`
    }
  }
  confirm.open = true
}

onMounted(async () => {
  await loadKdls()
  await reload()
})
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
.filter { display: grid; gap: 0.3rem; min-width: 220px; }
.filter span { font-size: 0.78rem; color: #475569; }
.filter select { padding: 0.4rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px; background: white; font: inherit; }
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
.title-cell { max-width: 30ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted-cell { color: #64748b; font-size: 0.85rem; max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-col { display: flex; gap: 0.4rem; align-items: center; }
.status {
  font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px;
  background: #e2e8f0; color: #334155;
}
.status.s-DONE { background: #dcfce7; color: #166534; }
.status.s-PENDING { background: #fef3c7; color: #92400e; }
.status.s-IN_PROGRESS { background: #dbeafe; color: #1e40af; }
</style>