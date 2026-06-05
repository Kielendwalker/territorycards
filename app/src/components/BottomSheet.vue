<template>
  <Transition name="sheet">
    <div v-if="show" class="sheet-overlay" @click.self="$emit('close')">
      <div class="sheet-container" role="dialog" aria-modal="true" aria-label="Detail daerah">

        <!-- Fixed header — never scrolls, holds handle + close button -->
        <div class="sheet-header">
          <div class="sheet-handle"></div>
          <button class="sheet-close" type="button" @click="$emit('close')" aria-label="Tutup">
            &times;
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="sheet-body">
          <div class="sheet-image-wrap" v-if="imageUrl && !imgError">
            <img
              :src="imageUrl"
              :alt="area ? 'Kartu daerah ' + area.name : 'Kartu daerah'"
              class="sheet-image"
              @error="onImgError"
            />
          </div>
          <div class="sheet-image-placeholder" v-else-if="imgError">
            <span>Gambar tidak tersedia</span>
          </div>
          <div class="sheet-info">
            <div class="sheet-area-name" v-if="area">Daerah {{ area.name }}</div>
            <div class="sheet-area-desc" v-if="area">{{ area.description }}</div>
            <div class="sheet-area-meta" v-if="area">
              {{ area.segmentLabel }} &nbsp;|&nbsp;
              Pusat: {{ area.center.lat.toFixed(6) }}, {{ area.center.lng.toFixed(6) }}
            </div>
          </div>

          <div class="sheet-actions">
            <a
              :class="['sheet-btn', 'sheet-btn-primary', { disabled: !openMapsHref }]"
              :href="openMapsHref || '#'"
              :aria-disabled="!openMapsHref"
              target="_blank"
              rel="noopener"
            >Buka My Maps</a>
            <a
              :class="['sheet-btn', 'sheet-btn-secondary', { disabled: !directionsHref }]"
              :href="directionsHref || '#'"
              :aria-disabled="!directionsHref"
              target="_blank"
              rel="noopener"
              @click.prevent="emit('directions', $event)"
            >Arah ke sini</a>
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  area: { type: Object, default: null },
  imageUrl: { type: String, default: '' },
  show: { type: Boolean, default: false },
  openMapsHref: { type: String, default: '' },
  directionsHref: { type: String, default: '' }
})

const emit = defineEmits(['close', 'directions'])

const imgError = ref(false)
watch(() => props.imageUrl, () => { imgError.value = false })

function onImgError() { imgError.value = true }
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(22, 32, 51, 0.5);
  display: flex;
  align-items: flex-end;
}

.sheet-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 85vh;
  max-height: 85dvh;
  background: #ffffff;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 24px rgba(22, 32, 51, 0.18);
  overflow: hidden; /* clips children to rounded corners */
}

/* Non-scrolling header row */
.sheet-header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  padding: 12px 16px 12px;
}

.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: #d7dde8;
}

.sheet-close {
  position: absolute;
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #162033;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet-close:hover {
  color: #5b6678;
}

/* Scrollable content */
.sheet-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}

.sheet-image-wrap {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f4f8;
  margin-bottom: 12px;
}

.sheet-image {
  width: 100%;
  max-height: 50vh;
  max-height: 50dvh;
  display: block;
  object-fit: contain;
  object-position: top;
}

.sheet-image-placeholder {
  width: 100%;
  min-height: 120px;
  border-radius: 8px;
  background: #f0f4f8;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: #5b6678;
  font-size: 14px;
}

.sheet-info {
  padding: 4px 0 8px;
}

.sheet-area-name {
  font-size: 22px;
  font-weight: 800;
  color: #162033;
  line-height: 1.3;
}

.sheet-area-desc {
  margin-top: 6px;
  color: #5b6678;
  font-size: 15px;
  line-height: 1.45;
}

.sheet-area-meta {
  margin-top: 8px;
  color: #435067;
  font-size: 13px;
}

.sheet-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
  padding-bottom: 4px;
}

.sheet-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  text-align: center;
}

.sheet-btn-primary {
  background: #09684f;
  color: #ffffff;
}

.sheet-btn-primary:hover {
  background: #07563f;
}

.sheet-btn-secondary {
  background: #2457c5;
  color: #ffffff;
}

.sheet-btn-secondary:hover {
  background: #1e49a6;
}

.sheet-btn.disabled {
  background: #dce2ea;
  color: #697489;
  cursor: default;
  pointer-events: none;
}

/* Transition */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-enter-active .sheet-container,
.sheet-leave-active .sheet-container {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet-container,
.sheet-leave-to .sheet-container {
  transform: translateY(100%);
}
</style>
