import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, supabaseConfigured } from '../supabase'

const LS_KEY = (date) => `lan-checkin:checkins:${date}`

function rowToEntry(row) {
  return {
    name: row.name,
    discord: row.discord || '',
    phone: row.phone || '',
    checkedInAt: row.checked_in_at,
  }
}

export function useCheckins(dateKey) {
  const [entries, setEntries] = useState({})
  const [loaded, setLoaded] = useState(false)
  const latest = useRef({})
  latest.current = entries

  useEffect(() => {
    setLoaded(false)
    try {
      const raw = localStorage.getItem(LS_KEY(dateKey))
      setEntries(raw ? JSON.parse(raw) : {})
    } catch {
      setEntries({})
    }

    if (!supabaseConfigured || !supabase) {
      setLoaded(true)
      return
    }

    let mounted = true

    ;(async () => {
      const { data, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('date', dateKey)
      if (!mounted) return
      if (error) {
        console.error('Checkins load error:', error)
      } else {
        const map = {}
        for (const row of data || []) map[row.node_id] = rowToEntry(row)
        setEntries(map)
        try {
          localStorage.setItem(LS_KEY(dateKey), JSON.stringify(map))
        } catch {}
      }
      setLoaded(true)
    })()

    const channel = supabase
      .channel(`checkins-${dateKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkins', filter: `date=eq.${dateKey}` },
        (payload) => {
          setEntries((prev) => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE') {
              delete next[payload.old.node_id]
            } else {
              next[payload.new.node_id] = rowToEntry(payload.new)
            }
            try {
              localStorage.setItem(LS_KEY(dateKey), JSON.stringify(next))
            } catch {}
            return next
          })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [dateKey])

  const checkIn = useCallback(
    async (nodeId, info) => {
      const checkedInAt = new Date().toISOString()
      const entry = {
        name: info.name.trim(),
        discord: (info.discord || '').trim(),
        phone: (info.phone || '').trim(),
        checkedInAt,
      }
      const next = { ...latest.current, [nodeId]: entry }
      setEntries(next)
      try {
        localStorage.setItem(LS_KEY(dateKey), JSON.stringify(next))
      } catch {}

      if (!supabaseConfigured || !supabase) return
      const { error } = await supabase.from('checkins').upsert({
        date: dateKey,
        node_id: nodeId,
        name: entry.name,
        discord: entry.discord,
        phone: entry.phone,
        checked_in_at: checkedInAt,
      })
      if (error) console.error('Check-in save error:', error)
    },
    [dateKey]
  )

  const checkOut = useCallback(
    async (nodeId) => {
      const next = { ...latest.current }
      delete next[nodeId]
      setEntries(next)
      try {
        localStorage.setItem(LS_KEY(dateKey), JSON.stringify(next))
      } catch {}

      if (!supabaseConfigured || !supabase) return
      const { error } = await supabase
        .from('checkins')
        .delete()
        .eq('date', dateKey)
        .eq('node_id', nodeId)
      if (error) console.error('Check-out save error:', error)
    },
    [dateKey]
  )

  return { entries, loaded, checkIn, checkOut }
}
