<template>
  <main class="landing">
    <header class="hero">
      <h1>KDTU Admin</h1>
      <p class="subtitle">SIDANG SRENGSENG-3 — coordinator console</p>
    </header>

    <section v-if="!auth.isAuthenticated" class="card">
      <h2>Sign in</h2>
      <p class="muted">
        Default credentials come from <code>server/scripts/seed.js</code>:
        username <code>koordinator_srengseng3</code> and a 32-char random
        password that is printed once when you run <code>npm run server:seed</code>.
        The first login forces a rotation via
        <code>POST /api/auth/change-password</code>; every protected route
        returns <code>403 PASSWORD_RESET_REQUIRED</code> until then.
      </p>

      <form class="probe-form" @submit.prevent="login">
        <label>
          username
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          password
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <button class="primary" type="submit" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
      <p v-if="result" class="result" :class="{ ok: ok, err: !ok }">
        {{ result }}
      </p>
    </section>

    <section v-else class="card">
      <h2>Selamat datang, {{ auth.displayName }}</h2>
      <p class="muted">
        Anda masuk sebagai <code>{{ auth.user?.role || 'admin' }}</code>.
        Buka halaman <router-link to="/files">/files</router-link> untuk
        mengunduh spreadsheet &amp; gambar HD dari server.
      </p>
      <p v-if="auth.mustChangePassword" class="warning">
        Anda masih menggunakan kata sandi bawaan. Rotasi sebelum 24 jam
        pertama lewat (endpoint <code>POST /api/auth/change-password</code>).
      </p>
      <div class="actions">
        <router-link class="primary" to="/files">Buka Berkas</router-link>
        <button class="ghost" type="button" @click="logout">Keluar</button>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '../api/http.js'
import { useAdminAuthStore } from '../stores/auth.js'

const auth = useAdminAuthStore()
const router = useRouter()

const result = ref('')
const ok = ref(false)
const loading = ref(false)
const username = ref('koordinator_srengseng3')
const password = ref('')

async function login () {
  result.value = ''
  ok.value = false
  loading.value = true
  try {
    const { data } = await http.post('/api/auth/login', {
      username: username.value,
      password: password.value,
    })
    auth.setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: { name: data.user?.name || username.value, role: data.role },
      mustChangePassword: Boolean(data.mustChangePassword),
    })
    ok.value = true
    result.value = `Logged in as ${auth.displayName}.`
    // Land on the Files page since that's the most useful next step.
    router.push('/files')
  } catch (err) {
    ok.value = false
    const message = err?.response?.data?.message || err.message
    result.value = `${err?.response?.status || '??'} — ${message}`
  } finally {
    loading.value = false
  }
}

function logout () {
  auth.clear()
  result.value = ''
  ok.value = false
  password.value = ''
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
.warning {
  margin: 0.75rem 0;
  padding: 0.6rem 0.8rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  border-radius: 6px;
  font-size: 0.88rem;
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
  text-decoration: none;
  display: inline-block;
  font-size: 0.95rem;
}
.primary:hover { background: #3730a3; }
.primary:disabled { opacity: 0.6; cursor: progress; }
.ghost {
  background: transparent;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.55rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
}
.ghost:hover { background: #f1f5f9; }
.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}
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