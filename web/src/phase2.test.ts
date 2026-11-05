import { describe, expect, it } from 'vitest'
import { type Item, type ItemType, type ColorFamily, emptyData } from './model'
import { type DayConditions, eveningSwap, pick } from './picker'
import { ensurePick, ok, shownOutfit } from './ops'
import { parseWeather, viewWeather } from './weather'
import { planDay } from './calendar'
import type { CalEvent } from './google'
import { emptyPrefs } from './model'

const today = '2026-11-05'
const item = (id: string, type: ItemType, colorFamily: ColorFamily = 'OLIVE', extra: Partial<Item> = {}): Item => ({
  id, name: id, type, colorFamily, contexts: [], fabrics: [], hero: false, paletteFail: false, condition: 'GOOD', status: 'ACTIVE',
  hasPhoto: false, added: '2026-11-01', eligibleDaysUnworn: 0, ...extra,
})

function forecast(temps: number[], lowCloud: number[] = [], rain: number[] = []) {
  const time = temps.map((_, h) => `${today}T${String(h).padStart(2, '0')}:00`)
  return { hourly: { time, temperature_2m: temps, precipitation_probability: temps.map((_, h) => rain[h] ?? 0), cloud_cover_low: temps.map((_, h) => lowCloud[h] ?? 0) } }
}

describe('weather', () => {
  it('reads the day range, marine layer and band', () => {
    const temps = Array.from({ length: 24 }, (_, h) => (h <= 10 ? 16 : h <= 15 ? 23 : 18))
    const cloud = Array.from({ length: 24 }, (_, h) => (h <= 9 ? 90 : 10))
    const w = parseWeather(forecast(temps, cloud), today)
    const v = viewWeather(w)
    expect(w.marineUntil).toBe(10)
    expect(Math.round(w.high)).toBe(23)
    expect(v.band).toBe('WARM')
    expect(v.layer).toBe('LIGHT') // morning under 17°C
    expect(v.summary).toBe('16→23°C · 0% rain · Marine layer until 10 am')
  })
  it('hot day: no layer; rain flag at 40%', () => {
    const w = parseWeather(forecast(Array(24).fill(26), [], Array(24).fill(45)), today)
    expect(viewWeather(w)).toMatchObject({ band: 'HOT', layer: 'NONE', rainy: true, marine: false })
  })
})

const ev = (title: string, startH: number, endH: number, extra: Partial<CalEvent> = {}): CalEvent => ({
  title, start: new Date(2026, 10, 5, startH).toISOString(), end: new Date(2026, 10, 5, endH).toISOString(), allDay: false, location: '', guests: 0, video: false, ...extra,
})

describe('calendar', () => {
  it('customer meeting means Exec', () => {
    expect(planDay([ev('Customer workshop', 13, 15)])).toMatchObject({ occasion: 'EXEC', detail: 'Customer workshop 1 pm' })
  })
  it('video calls mean camera-ready with a time window', () => {
    expect(planDay([ev('Sync', 10, 11, { video: true }), ev('Zoom with team', 13, 14)])).toMatchObject({ cameraReady: true, detail: 'Video 10–2' })
  })
  it('evening dinner becomes the evening line', () => {
    expect(planDay([ev('Dinner at George’s, La Jolla', 19, 21)]).evening).toEqual({ title: 'Dinner at George’s', time: '7 pm' })
  })
  it('school event is Family', () => {
    expect(planDay([ev('Félix soccer game', 9, 11)]).occasion).toBe('FAMILY')
  })
})

const noLayer: DayConditions = { band: 'WARM', layer: 'NONE', rainy: false, known: true }

describe('pick with context', () => {
  const closet = [
    item('TEE-001', 'TEE', 'OLIVE'), item('POLO-001', 'POLO', 'NAVY'), item('PANT-001', 'PANT', 'STONE'),
    item('SHOE-001', 'SHOE', 'TOBACCO', { formality: 'CASUAL' }), item('SHOE-002', 'SHOE', 'TOBACCO', { name: 'Suede loafers', formality: 'SMART', contexts: ['DATE'] }),
    item('LAYER-001', 'LAYER', 'NAVY', { name: 'Navy blazer', formality: 'BUSINESS' }),
  ]
  it('camera-ready never picks a tee', () => {
    const r = pick(closet, [], emptyPrefs(), today, 'WFH', { ...noLayer, cameraReady: true })
    expect(r.outfits.every((o) => o.topId === 'POLO-001')).toBe(true)
  })
  it('re-picks when conditions change, but not after OK', () => {
    let d = ensurePick({ ...emptyData(), items: closet }, today, noLayer)
    const before = d.prefs.todayPick
    d = ensurePick(d, today, { ...noLayer, cameraReady: true })
    expect(d.prefs.todayPick).not.toBe(before)
    d = ok(d, today)
    const logged = d.prefs.todayPick
    d = ensurePick(d, today, { ...noLayer, band: 'COOL', layer: 'WARM' })
    expect(d.prefs.todayPick).toBe(logged)
  })
  it('evening line suggests dressier shoes and a layer', () => {
    const o = { topId: 'POLO-001', bottomId: 'PANT-001', shoeId: 'SHOE-001' }
    expect(eveningSwap(o, closet, 'WFH', { title: 'Dinner', time: '7 pm' })).toBe('Dinner 7 pm: swap in suede loafers + navy blazer.')
    expect(eveningSwap(o, closet, 'EXEC', { title: 'Dinner', time: '7 pm' })).toBeUndefined()
  })
  it('shown outfit exists after a calendar-driven Exec day', () => {
    const d = ensurePick({ ...emptyData(), items: closet }, today, { ...noLayer, occasion: 'EXEC' })
    expect(d.prefs.todayPick?.occasion).toBe('EXEC')
    expect(shownOutfit(d, today)).toBeDefined()
  })
})

describe('context fallback', () => {
  it('falls back to the closest match when nothing is tagged for the occasion', () => {
    const items = [item('POLO-001', 'POLO', 'OLIVE', { contexts: ['WFH'] }), item('PANT-001', 'PANT', 'STONE', { contexts: ['WFH'] }), item('SHOE-001', 'SHOE', 'TOBACCO', { contexts: ['WFH'] })]
    const r = pick(items, [], emptyPrefs(), today, 'EXEC', noLayer)
    expect(r.outfits).toHaveLength(1)
    expect(r.note).toBe('Closest match for today.')
  })
})
