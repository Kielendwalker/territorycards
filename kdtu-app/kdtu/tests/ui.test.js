import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import Toast from '../src/components/Toast.vue'
import AppLayout from '../src/components/AppLayout.vue'
import FormField from '../src/components/FormField.vue'

// Stub vue-router so AppLayout can resolve <RouterLink> in isolation.
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn(), currentRoute: { value: { fullPath: '/' } } }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}))

// Stub the auth store with sensible defaults so AppLayout mounts cleanly.
vi.mock('../src/stores/auth.js', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    displayName: 'Budi',
    member: { id: 1, name: 'Budi', availabilityDays: [] },
    logout: vi.fn(),
  }),
}))

// Stub the toast composable so Toast.vue does not try to manage a real queue.
vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({
    state: { items: [{ id: 1, kind: 'success', message: 'Tersimpan' }] },
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('ConfirmDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: false, title: 'Hapus?', message: 'Yakin?' },
      attachTo: document.body,
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    wrapper.unmount()
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        title: 'Hapus?',
        message: 'Tidak bisa dibatalkan',
        confirmLabel: 'Hapus',
        danger: true,
      },
      attachTo: document.body,
    })
    const buttons = document.body.querySelectorAll('button')
    const confirmBtn = Array.from(buttons).find((b) => b.textContent.includes('Hapus'))
    confirmBtn.click()
    await nextTick()
    expect(wrapper.emitted('confirm')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Hapus?', message: 'Tidak bisa dibatalkan' },
      attachTo: document.body,
    })
    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Batal',
    )
    cancelBtn.click()
    await nextTick()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits cancel when ESC is pressed', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Hapus?', message: 'Tidak bisa dibatalkan' },
      attachTo: document.body,
    })
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    document.dispatchEvent(event)
    await nextTick()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits cancel when the backdrop is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Hapus?', message: 'Tidak bisa dibatalkan' },
      attachTo: document.body,
    })
    const backdrop = document.body.querySelector('.kdtu-confirm__backdrop')
    backdrop.click()
    await nextTick()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    wrapper.unmount()
  })
})

describe('Toast', () => {
  it('renders the messages currently in the queue', () => {
    const wrapper = mount(Toast, { attachTo: document.body })
    const text = document.body.textContent
    expect(text).toContain('Tersimpan')
    wrapper.unmount()
  })
})

describe('AppLayout', () => {
  it('renders slot content and the user chip', () => {
    const wrapper = mount(AppLayout, {
      slots: { default: '<p class="kdtu-slot">Hello member</p>' },
    })
    expect(wrapper.html()).toContain('Hello member')
    expect(wrapper.html()).toContain('Budi')
    expect(wrapper.html()).toContain('Keluar')
  })
})

describe('FormField', () => {
  it('renders label and error text', () => {
    const wrapper = mount(FormField, {
      props: { label: 'Nama', error: 'Wajib diisi' },
      slots: {
        default: '<input class="kdtu-input" />',
      },
    })
    expect(wrapper.html()).toContain('Nama')
    expect(wrapper.html()).toContain('Wajib diisi')
  })

  it('hides error and shows hint when there is no error', () => {
    const wrapper = mount(FormField, {
      props: { label: 'Nama', hint: 'Nama lengkap' },
    })
    expect(wrapper.html()).toContain('Nama lengkap')
    expect(wrapper.html()).not.toContain('kdtu-field__error')
  })
})