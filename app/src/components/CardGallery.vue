<template>
  <div class="gallery">
    <div class="gallery-grid">
      <div
        v-for="area in areas"
        :key="area.name"
        class="gallery-card"
        :data-name="area.name"
        @click="$emit('open', area)"
      >
        <div class="card-img-wrap">
          <div v-if="imageStatus[area.name] !== 'loaded' && imageStatus[area.name] !== 'error'" class="card-skeleton">
            <div class="card-spinner"></div>
          </div>
          <div v-else-if="imageStatus[area.name] === 'error'" class="card-skeleton">
            <div class="card-spinner"></div>
          </div>
          <img
            v-else
            :src="imageSrc[area.name]"
            :alt="`Kartu daerah ${area.name}`"
            class="card-img"
          />
        </div>
        <div class="card-label">{{ area.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { AREA_DATA } from '../data/areaData.js'
import { imageStatus, imageSrc, loadImage } from '../utils/imageCache.js'

defineEmits(['open'])

const areas = [...AREA_DATA].sort((a, b) => {
  const aIsU = a.name.startsWith('U')
  const bIsU = b.name.startsWith('U')
  if (aIsU && !bIsU) return 1
  if (!aIsU && bIsU) return -1
  return a.name.localeCompare(b.name, 'id', { numeric: true })
})

// Track how many times each area has been retried from gallery level
const galleryRetryCount = {}
const MAX_GALLERY_RETRIES = 3

// Watch imageStatus reactively — auto-retry on error
watch(imageStatus, (status) => {
  for (const name in status) {
    if (status[name] === 'error') {
      const count = galleryRetryCount[name] || 0
      if (count < MAX_GALLERY_RETRIES) {
        galleryRetryCount[name] = count + 1
        setTimeout(() => loadImage(name, true), 3000 * (count + 1)) // backoff: 3s, 6s, 9s
      }
    }
  }
}, { deep: true })

let observer = null

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const name = entry.target.dataset.name
        if (name) loadImage(name)
        observer.unobserve(entry.target)
      }
    })
  }, { rootMargin: '150px' })

  document.querySelectorAll('.gallery-card[data-name]').forEach(el => {
    observer.observe(el)
  })
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.gallery {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: #f4f7fb;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px;
}

@media (min-width: 480px) {
  .gallery-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (min-width: 768px) {
  .gallery-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 16px; }
}

.gallery-card {
  background: #ffffff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(22, 32, 51, 0.10);
  cursor: pointer;
  transition: transform 0.15s;
}

.gallery-card:active { transform: scale(0.97); }

.card-img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  background: #edf2f7;
  overflow: hidden;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  display: block;
}

.card-skeleton {
  position: absolute;
  inset: 0;
  background: #f0f4f8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid #d0e8ff;
  border-top-color: #3b9ef5;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}


.card-label {
  padding: 6px 10px 8px;
  font-size: 13px;
  font-weight: 700;
  color: #162033;
  text-align: center;
}
</style>
