import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, supabaseConfigured } from '../supabase'
import { makeId } from '../utils/idGen'

const LAYOUT_ID = 'main'
const LS_KEY = 'lan-checkin:layout'

// Fields we add to the stored JSON to identify our own writes when the
// realtime echo comes back. They live inside `data` so no schema change
// is needed; pre-existing layouts without these fields continue to load
// unchanged.
const META_WRITER = '_writer'
const META_SEQ = '_writeSeq'

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

// Strip our realtime-tag fields so they never leak into app state / UI.
function stripMeta(data) {
  if (!data || typeof data !== 'object') return {}
  const { [META_WRITER]: _w, [META_SEQ]: _s, ...rest } = data
  return rest
}

export function useLayout() {
  const [layout, setLayout] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...DEFAULT_LAYOUT, ...stripMeta(JSON.parse(raw)) }
    } catch {}
    return DEFAULT_LAYOUT
  })
  const [loaded, setLoaded] = useState(!supabaseConfigured)
  const [saving, setSaving] = useState(false)
  const pendingTimeout = useRef(null)
  const latest = useRef(layout)
  latest.current = layout

  // Per-tab identity. This lets us recognize our own realtime echoes
  // even when JSONB key reordering makes a byte-for-byte comparison
  // unreliable.
  const writerId = useRef(makeId('w')).current
  const writeSeq = useRef(0)
  // The highest sequence number we've sent out AND will ignore echoes
  // for. When a newer local edit arrives during an in-flight write, the
  // stale echo must still be suppressed — so we compare with `<=`.
  const ignoredSeqMax = useRef(0)

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
        setLayout({ ...DEFAULT_LAYOUT, ...stripMeta(data.data) })
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
          // Is this an echo of one of our own recent writes?
          if (
            incoming[META_WRITER] === writerId &&
            typeof incoming[META_SEQ] === 'number' &&
            incoming[META_SEQ] <= ignoredSeqMax.current
          ) {
            return
          }
          setLayout({ ...DEFAULT_LAYOUT, ...stripMeta(incoming) })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const seq = ++writeSeq.current
      ignoredSeqMax.current = seq
      const tagged = {
        ...stripMeta(latest.current),
        [META_WRITER]: writerId,
        [META_SEQ]: seq,
      }
      try {
        const { error } = await supabase
          .from('layouts')
          .upsert({
            id: LAYOUT_ID,
            data: tagged,
            updated_at: new Date().toISOString(),
          })
        if (error) console.error('Layout save error:', error)
      } finally {
        setSaving(false)
      }
    }, 400)
  }, [writerId])

  const update = useCallback(
    (fn) => {
      const next = fn(latest.current)
      persist(next)
    },
    [persist]
  )

  return { layout, update, loaded, saving }
}
