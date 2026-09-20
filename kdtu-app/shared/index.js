// @kdtu/shared — public API contracts shared between server and both front-ends.
//
// Keep this file dependency-free so it can be imported by any package in the
// monorepo without pulling in node-only modules (e.g. `better-sqlite3`).

export const API_VERSION = 'v1'

export const ROLE = Object.freeze({
  MEMBER: 'member',
  ADMIN: 'admin',
})

export const APP = Object.freeze({
  KDTU: 'kdtu',
  KDTU_ADMIN: 'kdtu-admin',
})

// ---- Domain enums ---------------------------------------------------------

export const TIMETABLE_DAY = Object.freeze({
  RABU: 'RABU',
  JUMAT: 'JUMAT',
  SABTU: 'SABTU',
  MINGGU: 'MINGGU',
})

export const TIMETABLE_SLOT = Object.freeze({
  EARLY: 'EARLY', // 06:30-08:30 or 11:00-13:00
  LATE: 'LATE',   // 14:00-16:00
})

export const PUBLICATION_CATEGORY = Object.freeze({
  MAJALAH: 'Majalah',
  RISALAH: 'Risalah',
  BUKU: 'Buku',
  BROSUR: 'Brosur',
  LAINNYA: 'Lainnya',
})

// ---- Endpoint surface -----------------------------------------------------
// Auth
export const AUTH_LOGIN = '/api/auth/login'
export const AUTH_PIN_LOGIN = '/api/auth/pin-login'
export const AUTH_REFRESH = '/api/auth/refresh'
export const AUTH_ME = '/api/auth/me'
export const AUTH_LOGOUT = '/api/auth/logout'
export const AUTH_CHANGE_PASSWORD = '/api/auth/change-password'

// Members
export const MEMBERS_LIST = '/api/members'
export const MEMBER_DETAIL = (id) => `/api/members/${id}`
export const MEMBER_AVAILABILITY = (id) => `/api/members/${id}/availability`

// Locations
export const LOCATIONS_LIST = '/api/locations'

// Timetable (KDTU periods)
export const TIMETABLE_PERIODS = '/api/timetable/periods'
export const TIMETABLE_PERIOD_DETAIL = (periodId) => `/api/timetable/periods/${periodId}`
export const TIMETABLE_ASSIGNMENTS = (periodId) => `/api/timetable/periods/${periodId}/assignments`
export const TIMETABLE_ASSIGNMENT_DETAIL = (id) => `/api/timetable/assignments/${id}`
export const TIMETABLE_PUBLICATIONS = (periodId) => `/api/timetable/periods/${periodId}/publications`

// KDL (Kelompok Pelayanan)
export const KDL_LIST = '/api/kdl'
export const KDL_DETAIL = (id) => `/api/kdl/${id}`
export const KDL_MEMBERS = (id) => `/api/kdl/${id}/members`
export const KDL_PENUGASAN = (id) => `/api/kdl/${id}/penugasan`

// Penugasan items assignable to KDLs
export const PENUGASAN_LIST = '/api/penugasan'
export const PENUGASAN_DETAIL = (id) => `/api/penugasan/${id}`

// Publications
export const PUBLICATIONS_LIST = '/api/publications'
export const PUBLICATION_DETAIL = (id) => `/api/publications/${id}`

// Summary
export const SUMMARY_KDTU = '/api/summary/kdtu'

// Audit log (admin-only)
export const AUDIT_LIST = '/api/audit'

// ---- Response shapes ------------------------------------------------------
// These are plain JSDoc so they are usable in JS without TS.

/**
 * @typedef {Object} ApiMember
 * @property {number} id
 * @property {string} name
 * @property {string|null} phone
 * @property {string|null} kdlName
 * @property {boolean} active
 * @property {string[]} availabilityDays   // e.g. ['RABU','JUMAT']
 */

/**
 * @typedef {Object} ApiLocation
 * @property {number} id
 * @property {string} name
 * @property {string} type                  // 'JAGA' | 'RAK_STAND'
 */

/**
 * @typedef {Object} ApiTimetablePeriod
 * @property {number} id
 * @property {string} label                 // e.g. 'September 2026'
 * @property {string} startsOn              // ISO date
 * @property {string} endsOn                // ISO date
 */

/**
 * @typedef {Object} ApiTimetableAssignment
 * @property {number} id
 * @property {number} periodId
 * @property {'RABU'|'JUMAT'|'SABTU'|'MINGGU'} day
 * @property {'EARLY'|'LATE'} slot
 * @property {string} jam                   // '06:30-08:30'
 * @property {string} date                  // ISO date
 * @property {string} lokasiJaga
 * @property {string|null} lokasiRakBeroda
 * @property {string|null} posterRakBeroda
 * @property {string|null} setRakrod
 * @property {number[]} memberIds
 */

/**
 * @typedef {Object} ApiKdl
 * @property {number} id
 * @property {string} name
 * @property {string|null} leader
 * @property {string|null} meetingDay
 * @property {number} memberCount
 */

/**
 * @typedef {Object} ApiPenugasan
 * @property {number} id
 * @property {number} kdlId
 * @property {string} title
 * @property {string|null} description
 * @property {string|null} dueOn
 * @property {'PENDING'|'IN_PROGRESS'|'DONE'} status
 */

/**
 * @typedef {Object} ApiPublication
 * @property {number} id
 * @property {'Majalah'|'Risalah'|'Buku'|'Brosur'|'Lainnya'} category
 * @property {string} title
 * @property {number} stock
 * @property {string|null} edition
 */

/**
 * @typedef {Object} ApiSummaryMonth
 * @property {string} month                 // '2026-09'
 * @property {number} majalah
 * @property {number} risalah
 * @property {number} buku
 * @property {number} brosur
 * @property {number} lainnya
 * @property {number} total
 */

export const PASSWORD_MIN_LENGTH = 10
export const PIN_LENGTH = 4

export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER: 'SERVER_ERROR',
})
