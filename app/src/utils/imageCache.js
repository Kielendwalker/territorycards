/**
 * Shared image cache with TTL (time-to-live).
 * Images are re-fetched automatically after TTL_MS milliseconds.
 */
import { reactive } from 'vue'

const TTL_MS = 5 * 60 * 1000 // 5 minutes — matches API Cache-Control

// 'idle' | 'loading' | 'loaded' | 'error'
export const imageStatus = reactive({})
export const imageSrc = reactive({})
const imageTimestamp = {}

export async function loadImage(name, forceRefresh = false) {
  const now = Date.now()
  const cached = imageStatus[name] === 'loaded'
  const expired = cached && (now - (imageTimestamp[name] || 0)) > TTL_MS

  // Skip if already loading
  if (imageStatus[name] === 'loading') return

  // Skip if cached and not expired (unless forced)
  if (cached && !expired && !forceRefresh) return

  imageStatus[name] = 'loading'

  try {
    const res = await fetch(`/api/kartu/${name}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()

    // Revoke old blob URL to free memory
    if (imageSrc[name]) URL.revokeObjectURL(imageSrc[name])

    imageSrc[name] = URL.createObjectURL(blob)
    imageTimestamp[name] = Date.now()
    imageStatus[name] = 'loaded'
  } catch {
    // Keep old image if refresh fails — don't wipe what we have
    if (expired && imageSrc[name]) {
      imageStatus[name] = 'loaded'
    } else {
      imageStatus[name] = 'error'
    }
  }
}
