<template>
  <div class="app-root">

    <!-- Top Navigation -->
    <nav class="top-nav">
      <button
        :class="['nav-tab', { active: currentTab === 'map' }]"
        @click="currentTab = 'map'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/>
          <line x1="9" y1="3" x2="9" y2="18"/>
          <line x1="15" y1="6" x2="15" y2="21"/>
        </svg>
        Peta
      </button>
      <button
        :class="['nav-tab', { active: currentTab === 'gallery' }]"
        @click="currentTab = 'gallery'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        Kartu
      </button>
    </nav>

    <!-- Map Tab -->
  <div v-show="currentTab === 'map'" :class="['map-shell', { 'has-selection': hasSelection, 'segment-view': isSegmentView }]">
    <div id="map" aria-label="Peta daerah Srengseng"></div>

    <section class="panel" aria-label="Pencarian daerah">
      <form class="search-row" @submit.prevent="onSearch">
        <label class="sr-only" for="areaInput">Nomor daerah</label>
        <input
          id="areaInput"
          v-model="areaInputValue"
          list="areaList"
          autocomplete="off"
          inputmode="text"
          placeholder="Nomor daerah"
        />
        <datalist id="areaList">
          <option v-for="area in sortedAreas" :key="area.name" :value="area.name" />
        </datalist>
        <button type="submit">Cari</button>
      </form>

      <div class="segments">
        <button
          type="button"
          :class="['segment-button', { active: activeSegmentId === 'all' }]"
          @click="showAll"
        >
          Semua
        </button>
        <button
          v-for="segment in SEGMENTS"
          :key="segment.id"
          type="button"
          :class="['segment-button', { active: activeSegmentId === segment.id }]"
          @click="showSegment(segment.id)"
        >
          <span class="segment-swatch" :style="{ background: segment.color }"></span>
          {{ segment.label }}
        </button>
      </div>

      <div class="result">
        <div class="area-title">{{ areaTitle }}</div>
        <div class="area-desc">{{ areaDesc }}</div>
        <div class="meta">{{ areaMeta }}</div>
        <div class="actions">
          <button
            type="button"
            :class="['action-link', { disabled: !selectedArea }]"
            :disabled="!selectedArea"
            @click="onPetaDaerah"
          >Peta Daerah</button>
          <a
            :class="['action-link', 'secondary', { disabled: !directionsHref }]"
            :href="directionsHref || '#'"
            :aria-disabled="!directionsHref ? 'true' : 'false'"
            target="_blank"
            rel="noopener"
          >Arah ke sini</a>
        </div>
        <div class="message" role="status" aria-live="polite">{{ message }}</div>
      </div>
    </section>

  </div>

    <!-- Gallery Tab -->
    <div v-if="currentTab === 'gallery'" class="gallery-tab">
      <CardGallery @open="openFromGallery" />
    </div>

    <!-- BottomSheet is shared across both tabs -->
    <BottomSheet
      :area="selectedArea"
      :show="showBottomSheet"
      :source="bottomSheetSource"
      :openMapsHref="openMapsHref"
      :directionsHref="directionsHref"
      @close="showBottomSheet = false"
      @detail-peta="onDetailPeta"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import L from 'leaflet'
import { AREA_DATA } from './data/areaData.js'
import { SEGMENTS } from './data/segments.js'
import BottomSheet from './components/BottomSheet.vue'
import CardGallery from './components/CardGallery.vue'

// ─── Reactive state ────────────────────────────────────────────────────────────
const areaInputValue = ref('')
const areaTitle = ref('Semua Daerah')
const areaDesc = ref('')
const areaMeta = ref('')
const message = ref('')
const openMapsHref = ref('')
const directionsHref = ref('')
const activeSegmentId = ref('all')
const hasSelection = ref(false)
const isSegmentView = ref(false)
const selectedArea = ref(null)
const showBottomSheet = ref(false)
const bottomSheetSource = ref('map') // 'map' | 'gallery'
const currentTab = ref('map')

// ─── Map state (non-reactive, Leaflet handles these) ──────────────────────────
let map = null
const areaByName = new Map()
const layerByName = new Map()
let selectedLayer = null
let selectedMarker = null
let selectedCenter = null
let selectedRouteArea = null
let locationMarker = null
let locationAccuracyCircle = null

// ─── Computed ──────────────────────────────────────────────────────────────────
const sortedAreas = computed(() =>
  [...AREA_DATA].sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }))
)

