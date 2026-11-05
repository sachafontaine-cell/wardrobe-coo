// Pure outfit picker, ported from the Android version.
import { COLOR_BY, type Formality, type HistoryEntry, type Item, type Occasion, type Outfit, type Prefs, type Slot, outfitIds, slotOf, typeLabel } from './model'
import { daysBetween, weekday } from './dates'

export type WeatherBand = 'HOT' | 'WARM' | 'MILD' | 'COOL'
export type LayerNeed = 'NONE' | 'LIGHT' | 'WARM'
export interface DayConditions {
  band: WeatherBand
  layer: LayerNeed
  rainy: boolean
  /** Weather came from a forecast (not the fallback). */
  known: boolean
  marine?: boolean
  /** A video call today: no tees. */
  cameraReady?: boolean
  /** Occasion the calendar implies; a manual pick still wins. */
  occasion?: Occasion
}

/** Spec fallback when weather is unavailable: plan for 18–22°C and bring a light layer. */
export const FALLBACK: DayConditions = { band: 'WARM', layer: 'LIGHT', rainy: false, known: false }

/** Changes when anything that affects the pick changes. */
export const condKey = (c: DayConditions) => [c.band, c.layer, c.rainy, !!c.cameraReady, c.occasion ?? ''].join('|')

export interface PickResult { outfits: Outfit[]; note: string }

export const defaultOccasion = (date: string): Occasion => {
  const w = weekday(date)
  return w === 0 || w === 6 ? 'FAMILY' : 'WFH'
}

const daysSince = (d: string | undefined, today: string) => (d ? daysBetween(d, today) : undefined)

const topWeightOk = (w: Item['weight'], c: DayConditions) => {
  switch (c.band) {
    case 'HOT': case 'WARM': return !w || w === 'LIGHT'
    case 'MILD': return !w || w === 'LIGHT' || w === 'MID'
    case 'COOL': return !w || w === 'MID' || w === 'HEAVY'
  }
}
const bottomOk = (i: Item, c: DayConditions) => (c.band === 'HOT' || c.band === 'WARM' ? true : i.type !== 'SHORT')
const layerOk = (w: Item['weight'], need: LayerNeed) =>
  need === 'NONE' ? false : need === 'LIGHT' ? !w || w === 'LIGHT' || w === 'MID' : !w || w === 'MID' || w === 'HEAVY'
const fitsOccasion = (i: Item, occ: Occasion) => i.contexts.length === 0 || i.contexts.includes(occ)
/** Near-face rule: tops and layers must be in palette; no black near the face. */
const nearFaceOk = (i: Item) => !i.paletteFail && i.colorFamily !== 'BLACK'

const RELAX: { topCap: boolean; bottomCap: boolean; combo7: boolean; snooze: boolean; anyContext?: boolean; note: string }[] = [
  { topCap: false, bottomCap: false, combo7: false, snooze: false, note: '' },
  { topCap: true, bottomCap: false, combo7: false, snooze: false, note: 'Top limit relaxed.' },
  { topCap: true, bottomCap: true, combo7: false, snooze: false, note: 'Top and bottom limits relaxed.' },
  { topCap: true, bottomCap: true, combo7: true, snooze: false, note: 'Repeat rule relaxed.' },
  { topCap: true, bottomCap: true, combo7: true, snooze: true, note: 'Repeat rules relaxed.' },
  { topCap: true, bottomCap: true, combo7: true, snooze: true, anyContext: true, note: 'Closest match for today.' },
]

