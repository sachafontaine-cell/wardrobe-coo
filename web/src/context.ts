// Today's weather and calendar. Read from cache instantly, refreshed in the background.
import { useEffect, useState } from 'preact/hooks'
import { type DayPlan, planDay } from './calendar'
import { type CalEvent, fetchEvents } from './google'
import { type DayConditions, FALLBACK } from './picker'
import { cacheGet, cacheSet, getSettings } from './settings'
import { type Weather, fetchWeather, viewWeather } from './weather'

export interface DayContext {
  cond: DayConditions
  weatherLine?: string
  weatherFailed: boolean
  plan: DayPlan
  calendarConnected: boolean
}

interface CalCache { date: string; events: CalEvent[]; fetchedAt: number }

let today = ''
let weather: Weather | undefined
let weatherFailed = false
let cal: CalCache | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Sets the day and loads cached values. Synchronous so the first frame is right. */
export function setDay(date: string) {
  if (date === today) return
  today = date
  const w = cacheGet<Weather>('weather')
  weather = w?.date === date ? w : undefined
  weatherFailed = false
  const c = cacheGet<CalCache>('calendar')
  cal = c?.date === date ? c : undefined
}

export function getContext(): DayContext {
  const w = weather ? viewWeather(weather) : undefined
  const connected = !!getSettings().google
  const plan = connected && cal ? planDay(cal.events) : { cameraReady: false }
  const base = w ? { band: w.band, layer: w.layer, rainy: w.rainy, known: true, marine: w.marine } : FALLBACK
  return {
    cond: { ...base, cameraReady: plan.cameraReady, occasion: plan.occasion },
    weatherLine: w?.summary,
    weatherFailed: !w && weatherFailed,
    plan,
    calendarConnected: connected,
  }
}

let refreshing = false
/** Fetches anything stale (weather > 1 h, calendar > 15 min). Calls onChange if the context changed. */
export async function refreshContext(force = false): Promise<void> {
  if (refreshing || !today) return
  refreshing = true
  const date = today
  const jobs: Promise<void>[] = []
  if (force || !weather || Date.now() - weather.fetchedAt > 3600_000) {
    jobs.push(fetchWeather(date).then((w) => { if (date === today) { weather = w; weatherFailed = false; cacheSet('weather', w) } })
      .catch(() => { if (!weather) weatherFailed = true }))
  }
  if (getSettings().google && (force || !cal || Date.now() - cal.fetchedAt > 900_000)) {
    jobs.push(fetchEvents(date).then((events) => { if (date === today) { cal = { date, events, fetchedAt: Date.now() }; cacheSet('calendar', cal) } })
      .catch(() => { /* keep cached or none: defaults apply */ }))
  }
  await Promise.all(jobs)
  refreshing = false
  emit()
}

export function onContextChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function useContext(): DayContext {
  const [, force] = useState(0)
  useEffect(() => onContextChange(() => force((n) => n + 1)), [])
  return getContext()
}
