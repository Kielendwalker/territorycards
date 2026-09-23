// @kdtu/shared — UI design tokens shared between kdtu and kdtu-admin.
//
// Single source of truth for the visual design system. The CSS file in each
// app re-declares these as CSS custom properties (so authors can use
// var(--kdtu-color-primary) directly), but JS code should import from this
// module so values stay in sync.

export const color = Object.freeze({
  primary: '#4338ca',         // deep indigo
  primaryHover: '#3730a3',
  primarySoft: '#eef2ff',     // tinted background
  accent: '#10b981',          // emerald
  accentSoft: '#ecfdf5',

  ink: '#0f172a',             // slate-900 — strongest text
  inkMuted: '#475569',        // slate-600 — secondary text
  inkSubtle: '#94a3b8',       // slate-400 — tertiary text / placeholders
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',      // slate-50 — panel / stripe
  surfaceSunken: '#f1f5f9',   // slate-100
  border: '#e2e8f0',          // slate-200
  borderStrong: '#cbd5e1',    // slate-300

  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
})

// Per-app tint overrides. kdtu leans slightly warmer so the volunteer-facing
// UI feels friendly; admin stays neutral indigo.
export const tint = Object.freeze({
  kdtu: Object.freeze({
    background: '#fffbeb',     // very warm off-white
    primarySoft: '#fef3c7',    // amber-100 (warmer than indigo-soft)
    accent: '#0d9488',         // teal-600 — friendlier than emerald
  }),
  'kdtu-admin': Object.freeze({
    background: '#f8fafc',
    primarySoft: '#eef2ff',
    accent: '#10b981',
  }),
})

export const font = Object.freeze({
  family: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  familyMono: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
  sizeXs: '12px',
  sizeSm: '13px',
  sizeBase: '14px',
  sizeMd: '15px',
  sizeLg: '17px',
  sizeXl: '20px',
  size2xl: '24px',
  size3xl: '30px',
  weightRegular: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
  leadingTight: 1.2,
  leadingNormal: 1.5,
  leadingRelaxed: 1.7,
})

export const space = Object.freeze({
  px: '1px',
  '0_5': '2px',
  1: '4px',
  '1_5': '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
})

export const radius = Object.freeze({
  sm: '4px',
  md: '6px',
  lg: '10px',
  xl: '14px',
  pill: '999px',
})

export const shadow = Object.freeze({
  sm: '0 1px 2px rgba(15, 23, 42, 0.05)',
  md: '0 4px 12px rgba(15, 23, 42, 0.08)',
  lg: '0 12px 32px rgba(15, 23, 42, 0.16)',
  focus: '0 0 0 3px rgba(67, 56, 202, 0.35)',
})

export const z = Object.freeze({
  base: 0,
  sticky: 10,
  sidebar: 20,
  topbar: 30,
  drawer: 40,
  toast: 80,
  modal: 90,
})

export const breakpoints = Object.freeze({
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
})

export const motion = Object.freeze({
  fast: '120ms ease-out',
  base: '180ms ease-out',
  slow: '280ms ease-out',
})

export const uiTokens = Object.freeze({
  color,
  tint,
  font,
  space,
  radius,
  shadow,
  z,
  breakpoints,
  motion,
})

export default uiTokens