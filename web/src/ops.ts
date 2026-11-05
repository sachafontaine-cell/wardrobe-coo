// State changes as pure functions of AppData, ported from the Android version.
import { type AppData, type ColorFamily, type HistoryEntry, type Item, type ItemType, type Occasion, type Outfit, type Pattern, type PrevValue, type Slot, TYPES, outfitIds } from './model'
import { type DayConditions, defaultOccasion, pick, swapSlot } from './picker'
import { addDays, daysBetween } from './dates'

export const occasionFor = (d: AppData, today: string): Occasion => d.prefs.occasionOverride[today] ?? defaultOccasion(today)

/** Once per day: count suitable unworn days, drop old history, delete items donated 14+ days ago. */
export function dailyMaintenance(d: AppData, today: string): { data: AppData; expired: string[] } {
  const last = d.prefs.lastEligibilityDate
  if (last && last >= today) return { data: d, expired: [] }
  const days = last ? Math.min(Math.max(daysBetween(last, today), 0), 120) : 0
  // Without weather history, only light and mid items accrue days (spec fallback).
  let items = d.items.map((i) =>
    days > 0 && i.status === 'ACTIVE' && (!i.weight || i.weight === 'LIGHT' || i.weight === 'MID') ? { ...i, eligibleDaysUnworn: i.eligibleDaysUnworn + days } : i)
  const cutoff = addDays(today, -14)
  const expired = items.filter((i) => i.status === 'DONATED' && i.donatedOn && i.donatedOn <= cutoff).map((i) => i.id)
  items = items.filter((i) => !expired.includes(i.id))
  const keepDate = <T,>(rec: Record<string, T>, f: (k: string, v: T) => boolean) => Object.fromEntries(Object.entries(rec).filter(([k, v]) => f(k, v)))
  return {
    expired,
    data: {
      ...d,
      items,
      history: d.history.filter((h) => h.date > cutoff),
      prefs: {
        ...d.prefs,
        lastEligibilityDate: today,
        occasionOverride: keepDate(d.prefs.occasionOverride, (k) => k >= today),
        snoozes: keepDate(d.prefs.snoozes, (_, v) => v >= today),
        swaps: d.prefs.swaps.filter((s) => s.date > cutoff),
      },
    },
  }
}

/** Today's pick, generated once and cached; regenerated if the occasion changed or a piece is gone. */
export function ensurePick(d: AppData, today: string, cond: DayConditions, force = false): AppData {
  const occ = occasionFor(d, today)
  const cached = d.prefs.todayPick
  const logged = d.history.some((h) => h.date === today)
  const active = new Set(d.items.filter((i) => i.status === 'ACTIVE').map((i) => i.id))
  const valid = !!cached && cached.date === today && cached.occasion === occ && cached.outfits.length > 0 &&
    cached.outfits.every((o) => outfitIds(o).every((id) => active.has(id)))
  if (!force && (valid || (logged && cached?.date === today))) return d
  const r = pick(d.items, d.history, d.prefs, today, occ, cond)
  return { ...d, prefs: { ...d.prefs, todayPick: { date: today, occasion: occ, outfits: r.outfits, index: 0, note: r.note, skipped: {} } } }
}

export function shownOutfit(d: AppData, today: string): Outfit | undefined {
  const p = d.prefs.todayPick
  if (!p || p.date !== today) return undefined
  return p.shown ?? p.outfits[p.index]
}

export const loggedToday = (d: AppData, today: string): HistoryEntry | undefined => [...d.history].reverse().find((h) => h.date === today)

export function ok(d: AppData, today: string): AppData {
  if (loggedToday(d, today)) return d
  const p = d.prefs.todayPick
  const o = shownOutfit(d, today)
  if (!p || !o) return d
  const ids = new Set(outfitIds(o))
  const prev: Record<string, PrevValue> = {}
  for (const i of d.items) if (ids.has(i.id)) prev[i.id] = { lastWorn: i.lastWorn, eligibleDaysUnworn: i.eligibleDaysUnworn }
  const entry: HistoryEntry = { date: today, ...o, occasion: p.occasion, source: p.index === 0 && !p.shown ? 'pick' : `swap-${p.index}`, prev }
  return { ...d, items: d.items.map((i) => (ids.has(i.id) ? { ...i, lastWorn: today, eligibleDaysUnworn: 0 } : i)), history: [...d.history, entry] }
}

