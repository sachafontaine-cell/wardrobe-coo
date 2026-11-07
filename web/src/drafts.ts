// New items waiting for your OK before they join the closet. Each is one garment photo
// plus any number of label photos (care, size, brand). The queue is saved on the phone
// (details in localStorage, photos in IndexedDB), so closing the app loses nothing and
// tagging picks up where it left off. Items here are never used in outfits.
import { useEffect, useState } from 'preact/hooks'
import type { ColorFamily, Fabric, Fit, Formality, ItemType, Occasion, Pattern, Season, Weight } from './model'
import { type Processed, processLabel, processPhoto } from './photo'
import { GeminiError, type Tagging, tagQueued } from './gemini'
import { getSettings } from './settings'
import { delBlob, getBlob, getData, putBlob } from './store'
import { profileOf } from './model'

export interface LabelShot { id: string; blob: Blob; url: string }

export interface Draft {
  key: string
  photo?: Processed
  thumbUrl?: string
  labels: LabelShot[]
  /** Saved label ids (photos load from IndexedDB after a restart). */
  labelIds: string[]
  /** Label photos still being processed. */
  labelsPending: number
  hasPhoto?: boolean
  failed?: boolean
  tagging?: 'busy' | 'done' | 'error'
  tagError?: string
  /** Live progress line while tagging, e.g. "Tagging… 12 s". */
  tagStatus?: string
  /** The last failure was a dropped connection or timeout: retry when the app is back. */
  retryable?: boolean
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

const META = 'wardrobe-coo:drafts'
const fullKey = (k: string) => `draft:${k}:full`
const thumbKey = (k: string) => `draft:${k}:thumb`
const labelBlobKey = (k: string, id: string) => `draft:${k}:l:${id}`

let drafts: Draft[] = readMeta()
const listeners = new Set<() => void>()
let seq = 0

// ---- Saving the queue ----
const TRANSIENT = ['photo', 'thumbUrl', 'labels', 'labelsPending', 'tagStatus', 'deferTag', 'retag'] as const
function readMeta(): Draft[] {
  try {
    const raw = JSON.parse(localStorage.getItem(META) ?? '[]') as Draft[]
    // Anything mid-tag when the app closed starts again.
    return raw.map((d) => ({ ...d, labels: [], labelsPending: 0, tagging: d.tagging === 'busy' ? undefined : d.tagging }))
  } catch { return [] }
}
function writeMeta() {
  try {
    localStorage.setItem(META, JSON.stringify(drafts.map((d) => {
      const o: Record<string, unknown> = { ...d }
      for (const k of TRANSIENT) delete o[k]
      return o
    })))
  } catch { /* storage full: the queue still works until the app closes */ }
}
let writeTimer = 0
const emit = () => {
  listeners.forEach((l) => l())
  clearTimeout(writeTimer)
  writeTimer = setTimeout(writeMeta, 150) as unknown as number
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeMeta() })

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

export interface DraftSummary { count: number; labels: number; tagging: number; ready: number }
const summarize = (): DraftSummary => ({
  count: drafts.length,
  labels: drafts.reduce((n, d) => n + d.labels.length + d.labelsPending, 0),
  tagging: drafts.filter((d) => d.tagging === 'busy' || (d.hasPhoto && !d.tagging && geminiReady())).length,
  ready: drafts.filter(canSave).length,
})
/** Counts only: re-renders when they change, not on every progress tick. */
export function useDraftSummary(): DraftSummary {
  const [s, setS] = useState(summarize)
  useEffect(() => {
    const l = () => setS((prev) => { const n = summarize(); return n.count === prev.count && n.labels === prev.labels && n.tagging === prev.tagging && n.ready === prev.ready ? prev : n })
    listeners.add(l)
    l()
    return () => { listeners.delete(l) }
  }, [])
  return s
}

export const geminiReady = () => !!(getSettings().geminiKey && getSettings().geminiModel)
export const canSave = (d: Draft) => !!d.photo && !!d.type && d.tagging !== 'busy' && d.labelsPending === 0

// ---- Adding ----

/** A garment photo becomes a new draft. From the camera, tagging waits until the camera closes. */
export function addPhoto(blob: Blob, deferTag = false) {
  const key = `d${Date.now().toString(36)}${seq++}`
  drafts = [...drafts, { key, name: '', contexts: [], fabrics: [], labels: [], labelIds: [], labelsPending: 0, hero: false, paletteFail: false, touched: [], deferTag }]
  emit()
  processPhoto(blob)
    .then(async (p) => {
      if (!find(key)) return
      patch(key, { photo: p, hasPhoto: true, thumbUrl: URL.createObjectURL(p.thumb) })
      maybeTag(key)
      await Promise.all([putBlob(fullKey(key), p.full), putBlob(thumbKey(key), p.thumb)])
    })
    .catch(() => patch(key, { failed: true }))
  return key
}

