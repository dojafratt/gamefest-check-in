import React, { useState } from 'react'
import { makeId, nextLocalNumber } from '../utils/idGen'

export default function EditorSidebar({
  layout,
  update,
  selection,
  setSelection,
  placingNode,
  setPlacingNode,
}) {
  const [expanded, setExpanded] = useState({ map: true, sections: true, selection: true })

  const toggle = (k) => setExpanded((e) => ({ ...e, [k]: !e[k] }))

  const addTable = () => {
    const id = makeId('t')
    const t = {
      id,
      x: Math.round(layout.mapWidth / 2),
      y: Math.round(layout.mapHeight / 2),
      width: 6,
      length: 2,
      rotation: 0,
      label: `T${layout.tables.length + 1}`,
    }
    update((l) => ({ ...l, tables: [...l.tables, t] }))
    setSelection({ kind: 'table', id })
  }

  const startPlacingNode = (sectionId, type) => {
    setPlacingNode({ sectionId, type })
  }

  const addSection = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const used = new Set(layout.sections.map((s) => s.prefix))
    let prefix = 'A'
    for (const l of letters) if (!used.has(l)) { prefix = l; break }
    const colors = ['#7cf7c6', '#ffb86b', '#c084fc', '#60a5fa', '#f472b6', '#facc15', '#34d399']
    const color = colors[layout.sections.length % colors.length]
    const s = {
      id: makeId('s'),
      name: `Section ${prefix}`,
      prefix,
      showPrefix: true,
      color,
    }
    update((l) => ({ ...l, sections: [...l.sections, s] }))
  }

  const selectedTable = selection?.kind === 'table'
    ? layout.tables.find((t) => t.id === selection.id)
    : null
  const selectedNode = selection?.kind === 'node'
    ? layout.nodes.find((n) => n.id === selection.id)
    : null

  const updateTable = (patch) => {
    update((l) => ({
      ...l,
      tables: l.tables.map((t) => (t.id === selectedTable.id ? { ...t, ...patch } : t)),
    }))
  }
  const deleteTable = () => {
    update((l) => ({ ...l, tables: l.tables.filter((t) => t.id !== selectedTable.id) }))
    setSelection(null)
  }

  const updateNode = (patch) => {
    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) => (n.id === selectedNode.id ? { ...n, ...patch } : n)),
    }))
  }
  const deleteNode = () => {
    update((l) => ({ ...l, nodes: l.nodes.filter((n) => n.id !== selectedNode.id) }))
    setSelection(null)
  }

  const updateSection = (id, patch) => {
    update((l) => ({
      ...l,
      sections: l.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }
  const deleteSection = (id) => {
    if (layout.sections.length <= 1) {
      alert('At least one section is required.')
      return
    }
    const inUse = layout.nodes.filter((n) => n.sectionId === id).length
    if (inUse > 0 && !confirm(`${inUse} node(s) are in this section and will also be deleted. Continue?`)) {
      return
    }
    update((l) => ({
      ...l,
      sections: l.sections.filter((s) => s.id !== id),
      nodes: l.nodes.filter((n) => n.sectionId !== id),
    }))
  }

  return (
    <aside className="sidebar">
      {/* Map settings */}
      <div className="panel">
        <div className="section-title" onClick={() => toggle('map')} style={{ cursor: 'pointer' }}>
          <span>Map & Tables</span>
          <span>{expanded.map ? '−' : '+'}</span>
        </div>
        {expanded.map && (
          <>
            <div className="field-row" style={{ marginBottom: 10 }}>
              <div>
                <label>Width (ft)</label>
                <input
                  type="number" min="10" max="500"
                  value={layout.mapWidth}
                  onChange={(e) => update((l) => ({ ...l, mapWidth: +e.target.value || 1 }))}
                />
              </div>
              <div>
                <label>Length (ft)</label>
                <input
                  type="number" min="10" max="500"
                  value={layout.mapHeight}
                  onChange={(e) => update((l) => ({ ...l, mapHeight: +e.target.value || 1 }))}
                />
              </div>
              <div>
                <label>Grid (ft)</label>
                <input
                  type="number" min="0.5" step="0.5" max="20"
                  value={layout.gridSize}
                  onChange={(e) => update((l) => ({ ...l, gridSize: +e.target.value || 1 }))}
                />
              </div>
            </div>
            <button onClick={addTable} style={{ width: '100%' }}>+ Add Table</button>
          </>
        )}
      </div>

      {/* Sections */}
      <div className="panel">
        <div className="section-title" onClick={() => toggle('sections')} style={{ cursor: 'pointer' }}>
          <span>Sections</span>
          <span>{expanded.sections ? '−' : '+'}</span>
        </div>
        {expanded.sections && (
          <>
            <div className="section-list" style={{ marginBottom: 10 }}>
              {layout.sections.map((s) => {
                const count = layout.nodes.filter((n) => n.sectionId === s.id).length
                return (
                  <SectionItem
                    key={s.id}
                    section={s}
                    count={count}
                    onUpdate={(patch) => updateSection(s.id, patch)}
                    onDelete={() => deleteSection(s.id)}
                    onAddNode={(type) => startPlacingNode(s.id, type)}
                    placingHere={placingNode?.sectionId === s.id}
                  />
                )
              })}
            </div>
            <button onClick={addSection} style={{ width: '100%' }}>+ New Section</button>
          </>
        )}
      </div>

      {placingNode && (
        <div className="panel" style={{ borderColor: 'var(--accent)', background: 'rgba(124,247,198,0.05)' }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            Click map to place {placingNode.type.toUpperCase()} node
          </div>
          <button className="ghost" onClick={() => setPlacingNode(null)} style={{ width: '100%' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Selection editor */}
      {(selectedTable || selectedNode) && (
        <div className="panel">
          <div className="section-title">
            <span>Selected · {selectedTable ? 'Table' : 'Node'}</span>
            <button className="ghost icon" onClick={() => setSelection(null)}>×</button>
          </div>
          {selectedTable && (
            <>
              <div className="form-row">
                <label>Label</label>
                <input
                  value={selectedTable.label || ''}
                  onChange={(e) => updateTable({ label: e.target.value })}
                />
              </div>
              <div className="field-row form-row">
                <div>
                  <label>Width (ft)</label>
                  <input
                    type="number" min="0.5" step="0.5"
                    value={selectedTable.width}
                    onChange={(e) => updateTable({ width: +e.target.value || 1 })}
                  />
                </div>
                <div>
                  <label>Length (ft)</label>
                  <input
                    type="number" min="0.5" step="0.5"
                    value={selectedTable.length}
                    onChange={(e) => updateTable({ length: +e.target.value || 1 })}
                  />
                </div>
              </div>
              <div className="field-row form-row">
                <div>
                  <label>X (ft)</label>
                  <input
                    type="number" step="0.5"
                    value={+selectedTable.x.toFixed(2)}
                    onChange={(e) => updateTable({ x: +e.target.value })}
                  />
                </div>
                <div>
                  <label>Y (ft)</label>
                  <input
                    type="number" step="0.5"
                    value={+selectedTable.y.toFixed(2)}
                    onChange={(e) => updateTable({ y: +e.target.value })}
                  />
                </div>
                <div>
                  <label>Rotation (°)</label>
                  <input
                    type="number" step="5"
                    value={selectedTable.rotation || 0}
                    onChange={(e) => updateTable({ rotation: +e.target.value })}
                  />
                </div>
              </div>
              <div className="field-row">
                <button
                  onClick={() => updateTable({ rotation: ((selectedTable.rotation || 0) - 15 + 360) % 360 })}
                >↺ −15°</button>
                <button
                  onClick={() => updateTable({ rotation: ((selectedTable.rotation || 0) + 15) % 360 })}
                >↻ +15°</button>
                <button
                  onClick={() => updateTable({ rotation: ((selectedTable.rotation || 0) + 90) % 360 })}
                >↻ 90°</button>
              </div>
              <button className="danger" onClick={deleteTable} style={{ width: '100%', marginTop: 10 }}>
                Delete table
              </button>
            </>
          )}

          {selectedNode && (
            <>
              <div className="form-row">
                <label>Section</label>
                <select
                  value={selectedNode.sectionId}
                  onChange={(e) => {
                    const newSection = e.target.value
                    if (newSection === selectedNode.sectionId) return
                    const ln = nextLocalNumber(
                      layout.nodes.filter((n) => n.id !== selectedNode.id),
                      newSection
                    )
                    updateNode({ sectionId: newSection, localNumber: ln })
                  }}
                >
                  {layout.sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Type</label>
                <div className="radio-group">
                  <button
                    className={selectedNode.type === 'byoc' ? 'active' : ''}
                    onClick={() => updateNode({ type: 'byoc' })}
                  >BYOC</button>
                  <button
                    className={selectedNode.type === 'rental' ? 'active' : ''}
                    onClick={() => updateNode({ type: 'rental' })}
                  >Rental</button>
                </div>
              </div>
              <div className="form-row">
                <label>Local number</label>
                <input
                  type="number" min="1"
                  value={selectedNode.localNumber}
                  onChange={(e) => updateNode({ localNumber: +e.target.value || 1 })}
                />
              </div>
              <div className="field-row form-row">
                <div>
                  <label>X (ft)</label>
                  <input
                    type="number" step="0.5"
                    value={+selectedNode.x.toFixed(2)}
                    onChange={(e) => updateNode({ x: +e.target.value })}
                  />
                </div>
                <div>
                  <label>Y (ft)</label>
                  <input
                    type="number" step="0.5"
                    value={+selectedNode.y.toFixed(2)}
                    onChange={(e) => updateNode({ y: +e.target.value })}
                  />
                </div>
              </div>
              <button className="danger" onClick={deleteNode} style={{ width: '100%', marginTop: 10 }}>
                Delete node
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function SectionItem({ section, count, onUpdate, onDelete, onAddNode, placingHere }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="section-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="swatch" style={{ background: section.color }} />
        <span className="name">{section.name}</span>
        <span className="meta">{count} node{count === 1 ? '' : 's'}</span>
        <button className="ghost icon" onClick={() => setOpen((o) => !o)}>{open ? '−' : '⋯'}</button>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <div className="field-row">
            <div>
              <label>Name</label>
              <input value={section.name} onChange={(e) => onUpdate({ name: e.target.value })} />
            </div>
            <div>
              <label>Prefix</label>
              <input
                value={section.prefix}
                maxLength={4}
                onChange={(e) => onUpdate({ prefix: e.target.value })}
              />
            </div>
            <div style={{ maxWidth: 60 }}>
              <label>Color</label>
              <input
                type="color"
                value={section.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                style={{ padding: 2, height: 34 }}
              />
            </div>
          </div>
          <div className="switch-row">
            <span>Show prefix in ID</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={section.showPrefix}
                onChange={(e) => onUpdate({ showPrefix: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
          <button className="danger" onClick={onDelete}>Delete section</button>
        </div>
      )}
      <div className="field-row">
        <button
          onClick={() => onAddNode('byoc')}
          style={{
            flex: 1,
            borderColor: placingHere ? 'var(--accent)' : undefined,
          }}
        >+ BYOC</button>
        <button
          onClick={() => onAddNode('rental')}
          style={{ flex: 1 }}
        >+ Rental</button>
      </div>
    </div>
  )
}