export function pick(all: Item[], history: HistoryEntry[], prefs: Prefs, today: string, occasion: Occasion, cond: DayConditions, max = 6): PickResult {
  const items = all.filter((i) => i.status === 'ACTIVE' && i.type !== 'WORKOUT')
  const recent = history.filter((h) => h.date !== today && (daysSince(h.date, today) ?? 99) <= 14)
  const count = (key: 'topId' | 'bottomId') => {
    const m = new Map<string, number>()
    for (const h of recent) m.set(h[key], (m.get(h[key]) ?? 0) + 1)
    return m
  }
  const topCounts = count('topId')
  const bottomCounts = count('bottomId')
  const combos7 = new Set(recent.filter((h) => (daysSince(h.date, today) ?? 99) <= 7).map((h) => h.topId + '|' + h.bottomId))
  const within4 = new Set(recent.filter((h) => (daysSince(h.date, today) ?? 99) <= 4).flatMap((h) => [h.topId, h.bottomId, h.shoeId, h.layerId ?? '']))
  const snoozed = new Set(Object.entries(prefs.snoozes).filter(([, until]) => until >= today).map(([id]) => id))
  const blocked = new Set(prefs.blockedCombos.map((b) => b.topId + '|' + b.bottomId))

  let fallback: { scored: [Outfit, number][]; note: string } | undefined
  for (const r of RELAX) {
    const usable = (i: Item) => (r.anyContext || fitsOccasion(i, occasion)) && (r.snooze || !snoozed.has(i.id)) && !(i.hero && within4.has(i.id))
    const tops = items.filter((i) => slotOf(i.type) === 'TOP' && usable(i) && nearFaceOk(i) && topWeightOk(i.weight, cond) && !(cond.cameraReady && i.type === 'TEE') && (r.topCap || (topCounts.get(i.id) ?? 0) < 3))
    const bottoms = items.filter((i) => slotOf(i.type) === 'BOTTOM' && usable(i) && bottomOk(i, cond) && (r.bottomCap || (bottomCounts.get(i.id) ?? 0) < 4))
    const shoes = items.filter((i) => slotOf(i.type) === 'SHOES' && usable(i) && !(cond.rainy && i.fabrics.includes('SUEDE')))
    let layers: (Item | undefined)[] = [undefined]
    if (cond.layer !== 'NONE') {
      const ls = items.filter((i) => slotOf(i.type) === 'LAYER' && usable(i) && !i.paletteFail && layerOk(i.weight, cond.layer))
      if (ls.length) layers = ls
    }
    const scored: [Outfit, number][] = []
    for (const t of tops) for (const b of bottoms) {
      const key = t.id + '|' + b.id
      if (blocked.has(key) || (!r.combo7 && combos7.has(key))) continue
      for (const s of shoes) for (const l of layers) {
        const pieces = l ? [t, b, s, l] : [t, b, s]
        if (pieces.filter((p) => p.hero).length > 1) continue
        scored.push([{ topId: t.id, bottomId: b.id, shoeId: s.id, ...(l ? { layerId: l.id } : {}) }, score(pieces, occasion, today)])
      }
    }
    if (scored.length >= 2) return rank(scored, r.note, max)
    if (scored.length && !fallback) fallback = { scored, note: r.note }
  }
  return fallback ? rank(fallback.scored, fallback.note, max) : { outfits: [], note: '' }
}

function rank(scored: [Outfit, number][], note: string, max: number): PickResult {
  scored.sort((a, b) => b[1] - a[1])
  const chosen: Outfit[] = []
  for (const [o] of scored) {
    if (!chosen.some((c) => c.topId === o.topId && c.bottomId === o.bottomId)) chosen.push(o)
    if (chosen.length >= max) break
  }
  return { outfits: chosen, note }
}

