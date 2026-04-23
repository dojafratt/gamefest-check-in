import React, { useState } from 'react'

export default function AdminGate({ onUnlock }) {
  const [pc, setPc] = useState('')
  const [err, setErr] = useState('')
  const expected = import.meta.env.VITE_ADMIN_PASSCODE || ''

  const submit = (e) => {
    e.preventDefault()
    if (!expected) {
      // No passcode configured -> just unlock
      onUnlock()
      return
    }
    if (pc === expected) {
      try { sessionStorage.setItem('lan-checkin:admin', '1') } catch {}
      onUnlock()
    } else {
      setErr('Incorrect passcode.')
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 360 }}>
        <h2>Admin access</h2>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
          Enter the admin passcode to edit the floor plan.
        </div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Passcode</label>
            <input
              type="password"
              autoFocus
              value={pc}
              onChange={(e) => { setPc(e.target.value); setErr('') }}
            />
            {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6, fontFamily: 'var(--font-mono)' }}>{err}</div>}
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => history.back()}>Cancel</button>
            <button type="submit" className="primary">Unlock</button>
          </div>
        </form>
      </div>
    </div>
  )
}
