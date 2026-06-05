<template>
  <div class="gallery">
    <div class="gallery-grid">
      <div
        v-for="area in areas"
        :key="area.name"
        class="gallery-card"
        @click="$emit('open', area)"
      >
        <div class="card-img-wrap">
          <div v-if="imageStatus[area.name] !== 'loaded' && imageStatus[area.name] !== 'error'" class="card-skeleton"></div>
          <div v-else-if="imageStatus[area.name] === 'error'" class="card-error">
            <button class="retry-btn" @click.stop="loadImage(area.name)">↺ Coba lagi</button>
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

// Kick off loading for all visible areas (browser handles lazy naturally via intersection)
areas.forEach(area => loadImage(area.name))
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
  transition: transform 0.15s, box-shadow 0.15s;
}

.gallery-card:active {
  transform: scale(0.97);
}

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
  background: linear-gradient(90deg, #edf2f7 25%, #e2e8f0 50%, #edf2f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.card-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #edf2f7;
  color: #9aa3b2;
  font-size: 11px;
  font-weight: 700;
}

.retry-btn {
  padding: 6px 12px;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  background: #ffffff;
  color: #4a5568;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.retry-btn:hover { background: #e2e8f0; }

.card-label {
  padding: 6px 10px 8px;
  font-size: 13px;
  font-weight: 700;
  color: #162033;
  text-align: center;
}
</style>
