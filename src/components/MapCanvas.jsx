import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { clamp, snap } from '../utils/geometry'
import { displayNodeLabel } from '../utils/idGen'

const MIN_ZOOM = 4      // pixels per foot
const MAX_ZOOM = 40
const DEFAULT_ZOOM = 10
const NODE_RADIUS_FT = 1.0

// ----------------------------------------------------------------------
// Safe view updater
//
// Every setView call goes through this. It:
//   - rejects non-finite values (prevents NaN transform, which makes the
//     whole SVG disappear on iOS WebKit — the "grey screen" the user
//     was seeing during pinch-zoom)
//   - clamps z into range
// ----------------------------------------------------------------------
function sanitizeView(v, fallback) {
  if (
    !v ||
    !Number.isFinite(v.tx) ||
    !Number.isFinite(v.ty) ||
    !Number.isFinite(v.z) ||
    v.z <= 0
  ) {
    return fallback
  }
  return { tx: v.tx, ty: v.ty, z: clamp(v.z, MIN_ZOOM, MAX_ZOOM) }
}

export default function MapCanvas({
  layout,
  mode,
  placingNode,
  onPlaceNode,
  selection,
  onSelect,
  onMoveTable,
  onMoveNode,
  entries,
  onNodeClickCheckin,
  snapStep,
}) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const [viewport, setViewport] = useState({ w: 1000, h: 700 })
  const [view, setView] = useState({ tx: 40, ty: 40, z: DEFAULT_ZOOM })
  const [hover, setHover] = useState(null)
  const [interacting, setInteracting] = useState(false)

  // Keep a ref to the latest view so gesture handlers don't close over stale state.
  const viewRef = useRef(view)
  viewRef.current = view

  const applyView = useCallback((nextOrFn) => {
    setView((v) => {
      const next = typeof nextOrFn === 'function' ? nextOrFn(v) : nextOrFn
      return sanitizeView(next, v)
    })
  }, [])

  // Observe canvas size
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setViewport({ w: r.width, h: r.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit map when dimensions change significantly
  useEffect(() => {
    const { w, h } = viewport
    if (!w || !h || !Number.isFinite(layout.mapWidth) || !Number.isFinite(layout.mapHeight)) return
    const fitZ = Math.min(w / (layout.mapWidth + 10), h / (layout.mapHeight + 10))
    const z = clamp(fitZ, MIN_ZOOM, MAX_ZOOM)
    applyView({
      z,
      tx: (w - layout.mapWidth * z) / 2,
      ty: (h - layout.mapHeight * z) / 2,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.mapWidth, layout.mapHeight, viewport.w, viewport.h])

  // ------------------------------------------------------------------
  // screenToWorld needs the current view. We keep it pure / closure-free
  // over `view` so gesture math always uses the freshest values via ref.
  // ------------------------------------------------------------------
  const screenToWorld = useCallback((sx, sy) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const v = viewRef.current
    return {
      x: (sx - rect.left - v.tx) / v.z,
      y: (sy - rect.top - v.ty) / v.z,
    }
  }, [])

  // ------------------------------------------------------------------
  // Gesture state
  //
  // We deliberately avoid setPointerCapture — it's unreliable on iOS
  // Safari and tends to leak capture when multiple pointers interact.
  // Instead, once a gesture starts we attach document-level move/up
  // listeners and remove them when the gesture ends. This is the pattern
  // most battle-tested libraries (e.g. react-use-gesture) default to.
  //
  // Active pointer map supports proper 2-finger pinch-zoom.
  // ------------------------------------------------------------------
  const pointersRef = useRef(new Map())     // pointerId -> {x, y}
  const gestureRef = useRef(null)           // 'pan' | 'pinch' | 'drag' | null
  const panOriginRef = useRef(null)         // {startX, startY, startTx, startTy}
  const pinchOriginRef = useRef(null)       // {dist, cx, cy, startZ, startTx, startTy}
  const dragRef = useRef(null)              // {kind, id, offX, offY}

  const endGesture = useCallback(() => {
    pointersRef.current.clear()
    gestureRef.current = null
    panOriginRef.current = null
    pinchOriginRef.current = null
    dragRef.current = null
    setInteracting(false)
  }, [])

  const getTwoPointers = () => {
    const arr = [...pointersRef.current.values()]
    return arr.length >= 2 ? [arr[0], arr[1]] : null
  }

  const startPinch = () => {
    const pts = getTwoPointers()
    if (!pts) return
    const dx = pts[1].x - pts[0].x
    const dy = pts[1].y - pts[0].y
    const dist = Math.hypot(dx, dy)
    if (!Number.isFinite(dist) || dist < 1) return
    const cx = (pts[0].x + pts[1].x) / 2
    const cy = (pts[0].y + pts[1].y) / 2
    const v = viewRef.current
    pinchOriginRef.current = {
      dist, cx, cy,
      startZ: v.z,
      startTx: v.tx,
      startTy: v.ty,
    }
    gestureRef.current = 'pinch'
    panOriginRef.current = null
  }

  // Document-level move: routes to the right gesture handler.
  const onDocPointerMove = useCallback((e) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (gestureRef.current === 'drag' && dragRef.current) {
      // Element drag uses whichever pointer moved (single-finger drag).
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
      const { kind, id, offX, offY } = dragRef.current
      const nx = snap(wx - offX, snapStep || 0)
      const ny = snap(wy - offY, snapStep || 0)
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return
      if (kind === 'table') onMoveTable?.(id, { x: nx, y: ny })
      if (kind === 'node') onMoveNode?.(id, { x: nx, y: ny })
      return
    }

    if (gestureRef.current === 'pinch') {
      const pts = getTwoPointers()
      const origin = pinchOriginRef.current
      if (!pts || !origin) return
      const dx = pts[1].x - pts[0].x
      const dy = pts[1].y - pts[0].y
      const dist = Math.hypot(dx, dy)
      if (!Number.isFinite(dist) || dist < 1) return
      const scale = dist / origin.dist
      if (!Number.isFinite(scale) || scale <= 0) return
      const nz = clamp(origin.startZ * scale, MIN_ZOOM, MAX_ZOOM)
      // Keep the midpoint anchored in screen space.
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const cx = (pts[0].x + pts[1].x) / 2 - rect.left
      const cy = (pts[0].y + pts[1].y) / 2 - rect.top
      const ocx = origin.cx - rect.left
      const ocy = origin.cy - rect.top
      const wx = (ocx - origin.startTx) / origin.startZ
      const wy = (ocy - origin.startTy) / origin.startZ
      applyView({
        z: nz,
        tx: cx - wx * nz,
        ty: cy - wy * nz,
      })
      return
    }

    if (gestureRef.current === 'pan' && panOriginRef.current) {
      const o = panOriginRef.current
      const dx = e.clientX - o.startX
      const dy = e.clientY - o.startY
      applyView({
        z: viewRef.current.z,
        tx: o.startTx + dx,
        ty: o.startTy + dy,
      })
    }
  }, [applyView, onMoveTable, onMoveNode, screenToWorld, snapStep])

  const onDocPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId)
    const n = pointersRef.current.size

    if (n === 0) {
      endGesture()
      return
    }
    // Went from 2 -> 1: end pinch, don't start a new pan (would jump)
    if (gestureRef.current === 'pinch' && n === 1) {
      pinchOriginRef.current = null
      gestureRef.current = null
    }
    // Went from 3+ -> 2: restart pinch with remaining fingers
    if (n === 2) {
      startPinch()
    }
  }, [endGesture])

  // Attach doc listeners only when a gesture is active (cleaner than
  // listening forever).
  useEffect(() => {
    if (!interacting) return
    document.addEventListener('pointermove', onDocPointerMove, { passive: true })
    document.addEventListener('pointerup', onDocPointerUp, { passive: true })
    document.addEventListener('pointercancel', onDocPointerUp, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onDocPointerMove)
      document.removeEventListener('pointerup', onDocPointerUp)
      document.removeEventListener('pointercancel', onDocPointerUp)
    }
  }, [interacting, onDocPointerMove, onDocPointerUp])

  // ------------------------------------------------------------------
  // Svg-level pointerdown on the *background* (not on an element)
  // ------------------------------------------------------------------
  const onBgPointerDown = (e) => {
    // Placing a node — one-shot tap, no gesture.
    if (mode === 'edit' && placingNode) {
      const { x, y } = screenToWorld(e.clientX, e.clientY)
      if (Number.isFinite(x) && Number.isFinite(y)) onPlaceNode?.(x, y)
      return
    }
    // Track this pointer.
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setInteracting(true)

    if (pointersRef.current.size === 1) {
      onSelect?.(null)
      panOriginRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: viewRef.current.tx,
        startTy: viewRef.current.ty,
      }
      gestureRef.current = 'pan'
    } else if (pointersRef.current.size === 2) {
      // Upgrade to pinch.
      startPinch()
    }
  }

  // Element pointerdown — starts a drag or selection.
  const onElementPointerDown = (e, kind, id, pos) => {
    e.stopPropagation()
    onSelect?.({ kind, id })
    if (mode !== 'edit') return
    // Only track as drag if this is a single-finger interaction (avoid
    // conflicting with pinch that started elsewhere).
    if (pointersRef.current.size > 0) return
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragRef.current = { kind, id, offX: wx - pos.x, offY: wy - pos.y }
    gestureRef.current = 'drag'
    setInteracting(true)
  }

  // Wheel (desktop). Ignored during pinch.
  const onWheel = (e) => {
    // Non-passive is fine here because React attaches a regular listener.
    if (gestureRef.current === 'pinch') return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const factor = Math.exp(-e.deltaY * 0.0015)
    if (!Number.isFinite(factor) || factor <= 0) return
    applyView((v) => {
      const nz = clamp(v.z * factor, MIN_ZOOM, MAX_ZOOM)
      const wx = (px - v.tx) / v.z
      const wy = (py - v.ty) / v.z
      return { z: nz, tx: px - wx * nz, ty: py - wy * nz }
    })
  }

  const zoomButton = (delta) => {
    applyView((v) => {
      const nz = clamp(v.z * (delta > 0 ? 1.25 : 0.8), MIN_ZOOM, MAX_ZOOM)
      const cx = viewport.w / 2, cy = viewport.h / 2
      const wx = (cx - v.tx) / v.z, wy = (cy - v.ty) / v.z
      return { z: nz, tx: cx - wx * nz, ty: cy - wy * nz }
    })
  }

  // ----- Grid (memoised; cheap to regenerate on dim change only) -----
  const grid = useMemo(() => {
    const step = Math.max(1, layout.gridSize || 1)
    const w = layout.mapWidth, h = layout.mapHeight
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null
    const lines = []
    for (let x = 0; x <= w; x += step) {
      lines.push(
        <line
          key={`gx${x}`}
          x1={x} y1={0} x2={x} y2={h}
          stroke={x % (step * 5) === 0 ? 'var(--grid-strong)' : 'var(--grid)'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )
    }
    for (let y = 0; y <= h; y += step) {
      lines.push(
        <line
          key={`gy${y}`}
          x1={0} y1={y} x2={w} y2={y}
          stroke={y % (step * 5) === 0 ? 'var(--grid-strong)' : 'var(--grid)'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )
    }
    return lines
  }, [layout.mapWidth, layout.mapHeight, layout.gridSize])

  const tooltipPos = useMemo(() => {
    if (!hover) return null
    return { x: hover.x * view.z + view.tx, y: hover.y * view.z + view.ty }
  }, [hover, view])

  // Defensive: if viewBox/transform would be invalid, render a neutral backdrop
  // instead of a broken SVG (which on iOS would blank out entirely).
  const safeTransform =
    Number.isFinite(view.tx) && Number.isFinite(view.ty) && Number.isFinite(view.z) && view.z > 0
      ? `translate(${view.tx} ${view.ty}) scale(${view.z})`
      : 'translate(0 0) scale(1)'

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        onPointerDown={onBgPointerDown}
        onWheel={onWheel}
        style={{
          cursor: placingNode ? 'crosshair' : interacting ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <defs>
          <filter id="node-glow">
            <feGaussianBlur stdDeviation="0.15" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <g transform={safeTransform}>
          <rect
            x={0} y={0}
            width={layout.mapWidth} height={layout.mapHeight}
            fill="var(--bg-soft)"
            stroke="var(--border-strong)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {grid}

          {layout.tables.map((t) => {
            const selected = selection?.kind === 'table' && selection.id === t.id
            return (
              <g
                key={t.id}
                transform={`translate(${t.x} ${t.y}) rotate(${t.rotation || 0})`}
                style={{ cursor: mode === 'edit' ? 'move' : 'default' }}
                onPointerDown={(e) => onElementPointerDown(e, 'table', t.id, { x: t.x, y: t.y })}
              >
                <rect
                  x={-t.width / 2}
                  y={-t.length / 2}
                  width={t.width}
                  height={t.length}
                  fill={selected ? 'rgba(124, 247, 198, 0.08)' : 'rgba(255, 255, 255, 0.03)'}
                  stroke={selected ? 'var(--accent)' : 'var(--border-strong)'}
                  strokeWidth={selected ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  rx={0.15}
                />
                {t.label && (
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--text-faint)"
                    fontSize={Math.min(t.width, t.length) * 0.35}
                    style={{ fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}
                  >
                    {t.label}
                  </text>
                )}
              </g>
            )
          })}

          {layout.nodes.map((n) => {
            const section = layout.sections.find((s) => s.id === n.sectionId)
            const color = n.type === 'rental' ? 'var(--rental)' : (section?.color || 'var(--byoc)')
            const label = displayNodeLabel(n, layout.sections)
            const checkedIn = !!entries?.[n.id]
            const selected = selection?.kind === 'node' && selection.id === n.id
            const r = NODE_RADIUS_FT

            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                style={{ cursor: mode === 'edit' ? 'move' : 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (mode === 'edit') {
                    onElementPointerDown(e, 'node', n.id, { x: n.x, y: n.y })
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (mode === 'checkin') {
                    onNodeClickCheckin?.(n)
                  } else {
                    onSelect?.({ kind: 'node', id: n.id })
                  }
                }}
                onPointerEnter={() => setHover({ kind: 'node', id: n.id, x: n.x, y: n.y })}
                onPointerLeave={() => setHover(null)}
              >
                {checkedIn && (
                  <circle
                    r={r * 1.6}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.25}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  r={r}
                  fill={checkedIn ? color : 'var(--bg-elev-2)'}
                  stroke={selected ? 'var(--accent)' : color}
                  strokeWidth={selected ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  filter={checkedIn ? 'url(#node-glow)' : undefined}
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={checkedIn ? '#041614' : color}
                  fontSize={r * 0.9}
                  fontWeight={700}
                  style={{ fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}
                >
                  {label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {hover && mode === 'checkin' && tooltipPos && (() => {
        const n = layout.nodes.find((x) => x.id === hover.id)
        if (!n) return null
        const label = displayNodeLabel(n, layout.sections)
        const section = layout.sections.find((s) => s.id === n.sectionId)
        const entry = entries?.[n.id]
        return (
          <div className="node-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
            <div className="big">
              #{label} <span className="dim">· {n.type === 'rental' ? 'RENTAL' : 'BYOC'}</span>
            </div>
            {section && <div className="dim">{section.name}</div>}
            {entry ? (
              <div>{entry.name}</div>
            ) : (
              <div className="dim">Tap to check in</div>
            )}
          </div>
        )
      })()}

      <div className="canvas-hud">
        {Math.round(layout.mapWidth)}ft × {Math.round(layout.mapHeight)}ft · 1 grid = {layout.gridSize}ft · zoom {view.z.toFixed(1)}
      </div>
      <div className="zoom-controls">
        <button className="icon" onClick={() => zoomButton(1)} title="Zoom in">+</button>
        <button className="icon" onClick={() => zoomButton(-1)} title="Zoom out">−</button>
        <button
          className="icon"
          title="Fit to view"
          onClick={() => {
            const { w, h } = viewport
            if (!w || !h) return
            const fitZ = Math.min(w / (layout.mapWidth + 10), h / (layout.mapHeight + 10))
            const z = clamp(fitZ, MIN_ZOOM, MAX_ZOOM)
            applyView({
              z,
              tx: (w - layout.mapWidth * z) / 2,
              ty: (h - layout.mapHeight * z) / 2,
            })
          }}
        >⊡</button>
      </div>
    </div>
  )
}