// ─── Helpers ───────────────────────────────────────────────────────────────────
function normalizeAreaNumber(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''

  const compact = raw.replace(/\s+/g, '')
  if (areaByName.has(compact)) return compact

  const unitMatch = compact.match(/U\D*0*(\d+)$/)
  if (unitMatch) {
    const normalizedUnit = 'U' + unitMatch[1].padStart(2, '0')
    if (areaByName.has(normalizedUnit)) return normalizedUnit
  }

  const numbers = compact.match(/\d+/g)
  if (numbers) {
    const last = numbers[numbers.length - 1]
    const padded = String(Number(last)).padStart(3, '0')
    if (areaByName.has(padded)) return padded
    if (areaByName.has(last)) return last
  }

  return compact
}

function toLatLngs(area) {
  // When multiple rings exist, keep only the largest one — small rings are data artifacts
  const rings = area.coords.length > 1
    ? [area.coords.reduce((a, b) => a.length >= b.length ? a : b)]
    : area.coords
  return rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
}

function styleForArea(area, selected = false, dimmed = false) {
  if (selected) {
    return {
      color: '#d96c00',
      fillColor: '#ffcf5a',
      fillOpacity: 0.58,
      opacity: 1,
      weight: 5,
    }
  }
  return {
    color: area.stroke || area.color,
    fillColor: area.color,
    fillOpacity: dimmed ? 0.09 : Math.max(area.fillOpacity, 0.2),
    opacity: dimmed ? 0.45 : 0.92,
    weight: dimmed ? 1 : 1.5,
  }
}

function setLayerVisible(layer, visible) {
  const isVisible = map.hasLayer(layer)
  if (visible && !isVisible) {
    layer.addTo(map)
  } else if (!visible && isVisible) {
    layer.remove()
  }
}

function myMapsViewerUrl(center) {
  return `https://www.openstreetmap.org/?mlat=${center.lat.toFixed(7)}&mlon=${center.lng.toFixed(7)}#map=17/${center.lat.toFixed(7)}/${center.lng.toFixed(7)}`
}

function mapsDirectionsUrl(destination, origin = null) {
  const params = new URLSearchParams({
    api: '1',
    destination: destination.lat.toFixed(7) + ',' + destination.lng.toFixed(7),
    travelmode: 'driving',
  })
  if (origin) {
    params.set('origin', origin.lat.toFixed(7) + ',' + origin.lng.toFixed(7))
  }
  return 'https://www.google.com/maps/dir/?' + params.toString()
}

function segmentSummary() {
  return SEGMENTS.map((s) => s.label + ': ' + s.count).join(' | ')
}

function mapPadding() {
  const shell = document.querySelector('.map-shell').getBoundingClientRect()
  const panel = document.querySelector('.panel').getBoundingClientRect()
  const isBottomPanel = panel.top > shell.height / 2
  const limitX = Math.floor(shell.width * 0.48)
  const limitY = Math.floor(shell.height * 0.48)

  if (isBottomPanel) {
    return {
      paddingTopLeft: [12, 12],
      paddingBottomRight: [12, Math.min(panel.height + 24, limitY)],
    }
  }
  return {
    paddingTopLeft: [Math.min(panel.width + panel.left + 24, limitX), Math.min(panel.top + 12, limitY)],
    paddingBottomRight: [12, 12],
  }
}

function fitLayers(layers, maxZoom = 18) {
  if (!layers.length) return
  const group = L.featureGroup(layers)
  const padding = mapPadding()
  map.fitBounds(group.getBounds(), {
    paddingTopLeft: padding.paddingTopLeft,
    paddingBottomRight: padding.paddingBottomRight,
    maxZoom,
    animate: false,
  })
}

function resetSelectedMarker() {
  if (selectedMarker) {
    selectedMarker.remove()
    selectedMarker = null
  }
}

function nearestPointOnArea(area, origin) {
  if (!area || !area.coords) return selectedCenter

  const latScale = 111320
  const lngScale = Math.cos((origin.lat * Math.PI) / 180) * 111320
  let best = null
  let bestScore = Infinity

  function toXY(point) {
    return {
      x: (point.lng - origin.lng) * lngScale,
      y: (point.lat - origin.lat) * latScale,
    }
  }

  function toLatLng(point) {
    return {
      lat: origin.lat + point.y / latScale,
      lng: origin.lng + point.x / lngScale,
    }
  }

  for (const ring of area.coords) {
    for (let i = 0; i < ring.length; i++) {
      const current = ring[i]
      const next = ring[(i + 1) % ring.length]
      const a = toXY({ lng: current[0], lat: current[1] })
      const b = toXY({ lng: next[0], lat: next[1] })
      const abx = b.x - a.x
      const aby = b.y - a.y
      const denom = abx * abx + aby * aby || 1
      const t = Math.max(0, Math.min(1, -(a.x * abx + a.y * aby) / denom))
      const candidate = { x: a.x + abx * t, y: a.y + aby * t }
      const distSq = candidate.x * candidate.x + candidate.y * candidate.y
      if (distSq < bestScore) {
        bestScore = distSq
        best = toLatLng(candidate)
      }
    }
  }

  return best || { lat: area.center.lat, lng: area.center.lng }
}

