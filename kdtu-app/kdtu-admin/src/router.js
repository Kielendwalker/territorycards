// kdtu-admin router. Today mounts Landing + Files; the FilesView requires
// the admin JWT (handled inside the view via the /api/files gate — non-admins
// receive 401/403). Full CRUD routes (login, kdl, members, publications,
// summary, timetable) will be added alongside their views.
import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'
import FilesView from './views/FilesView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: LandingView },
    { path: '/files', name: 'files', component: FilesView },
  ],
})