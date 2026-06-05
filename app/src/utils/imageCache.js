/**
 * Shared image cache with TTL (time-to-live).
 * Images are re-fetched after TTL_MS. A stuck 'loading' state is
 * overridden after LOADING_TIMEOUT_MS so BottomSheet never hangs.
 */
import { reactive } from 'vue'

const TTL_MS            = 5 * 60 * 1000  // 5 minutes
const LOADING_TIMEOUT_MS = 15 * 1000      // treat load as stuck after 15 s

// 'loading' | 'loaded' | 'error'
export const imageStatus = reactive({})
export const imageSrc    = reactive({})
const imageTimestamp  = {}
const loadingStarted  = {}

export async function loadImage(name, forceRefresh = false) {
  const now    = Date.now()
  const cached  = imageStatus[name] === 'loaded'
  const expired = cached && (now - (imageTimestamp[name] || 0)) > TTL_MS

  // If already loading, only override if it has been stuck > LOADING_TIMEOUT_MS
  if (imageStatus[name] === 'loading') {
    const stuck = (now - (loadingStarted[name] || 0)) > LOADING_TIMEOUT_MS
    if (!stuck) return        // still in progress — wait for it
    // else fall through and re-try
  }

  // Skip if cached and fresh (unless forced)
  if (cached && !expired && !forceRefresh) return

  imageStatus[name]    = 'loading'
  loadingStarted[name] = Date.now()

  const MAX_RETRIES = 5
  const RETRY_DELAY = 2000

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`/api/kartu/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()

      if (imageSrc[name]) URL.revokeObjectURL(imageSrc[name])
      imageSrc[name]       = URL.createObjectURL(blob)
      imageTimestamp[name] = Date.now()
      imageStatus[name]    = 'loaded'
      return
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY))
      }
    }
  }

  // All retries exhausted
  if (expired && imageSrc[name]) {
    imageStatus[name] = 'loaded'  // keep stale image
  } else {
    imageStatus[name] = 'error'
  }
}
