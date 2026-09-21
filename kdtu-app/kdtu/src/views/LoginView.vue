<template>
  <div class="kdtu-login">
    <div class="kdtu-login__card">
      <!--
        When MEMBER_LOGIN_ENABLED is false we hide the PIN form and show a
        clear notice. The API surface has been killed (POST /api/auth/pin-login
        returns 410) so even a hand-crafted request would fail. This keeps the
        public kdtu workspace from looking like a working login page while the
        admin surface is the only live route.
      -->
      <template v-if="!MEMBER_LOGIN_ENABLED">
        <h1 class="kdtu-login__brand">KDTU</h1>
        <p class="kdtu-login__tagline">SIDANG SRENGSENG-3</p>
        <p class="kdtu-login__notice">
          Halaman login anggota dinonaktifkan. Akses jadwal &amp; tugas
          sekarang hanya tersedia melalui konsol koordinator (KDTU Admin).
          Hubungi koordinator KDTU jika Anda adalah anggota yang membutuhkan
          informasi terbaru.
        </p>
      </template>

      <template v-else>
        <h1 class="kdtu-login__brand">KDTU</h1>
        <p class="kdtu-login__tagline">SIDANG SRENGSENG-3</p>
        <p class="kdtu-login__intro">
          Masukkan nama dan PIN 4 digit untuk melihat jadwal pelayanan Anda.
        </p>

        <FormField label="Nama" :error="errors.name">
          <template #default="{ id }">
            <input
              :id="id"
              v-model="name"
              class="kdtu-input"
              type="text"
              autocomplete="username"
              placeholder="contoh: Budi Santoso"
              @keydown.enter="onSubmit"
            />
          </template>
        </FormField>

        <FormField label="PIN" :error="errors.pin">
          <template #default="{ id }">
            <input
              :id="id"
              v-model="pin"
              class="kdtu-input kdtu-input--pin"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              autocomplete="one-time-code"
              placeholder="••••"
              @keydown.enter="onSubmit"
            />
          </template>
        </FormField>

        <p v-if="errorMessage" class="kdtu-login__error">{{ errorMessage }}</p>

        <button
          type="button"
          class="kdtu-btn kdtu-btn--primary kdtu-btn--block"
          :disabled="loading"
          @click="onSubmit"
        >
          {{ loading ? 'Memeriksa…' : 'Masuk' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '../api/http.js'
import { AUTH_PIN_LOGIN, MEMBER_LOGIN_ENABLED } from '@kdtu/shared'
import { useAuthStore } from '../stores/auth.js'
import FormField from '../components/FormField.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const name = ref('')
const pin = ref('')
const loading = ref(false)
const errorMessage = ref('')
const errors = reactive({ name: '', pin: '' })

function validate() {
  errors.name = name.value.trim() ? '' : 'Nama wajib diisi'
  errors.pin = /^\d{4}$/.test(pin.value) ? '' : 'PIN harus 4 digit angka'
  return !errors.name && !errors.pin
}

async function onSubmit() {
  errorMessage.value = ''
  if (!validate()) return
  loading.value = true
  try {
    const { data } = await http.post(AUTH_PIN_LOGIN, {
      name: name.value.trim(),
      pin: pin.value,
    })
    auth.setSession({
      token: data.token,
      member: {
        id: data.member.id,
        name: data.member.name,
        kdlName: data.member.kdlName || null,
        availabilityDays: data.member.availabilityDays || [],
      },
    })
    const next = typeof route.query.next === 'string' ? route.query.next : '/today'
    router.replace(next)
  } catch (err) {
    errorMessage.value =
      err?.response?.data?.message || 'Nama atau PIN salah. Coba lagi.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.kdtu-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--kdtu-space-5);
  background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
}

.kdtu-login__card {
  width: 100%;
  max-width: 380px;
  background: var(--kdtu-color-surface);
  border: 1px solid var(--kdtu-color-border);
  border-radius: var(--kdtu-radius-xl);
  box-shadow: var(--kdtu-shadow-md);
  padding: var(--kdtu-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--kdtu-space-4);
}

.kdtu-login__brand {
  margin: 0;
  font-size: 32px;
  letter-spacing: 0.08em;
  color: var(--kdtu-color-primary);
  text-align: center;
}

.kdtu-login__tagline {
  margin: 0;
  text-align: center;
  font-size: var(--kdtu-font-size-xs);
  color: var(--kdtu-color-ink-subtle);
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.kdtu-login__intro {
  margin: var(--kdtu-space-2) 0;
  text-align: center;
  color: var(--kdtu-color-ink-muted);
  line-height: 1.5;
}

.kdtu-login__notice {
  margin: var(--kdtu-space-2) 0 0;
  padding: var(--kdtu-space-4);
  background: var(--kdtu-color-warning-soft, #fef3c7);
  color: var(--kdtu-color-warning-strong, #92400e);
  border-radius: var(--kdtu-radius-md);
  font-size: var(--kdtu-font-size-sm);
  line-height: 1.55;
  text-align: center;
}

.kdtu-input--pin {
  letter-spacing: 0.6em;
  text-align: center;
  font-size: var(--kdtu-font-size-xl);
}

.kdtu-login__error {
  margin: 0;
  padding: var(--kdtu-space-2) var(--kdtu-space-3);
  background: var(--kdtu-color-danger-soft);
  color: var(--kdtu-color-danger);
  border-radius: var(--kdtu-radius-md);
  font-size: var(--kdtu-font-size-sm);
}
</style>