// Turns today's calendar into an occasion, a camera-ready flag and an evening event.
import type { Occasion } from './model'
import type { CalEvent } from './google'

export interface DayPlan {
  occasion?: Occasion
  /** Short note for the occasion chip, e.g. "Video 10–2". */
  detail?: string
  cameraReady: boolean
  evening?: { title: string; time: string }
}

const EXEC = /\b(customer|client|conference|keynote|presentation|presenting|summit|offsite|on-?site|board|exec|interview)\b/i
const FAMILY = /\b(school|game|practice|party|park|birthday|recital|soccer|baseball|basketball|playdate|kids?|camp|parents?)\b/i
const BEACH = /\b(beach|pool|surf|swim)/i
const VIDEO = /\b(zoom|teams|google meet|webex|video call|video)\b/i
const EVENING = /\b(dinner|date|gala|party|drinks|restaurant|reservation|wedding|theat(er|re)|concert|show|opera|ballet|fundraiser)\b/i

const hourOf = (iso: string) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60 }

export function timeLabel(iso: string, suffix = true): string {
  const d = new Date(iso)
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  const base = m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`
  return suffix ? `${base} ${d.getHours() < 12 ? 'am' : 'pm'}` : base
}

const short = (t: string, n = 22) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)

export function planDay(events: CalEvent[]): DayPlan {
  const timed = events.filter((e) => !e.allDay)
  const day = timed.filter((e) => hourOf(e.start) < 17)
  const evening = timed.filter((e) => hourOf(e.start) >= 17)
  const plan: DayPlan = { cameraReady: false }

  const exec = day.find((e) => EXEC.test(e.title) || EXEC.test(e.location))
  const family = day.find((e) => FAMILY.test(e.title))
  const beach = [...day, ...events.filter((e) => e.allDay)].find((e) => BEACH.test(e.title) || BEACH.test(e.location))
  if (exec) { plan.occasion = 'EXEC'; plan.detail = `${short(exec.title)} ${timeLabel(exec.start)}` }
  else if (family) { plan.occasion = 'FAMILY'; plan.detail = `${short(family.title)} ${timeLabel(family.start)}` }
  else if (beach) { plan.occasion = 'BEACH'; plan.detail = short(beach.title) }

  const video = day.filter((e) => e.video || VIDEO.test(e.title))
  if (video.length) {
    plan.cameraReady = true
    const first = video.reduce((a, b) => (a.start < b.start ? a : b))
    const last = video.reduce((a, b) => (a.end > b.end ? a : b))
    if (!plan.detail) plan.detail = `Video ${timeLabel(first.start, false)}–${timeLabel(last.end, false)}`
  }

  const ev = evening.find((e) => EVENING.test(e.title))
  if (ev) plan.evening = { title: short(ev.title.split(/[,(]/)[0].trim(), 18), time: timeLabel(ev.start) }
  return plan
}
