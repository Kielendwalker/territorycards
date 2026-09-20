<template>
  <div class="app-shell">
    <router-view />
  </div>
</template>

<script setup>
// kdtu-admin root. Auth-gated views will be wired in a follow-up; today this
// just renders the active route so the dev stack has a working entry point.
</script>

<style>
.app-shell {
  min-height: 100vh;
  background: #f8fafc;
}
</style>