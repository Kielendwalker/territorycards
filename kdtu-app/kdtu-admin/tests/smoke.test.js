// Placeholder smoke test so vitest exits 0 in the kdtu-admin workspace.
// Real component / store tests will land alongside future admin features.
import { describe, it, expect } from 'vitest'

describe('@kdtu/kdtu-admin smoke', () => {
  it('runs vitest with the happy-dom environment', () => {
    expect(typeof document).toBe('object')
    expect(document.documentElement.tagName).toBe('HTML')
  })
})