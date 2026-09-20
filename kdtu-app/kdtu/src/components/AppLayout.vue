<template>
  <div class="kdtu-app">
    <header class="kdtu-topbar">
      <button
        type="button"
        class="kdtu-btn kdtu-btn--ghost kdtu-btn--sm kdtu-app__menu"
        :aria-label="menuOpen ? 'Tutup menu' : 'Buka menu'"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <span aria-hidden="true">&#9776;</span>
      </button>
      <div class="kdtu-topbar__brand">
        <span class="kdtu-topbar__logo">KDTU</span>
        <span class="kdtu-topbar__subtitle">SIDANG SRENGSENG-3</span>
      </div>
      <div class="kdtu-topbar__spacer"></div>
      <div v-if="auth.isAuthenticated" class="kdtu-topbar__user">
        <span class="kdtu-topbar__chip">{{ auth.displayName }}</span>
        <button
          type="button"
          class="kdtu-btn kdtu-btn--ghost kdtu-btn--sm"
          @click="onLogout"
        >
          Keluar
        </button>
      </div>
    </header>

    <div class="kdtu-app__body">
      <aside class="kdtu-sidebar" :class="{ 'kdtu-sidebar--open': menuOpen }">
        <nav>
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="kdtu-sidebar__link"
            active-class="kdtu-sidebar__link--active"
            @click="menuOpen = false"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </aside>
      <div
        v-if="menuOpen"
        class="kdtu-app__backdrop"
        aria-hidden="true"
        @click="menuOpen = false"
      ></div>

      <main class="kdtu-app__main">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

const menuOpen = ref(false)

const navItems = [
  { to: '/today', label: 'Hari Ini' },
  { to: '/timetable', label: 'Jadwal Lengkap' },
  { to: '/me', label: 'Profil & Ketersediaan' },
]

watch(
  () => router.currentRoute.value.fullPath,
  () => {
    menuOpen.value = false
  },
)

function onLogout() {
  auth.logout()
  router.replace('/login')
}
</script>

<style scoped>
.kdtu-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.kdtu-topbar {
  position: sticky;
  top: 0;
  z-index: var(--kdtu-z-topbar);
  display: flex;
  align-items: center;
  gap: var(--kdtu-space-3);
  padding: var(--kdtu-space-3) var(--kdtu-space-5);
  background: var(--kdtu-color-surface);
  border-bottom: 1px solid var(--kdtu-color-border);
}

.kdtu-app__menu {
  display: none;
}

.kdtu-topbar__brand {
  display: flex;
  align-items: baseline;
  gap: var(--kdtu-space-2);
}

.kdtu-topbar__logo {
  font-weight: 700;
  font-size: var(--kdtu-font-size-lg);
  color: var(--kdtu-color-primary);
  letter-spacing: 0.04em;
}

.kdtu-topbar__subtitle {
  font-size: var(--kdtu-font-size-xs);
  color: var(--kdtu-color-ink-subtle);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.kdtu-topbar__spacer {
  flex: 1;
}

.kdtu-topbar__user {
  display: flex;
  align-items: center;
  gap: var(--kdtu-space-3);
}

.kdtu-topbar__chip {
  padding: var(--kdtu-space-1) var(--kdtu-space-3);
  background: var(--kdtu-color-primary-soft);
  color: var(--kdtu-color-primary);
  font-size: var(--kdtu-font-size-sm);
  font-weight: 500;
  border-radius: var(--kdtu-radius-pill);
}

.kdtu-app__body {
  flex: 1;
  display: flex;
  position: relative;
}

.kdtu-sidebar {
  width: 240px;
  background: var(--kdtu-color-surface);
  border-right: 1px solid var(--kdtu-color-border);
  padding: var(--kdtu-space-4) var(--kdtu-space-2);
  flex: none;
  z-index: var(--kdtu-z-sidebar);
}

.kdtu-sidebar__link {
  display: block;
  padding: var(--kdtu-space-3) var(--kdtu-space-4);
  color: var(--kdtu-color-ink-muted);
  border-radius: var(--kdtu-radius-md);
  font-size: var(--kdtu-font-size-base);
  font-weight: 500;
  text-decoration: none;
  margin-bottom: var(--kdtu-space-1);
}

.kdtu-sidebar__link:hover {
  background: var(--kdtu-color-surface-alt);
  color: var(--kdtu-color-ink);
  text-decoration: none;
}

.kdtu-sidebar__link--active {
  background: var(--kdtu-color-primary-soft);
  color: var(--kdtu-color-primary);
}

.kdtu-app__backdrop {
  display: none;
}

.kdtu-app__main {
  flex: 1;
  padding: var(--kdtu-space-6);
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
}

@media (max-width: 767px) {
  .kdtu-app__menu {
    display: inline-flex;
  }
  .kdtu-sidebar {
    position: fixed;
    top: 56px;
    left: 0;
    bottom: 0;
    transform: translateX(-100%);
    transition: transform var(--kdtu-motion-base);
    box-shadow: var(--kdtu-shadow-md);
  }
  .kdtu-sidebar--open {
    transform: translateX(0);
  }
  .kdtu-app__backdrop {
    display: block;
    position: fixed;
    inset: 56px 0 0 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: var(--kdtu-z-drawer);
  }
  .kdtu-app__main {
    padding: var(--kdtu-space-4);
  }
}
</style>