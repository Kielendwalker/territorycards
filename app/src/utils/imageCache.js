/**
 * Shared image cache with TTL (time-to-live).
 * Images are re-fetched after TTL_MS. A stuck 'loading' state is
 * overridden after LOADING_TIMEOUT_MS so BottomSheet never hangs.
 */
import { reactive } from 'vue'

const TTL_MS            = 30 * 24 * 60 * 60 * 1000  // 1 month
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

  // For manual retries, enforce a minimum spinner duration so the user
  // can see the loading state even when the fetch fails almost instantly.
  const fetchStart   = Date.now()
  const MIN_SPIN_MS  = forceRefresh ? 700 : 0

  async function waitMinSpin() {
    const elapsed = Date.now() - fetchStart
    if (elapsed < MIN_SPIN_MS) await new Promise(r => setTimeout(r, MIN_SPIN_MS - elapsed))
  }

  try {
    const res = await fetch(`/api/kartu/${name}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()

    await waitMinSpin()
    if (imageSrc[name]) URL.revokeObjectURL(imageSrc[name])
    imageSrc[name]       = URL.createObjectURL(blob)
    imageTimestamp[name] = Date.now()
    imageStatus[name]    = 'loaded'
    return
  } catch {
    // single attempt failed
  }

  await waitMinSpin()
  if (expired && imageSrc[name]) {
    imageStatus[name] = 'loaded'  // keep stale image
  } else {
    imageStatus[name] = 'error'
  }
}
