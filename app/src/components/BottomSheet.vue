<template>
  <Teleport to="body">
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
          <div class="sheet-image-wrap" v-if="area">
            <div v-if="imgStatus !== 'loaded' && imgStatus !== 'error'" class="sheet-img-loading">
              <div class="sheet-spinner"></div>
            </div>
            <div v-else-if="imgStatus === 'error'" class="sheet-image-placeholder">
              <span>Gambar tidak tersedia</span>
            </div>
            <img
              v-else
              :src="imgSrc"
              :alt="'Kartu daerah ' + area.name"
              class="sheet-image"
            />
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
            <button
              v-if="source === 'gallery'"
              class="sheet-btn sheet-btn-primary"
              :disabled="!area"
              @click="emit('detail-peta', area)"
            >Detail Peta</button>
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
  </Teleport>
</template>

<script setup>
import { computed, watch } from 'vue'
import { imageStatus, imageSrc, loadImage } from '../utils/imageCache.js'

const props = defineProps({
  area: { type: Object, default: null },
  show: { type: Boolean, default: false },
  source: { type: String, default: 'map' }, // 'map' | 'gallery'
  openMapsHref: { type: String, default: '' },
  directionsHref: { type: String, default: '' }
})

const emit = defineEmits(['close', 'directions', 'detail-peta'])

// Explicit computed refs so Vue tracks cache reactivity properly
const imgStatus = computed(() => props.area ? imageStatus[props.area.name] : null)
const imgSrc    = computed(() => props.area ? imageSrc[props.area.name] : '')

// Trigger load when area changes
watch(() => props.area, (area) => {
  if (area) loadImage(area.name)
}, { immediate: true })
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  top: 48px; /* below nav bar height */
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 999;
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
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f4f8;
  margin-bottom: 12px;
  min-height: 120px;
}

.sheet-img-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f4f8;
  z-index: 1;
}

.sheet-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #d0e8ff;
  border-top-color: #3b9ef5;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.sheet-image {
  width: 100%;
  max-height: 50vh;
  max-height: 50dvh;
  display: block;
  object-fit: contain;
  object-position: top;
}

.sheet-image.hidden {
  opacity: 0;
}

.sheet-image-placeholder {
  width: 100%;
  min-height: 120px;
  border-radius: 8px;
  background: #f0f4f8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
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
  margin-top: 14px;
  padding-bottom: 4px;
  display: flex;
  gap: 10px;
}

.sheet-actions .sheet-btn {
  flex: 1;
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
