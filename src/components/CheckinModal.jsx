import React, { useState, useEffect } from 'react'
import { displayNodeLabel } from '../utils/idGen'

export default function CheckinModal({
  node,
  section,
  existing,    // existing check-in entry for this node, if any
  sections,
  onClose,
  onCheckIn,
  onCheckOut,
  prettyDate,
}) {
  const [name, setName] = useState('')
  const [discord, setDiscord] = useState('')
  const [phone, setPhone] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)

  useEffect(() => {
    setName('')
    setDiscord('')
    setPhone('')
    setConfirmOut(false)
  }, [node?.id])

  if (!node) return null

  const label = displayNodeLabel(node, sections)

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onCheckIn({ name, discord, phone })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {existing ? (
          <>
            <h2>
              Station {label}
              <span className="pill">{node.type === 'rental' ? 'Rental' : 'BYOC'}</span>
            </h2>
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
              {section?.name} · {prettyDate}
            </div>
            <div className="kv-grid">
              <div className="k">Name</div><div className="v">{existing.name}</div>
              {existing.discord && (<><div className="k">Discord</div><div className="v">{existing.discord}</div></>)}
              {existing.phone && (<><div className="k">Phone</div><div className="v">{existing.phone}</div></>)}
              <div className="k">Checked in</div>
              <div className="v">{new Date(existing.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {!confirmOut ? (
              <div className="form-actions">
                <button onClick={onClose}>Close</button>
                <button className="danger" onClick={() => setConfirmOut(true)}>Check out</button>
              </div>
            ) : (
              <>
                <div style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                  Remove {existing.name} from station {label}?
                </div>
                <div className="form-actions">
                  <button onClick={() => setConfirmOut(false)}>Cancel</button>
                  <button
                    className="danger"
                    onClick={() => { onCheckOut(); onClose() }}
                  >Confirm check-out</button>
                </div>
              </>
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            <h2>
              Check in · Station {label}
              <span className="pill">{node.type === 'rental' ? 'Rental' : 'BYOC'}</span>
            </h2>
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
              {section?.name} · {prettyDate}
            </div>
            <div className="form-row">
              <label>Name *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="form-row">
              <label>Discord</label>
              <input
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                placeholder="@username"
              />
            </div>
            <div className="form-row">
              <label>Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="form-actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={!name.trim()}>
                Check in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
