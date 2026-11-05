import { useMemo, useState } from 'preact/hooks'
import type { AppData } from '../model'
import { FILTER_GROUPS, SORTS, applyFilters, sortItems } from '../filters'
import { Chip, Crest, Icons, Picture, Sheet } from '../ui'

interface Props {
  data: AppData
  today: string
  query: string
  setQuery: (q: string) => void
  onOpen: (id: string) => void
  onAdd: () => void
  onFilters: (f: Record<string, string[]>) => void
  onSort: (s: string) => void
}

export function Closet({ data, today, query, setQuery, onOpen, onAdd, onFilters, onSort }: Props) {
  const [showFilters, setShowFilters] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const filters = data.prefs.closetFilters
  const sort = data.prefs.closetSort
  const shown = useMemo(() => sortItems(applyFilters(data.items, filters, query, today), sort), [data.items, filters, query, sort, today])
  const active = FILTER_GROUPS.filter((g) => filters[g.key]?.length)

  return (
    <div class="main stack" style={{ gap: 12 }}>
      <div class="row">
        <Crest />
        <h1 class="title grow">Closet</h1>
        <button class="press" onClick={onAdd} aria-label="Add item"
          style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--primary)', color: 'var(--on-primary)', fontSize: 28, lineHeight: '48px' }}>+</button>
      </div>
      <div class="row" style={{ gap: 8 }}>
        <input class="field grow" type="search" placeholder="Search name, brand, color…" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        <button class="field press row" style={{ width: 'auto', gap: 6, fontWeight: 500, fontSize: 15 }} onClick={() => setShowFilters(true)}>
          <span style={{ width: 18, height: 18, display: 'inline-flex' }}>{Icons.filters}</span>Filters
        </button>
      </div>
      {active.length > 0 && (
        <div class="chips">
          {active.map((g) => {
            const labels = g.options.filter((o) => filters[g.key].includes(o.code)).map((o) => o.label).join(', ')
            return <Chip key={g.key} label={`${labels}  ×`} on onClick={() => { const { [g.key]: _, ...rest } = filters; onFilters(rest) }} />
          })}
          <button class="press" style={{ fontSize: 14, textDecoration: 'underline', padding: '0 8px', minHeight: 38 }} onClick={() => onFilters({})}>Clear all</button>
        </div>
      )}
      <div class="row">
        <span class="muted grow">{shown.length} items</span>
        <div style={{ position: 'relative' }}>
          <button class="press" style={{ fontSize: 14, fontWeight: 500, height: 44 }} onClick={() => setSortOpen(!sortOpen)}>
            Sort: {SORTS.find((s) => s.code === sort)?.label ?? 'Type'} ▾
          </button>
          {sortOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setSortOpen(false)} />
              <div class="menu" style={{ right: 0, top: 44 }}>
                {SORTS.map((s) => <button key={s.code} onClick={() => { setSortOpen(false); onSort(s.code) }}>{s.label}</button>)}
              </div>
            </>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div class="muted" style={{ fontSize: 16, padding: '24px 0' }}>
          {data.items.length === 0 ? 'Your closet is empty. Tap + to photograph your clothes.' : 'No items match.'}
        </div>
      ) : (
        <div class="grid3">
          {shown.map((i) => {
            const badge = i.condition === 'WORN' ? ['Worn', 'badge-red'] : i.condition === 'FADING' ? ['Fading', 'badge-red'] : i.paletteFail ? ['Off palette', 'badge-amber'] : i.fitNote ? [i.fitNote.split(' ·')[0], 'badge-amber'] : undefined
            return (
              <button key={i.id} class="press" style={{ position: 'relative' }} onClick={() => onOpen(i.id)} aria-label={i.name}>
                <Picture id={i.id} hasPhoto={i.hasPhoto} type={i.type} color={i.colorFamily} />
                {badge && <span class={`badge ${badge[1]}`}>{badge[0]}</span>}
              </button>
            )
          })}
        </div>
      )}

      {showFilters && <Filters data={data} today={today} query={query} current={filters} onApply={onFilters} onClose={() => setShowFilters(false)} />}
    </div>
  )
}

function Filters({ data, today, query, current, onApply, onClose }: {
  data: AppData; today: string; query: string; current: Record<string, string[]>; onApply: (f: Record<string, string[]>) => void; onClose: () => void
}) {
  const [picked, setPicked] = useState(current)
  const count = useMemo(() => applyFilters(data.items, picked, query, today).length, [picked, data.items, query, today])
  const toggle = (key: string, code: string) => {
    const sel = picked[key] ?? []
    const next = sel.includes(code) ? sel.filter((c) => c !== code) : [...sel, code]
    const { [key]: _, ...rest } = picked
    setPicked(next.length ? { ...rest, [key]: next } : rest)
  }
  return (
    <Sheet title="Filters" onClose={onClose} foot={<>
      <button class="btn btn-secondary btn-sm press" style={{ height: 52 }} onClick={() => setPicked({})}>Clear all</button>
      <button class="btn btn-primary press grow" style={{ height: 52 }} onClick={() => { onApply(picked); onClose() }}>Show {count} items</button>
    </>}>
      {FILTER_GROUPS.map((g) => (
        <div key={g.key} class="stack" style={{ gap: 8 }}>
          <div class="label">{g.label}</div>
          <div class="chips">{g.options.map((o) => <Chip key={o.code} label={o.label} on={(picked[g.key] ?? []).includes(o.code)} onClick={() => toggle(g.key, o.code)} />)}</div>
        </div>
      ))}
    </Sheet>
  )
}
