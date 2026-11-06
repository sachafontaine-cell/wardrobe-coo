// Photos being reviewed before they join the closet. Kept in memory only.
// Each draft is one garment photo plus any number of label photos (care, size, brand).
import { useEffect, useState } from 'preact/hooks'
import type { ColorFamily, Fabric, Fit, Formality, ItemType, Occasion, Pattern, Season, Weight } from './model'
import { type Processed, processLabel, processPhoto } from './photo'
import { type Tagging, tagQueued } from './gemini'
import { getSettings } from './settings'
import { getData } from './store'
import { profileOf } from './model'

export interface LabelShot { blob: Blob; url: string }

export interface Draft {
  key: string
  photo?: Processed
  thumbUrl?: string
  labels: LabelShot[]
  /** Label photos still being processed. */
  labelsPending: number
  failed?: boolean
  tagging?: 'busy' | 'done' | 'error'
  tagError?: string
  /** Tag once the camera closes, so item + label shots go to Gemini together. */
  deferTag?: boolean
  /** A label arrived while tagging; tag again when done. */
  retag?: boolean
  /** Fields the person changed by hand; Gemini never overwrites them. */
  touched: string[]
  name: string
  type?: ItemType
  colorFamily?: ColorFamily
  exactColor?: string
  weight?: Weight
  formality?: Formality
  contexts: Occasion[]
  pattern?: Pattern
  fabrics: Fabric[]
  blend?: string
  fabricEstimated?: boolean
  brand?: string
  size?: string
  care?: string
  fit?: Fit
  season?: Season
  hero: boolean
  paletteFail: boolean
  failReason?: string
}

let drafts: Draft[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let seq = 0

export const getDrafts = () => drafts
const find = (key: string) => drafts.find((d) => d.key === key)

export function useDrafts(): Draft[] {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return drafts
}

export const geminiReady = () => !!(getSettings().geminiKey && getSettings().geminiModel)

/** A garment photo becomes a new draft. From the camera, tagging waits until the camera closes. */
export function addPhoto(blob: Blob, deferTag = false) {
  const key = `d${Date.now()}-${seq++}`
  drafts = [...drafts, { key, name: '', contexts: [], fabrics: [], labels: [], labelsPending: 0, hero: false, paletteFail: false, touched: [], deferTag }]
  emit()
  processPhoto(blob)
    .then((p) => { patch(key, { photo: p, thumbUrl: URL.createObjectURL(p.thumb) }); maybeTag(key) })
    .catch(() => patch(key, { failed: true }))
  return key
}

/** Adds a label photo to a draft (the newest one when no key is given). */
export function addLabel(file: Blob, key = drafts[drafts.length - 1]?.key) {
  const d = key ? find(key) : undefined
  if (!d) return
  patch(d.key, { labelsPending: d.labelsPending + 1 })
  processLabel(file)
    .then((blob) => {
      const cur = find(d.key)
      if (!cur) return
      patch(d.key, { labels: [...cur.labels, { blob, url: URL.createObjectURL(blob) }], labelsPending: cur.labelsPending - 1 })
      // Once the item has been tagged (or is tagging), read the new label too.
      const now = find(d.key)!
      if (now.tagging === 'busy') patch(d.key, { retag: true })
      else if (now.tagging) runTag(d.key)
      else maybeTag(d.key)
    })
    .catch(() => {
      const cur = find(d.key)
      if (cur) patch(d.key, { labelsPending: cur.labelsPending - 1, tagError: "Couldn't read that label photo." })
    })
}

export function removeLabel(key: string, n: number) {
  const d = find(key)
  if (!d) return
  URL.revokeObjectURL(d.labels[n]?.url ?? '')
  patch(key, { labels: d.labels.filter((_, i) => i !== n) })
}

/** Camera closed: tag everything that was waiting. */
export function releaseDeferred() {
  for (const d of drafts) if (d.deferTag) { patch(d.key, { deferTag: false }); maybeTag(d.key) }
}

function maybeTag(key: string) {
  const d = find(key)
  if (!d || d.deferTag || d.tagging || !d.photo || d.labelsPending > 0) return
  runTag(key)
}

export function runTag(key: string) {
  const d = find(key)
  const s = getSettings()
  if (!d?.photo || !s.geminiKey || !s.geminiModel) return
  patch(key, { tagging: 'busy', tagError: undefined, retag: false })
  tagQueued(s.geminiKey, s.geminiModel, d.photo.full, d.labels.map((l) => l.blob), profileOf(getData()))
    .then((t) => applyTagging(key, t, d.labels.length > 0))
    .catch((e) => patch(key, { tagging: 'error', tagError: (e as Error).message }))
    .finally(() => { if (find(key)?.retag) runTag(key) })
}

function applyTagging(key: string, t: Tagging, fromLabel: boolean) {
  const d = find(key)
  if (!d) return
  const change: Partial<Draft> = { tagging: 'done' }
  for (const [k, v] of Object.entries(t) as [keyof Tagging, unknown][]) {
    if (v === undefined || d.touched.includes(k)) continue
    // Fibers read from a label are never replaced by a guess from the photo alone.
    if (!fromLabel && (k === 'fabrics' || k === 'blend' || k === 'fabricEstimated') && d.fabricEstimated === false) continue
    ;(change as Record<string, unknown>)[k] = v
  }
  patch(key, change)
}

/** System update (no "touched" marking). */
export function patch(key: string, change: Partial<Draft>) {
  drafts = drafts.map((d) => (d.key === key ? { ...d, ...change } : d))
  emit()
}

/** A person's edit: remembered so Gemini won't overwrite it. */
export function edit(key: string, change: Partial<Draft>) {
  const d = find(key)
  if (!d) return
  patch(key, { ...change, touched: [...new Set([...d.touched, ...Object.keys(change)])] })
}

function revoke(d: Draft) {
  if (d.thumbUrl) URL.revokeObjectURL(d.thumbUrl)
  d.labels.forEach((l) => URL.revokeObjectURL(l.url))
}

export function remove(key: string) {
  const d = find(key)
  if (d) revoke(d)
  drafts = drafts.filter((x) => x.key !== key)
  emit()
}

export function clearDrafts() {
  drafts.forEach(revoke)
  drafts = []
  emit()
}