function getCardImageUrl(areaName) {
  if (!areaName) return ''
  return `/api/kartu/${areaName}`
}

// ─── Actions ───────────────────────────────────────────────────────────────────
function setActions(center = null, area = null) {
  selectedCenter = center
  selectedRouteArea = area
  openMapsHref.value = center ? myMapsViewerUrl(center) : ''
  directionsHref.value = center ? mapsDirectionsUrl(center) : ''
}

function setMessage(text = '') {
  message.value = text
}

function showAll() {
  hasSelection.value = false
  isSegmentView.value = false
  selectedLayer = null
  resetSelectedMarker()
  setMessage()
  setActions()
  activeSegmentId.value = 'all'

  const layers = []
  for (const area of AREA_DATA) {
    const layer = layerByName.get(area.name.toUpperCase())
    if (!layer) continue
    layer.setStyle(styleForArea(area))
    setLayerVisible(layer, true)
    layers.push(layer)
  }

  areaInputValue.value = ''
  areaTitle.value = 'Semua Daerah'
  areaDesc.value = AREA_DATA.length + ' daerah'
  areaMeta.value = segmentSummary()
  fitLayers(layers, 15)
}

function showSegment(segmentId) {
  hasSelection.value = false
  isSegmentView.value = true
  selectedLayer = null
  resetSelectedMarker()
  setMessage()
  setActions()
  activeSegmentId.value = segmentId

  const segment = SEGMENTS.find((s) => s.id === segmentId)
  const layers = []

  for (const area of AREA_DATA) {
    const layer = layerByName.get(area.name.toUpperCase())
    if (!layer) continue
    const visible = area.segmentId === segmentId
    layer.setStyle(styleForArea(area))
    setLayerVisible(layer, visible)
    if (visible) layers.push(layer)
  }

  areaInputValue.value = ''
  areaTitle.value = segment?.label || 'Segmen'
  areaDesc.value = (segment?.count || layers.length) + ' daerah'
  areaMeta.value = ''
  fitLayers(layers, 15)
}

