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
          <!-- Skeleton shown while loading or retrying -->
          <div v-if="statusMap[area.name] === 'loading'" class="card-skeleton"></div>
          <!-- Error state with retry button -->
          <div v-else-if="statusMap[area.name] === 'error'" class="card-error">
            <button
              class="retry-btn"
              @click.stop="loadImage(area.name)"
            >↺ Coba lagi</button>
          </div>
          <!-- Image shown on success -->
          <img
            v-else-if="statusMap[area.name] === 'loaded'"
            :src="srcMap[area.name]"
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
import { reactive, onMounted } from 'vue'
import { AREA_DATA } from '../data/areaData.js'

defineEmits(['open'])

// Sort: numbered areas first (001, 002...), then U areas
const areas = [...AREA_DATA].sort((a, b) => {
  const aIsU = a.name.startsWith('U')
  const bIsU = b.name.startsWith('U')
  if (aIsU && !bIsU) return 1
  if (!aIsU && bIsU) return -1
  return a.name.localeCompare(b.name, 'id', { numeric: true })
})

// statusMap[name]: 'loading' | 'loaded' | 'error'
const statusMap = reactive({})
// srcMap[name]: blob URL string
const srcMap = reactive({})

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1500

async function loadImage(name) {
  statusMap[name] = 'loading'

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`/api/kartu/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      srcMap[name] = URL.createObjectURL(blob)
      statusMap[name] = 'loaded'
      return
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        // Wait before next retry, keeping skeleton visible
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
  }

  // All retries exhausted
  statusMap[name] = 'error'
}

onMounted(async () => {
  const BATCH_SIZE = 6
  const BATCH_DELAY_MS = 100

  for (let i = 0; i < areas.length; i += BATCH_SIZE) {
    const batch = areas.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(area => loadImage(area.name)))
    if (i + BATCH_SIZE < areas.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }
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

/* Shimmer skeleton */
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
  transition: background 0.15s, border-color 0.15s;
}

.retry-btn:hover {
  background: #e2e8f0;
  border-color: #a0aec0;
}

.card-label {
  padding: 6px 10px 8px;
  font-size: 13px;
  font-weight: 700;
  color: #162033;
  text-align: center;
}
</style>
