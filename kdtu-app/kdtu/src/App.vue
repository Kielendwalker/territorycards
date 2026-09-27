<template>
  <RouterView />
  <ConfirmDialog
    :open="confirm.state.open"
    :title="confirm.state.title"
    :message="confirm.state.message"
    :confirm-label="confirm.state.confirmLabel"
    :cancel-label="confirm.state.cancelLabel"
    :danger="confirm.state.danger"
    @confirm="confirm.onConfirm"
    @cancel="confirm.onCancel"
  />
  <Toast />
</template>

<script setup>
import { RouterView } from 'vue-router'
import ConfirmDialog from './components/ConfirmDialog.vue'
import Toast from './components/Toast.vue'
import { useConfirm } from './composables/useConfirm.js'

const confirm = useConfirm()
</script>