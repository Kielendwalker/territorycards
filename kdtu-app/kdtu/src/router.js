import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'
import LoginView from './views/LoginView.vue'
import TodayView from './views/TodayView.vue'
import TimetableView from './views/TimetableView.vue'
import MeView from './views/MeView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/', redirect: '/today' },
  { path: '/today', name: 'today', component: TodayView },
  { path: '/timetable', name: 'timetable', component: TimetableView },
  { path: '/me', name: 'me', component: MeView },
  { path: '/:pathMatch(.*)*', redirect: '/today' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { path: '/login', query: { next: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { path: '/today' }
  }
})