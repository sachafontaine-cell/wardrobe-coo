import { describe, expect, it } from 'vitest'
import { type Fabric, type Item, type ItemType, type ColorFamily, emptyData, emptyPrefs } from './model'
import { type DayConditions, defaultOccasion, pick } from './picker'
import { dailyMaintenance, ensurePick, loggedToday, nextId, ok, shownOutfit, swapOutfit, undo } from './ops'
import { applyFilters } from './filters'
import { outfitIds } from './model'

const today = '2026-11-05' // Thursday
const noLayer: DayConditions = { band: 'WARM', layer: 'NONE', rainy: false, known: true }
const item = (id: string, type: ItemType, colorFamily: ColorFamily = 'OLIVE', extra: Partial<Item> = {}): Item => ({
  id, name: id, type, colorFamily, contexts: [], fabrics: [], hero: false, paletteFail: false, condition: 'GOOD', status: 'ACTIVE',
  hasPhoto: false, added: '2026-11-01', eligibleDaysUnworn: 0, ...extra,
})
const basic = [
  item('POLO-001', 'POLO', 'OLIVE'), item('POLO-002', 'POLO', 'NAVY'),
  item('PANT-001', 'PANT', 'STONE'), item('PANT-002', 'PANT', 'DENIM'), item('SHOE-001', 'SHOE', 'TOBACCO'),
]

describe('picker', () => {
  it('picks from a small closet without a relax note', () => {
    const r = pick([basic[0], basic[2], basic[4]], [], emptyPrefs(), today, 'WFH', noLayer)
    expect(r.outfits).toHaveLength(1)
    expect(r.note).toBe('')
  })
  it('never picks a black top', () => {
    const r = pick([...basic, item('TEE-001', 'TEE', 'BLACK')], [], emptyPrefs(), today, 'WFH', noLayer)
    expect(r.outfits.some((o) => o.topId === 'TEE-001')).toBe(false)
  })
  it('prefers fresher pieces', () => {
    const items = basic.map((i) => (i.id === 'POLO-001' ? { ...i, lastWorn: '2026-11-04' } : i))
    expect(pick(items, [], emptyPrefs(), today, 'WFH', noLayer).outfits[0].topId).toBe('POLO-002')
  })
  it('respects the top cap', () => {
    const hist = [1, 2, 3].map((n) => ({ date: `2026-11-0${n}`, topId: 'POLO-001', bottomId: n % 2 ? 'PANT-002' : 'PANT-001', shoeId: 'SHOE-001', occasion: 'WFH' as const, source: 'pick', prev: {} }))
    expect(pick(basic, hist, emptyPrefs(), today, 'WFH', noLayer).outfits.some((o) => o.topId === 'POLO-001')).toBe(false)
  })
  it('allows at most one hero', () => {
    const items = [item('POLO-001', 'POLO', 'RUST', { hero: true }), item('PANT-001', 'PANT', 'FOREST', { hero: true }), item('PANT-002', 'PANT', 'STONE'), item('SHOE-001', 'SHOE', 'TOBACCO')]
    const r = pick(items, [], emptyPrefs(), today, 'WFH', noLayer)
    expect(r.outfits.length).toBeGreaterThan(0)
    expect(r.outfits.some((o) => o.topId === 'POLO-001' && o.bottomId === 'PANT-001')).toBe(false)
  })
  it('weekend defaults to Family', () => {
    expect(defaultOccasion('2026-11-07')).toBe('FAMILY')
    expect(defaultOccasion(today)).toBe('WFH')
  })
})

describe('ops', () => {
  it('OK then Undo restores', () => {
    let d = ensurePick({ ...emptyData(), items: basic }, today, noLayer)
    d = ok(d, today)
    const worn = outfitIds(shownOutfit(d, today)!)
    expect(worn.every((id) => d.items.find((i) => i.id === id)!.lastWorn === today)).toBe(true)
    d = undo(d, today)
    expect(d.items.every((i) => !i.lastWorn)).toBe(true)
    expect(loggedToday(d, today)).toBeUndefined()
  })
  it('three swaps block a combo', () => {
    let d = ensurePick({ ...emptyData(), items: basic }, today, noLayer)
    const first = shownOutfit(d, today)!
    for (let k = 0; k < 3; k++) {
      d = { ...d, prefs: { ...d.prefs, todayPick: { ...d.prefs.todayPick!, index: 0 } } }
      d = swapOutfit(d, today)
    }
    expect(d.prefs.blockedCombos.some((b) => b.topId === first.topId && b.bottomId === first.bottomId)).toBe(true)
  })
  it('continues ids', () => {
    expect(nextId(basic, 'POLO')).toBe('POLO-003')
    expect(nextId(basic, 'TEE')).toBe('TEE-001')
    expect(nextId(basic, 'POLO', ['POLO-003'])).toBe('POLO-004')
  })
  it('expires donated items after 14 days and counts unworn days', () => {
    const d = { ...emptyData(), items: [...basic, item('TEE-009', 'TEE', 'OLIVE', { status: 'DONATED', donatedOn: '2026-10-20' })], prefs: { ...emptyPrefs(), lastEligibilityDate: '2026-11-04' } }
    const { data, expired } = dailyMaintenance(d, today)
    expect(expired).toEqual(['TEE-009'])
    expect(data.items.every((i) => i.eligibleDaysUnworn === 1)).toBe(true)
  })
})

describe('filters', () => {
  it('fabric needs every fabric picked', () => {
    const f = (id: string, fabrics: Fabric[]) => item(id, 'POLO', 'OLIVE', { fabrics })
    const items = [f('A', ['WOOL', 'POLYESTER']), f('B', ['WOOL', 'POLYESTER', 'ELASTANE']), f('C', ['WOOL']), f('D', ['POLYESTER'])]
    expect(applyFilters(items, { fabric: ['WOOL', 'POLYESTER'] }, '', today).map((i) => i.id)).toEqual(['A', 'B'])
  })
})
