// Closet check (Mar, Jun, Sep, Dec 10) and the big review (Mar, Sep 10).
import { type AppData, type Item, type ItemType, typeLabel } from './model'

const MONTHS = [3, 6, 9, 12]

/** Most recent review date on or before today. */
export function reviewDateFor(today: string): string {
  const y = Number(today.slice(0, 4))
  const cands: string[] = []
  for (const yy of [y - 1, y]) for (const m of MONTHS) cands.push(`${yy}-${String(m).padStart(2, '0')}-10`)
  return cands.filter((d) => d <= today).sort().pop()!
}

export function nextReviewDate(today: string): string {
  const y = Number(today.slice(0, 4))
  for (const yy of [y, y + 1]) for (const m of MONTHS) {
    const d = `${yy}-${String(m).padStart(2, '0')}-10`
    if (d > today) return d
  }
  return `${y + 1}-03-10`
}

export const isBigReview = (date: string) => date.slice(5, 7) === '03' || date.slice(5, 7) === '09'

const NO_UNWORN_FLAG: ItemType[] = ['WORKOUT', 'SWIM', 'SUIT']

export interface Flag { item: Item; reason: string }

/** Items needing a decision, at most 6, most-unworn first. */
export function flaggedItems(items: Item[], reviewDate: string): Flag[] {
  const out: (Flag & { days: number })[] = []
  for (const i of items) {
    if (i.status !== 'ACTIVE' || (i.keptUntil && i.keptUntil > reviewDate)) continue
    let reason = ''
    if (i.condition === 'WORN') reason = 'Worn'
    else if (i.condition === 'FADING') reason = 'Fading'
    else if (i.paletteFail) reason = `Off palette${i.failReason ? `: ${i.failReason}` : ''}`
    else if (i.eligibleDaysUnworn >= 90 && !NO_UNWORN_FLAG.includes(i.type)) reason = `Unworn ${i.eligibleDaysUnworn} suitable days`
    if (reason) out.push({ item: i, reason, days: i.eligibleDaysUnworn })
  }
  return out.sort((a, b) => b.days - a.days).slice(0, 6).map(({ item, reason }) => ({ item, reason }))
}

export interface CheckState { reviewDate: string; big: boolean; flags: Flag[]; due: boolean; showBanner: boolean }

export function checkState(d: AppData, today: string): CheckState {
  const reviewDate = reviewDateFor(today)
  const big = isBigReview(reviewDate)
  const flags = flaggedItems(d.items, reviewDate)
  const firstAdded = d.items.map((i) => i.added).sort()[0]
  const done = (d.prefs.reviewsDone ?? []).includes(reviewDate)
  // Only reviews that fall after the closet was started count.
  const due = !done && !!firstAdded && firstAdded <= reviewDate && (flags.length > 0 || big)
  const snoozed = !!d.prefs.checkSnoozeUntil && d.prefs.checkSnoozeUntil > today
  return { reviewDate, big, flags, due, showBanner: due && !snoozed }
}

/** Spec targets for a 14-day laundry gap. */
export const TARGETS: { type: ItemType; target: number; note?: string }[] = [
  { type: 'POLO', target: 5 }, { type: 'TEE', target: 5 }, { type: 'SHIRT', target: 3, note: 'non-iron button-downs' },
  { type: 'SHORT', target: 4, note: 'stone, olive, navy, athletic' }, { type: 'PANT', target: 4, note: 'stone chino, olive chino, dark denim, tobacco 5-pocket' },
  { type: 'LAYER', target: 2, note: 'overshirt, navy blazer' }, { type: 'SHOE', target: 4, note: 'suede loafers, tobacco leather sneakers, off-white sneakers, sandals' },
  { type: 'SWIM', target: 1 }, { type: 'WORKOUT', target: 5 },
]

export function gaps(items: Item[]): string[] {
  const active = items.filter((i) => i.status === 'ACTIVE' && i.condition !== 'WORN')
  return TARGETS.flatMap(({ type, target, note }) => {
    const have = active.filter((i) => i.type === type).length
    return have < target ? [`${typeLabel(type)}: ${have} of ${target}${note ? ` (${note})` : ''}`] : []
  })
}

export const missingPhotos = (items: Item[]) => items.filter((i) => i.status === 'ACTIVE' && !i.hasPhoto)
