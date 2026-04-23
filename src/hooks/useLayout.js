import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, supabaseConfigured } from '../supabase'
import { makeId } from '../utils/idGen'

const LAYOUT_ID = 'main'
const LS_KEY = 'lan-checkin:layout'

export const DEFAULT_LAYOUT = {
  tables: [],
  nodes: [],
  sections: [
    { id: makeId('s'), name: 'Main', prefix: 'A', showPrefix: false, color: '#7cf7c6' },
  ],
  mapWidth: 80,
  mapHeight: 60,
  gridSize: 1,
}

export function useLayout() {
  const [layout, setLayout] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) }
    } catch {}
    return DEFAULT_LAYOUT
  })
  const [loaded, setLoaded] = useState(!supabaseConfigured)
  const [saving, setSaving] = useState(false)
  const pendingTimeout = useRef(null)
  const latest = useRef(layout)
  latest.current = layout
  // Tracks the JSON we last pushed, so we can ignore echoes from realtime.
  const lastPushed = useRef(null)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    let mounted = true

    ;(async () => {
      const { data, error } = await supabase
        .from('layouts')
        .select('data')
        .eq('id', LAYOUT_ID)
        .maybeSingle()
      if (!mounted) return
      if (error) {
        console.error('Layout load error:', error)
      } else if (data?.data) {
        setLayout({ ...DEFAULT_LAYOUT, ...data.data })
      }
      setLoaded(true)
    })()

    const channel = supabase
      .channel('layouts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'layouts', filter: `id=eq.${LAYOUT_ID}` },
        (payload) => {
          const incoming = payload.new?.data
          if (!incoming) return
          const incomingStr = JSON.stringify(incoming)
          // Ignore the echo of our own write.
          if (lastPushed.current === incomingStr) return
          setLayout({ ...DEFAULT_LAYOUT, ...incoming })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  const persist = useCallback((next) => {
    setLayout(next)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {}

    if (!supabaseConfigured || !supabase) return

    if (pendingTimeout.current) clearTimeout(pendingTimeout.current)
    setSaving(true)
    pendingTimeout.current = setTimeout(async () => {
      const payload = latest.current
      lastPushed.current = JSON.stringify(payload)
      try {
        const { error } = await supabase
          .from('layouts')
          .upsert({
            id: LAYOUT_ID,
            data: payload,
            updated_at: new Date().toISOString(),
          })
        if (error) console.error('Layout save error:', error)
      } finally {
        setSaving(false)
      }
    }, 400)
  }, [])

  const update = useCallback(
    (fn) => {
      const next = fn(latest.current)
      persist(next)
    },
    [persist]
  )

  return { layout, update, loaded, saving }
}