function showArea(inputValue) {
  const normalized = normalizeAreaNumber(inputValue)
  const area = areaByName.get(normalized)

  if (!area) {
    setMessage('Daerah ' + String(inputValue || '').trim() + ' tidak ditemukan.')
    return
  }

  hasSelection.value = true
  isSegmentView.value = false
  setMessage()
  activeSegmentId.value = area.segmentId

  for (const item of AREA_DATA) {
    const layer = layerByName.get(item.name.toUpperCase())
    if (!layer) continue
    const isSelected = item.name === area.name
    layer.setStyle(styleForArea(item, isSelected, !isSelected))
    setLayerVisible(layer, true)
    if (isSelected) {
      selectedLayer = layer
      selectedLayer.bringToFront()
    }
  }

  resetSelectedMarker()
  const labelCenter = selectedLayer ? selectedLayer.getCenter() : area.center
  selectedMarker = L.marker([labelCenter.lat, labelCenter.lng], {
    icon: L.divIcon({
      className: '',
      html: `<div class="area-selected-label">${area.name}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    }),
    interactive: false,
    zIndexOffset: 500,
  }).addTo(map)

  areaInputValue.value = area.name
  areaTitle.value = 'Daerah ' + area.name
  areaDesc.value = area.description
  areaMeta.value =
    area.segmentLabel +
    ' | Pusat: ' +
    area.center.lat.toFixed(6) +
    ', ' +
    area.center.lng.toFixed(6)
  setActions(area.center, area)

  selectedArea.value = area

  const layer = layerByName.get(area.name.toUpperCase())
  if (layer) {
    const padding = mapPadding()
    map.fitBounds(layer.getBounds(), {
      paddingTopLeft: padding.paddingTopLeft,
      paddingBottomRight: padding.paddingBottomRight,
      maxZoom: 17,
      animate: true,
    })
  }
}

function onDetailPeta(area) {
  // Close bottom sheet first
  showBottomSheet.value = false
  // Switch to map tab
  currentTab.value = 'map'
  // After next tick (so map is visible), trigger showArea
  nextTick(() => {
    showArea(area.name)
  })
}

function onPetaDaerah() {
  if (!selectedArea.value) return
  currentTab.value = 'gallery'
  bottomSheetSource.value = 'gallery'
  showBottomSheet.value = true
}

// Re-render map when switching back to Peta tab, close bottom sheet on tab change
watch(currentTab, (newTab) => {
  if (newTab === 'map') {
    showBottomSheet.value = false
  }
  if (newTab === 'map' && map) {
    requestAnimationFrame(() => map.invalidateSize())
  }
})

function openFromGallery(area) {
  selectedArea.value = area
  setActions(area.center, area)
  bottomSheetSource.value = 'gallery'
  showBottomSheet.value = true
}

function onSearch() {
  const value = areaInputValue.value
  if (!value.trim()) {
    showAll()
    return
  }
  showArea(value)
}

function locateMe() {
  if (!navigator.geolocation) {
    setMessage('Geolocation tidak didukung browser ini.')
    setTimeout(() => setMessage(''), 3000)
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords

      if (locationMarker) { locationMarker.remove(); locationMarker = null }
      if (locationAccuracyCircle) { locationAccuracyCircle.remove(); locationAccuracyCircle = null }

      locationAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#4285f4',
        fillColor: '#4285f4',
        fillOpacity: 0.12,
        weight: 1,
        interactive: false,
      }).addTo(map)

      locationMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'location-icon-wrapper',
          html: '<div class="my-location-dot"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map)

      map.setView([lat, lng], Math.max(map.getZoom(), 16))
    },
    (err) => {
      const msg = err.code === 1 ? 'Izin lokasi ditolak.' : 'Tidak dapat mendeteksi lokasi.'
      setMessage(msg)
      setTimeout(() => setMessage(''), 4000)
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  )
}

function onDirectionsClick(event) {
  if (event?.preventDefault) event.preventDefault()
  if (!selectedCenter) return

  // Open blank window immediately (must be synchronous in click handler to avoid popup blocker)
  const win = window.open('', '_blank')

  if (!navigator.geolocation) {
    win.location.href = mapsDirectionsUrl(selectedCenter)
    return
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      const accuracy = Math.round(pos.coords.accuracy)
      if (accuracy > 500) {
        // Warn user if accuracy is poor (typical on PC/Mac without GPS)
        setMessage(`Akurasi lokasi ±${accuracy}m (tidak akurat). Gunakan HP untuk hasil lebih baik.`)
        setTimeout(() => setMessage(''), 5000)
      }
      win.location.href = mapsDirectionsUrl(selectedCenter, origin)
    },
    () => {
      win.location.href = mapsDirectionsUrl(selectedCenter)
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  )
}

// ─── Leaflet init ──────────────────────────────────────────────────────────────
onMounted(() => {
  // Build area lookup
  for (const area of AREA_DATA) {
    areaByName.set(area.name.toUpperCase(), area)
  }

  // Keep retrying with rAF until #map has real CSS dimensions, then init Leaflet once.
  nextTick(() => {
    const el = document.getElementById('map')

    function doInit() {
      if (!el || el.clientHeight < 10) {
        requestAnimationFrame(doInit)
        return
      }

      map = L.map(el, {
        zoomControl: false,
        scrollWheelZoom: true,
        preferCanvas: true,
      })

      L.control.zoom({ position: 'bottomright' }).addTo(map)
      map.attributionControl.setPrefix('')

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      // Build polygon layers
      const sortedForLayers = [...AREA_DATA].sort((a, b) =>
        a.name.localeCompare(b.name, 'id', { numeric: true })
      )

      for (const area of sortedForLayers) {
        const layer = L.polygon(toLatLngs(area), styleForArea(area))
          .bindTooltip(area.name, {
            permanent: true,
            direction: 'center',
            className: 'area-label',
          })
          .addTo(map)
          .on('click', () => {
            showArea(area.name)
          })

        layerByName.set(area.name.toUpperCase(), layer)
      }

      areaDesc.value = AREA_DATA.length + ' daerah'
      areaMeta.value = segmentSummary()

      // Container has confirmed dimensions — set view directly.
      map.invalidateSize()
      map.setView([-6.2044, 106.7563], 14)

      // Auto-locate on load (silently ignore if denied/unavailable)
      locateMe()
    }

    doInit()
  })
})
</script>