export function undo(d: AppData, today: string): AppData {
  const e = loggedToday(d, today)
  if (!e) return d
  return {
    ...d,
    items: d.items.map((i) => (e.prev[i.id] ? { ...i, lastWorn: e.prev[i.id].lastWorn, eligibleDaysUnworn: e.prev[i.id].eligibleDaysUnworn } : i)),
    history: d.history.filter((h) => h !== e),
  }
}

/** Next ranked outfit. Records the swap; three swaps away from one combo blocks it. */
export function swapOutfit(d: AppData, today: string): AppData {
  const p = d.prefs.todayPick
  const away = shownOutfit(d, today)
  if (!p || !away || p.outfits.length < 2) return d
  const rec = { topId: away.topId, bottomId: away.bottomId, date: today }
  const swaps = [...d.prefs.swaps, rec]
  const n = swaps.filter((s) => s.topId === rec.topId && s.bottomId === rec.bottomId).length
  const already = d.prefs.blockedCombos.some((b) => b.topId === rec.topId && b.bottomId === rec.bottomId)
  const blockedCombos = n >= 3 && !already ? [...d.prefs.blockedCombos, rec] : d.prefs.blockedCombos
  const until = addDays(today, 2)
  return {
    ...d,
    prefs: {
      ...d.prefs, swaps, blockedCombos,
      snoozes: { ...d.prefs.snoozes, [away.topId]: until, [away.bottomId]: until },
      todayPick: { ...p, index: (p.index + 1) % p.outfits.length, shown: undefined, skipped: {} },
    },
  }
}

export function swapTile(d: AppData, today: string, slot: Slot, cond: DayConditions): AppData {
  const p = d.prefs.todayPick
  const cur = shownOutfit(d, today)
  if (!p || !cur) return d
  const curId = slot === 'TOP' ? cur.topId : slot === 'BOTTOM' ? cur.bottomId : slot === 'SHOES' ? cur.shoeId : slot === 'LAYER' ? cur.layerId : undefined
  if (!curId) return d
  let skipped = [...(p.skipped[slot] ?? []), curId]
  let next = swapSlot(cur, slot, d.items, d.prefs, today, p.occasion, cond, skipped)
  if (!next) {
    skipped = [curId] // cycled through everything: start over
    next = swapSlot(cur, slot, d.items, d.prefs, today, p.occasion, cond, skipped)
    if (!next) return d
  }
  return { ...d, prefs: { ...d.prefs, todayPick: { ...p, shown: next, skipped: { ...p.skipped, [slot]: skipped } } } }
}

export const setOccasion = (d: AppData, today: string, occ: Occasion): AppData =>
  ({ ...d, prefs: { ...d.prefs, occasionOverride: { ...d.prefs.occasionOverride, [today]: occ } } })

export function nextId(items: Item[], type: ItemType, extra: string[] = []): string {
  const prefix = TYPES.find((t) => t.code === type)!.code
  const nums = [...items.map((i) => i.id), ...extra].filter((id) => id.startsWith(prefix + '-')).map((id) => parseInt(id.slice(prefix.length + 1), 10)).filter((n) => !isNaN(n))
  return `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

/** An existing active item that looks the same: same type, color family and pattern. */
export const lookalike = (items: Item[], type?: ItemType, color?: ColorFamily, pattern?: Pattern): Item | undefined =>
  type && color ? items.find((i) => i.status === 'ACTIVE' && i.type === type && i.colorFamily === color && (!pattern || !i.pattern || i.pattern === pattern)) : undefined

export const donate = (d: AppData, id: string, today: string): AppData =>
  ({ ...d, items: d.items.map((i): Item => (i.id === id ? { ...i, status: 'DONATED', donatedOn: today } : i)) })

export const restore = (d: AppData, id: string): AppData =>
  ({ ...d, items: d.items.map((i): Item => (i.id === id ? { ...i, status: 'ACTIVE', donatedOn: undefined } : i)) })