export function score(pieces: Item[], occasion: Occasion, today: string): number {
  const fresh = avg(pieces.map((p) => Math.min(Math.max(daysSince(p.lastWorn, today) ?? 30, 0), 30) / 30))
  let harmony = 1
  const fams = pieces.map((p) => p.colorFamily).filter(Boolean) as NonNullable<Item['colorFamily']>[]
  if (new Set(fams).size > 3) harmony -= 0.6
  if (fams.filter((f) => COLOR_BY[f].accent).length > 1) harmony -= 0.6
  for (const p of pieces) if ((slotOf(p.type) === 'BOTTOM' || slotOf(p.type) === 'SHOES') && p.paletteFail) harmony -= 0.2
  const top = pieces.find((p) => slotOf(p.type) === 'TOP')?.colorFamily
  const bottom = pieces.find((p) => slotOf(p.type) === 'BOTTOM')?.colorFamily
  if (top && bottom) {
    if (top === bottom) harmony -= 0.15
    const ok = (f: typeof top) => COLOR_BY[f].core || COLOR_BY[f].accent
    if (!ok(top) || !ok(bottom)) harmony -= 0.1
  }
  harmony = Math.min(1, Math.max(0, harmony))
  const fit = avg(pieces.map((p) => formalityFit(p.formality, occasion)))
  return 0.45 * fresh + 0.35 * harmony + 0.2 * fit
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

function formalityFit(f: Formality | undefined, occ: Occasion): number {
  if (!f) return 0.6
  const table: Record<Occasion, Record<Formality, number>> = {
    EXEC: { BUSINESS: 1, SMART: 0.7, CASUAL: 0.1 },
    WFH: { SMART: 1, CASUAL: 0.8, BUSINESS: 0.3 },
    FAMILY: { CASUAL: 1, SMART: 0.7, BUSINESS: 0.2 },
    DATE: { SMART: 1, BUSINESS: 0.7, CASUAL: 0.5 },
    BEACH: { CASUAL: 1, SMART: 0.4, BUSINESS: 0 },
    ACTIVE: { CASUAL: 1, SMART: 0.2, BUSINESS: 0.2 },
  }
  return table[occ][f]
}

const slotId = (o: Outfit, s: Slot) => (s === 'TOP' ? o.topId : s === 'BOTTOM' ? o.bottomId : s === 'SHOES' ? o.shoeId : s === 'LAYER' ? o.layerId : undefined)
const withSlot = (o: Outfit, s: Slot, id: string): Outfit =>
  s === 'TOP' ? { ...o, topId: id } : s === 'BOTTOM' ? { ...o, bottomId: id } : s === 'SHOES' ? { ...o, shoeId: id } : s === 'LAYER' ? { ...o, layerId: id } : o

/** Next-best item for one slot with the rest of the outfit fixed, or undefined when nothing else fits. */
export function swapSlot(current: Outfit, slot: Slot, all: Item[], prefs: Prefs, today: string, occasion: Occasion, cond: DayConditions, skip: string[]): Outfit | undefined {
  const byId = new Map(all.map((i) => [i.id, i]))
  const cur = slotId(current, slot)
  const blocked = new Set(prefs.blockedCombos.map((b) => b.topId + '|' + b.bottomId))
  let best: Outfit | undefined
  let bestScore = -1
  for (const c of all) {
    if (c.status !== 'ACTIVE' || slotOf(c.type) !== slot || c.id === cur || skip.includes(c.id) || !fitsOccasion(c, occasion)) continue
    if (slot === 'TOP' && !(nearFaceOk(c) && topWeightOk(c.weight, cond) && !(cond.cameraReady && c.type === 'TEE'))) continue
    if (slot === 'BOTTOM' && !bottomOk(c, cond)) continue
    if (slot === 'LAYER' && c.paletteFail) continue
    const o = withSlot(current, slot, c.id)
    if (blocked.has(o.topId + '|' + o.bottomId)) continue
    const pieces = outfitIds(o).map((id) => byId.get(id)).filter(Boolean) as Item[]
    if (pieces.filter((p) => p.hero).length > 1) continue
    const s = score(pieces, occasion, today)
    if (s > bestScore) { bestScore = s; best = o }
  }
  return best
}

/** One plain line saying why this outfit, without repeating the header. */
export function reason(o: Outfit, items: Map<string, Item>, cond: DayConditions, note: string): string {
  const top = items.get(o.topId)
  const bottom = items.get(o.bottomId)
  const shoe = items.get(o.shoeId)
  const layer = o.layerId ? items.get(o.layerId) : undefined
  const parts: string[] = []
  if (cond.cameraReady && top) parts.push(`${typeLabel(top.type).toLowerCase()} for camera`)
  if (top?.colorFamily && bottom?.colorFamily && parts.length === 0) {
    parts.push(`${COLOR_BY[top.colorFamily].label.toLowerCase()} on ${COLOR_BY[bottom.colorFamily].label.toLowerCase()}`)
  }
  if (layer) {
    const n = layer.name.toLowerCase()
    parts.push(!cond.known ? `${n} in case it's cool` : cond.marine ? `${n} until the fog lifts` : cond.layer === 'WARM' ? `${n} for the cold` : `${n} for the cool morning`)
  }
  if (cond.rainy && shoe) parts.push('closed shoes for rain')
  let line = parts.join(', ')
  if (line) line = line.charAt(0).toUpperCase() + line.slice(1) + '.'
  if (note) line = line ? `${line} ${note}` : note
  return line
}

/**
 * For an evening event, the smallest change that lifts the day's outfit:
 * dressier shoes and/or a smart layer. Undefined when the outfit already works.
 */
export function eveningSwap(o: Outfit, all: Item[], dayOccasion: Occasion, ev: { title: string; time: string }): string | undefined {
  if (dayOccasion === 'EXEC' || dayOccasion === 'DATE') return undefined
  const active = all.filter((i) => i.status === 'ACTIVE')
  const byId = new Map(active.map((i) => [i.id, i]))
  const lift = (slot: Slot, current?: string) => {
    const cur = current ? byId.get(current) : undefined
    const curScore = cur ? formalityFit(cur.formality, 'DATE') + (cur.contexts.includes('DATE') ? 0.2 : 0) : -1
    let best: Item | undefined
    let bestScore = curScore
    for (const i of active) {
      if (slotOf(i.type) !== slot || i.id === current || i.paletteFail || (i.formality !== 'SMART' && i.formality !== 'BUSINESS')) continue
      const s = formalityFit(i.formality, 'DATE') + (i.contexts.includes('DATE') ? 0.2 : 0)
      if (s > bestScore + 0.05) { best = i; bestScore = s }
    }
    return best
  }
  const picks = [lift('SHOES', o.shoeId), lift('LAYER', o.layerId)].filter(Boolean) as Item[]
  if (!picks.length) return undefined
  return `${ev.title} ${ev.time}: swap in ${picks.map((p) => p.name.toLowerCase()).join(' + ')}.`
}
