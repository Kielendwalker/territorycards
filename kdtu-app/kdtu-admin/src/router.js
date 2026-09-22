// kdtu-admin router. All admin CRUD screens live here; the sidebar in App.vue
// drives navigation. FilesView, LandingView, and the new CRUD views are all
// mounted at the top level — they each handle their own auth gate (router push
// to /login if the auth store is empty).

import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'
import FilesView from './views/FilesView.vue'
import TimetableView from './views/TimetableView.vue'
import PublicationsView from './views/PublicationsView.vue'
import KdlView from './views/KdlView.vue'
import PenugasanView from './views/PenugasanView.vue'
import SummaryView from './views/SummaryView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: LandingView },
    { path: '/files', name: 'files', component: FilesView },
    { path: '/timetable', name: 'timetable', component: TimetableView },
    { path: '/publications', name: 'publications', component: PublicationsView },
    { path: '/kdl', name: 'kdl', component: KdlView },
    { path: '/penugasan', name: 'penugasan', component: PenugasanView },
    { path: '/summary', name: 'summary', component: SummaryView },
    // Catch-all → home.
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})