// Today's local date as YYYY-MM-DD
export function todayKey() {
  const d = new Date()
  return formatDateKey(d)
}

export function formatDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateKey(k) {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shiftDateKey(k, days) {
  const d = parseDateKey(k)
  d.setDate(d.getDate() + days)
  return formatDateKey(d)
}

export function prettyDate(k) {
  const d = parseDateKey(k)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Clamp value between min/max
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// Snap to grid (nearest increment)
export function snap(v, step) {
  if (!step) return v
  return Math.round(v / step) * step
}

// Rotate a point around origin (cx, cy) by angle (degrees)
export function rotatePoint(x, y, cx, cy, deg) {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = x - cx
  const dy = y - cy
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }
}
