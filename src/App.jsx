import React, { useState, useEffect, useMemo } from 'react'
import { useLayout } from './hooks/useLayout'
import { useCheckins } from './hooks/useCheckins'
import { supabaseConfigured } from './supabase'
import MapCanvas from './components/MapCanvas'
import EditorSidebar from './components/EditorSidebar'
import CheckinModal from './components/CheckinModal'
import AdminGate from './components/AdminGate'
import { todayKey, shiftDateKey, prettyDate } from './utils/geometry'
import { nextLocalNumber, makeId } from './utils/idGen'

export default function App() {
  const [mode, setMode] = useState('checkin') // 'checkin' | 'edit'
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    try { return sessionStorage.getItem('lan-checkin:admin') === '1' } catch { return false }
  })
  const [requestingAdmin, setRequestingAdmin] = useState(false)
  const [dateKey, setDateKey] = useState(todayKey())
  const [selection, setSelection] = useState(null)
  const [placingNode, setPlacingNode] = useState(null)
  const [activeNode, setActiveNode] = useState(null) // node opened in check-in modal
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const { layout, update, loaded: layoutLoaded, saving } = useLayout()
  const { entries, loaded: checkinsLoaded, checkIn, checkOut } = useCheckins(dateKey)

  const requireAdmin = () => {
    if (adminUnlocked || !import.meta.env.VITE_ADMIN_PASSCODE) {
      setMode('edit')
      setAdminUnlocked(true)
    } else {
      setRequestingAdmin(true)
    }
  }

  const onUnlocked = () => {
    setAdminUnlocked(true)
    setMode('edit')
    setRequestingAdmin(false)
  }

  // Handle placing a new node
  const placeNode = (x, y) => {
    if (!placingNode) return
    const ln = nextLocalNumber(layout.nodes, placingNode.sectionId)
    const newNode = {
      id: makeId('n'),
      sectionId: placingNode.sectionId,
      localNumber: ln,
      type: placingNode.type,
      x: Math.max(0, Math.min(layout.mapWidth, x)),
      y: Math.max(0, Math.min(layout.mapHeight, y)),
    }
    update((l) => ({ ...l, nodes: [...l.nodes, newNode] }))
    setSelection({ kind: 'node', id: newNode.id })
    // Keep placing to add multiple quickly — cancel via sidebar button
  }

  const onNodeClickCheckin = (node) => {
    setActiveNode(node)
  }

  const section = activeNode ? layout.sections.find((s) => s.id === activeNode.sectionId) : null
  const existing = activeNode ? entries[activeNode.id] : null

  // Statistics
  const stats = useMemo(() => {
    const total = layout.nodes.length
    const byoc = layout.nodes.filter((n) => n.type === 'byoc').length
    const rental = layout.nodes.filter((n) => n.type === 'rental').length
    const checkedIn = Object.keys(entries).filter((id) =>
      layout.nodes.some((n) => n.id === id)
    ).length
    return { total, byoc, rental, checkedIn }
  }, [layout.nodes, entries])

  const showSidebar = mode === 'edit' && sidebarOpen

  return (
    <div className="app">
      {!supabaseConfigured && (
        <div className="setup-banner">
          ⚠ Supabase not configured · running in local-only mode (single device). See README.md to enable multi-device sync.
        </div>
      )}

      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          LAN/CHECK-IN
        </div>

        <div className="mode-toggle">
          <button
            className={mode === 'checkin' ? 'active' : ''}
            onClick={() => {
              setMode('checkin')
              setSelection(null)
              setPlacingNode(null)
            }}
          >
            Check-in
          </button>
          <button
            className={mode === 'edit' ? 'active' : ''}
            onClick={requireAdmin}
          >
            Edit
          </button>
        </div>

        {mode === 'checkin' && (
          <div className="date-nav">
            <button onClick={() => setDateKey(shiftDateKey(dateKey, -1))}>‹</button>
            <div className="date">{prettyDate(dateKey)}</div>
            <button onClick={() => setDateKey(shiftDateKey(dateKey, 1))}>›</button>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => e.target.value && setDateKey(e.target.value)}
            />
            {dateKey !== todayKey() && (
              <button className="ghost" onClick={() => setDateKey(todayKey())}>Today</button>
            )}
          </div>
        )}

        {mode === 'checkin' && (
          <div className="stat-row" style={{ marginLeft: 8 }}>
            <div className="stat">
              <div className="n">{stats.checkedIn}</div>
              <div className="l">In</div>
            </div>
            <div className="stat">
              <div className="n" style={{ color: 'var(--text-dim)' }}>{stats.total - stats.checkedIn}</div>
              <div className="l">Open</div>
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div className="legend">
            <span className="chip">
              <span className="sw" style={{ background: 'var(--byoc)' }} /> BYOC
            </span>
            <span className="chip">
              <span className="sw" style={{ background: 'var(--rental)' }} /> Rental
            </span>
          </div>
        )}

        <div className="topbar-spacer" />

        {mode === 'edit' && (
          <button
            className="ghost"
            onClick={() => setSidebarOpen((o) => !o)}
            title="Toggle panel"
          >
            {sidebarOpen ? '⇠ Hide panel' : '⇢ Show panel'}
          </button>
        )}

        <div className={`sync-pill ${supabaseConfigured ? 'ok' : 'warn'}`}>
          <span className="led" />
          {!supabaseConfigured
            ? 'Local'
            : saving
              ? 'Saving…'
              : 'Synced'}
        </div>
      </div>

      <div className="main">
        {showSidebar && (
          <EditorSidebar
            layout={layout}
            update={update}
            selection={selection}
            setSelection={setSelection}
            placingNode={placingNode}
            setPlacingNode={setPlacingNode}
          />
        )}

        <MapCanvas
          layout={layout}
          mode={mode}
          placingNode={placingNode}
          onPlaceNode={placeNode}
          selection={selection}
          onSelect={setSelection}
          onMoveTable={(id, pos) =>
            update((l) => ({
              ...l,
              tables: l.tables.map((t) => (t.id === id ? { ...t, ...pos } : t)),
            }))
          }
          onMoveNode={(id, pos) =>
            update((l) => ({
              ...l,
              nodes: l.nodes.map((n) => (n.id === id ? { ...n, ...pos } : n)),
            }))
          }
          entries={entries}
          onNodeClickCheckin={onNodeClickCheckin}
          snapStep={layout.gridSize}
        />

        {!layoutLoaded && <div className="loading">Loading layout…</div>}
      </div>

      {activeNode && (
        <CheckinModal
          node={activeNode}
          section={section}
          existing={existing}
          sections={layout.sections}
          onClose={() => setActiveNode(null)}
          onCheckIn={(info) => checkIn(activeNode.id, info)}
          onCheckOut={() => checkOut(activeNode.id)}
          prettyDate={prettyDate(dateKey)}
        />
      )}

      {requestingAdmin && (
        <AdminGate
          onUnlock={onUnlocked}
        />
      )}
    </div>
  )
}
