import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { clamp, snap } from '../utils/geometry'
import { displayNodeLabel } from '../utils/idGen'

const MIN_ZOOM = 4      // pixels per foot
const MAX_ZOOM = 40
const DEFAULT_ZOOM = 10
const NODE_RADIUS_FT = 1.0  // visual radius of a node, in feet

export default function MapCanvas({
  layout,
  mode,              // 'edit' | 'checkin'
  placingNode,       // {sectionId, type} when actively placing
  onPlaceNode,       // (worldX, worldY) => void
  selection,         // {kind: 'table'|'node', id} or null
  onSelect,
  onMoveTable,       // (id, {x, y}) => void
  onMoveNode,        // (id, {x, y}) => void
  entries,           // map of nodeId -> check-in info
  onNodeClickCheckin,
  snapStep,
}) {
  const svgRef = useRef(null)
  const [viewport, setViewport] = useState({ w: 1000, h: 700 })
  const [view, setView] = useState({ tx: 40, ty: 40, z: DEFAULT_ZOOM })
  const [hover, setHover] = useState(null) // {kind, id, screenX, screenY}

  // Observe canvas size
  useEffect(() => {
    if (!svgRef.current) return
    const el = svgRef.current
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setViewport({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Center on layout when it changes size dramatically
  useEffect(() => {
    setView((v) => {
      const { w, h } = viewport
      if (!w || !h) return v
      const fitZ = Math.min(w / (layout.mapWidth + 10), h / (layout.mapHeight + 10))
      const z = clamp(fitZ, MIN_ZOOM, MAX_ZOOM)
      return {
        z,
        tx: (w - layout.mapWidth * z) / 2,
        ty: (h - layout.mapHeight * z) / 2,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.mapWidth, layout.mapHeight, viewport.w, viewport.h])

  const screenToWorld = useCallback(
    (sx, sy) => {
      const rect = svgRef.current.getBoundingClientRect()
      const x = (sx - rect.left - view.tx) / view.z
      const y = (sy - rect.top - view.ty) / view.z
      return { x, y }
    },
    [view]
  )

  // ----- Pan / zoom -----
  const panState = useRef(null)
  const dragState = useRef(null)

  const onPointerDownBackground = (e) => {
    // Placing a node?
    if (mode === 'edit' && placingNode) {
      const { x, y } = screenToWorld(e.clientX, e.clientY)
      onPlaceNode?.(x, y)
      return
    }
    // Begin pan
    onSelect?.(null)
    panState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTx: view.tx,
      startTy: view.ty,
      pointerId: e.pointerId,
    }
    svgRef.current.setPointerCapture?.(e.pointerId)
  }

  const onPointerMoveCanvas = (e) => {
    // Element drag in progress
    if (dragState.current) {
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
      const { kind, id, offX, offY } = dragState.current
      const nx = snap(wx - offX, snapStep || 0)
      const ny = snap(wy - offY, snapStep || 0)
      if (kind === 'table') onMoveTable?.(id, { x: nx, y: ny })
      if (kind === 'node') onMoveNode?.(id, { x: nx, y: ny })
      return
    }
    // Pan in progress
    if (panState.current) {
      const dx = e.clientX - panState.current.startX
      const dy = e.clientY - panState.current.startY
      setView((v) => ({ ...v, tx: panState.current.startTx + dx, ty: panState.current.startTy + dy }))
    }
  }

  const onPointerUpCanvas = (e) => {
    if (dragState.current) {
      dragState.current = null
    }
    panState.current = null
  }

  const onWheel = (e) => {
    e.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const factor = Math.exp(-e.deltaY * 0.0015)
    setView((v) => {
      const nz = clamp(v.z * factor, MIN_ZOOM, MAX_ZOOM)
      // Keep cursor anchored
      const wx = (px - v.tx) / v.z
      const wy = (py - v.ty) / v.z
      return { z: nz, tx: px - wx * nz, ty: py - wy * nz }
    })
  }

  const zoomButton = (delta) => {
    setView((v) => {
      const nz = clamp(v.z * (delta > 0 ? 1.25 : 0.8), MIN_ZOOM, MAX_ZOOM)
      const cx = viewport.w / 2, cy = viewport.h / 2
      const wx = (cx - v.tx) / v.z, wy = (cy - v.ty) / v.z
      return { z: nz, tx: cx - wx * nz, ty: cy - wy * nz }
    })
  }

  // ----- Element interactions -----
  const beginElementDrag = (e, kind, id, pos) => {
    e.stopPropagation()
    onSelect?.({ kind, id })
    if (mode !== 'edit') return
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
    dragState.current = { kind, id, offX: wx - pos.x, offY: wy - pos.y }
    svgRef.current.setPointerCapture?.(e.pointerId)
  }

  // ----- Grid -----
  const grid = useMemo(() => {
    const step = Math.max(1, layout.gridSize || 1)
    const lines = []
    for (let x = 0; x <= layout.mapWidth; x += step) {
      lines.push(
        <line
          key={`gx${x}`}
          x1={x} y1={0} x2={x} y2={layout.mapHeight}
          stroke={x % (step * 5) === 0 ? 'var(--grid-strong)' : 'var(--grid)'}
          strokeWidth={1 / view.z}
          vectorEffect="non-scaling-stroke"
        />
      )
    }
    for (let y = 0; y <= layout.mapHeight; y += step) {
      lines.push(
        <line
          key={`gy${y}`}
          x1={0} y1={y} x2={layout.mapWidth} y2={y}
          stroke={y % (step * 5) === 0 ? 'var(--grid-strong)' : 'var(--grid)'}
          strokeWidth={1 / view.z}
          vectorEffect="non-scaling-stroke"
        />
      )
    }
    return lines
  }, [layout.mapWidth, layout.mapHeight, layout.gridSize, view.z])

  // Convert hovered element center to screen coords for tooltip
  const tooltipPos = useMemo(() => {
    if (!hover) return null
    const wx = hover.x, wy = hover.y
    return { x: wx * view.z + view.tx, y: wy * view.z + view.ty }
  }, [hover, view])

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        onPointerDown={onPointerDownBackground}
        onPointerMove={onPointerMoveCanvas}
        onPointerUp={onPointerUpCanvas}
        onPointerCancel={onPointerUpCanvas}
        onWheel={onWheel}
        style={{ cursor: placingNode ? 'crosshair' : panState.current ? 'grabbing' : 'grab' }}
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

        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.z})`}>
          {/* Map backdrop */}
          <rect
            x={0} y={0}
            width={layout.mapWidth} height={layout.mapHeight}
            fill="var(--bg-soft)"
            stroke="var(--border-strong)"
            strokeWidth={2 / view.z}
            vectorEffect="non-scaling-stroke"
          />
          {grid}

          {/* Tables */}
          {layout.tables.map((t) => {
            const selected = selection?.kind === 'table' && selection.id === t.id
            return (
              <g
                key={t.id}
                transform={`translate(${t.x} ${t.y}) rotate(${t.rotation || 0})`}
                style={{ cursor: mode === 'edit' ? 'move' : 'default' }}
                onPointerDown={(e) => beginElementDrag(e, 'table', t.id, { x: t.x, y: t.y })}
              >
                <rect
                  x={-t.width / 2}
                  y={-t.length / 2}
                  width={t.width}
                  height={t.length}
                  fill={selected ? 'rgba(124, 247, 198, 0.08)' : 'rgba(255, 255, 255, 0.03)'}
                  stroke={selected ? 'var(--accent)' : 'var(--border-strong)'}
                  strokeWidth={selected ? 2 / view.z : 1.5 / view.z}
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

          {/* Nodes */}
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
                  // Always stop propagation so the SVG background doesn't
                  // start a pan or capture the pointer — without this, the
                  // synthesized click never reaches the node in check-in mode.
                  e.stopPropagation()
                  if (mode === 'edit') {
                    beginElementDrag(e, 'node', n.id, { x: n.x, y: n.y })
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
                onPointerEnter={(e) => setHover({ kind: 'node', id: n.id, x: n.x, y: n.y })}
                onPointerLeave={() => setHover(null)}
              >
                {checkedIn && (
                  <circle
                    r={r * 1.6}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.25}
                    strokeWidth={2 / view.z}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  r={r}
                  fill={checkedIn ? color : 'var(--bg-elev-2)'}
                  stroke={selected ? 'var(--accent)' : color}
                  strokeWidth={selected ? 2.5 / view.z : 1.5 / view.z}
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

      {/* Tooltip */}
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
            const fitZ = Math.min(w / (layout.mapWidth + 10), h / (layout.mapHeight + 10))
            const z = clamp(fitZ, MIN_ZOOM, MAX_ZOOM)
            setView({
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
