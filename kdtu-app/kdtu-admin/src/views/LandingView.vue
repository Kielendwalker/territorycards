<template>
  <main class="landing">
    <header class="hero">
      <h1>KDTU Admin</h1>
      <p class="subtitle">SIDANG SRENGSENG-3 — coordinator console</p>
    </header>

    <section class="card">
      <h2>Sign in</h2>
      <p class="muted">
        Default credentials come from <code>server/scripts/seed.js</code>:
        username <code>koordinator_srengseng3</code> and a 32-char random
        password that is printed once when you run <code>npm run server:seed</code>.
        The first login forces a rotation via
        <code>POST /api/auth/change-password</code>; every protected route
        returns <code>403 PASSWORD_RESET_REQUIRED</code> until then.
      </p>
      <p class="muted">
        Halaman <router-link to="/files">/files</router-link> sudah tersedia —
        menampilkan spreadsheet dan gambar HD dari folder
        <code>kdtu-data/</code> di server. CRUD lengkap (KDL, members,
        publications, summary, timetable) menyusul di PR berikutnya. API di
        <a href="http://localhost:5180/api/health" target="_blank" rel="noreferrer">/api/health</a>
        dapat dicek.
      </p>

      <form class="probe-form" @submit.prevent="probe">
        <label>
          username
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          password
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <button class="primary" type="submit">Probe /api/auth/login</button>
      </form>
      <p v-if="result" class="result" :class="{ ok: ok, err: !ok }">{{ result }}</p>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'

const result = ref('')
const ok = ref(false)
const username = ref('koordinator_srengseng3')
const password = ref('')

async function probe () {
  result.value = '…probing'
  ok.value = false
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const text = await res.text()
    ok.value = res.ok
    result.value = `${res.status} ${res.statusText} — ${text.slice(0, 200)}`
  } catch (err) {
    ok.value = false
    result.value = `network error: ${err.message}`
  }
}
</script>

<style scoped>
.landing {
  max-width: 640px;
  margin: 4rem auto;
  padding: 0 1.5rem;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.hero h1 {
  font-size: 2.25rem;
  margin: 0 0 0.25rem;
  color: #0f172a;
}
.subtitle {
  color: #475569;
  margin: 0 0 2rem;
}
.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem 1.75rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.card h2 {
  margin: 0 0 0.75rem;
  font-size: 1.125rem;
  color: #0f172a;
}
.muted {
  color: #475569;
  line-height: 1.55;
}
code {
  background: #f1f5f9;
  padding: 0 0.25rem;
  border-radius: 4px;
  font-size: 0.9em;
}
.primary {
  background: #4338ca;
  color: white;
  border: 0;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.primary:hover { background: #3730a3; }
.result {
  margin-top: 1rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  word-break: break-all;
}
.result.ok  { background: #ecfdf5; color: #065f46; }
.result.err { background: #fef2f2; color: #991b1b; }
.probe-form {
  margin-top: 1rem;
  display: grid;
  gap: 0.6rem;
  max-width: 360px;
}
.probe-form label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #475569;
}
.probe-form input {
  padding: 0.5rem 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
}
</style>
