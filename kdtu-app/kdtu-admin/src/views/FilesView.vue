<template>
  <main class="files-view">
    <header class="head">
      <div>
        <h1>Berkas KDTU</h1>
        <p class="muted">
          Daftar arsip penjadwalan &amp; dokumentasi HD yang berada di server
          <code>kdtu-data/</code>. Klik <em>Unduh</em> untuk menyimpan salinan
          lokal, atau buka pratinjau untuk gambar resolusi tinggi.
        </p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="refresh">
        {{ loading ? 'Memuat…' : 'Segarkan' }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="!loading && files.length === 0 && !error" class="empty">
      Belum ada berkas yang diindeks. Letakkan file
      <code>.xlsx</code>, <code>.pdf</code>, atau gambar di folder
      <code>kdtu-data/</code> pada server lalu segarkan halaman ini.
    </section>

    <table v-else-if="files.length > 0" class="files-table">
      <thead>
        <tr>
          <th scope="col">Nama</th>
          <th scope="col">Jenis</th>
          <th scope="col">Ukuran</th>
          <th scope="col">Diubah</th>
          <th scope="col" class="actions-col">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in files" :key="f.id" :class="{ 'is-image': f.kind === 'image' }">
          <td class="name-cell" :title="f.name">
            <code>{{ f.name }}</code>
          </td>
          <td>
            <span class="badge" :class="`kind-${f.kind}`">{{ kindLabel(f.kind) }}</span>
          </td>
          <td class="num">{{ formatSize(f.size_bytes) }}</td>
          <td class="num">{{ formatDate(f.updated_at) }}</td>
          <td class="actions-col">
            <button
              class="primary"
              type="button"
              :data-testid="`download-${f.id}`"
              @click="download(f)"
            >
              Unduh
            </button>
            <button
              v-if="f.kind === 'image'"
              class="secondary"
              type="button"
              :data-testid="`preview-${f.id}`"
              @click="openPreview(f)"
            >
              Pratinjau
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Inline image preview modal. Uses <dialog> for a11y + Escape-to-close. -->
    <dialog
      ref="previewDialog"
      class="preview-dialog"
      @close="onPreviewClose"
    >
      <header>
        <strong>{{ previewFile?.name }}</strong>
        <button class="ghost" type="button" @click="closePreview" aria-label="Tutup pratinjau">×</button>
      </header>
      <img
        v-if="previewFile"
        :src="previewSrc"
        :alt="previewFile.name"
        class="preview-image"
      />
      <footer>
        <a class="primary" :href="previewDownloadHref" download>Unduh salinan</a>
        <button class="ghost" type="button" @click="closePreview">Tutup</button>
      </footer>
    </dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

// FilesView — admin-only listing of files in kdtu-data/.
//
// All requests carry the admin JWT (set by AuthStore as kdtu_session cookie +
// Authorization header). The API uses opaque integer ids, so the only network
// surface is /api/files (list) and /api/files/:id/{download,preview}.
//
// Downloads use Content-Disposition: attachment so browsers offer a "Save as"
// dialog. Previews stream inline at the route /api/files/:id/preview which
// returns image/* with a short private cache.
const files = ref([])
const loading = ref(false)
const error = ref('')
const previewDialog = ref(null)
const previewFile = ref(null)

const previewSrc = computed(() =>
  previewFile.value ? `/api/files/${previewFile.value.id}/preview` : ''
)
const previewDownloadHref = computed(() =>
  previewFile.value ? `/api/files/${previewFile.value.id}/download` : ''
)

const KIND_LABELS = {
  spreadsheet: 'Spreadsheet',
  image: 'Gambar',
  document: 'Dokumen',
}
function kindLabel (kind) {
  return KIND_LABELS[kind] || kind
}

function formatSize (bytes) {
  if (!Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1 }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate (iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('id-ID', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

async function refresh () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/files', { credentials: 'same-origin' })
    if (!res.ok) {
      // Surface the JSON envelope from the API.
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message || `HTTP ${res.status}`)
    }
    const body = await res.json()
    files.value = Array.isArray(body.files) ? body.files : []
  } catch (err) {
    error.value = `Gagal memuat daftar berkas: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function download (file) {
  // Use a hidden anchor with the `download` attribute so the browser uses the
  // server-suggested filename from Content-Disposition. We MUST include
  // credentials so the session cookie travels; the admin JWT alone is not
  // enough because the cookie carries the refresh token + role hint.
  const a = document.createElement('a')
  a.href = `/api/files/${file.id}/download`
  a.rel = 'noopener'
  a.setAttribute('download', file.name)
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Give the browser a tick to start the download before removing the anchor.
  setTimeout(() => a.remove(), 1500)
}

async function openPreview (file) {
  previewFile.value = file
  // <dialog>.showModal() returns a Promise on modern browsers.
  if (previewDialog.value && typeof previewDialog.value.showModal === 'function') {
    previewDialog.value.showModal()
  }
}

function closePreview () {
  if (previewDialog.value && typeof previewDialog.value.close === 'function') {
    previewDialog.value.close()
  }
}

function onPreviewClose () {
  previewFile.value = null
}

onMounted(refresh)
</script>

<style scoped>
.files-view {
  max-width: 960px;
  margin: 2rem auto;
  padding: 0 1.5rem 4rem;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: #0f172a;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.head h1 {
  margin: 0 0 0.35rem;
  font-size: 1.75rem;
}
.muted {
  color: #475569;
  margin: 0;
  line-height: 1.55;
  max-width: 56ch;
}
code {
  background: #f1f5f9;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.85em;
}
.error {
  background: #fef2f2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid #fecaca;
}
.empty {
  background: white;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 2rem;
  text-align: center;
  color: #475569;
}
.files-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.files-table th,
.files-table td {
  text-align: left;
  padding: 0.65rem 0.9rem;
  font-size: 0.92rem;
  border-bottom: 1px solid #f1f5f9;
}
.files-table th {
  background: #f8fafc;
  font-weight: 600;
  color: #334155;
}
.files-table tbody tr:last-child td { border-bottom: 0; }
.files-table tr.is-image { background: #fafaff; }
.name-cell code {
  display: inline-block;
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}
.num {
  font-variant-numeric: tabular-nums;
  color: #475569;
  white-space: nowrap;
}
.actions-col {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  white-space: nowrap;
}
.badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 500;
  background: #e2e8f0;
  color: #334155;
}
.badge.kind-image      { background: #ede9fe; color: #5b21b6; }
.badge.kind-spreadsheet { background: #dbeafe; color: #1e40af; }
.badge.kind-document   { background: #fef3c7; color: #92400e; }

button.primary,
button.secondary,
button.ghost {
  border: 0;
  padding: 0.4rem 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
}
button.primary  { background: #4338ca; color: white; }
button.primary:hover { background: #3730a3; }
button.secondary { background: white; color: #4338ca; border: 1px solid #c7d2fe; }
button.secondary:hover { background: #eef2ff; }
button.ghost    { background: transparent; color: #475569; }
button.ghost:hover { background: #f1f5f9; }
button:disabled { opacity: 0.55; cursor: progress; }

.preview-dialog {
  border: 0;
  border-radius: 12px;
  padding: 0;
  max-width: min(96vw, 1200px);
  max-height: 92vh;
  background: #0f172a;
  color: white;
  box-shadow: 0 24px 48px rgba(0,0,0,0.45);
}
.preview-dialog::backdrop {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(2px);
}
.preview-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  background: #1e293b;
  border-radius: 12px 12px 0 0;
}
.preview-dialog header strong {
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60ch;
}
.preview-dialog header button {
  font-size: 1.4rem;
  line-height: 1;
  padding: 0 0.5rem;
}
.preview-image {
  display: block;
  max-width: 100%;
  max-height: calc(92vh - 110px);
  margin: 0 auto;
  object-fit: contain;
  background: #0f172a;
}
.preview-dialog footer {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 0.6rem 1rem;
  background: #1e293b;
  border-radius: 0 0 12px 12px;
}
.preview-dialog footer a.primary { text-decoration: none; }
</style>