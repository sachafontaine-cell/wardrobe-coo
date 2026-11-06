import { COLORS, CONDITIONS, FABRICS, FITS, FORMALITIES, type Item, OCCASIONS, type Opt, PATTERNS, SEASONS, STATUSES, TYPES, WEIGHTS, COLOR_BY } from './model'
import { daysBetween } from './dates'

/** Within a group, picks mean "any of these", except Fabric: "contains every fabric picked". */
export interface FilterGroup { key: string; label: string; options: readonly Opt[]; matchAll?: boolean; value: (i: Item, today: string) => string[] }

const lastWorn = (i: Item, today: string) => {
  if (!i.lastWorn) return 'NEVER'
  const d = daysBetween(i.lastWorn, today)
  return d < 7 ? 'LT7' : d < 30 ? 'D7_30' : d < 90 ? 'D30_90' : 'D90'
}
const one = (v?: string) => (v ? [v] : [])

export const FILTER_GROUPS: FilterGroup[] = [
  { key: 'type', label: 'Type', options: TYPES, value: (i) => [i.type] },
  { key: 'context', label: 'Context', options: OCCASIONS, value: (i) => i.contexts },
  { key: 'weight', label: 'Weight', options: WEIGHTS, value: (i) => one(i.weight) },
  { key: 'formality', label: 'Formality', options: FORMALITIES, value: (i) => one(i.formality) },
  { key: 'color', label: 'Color family', options: COLORS, value: (i) => one(i.colorFamily) },
  { key: 'pattern', label: 'Pattern', options: PATTERNS, value: (i) => one(i.pattern) },
  { key: 'fabric', label: 'Fabric (contains all)', options: FABRICS, matchAll: true, value: (i) => i.fabrics },
  { key: 'season', label: 'Season', options: SEASONS, value: (i) => one(i.season) },
  { key: 'fit', label: 'Fit', options: FITS, value: (i) => one(i.fit) },
  { key: 'hero', label: 'Hero', options: [{ code: 'Y', label: 'Yes' }, { code: 'N', label: 'No' }], value: (i) => [i.hero ? 'Y' : 'N'] },
  { key: 'palette', label: 'Palette fit', options: [{ code: 'PASS', label: 'Pass' }, { code: 'FAIL', label: 'Fail' }], value: (i) => [i.paletteFail ? 'FAIL' : 'PASS'] },
  { key: 'condition', label: 'Condition', options: CONDITIONS, value: (i) => [i.condition] },
  { key: 'status', label: 'Status', options: STATUSES, value: (i) => [i.status] },
  {
    key: 'lastWorn', label: 'Last worn',
    options: [{ code: 'LT7', label: 'Under 7 days' }, { code: 'D7_30', label: '7–30 days' }, { code: 'D30_90', label: '30–90 days' }, { code: 'D90', label: '90+ days' }, { code: 'NEVER', label: 'Never' }],
    value: (i, t) => [lastWorn(i, t)],
  },
  { key: 'photo', label: 'Photo', options: [{ code: 'HAS', label: 'Has photo' }, { code: 'MISSING', label: 'Missing photo' }], value: (i) => [i.hasPhoto ? 'HAS' : 'MISSING'] },
]

/** Status defaults to Active when not chosen. */
export function applyFilters(items: Item[], filters: Record<string, string[]>, query: string, today: string): Item[] {
  const q = query.trim().toLowerCase()
  const eff = filters.status?.length ? filters : { ...filters, status: ['ACTIVE'] }
  return items.filter((i) =>
    FILTER_GROUPS.every((g) => {
      const picked = eff[g.key] ?? []
      if (!picked.length) return true
      const v = g.value(i, today)
      return g.matchAll ? picked.every((p) => v.includes(p)) : v.some((x) => picked.includes(x))
    }) &&
    (!q || [i.name, i.brand, i.size, i.care, i.exactColor, i.colorFamily ? COLOR_BY[i.colorFamily].label : '', i.blend, i.fabrics.join(' '), i.notes]
      .some((s) => (s ?? '').toLowerCase().includes(q))))
}

export const SORTS = [
  { code: 'TYPE', label: 'Type' }, { code: 'RECENT', label: 'Recently added' }, { code: 'LEAST_WORN', label: 'Least recently worn' },
  { code: 'COLOR', label: 'Color' }, { code: 'FORMALITY', label: 'Formality' },
] as const

const idx = (opts: readonly Opt[], c?: string) => { const n = opts.findIndex((o) => o.code === c); return n < 0 ? 99 : n }

export function sortItems(items: Item[], sort: string): Item[] {
  const by = (f: (i: Item) => number | string) => [...items].sort((a, b) => {
    const x = f(a), y = f(b)
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1
  })
  switch (sort) {
    case 'RECENT': return by((i) => i.added + i.id).reverse()
    case 'LEAST_WORN': return by((i) => i.lastWorn ?? '')
    case 'COLOR': return by((i) => idx(COLORS, i.colorFamily) * 100 + idx(TYPES, i.type))
    case 'FORMALITY': return by((i) => idx(FORMALITIES, i.formality) * 100 + idx(TYPES, i.type))
    default: return by((i) => idx(TYPES, i.type))
  }
}
