// kdtu-admin router. Today only mounts a placeholder landing route so the
// dev stack has a working entry. Full CRUD routes (login, kdl, members,
// publications, summary, timetable) will be added alongside their views.
import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: LandingView },
  ],
})