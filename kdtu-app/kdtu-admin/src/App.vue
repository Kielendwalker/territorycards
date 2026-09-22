<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <strong>KDTU</strong>
        <span>Admin</span>
      </div>
      <nav>
        <router-link to="/" exact-active-class="active">Beranda</router-link>
        <router-link to="/timetable" active-class="active">Jadwal</router-link>
        <router-link to="/publications" active-class="active">Katalog</router-link>
        <router-link to="/kdl" active-class="active">KDL</router-link>
        <router-link to="/penugasan" active-class="active">Penugasan</router-link>
        <router-link to="/summary" active-class="active">Ringkasan</router-link>
        <router-link to="/files" active-class="active">Berkas</router-link>
      </nav>
      <div v-if="auth.isAuthenticated" class="user">
        <span>{{ auth.displayName }}</span>
        <button class="ghost" type="button" @click="logout">Keluar</button>
      </div>
    </aside>
    <main class="main-area">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAdminAuthStore } from './stores/auth.js'

const auth = useAdminAuthStore()
const router = useRouter()

function logout () {
  auth.clear()
  router.replace('/')
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
  background: #f8fafc;
}
.sidebar {
  background: white;
  border-right: 1px solid #e2e8f0;
  padding: 1.25rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  display: flex;
  flex-direction: column;
  padding: 0 0.5rem 0.5rem;
  border-bottom: 1px solid #f1f5f9;
}
.brand strong { font-size: 1.05rem; color: #0f172a; letter-spacing: 0.04em; }
.brand span { font-size: 0.78rem; color: #475569; text-transform: uppercase; letter-spacing: 0.12em; }
nav { display: flex; flex-direction: column; gap: 0.1rem; }
nav a {
  display: block;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  text-decoration: none;
  color: #334155;
  font-size: 0.92rem;
  font-weight: 500;
}
nav a:hover { background: #f1f5f9; }
nav a.active {
  background: #eef2ff;
  color: #312e81;
  font-weight: 600;
}
.user {
  margin-top: auto;
  border-top: 1px solid #f1f5f9;
  padding-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #475569;
}
.user button {
  background: transparent;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}
.user button:hover { background: #f1f5f9; }
.main-area { min-width: 0; }
</style>