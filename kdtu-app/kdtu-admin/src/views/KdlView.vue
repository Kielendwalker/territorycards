<template>
  <main class="admin-page">
    <header class="page-head">
      <div>
        <h1>Kelompok Pelayanan (KDL)</h1>
        <p class="muted">
          Kelola kelompok pelayanan dan anggota di dalamnya. Klik nama KDL
          untuk membuka detail anggota.
        </p>
      </div>
    </header>

    <section class="toolbar">
      <button class="primary" type="button" @click="openCreate">+ Tambah KDL</button>
      <button class="ghost" type="button" @click="reload">Segarkan</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <table v-if="kdls.length > 0" class="data-table">
      <thead>
        <tr>
          <th>Nama</th>
          <th>Pemimpin</th>
          <th>Hari Pertemuan</th>
          <th>Jam</th>
          <th>Lokasi</th>
          <th class="num-cell">Anggota</th>
          <th class="actions-col">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="k in kdls" :key="k.id">
          <td>
            <button class="link" type="button" @click="openDetail(k)">{{ k.name }}</button>
          </td>
          <td>{{ k.leader || '—' }}</td>
          <td>{{ k.meetingDay || '—' }}</td>
          <td>{{ k.meetingTime || '—' }}</td>
          <td>{{ k.location || '—' }}</td>
          <td class="num-cell">{{ k.memberCount }}</td>
          <td class="actions-col">
            <button class="ghost" type="button" @click="openEdit(k)">Edit</button>
            <button class="danger" type="button" @click="askDelete(k)">Hapus</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">Belum ada KDL.</p>

    <AdminModal
      :open="form.open"
      :title="form.editing ? 'Edit KDL' : 'Tambah KDL'"
      @update:open="onFormClose"
    >
      <FormField label="Nama" :error="form.errors.name">
        <template #default="{ id }">
          <input :id="id" v-model="form.name" :disabled="form.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Pemimpin">
        <template #default="{ id }">
          <input :id="id" v-model="form.leader" :disabled="form.saving" maxlength="200" />
        </template>
      </FormField>
      <FormField label="Hari Pertemuan">
        <template #default="{ id }">
          <select :id="id" v-model="form.meetingDay" :disabled="form.saving">
            <option value="">—</option>
            <option v-for="d in DAYS" :key="d" :value="d">{{ d }}</option>
          </select>
        </template>
      </FormField>
      <FormField label="Jam Pertemuan">
        <template #default="{ id }">
          <input :id="id" v-model="form.meetingTime" :disabled="form.saving" placeholder="contoh: 19:00" maxlength="20" />
        </template>
      </FormField>
      <FormField label="Lokasi">
        <template #default="{ id }">
          <input :id="id" v-model="form.location" :disabled="form.saving" maxlength="200" />
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

    <!-- Detail / members modal -->
    <AdminModal
      :open="detail.open"
      :title="detail.kdl ? `Anggota ${detail.kdl.name}` : 'Detail KDL'"
      @update:open="onDetailClose"
    >
      <div v-if="detail.kdl" class="kdl-detail">
        <dl class="kdl-detail__meta">
          <dt>Pemimpin</dt><dd>{{ detail.kdl.leader || '—' }}</dd>
          <dt>Hari/Jam</dt><dd>{{ detail.kdl.meetingDay || '—' }} {{ detail.kdl.meetingTime || '' }}</dd>
          <dt>Lokasi</dt><dd>{{ detail.kdl.location || '—' }}</dd>
          <dt>Pengumuman</dt><dd>{{ detail.kdl.announcements || '—' }}</dd>
        </dl>

        <h3 class="kdl-detail__h">Anggota ({{ detail.members.length }})</h3>
        <ul class="member-list">
          <li v-for="m in detail.members" :key="m.id">
            <span>Anggota #{{ m.id }}</span>
            <span :class="['status', m.active ? 'on' : 'off']">{{ m.active ? 'Aktif' : 'Non-aktif' }}</span>
            <button class="danger" type="button" @click="detachMember(m)">Lepas</button>
          </li>
        </ul>

        <details class="add-member">
          <summary>+ Pasangkan anggota yang ada</summary>
          <FormField label="ID anggota">
            <template #default="{ id }">
              <input :id="id" v-model.number="detail.newMemberId" type="number" min="1" />
            </template>
          </FormField>
          <button class="primary" type="button" :disabled="!detail.newMemberId || detail.attaching" @click="attachMember">
            {{ detail.attaching ? 'Memasang…' : 'Pasangkan' }}
          </button>
          <p v-if="detail.attachError" class="error server">{{ detail.attachError }}</p>
        </details>

        <h3 class="kdl-detail__h">Penugasan ({{ detail.penugasan.length }})</h3>
        <ul class="penugasan-list">
          <li v-for="p in detail.penugasan" :key="p.id">
            <strong>{{ p.title }}</strong>
            <span class="status" :class="`s-${p.status}`">{{ p.status }}</span>
          </li>
          <li v-if="detail.penugasan.length === 0" class="muted-cell">Belum ada penugasan.</li>
        </ul>
      </div>
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
import { onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '../api/index.js'
import AdminModal from '../components/AdminModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FormField from '../components/FormField.vue'
import { TIMETABLE_DAY } from '@kdtu/shared'

const DAYS = Object.values(TIMETABLE_DAY)

const kdls = ref([])
const loading = ref(false)
const error = ref('')

function emptyForm () {
  return { open: false, editing: null, name: '', leader: '', meetingDay: '', meetingTime: '', location: '', errors: {}, serverError: '', saving: false }
}
function emptyDetail () {
  return { open: false, kdl: null, members: [], penugasan: [], newMemberId: null, attaching: false, attachError: '' }
}
const form = reactive(emptyForm())
const detail = reactive(emptyDetail())
const confirm = reactive({ open: false, title: '', message: '', handler: null })

async function reload () {
  loading.value = true
  error.value = ''
  try {
    kdls.value = await api.get('/api/kdl')
  } catch (err) {
    error.value = `Gagal memuat daftar KDL: ${err.message}`
  } finally {
    loading.value = false
  }
}

function openCreate () { Object.assign(form, emptyForm(), { open: true }) }
function openEdit (k) {
  Object.assign(form, emptyForm(), {
    open: true, editing: k,
    name: k.name, leader: k.leader || '', meetingDay: k.meetingDay || '',
    meetingTime: k.meetingTime || '', location: k.location || '',
  })
}
function onFormClose (open) {
  form.open = open
  if (!open) Object.assign(form, emptyForm())
}

async function submit (close) {
  form.errors = {}
  form.serverError = ''
  if (!form.name.trim()) form.errors.name = 'Wajib diisi'
  if (Object.keys(form.errors).length > 0) return

  form.saving = true
  try {
    const payload = {
      name: form.name.trim(),
      leader: form.leader.trim() || null,
      meetingDay: form.meetingDay || null,
      meetingTime: form.meetingTime.trim() || null,
      location: form.location.trim() || null,
    }
    if (form.editing) await api.put(`/api/kdl/${form.editing.id}`, payload)
    else await api.post('/api/kdl', payload)
    close()
    await reload()
  } catch (err) {
    if (err instanceof ApiError && err.fields) form.errors = err.fields
    form.serverError = err.message
  } finally {
    form.saving = false
  }
}

function askDelete (k) {
  confirm.title = 'Hapus KDL?'
  confirm.message = `Hapus KDL "${k.name}"? Semua anggota yang terpasang di KDL ini akan dilepas (CASCADE).`
  confirm.handler = async () => {
    try {
      await api.delete(`/api/kdl/${k.id}`)
      await reload()
    } catch (err) {
      error.value = `Gagal menghapus KDL: ${err.message}`
    }
  }
  confirm.open = true
}

async function openDetail (k) {
  detail.open = true
  detail.kdl = k
  detail.members = []
  detail.penugasan = []
  detail.newMemberId = null
  detail.attachError = ''
  try {
    const [members, penugasan] = await Promise.all([
      api.get(`/api/kdl/${k.id}/members`),
      api.get(`/api/kdl/${k.id}/penugasan`),
    ])
    detail.members = Array.isArray(members) ? members : []
    detail.penugasan = Array.isArray(penugasan) ? penugasan : []
  } catch (err) {
    detail.attachError = `Gagal memuat detail: ${err.message}`
  }
}

function onDetailClose (open) {
  detail.open = open
  if (!open) Object.assign(detail, emptyDetail())
}

async function attachMember () {
  if (!detail.kdl || !detail.newMemberId) return
  detail.attaching = true
  detail.attachError = ''
  try {
    await api.post(`/api/kdl/${detail.kdl.id}/members`, { memberId: Number(detail.newMemberId) })
    detail.members = await api.get(`/api/kdl/${detail.kdl.id}/members`)
    detail.newMemberId = null
    await reload() // refresh memberCount
  } catch (err) {
    detail.attachError = err.message
  } finally {
    detail.attaching = false
  }
}

function detachMember (m) {
  confirm.title = 'Lepas anggota?'
  confirm.message = `Lepas anggota #${m.id} dari KDL ${detail.kdl.name}?`
  confirm.handler = async () => {
    try {
      await api.delete(`/api/kdl/${detail.kdl.id}/members/${m.id}`)
      detail.members = await api.get(`/api/kdl/${detail.kdl.id}/members`)
      await reload()
    } catch (err) {
      detail.attachError = `Gagal melepas: ${err.message}`
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
  display: flex; gap: 0.75rem; align-items: center;
  background: white; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 0.9rem 1.1rem; margin-bottom: 1rem;
}
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
button.link {
  background: none; border: 0; padding: 0; color: #4338ca;
  text-decoration: underline; cursor: pointer; font: inherit;
}
button.link:hover { color: #312e81; }
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
.actions-col { display: flex; gap: 0.4rem; align-items: center; }

.kdl-detail__meta {
  display: grid; grid-template-columns: max-content 1fr;
  gap: 0.3rem 1rem; margin: 0 0 1rem;
  font-size: 0.92rem;
}
.kdl-detail__meta dt { color: #64748b; }
.kdl-detail__h { font-size: 1rem; margin: 1rem 0 0.5rem; color: #334155; }
.member-list, .penugasan-list {
  list-style: none; padding: 0; margin: 0 0 0.5rem;
  display: grid; gap: 0.4rem;
}
.member-list li, .penugasan-list li {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.4rem 0.6rem; background: #f8fafc; border-radius: 6px;
  font-size: 0.9rem;
}
.member-list li > span:first-child { flex: 1; color: #334155; }
.status {
  font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px;
  background: #e2e8f0; color: #334155;
}
.status.on { background: #dcfce7; color: #166534; }
.status.off { background: #f1f5f9; color: #475569; }
.status.s-DONE { background: #dcfce7; color: #166534; }
.status.s-PENDING { background: #fef3c7; color: #92400e; }
.status.s-IN_PROGRESS { background: #dbeafe; color: #1e40af; }
.muted-cell { color: #64748b; }
.add-member {
  margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #f1f5f9;
}
.add-member summary { cursor: pointer; font-weight: 500; color: #334155; }
.add-member input[type=number] {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid #cbd5e1;
  border-radius: 6px; margin: 0.5rem 0 0.6rem; font: inherit;
}
</style>