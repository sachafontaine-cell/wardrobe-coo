import { describe, expect, it } from 'vitest'
import { type Item, type ItemType, emptyData, defaultProfile } from './model'
import { checkState, flaggedItems, gaps, isBigReview, nextReviewDate, reviewDateFor } from './review'
import { fitFlags } from './fit'
import { parse } from './ask'
import { seasonNote } from './weather'

const item = (id: string, type: ItemType, extra: Partial<Item> = {}): Item => ({
  id, name: id, type, colorFamily: 'OLIVE', contexts: [], fabrics: [], hero: false, paletteFail: false, condition: 'GOOD', status: 'ACTIVE',
  hasPhoto: true, added: '2026-01-01', eligibleDaysUnworn: 0, ...extra,
})

describe('closet check dates', () => {
  it('finds the latest review date and the next one', () => {
    expect(reviewDateFor('2026-11-05')).toBe('2026-09-10')
    expect(reviewDateFor('2026-03-10')).toBe('2026-03-10')
    expect(reviewDateFor('2026-02-01')).toBe('2025-12-10')
    expect(nextReviewDate('2026-11-05')).toBe('2026-12-10')
    expect(nextReviewDate('2026-12-10')).toBe('2027-03-10')
    expect(isBigReview('2026-09-10')).toBe(true)
    expect(isBigReview('2026-12-10')).toBe(false)
  })
})

describe('flags', () => {
  const items = [
    item('TEE-001', 'TEE', { condition: 'FADING' }), item('TEE-002', 'TEE', { paletteFail: true, failReason: 'cool grey' }),
    item('SHORT-001', 'SHORT', { eligibleDaysUnworn: 94 }), item('SWIM-001', 'SWIM', { eligibleDaysUnworn: 200 }),
    item('POLO-001', 'POLO', { eligibleDaysUnworn: 120, keptUntil: '2026-12-10' }), item('POLO-002', 'POLO', { status: 'DONATED', condition: 'WORN' }),
  ]
  it('flags fading, off palette and long-unworn; skips swim, kept and donated', () => {
    const f = flaggedItems(items, '2026-09-10')
    expect(f.map((x) => x.item.id).sort()).toEqual(['SHORT-001', 'TEE-001', 'TEE-002'])
    expect(f.find((x) => x.item.id === 'SHORT-001')!.reason).toBe('Unworn 94 suitable days')
    expect(f.find((x) => x.item.id === 'TEE-002')!.reason).toBe('Off palette: cool grey')
  })
  it('is not due for reviews before the closet started, and not after Done', () => {
    const d = { ...emptyData(), items: items.map((i) => ({ ...i, added: '2026-11-01' })) }
    expect(checkState(d, '2026-11-05').due).toBe(false)
    const d2 = { ...emptyData(), items }
    expect(checkState(d2, '2026-11-05')).toMatchObject({ due: true, big: true, showBanner: true })
    const d3 = { ...d2, prefs: { ...d2.prefs, reviewsDone: ['2026-09-10'] } }
    expect(checkState(d3, '2026-11-05').due).toBe(false)
    const d4 = { ...d2, prefs: { ...d2.prefs, checkSnoozeUntil: '2026-11-08' } }
    expect(checkState(d4, '2026-11-05').showBanner).toBe(false)
  })
  it('lists gaps against targets', () => {
    expect(gaps([item('POLO-001', 'POLO')])[0]).toBe('Polo: 1 of 5')
  })
})

describe('fit check', () => {
  const closet = [item('POLO-001', 'POLO', { fit: 'TRIM' }), item('PANT-001', 'PANT', { fit: 'TAILORED' }), item('PANT-002', 'PANT', { fit: 'RELAXED' })]
  const withPrev = { ...emptyData(), items: closet, profile: { ...defaultProfile(), fitHistory: [{ date: '2026-03-10', weightLb: 185, waistIn: 34 }] } }
  it('first time saves a baseline', () => {
    expect(fitFlags({ ...emptyData(), items: closet }, 180, 33).note).toMatch(/Baseline/)
  })
  it('waist down flags snug bottoms as loose', () => {
    const r = fitFlags(withPrev, 184, 32.5)
    expect(r.items.map((i) => i.id)).toEqual(['PANT-001'])
    expect(r.note).toMatch(/waist down 1.5″.*loose/)
  })
  it('big weight gain flags tops and bottoms as tight', () => {
    const r = fitFlags(withPrev, 193, 34.5)
    expect(r.items.map((i) => i.id).sort()).toEqual(['PANT-001', 'POLO-001'])
    expect(r.note).toMatch(/tight/)
  })
  it('no change, nothing to try', () => {
    expect(fitFlags(withPrev, 186, 34).items).toHaveLength(0)
  })
})

describe('ask', () => {
  it('parses valid actions and drops unknown ids', () => {
    const raw = 'Done.\nBottom line: donated.\n```actions\n[{"type":"donate","id":"TEE-001"},{"type":"donate","id":"NOPE-001"},{"type":"tonight","text":"Dinner 7 pm: loafers."}]\n```'
    const r = parse(raw, new Set(['TEE-001']))
    expect(r.text).toBe('Done.\nBottom line: donated.')
    expect(r.actions).toEqual([{ type: 'donate', id: 'TEE-001' }, { type: 'tonight', text: 'Dinner 7 pm: loafers.' }])
  })
})

describe('season note', () => {
  it('only suggests a change past a threshold', () => {
    expect(seasonNote(16)).toMatch(/cool/)
    expect(seasonNote(26)).toMatch(/hot/)
    expect(seasonNote(21)).toMatch(/No changes/)
  })
})