/** Adds a label photo to a draft (the newest one when no key is given). */
export function addLabel(file: Blob, key = drafts[drafts.length - 1]?.key) {
  const d = key ? find(key) : undefined
  if (!d) return
  patch(d.key, { labelsPending: d.labelsPending + 1 })
  const id = `${Date.now().toString(36)}${seq++}`
  processLabel(file)
    .then((blob) => {
      const cur = find(d.key)
      if (!cur) return
      patch(d.key, { labels: [...cur.labels, { id, blob, url: URL.createObjectURL(blob) }], labelIds: [...cur.labelIds, id], labelsPending: cur.labelsPending - 1 })
      putBlob(labelBlobKey(d.key, id), blob)
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
  const l = d?.labels[n]
  if (!d || !l) return
  URL.revokeObjectURL(l.url)
  delBlob(labelBlobKey(key, l.id))
  patch(key, { labels: d.labels.filter((_, i) => i !== n), labelIds: d.labelIds.filter((x) => x !== l.id) })
}

/** Camera closed: tag everything that was waiting. */
export function releaseDeferred() {
  for (const d of drafts) if (d.deferTag) { patch(d.key, { deferTag: false }); maybeTag(d.key) }
}

// ---- Tagging ----

function maybeTag(key: string) {
  const d = find(key)
  if (!d || d.deferTag || d.tagging || !d.photo || d.labelsPending > 0) return
  runTag(key)
}

const aborts = new Map<string, AbortController>()

export function runTag(key: string) {
  const d = find(key)
  const s = getSettings()
  if (!d?.photo || !s.geminiKey || !s.geminiModel) return
  aborts.get(key)?.abort()
  const ctrl = new AbortController()
  aborts.set(key, ctrl)
  patch(key, { tagging: 'busy', tagError: undefined, tagStatus: 'Waiting to tag…', retryable: false, retag: false })
  tagQueued(s.geminiKey, s.geminiModel, d.photo.full, d.labels.map((l) => l.blob), profileOf(getData()), {
    signal: ctrl.signal,
    onStatus: (t) => { if (find(key)?.tagging === 'busy') patch(key, { tagStatus: t }) },
  })
    .then((t) => applyTagging(key, t, d.labels.length > 0))
    .catch((e) => {
      const err = e as GeminiError
      if (find(key) && !ctrl.signal.aborted) patch(key, { tagging: 'error', tagError: err.message, retryable: !!err.retryable })
    })
    .finally(() => {
      if (aborts.get(key) === ctrl) aborts.delete(key)
      if (find(key)?.retag) runTag(key)
    })
}

/** Stop waiting on Gemini for this item; fill it in by hand. */
export function skipTag(key: string) {
  aborts.get(key)?.abort()
  patch(key, { tagging: 'error', tagError: 'Skipped', retryable: false, retag: false })
}

// Back in the app after the phone slept: retry anything that lost its connection.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    for (const d of drafts) if (d.tagging === 'error' && d.retryable) runTag(d.key)
  })
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

// ---- Editing ----

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

/** Drop a draft and its photos (after saving it to the closet, or when removed). */
export function remove(key: string) {
  const d = find(key)
  if (!d) return
  aborts.get(key)?.abort()
  aborts.delete(key)
  if (d.thumbUrl) URL.revokeObjectURL(d.thumbUrl)
  d.labels.forEach((l) => URL.revokeObjectURL(l.url))
  delBlob(fullKey(key)); delBlob(thumbKey(key))
  d.labelIds.forEach((id) => delBlob(labelBlobKey(key, id)))
  drafts = drafts.filter((x) => x.key !== key)
  emit()
}

// ---- After a restart: load photos, then carry on tagging ----
async function restore() {
  for (const d of [...drafts]) {
    // A shot that never finished processing has nothing to show.
    if (!d.hasPhoto) { remove(d.key); continue }
    const [full, thumb] = await Promise.all([getBlob(fullKey(d.key)), getBlob(thumbKey(d.key))])
    if (!full || !thumb) { patch(d.key, { failed: true, hasPhoto: false }); continue }
    const labels: LabelShot[] = []
    for (const id of d.labelIds) { const b = await getBlob(labelBlobKey(d.key, id)); if (b) labels.push({ id, blob: b, url: URL.createObjectURL(b) }) }
    patch(d.key, { photo: { full, thumb }, thumbUrl: URL.createObjectURL(thumb), labels, labelIds: labels.map((l) => l.id) })
    if (!d.tagging || (d.tagging === 'error' && d.retryable)) runTag(d.key)
  }
}
if (drafts.length && typeof indexedDB !== 'undefined') restore()
