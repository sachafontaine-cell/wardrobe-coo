// Photos being reviewed before they join the closet. Kept in memory only.
import { useEffect, useState } from 'preact/hooks'
import type { ColorFamily, Fabric, Fit, Formality, ItemType, Occasion, Pattern, Season, Weight } from './model'
import { type Processed, processLabel, processPhoto } from './photo'
import { type Tagging, tagQueued } from './gemini'
import { getSettings } from './settings'

export interface Draft {
  key: string
  photo?: Processed
  thumbUrl?: string
  label?: Blob
  failed?: boolean
  tagging?: 'busy' | 'done' | 'error'
  tagError?: string
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

export function addPhoto(blob: Blob) {
  const key = `d${Date.now()}-${seq++}`
  drafts = [...drafts, { key, name: '', contexts: [], fabrics: [], hero: false, paletteFail: false, touched: [] }]
  emit()
  processPhoto(blob)
    .then((p) => { patch(key, { photo: p, thumbUrl: URL.createObjectURL(p.thumb) }); runTag(key) })
    .catch(() => patch(key, { failed: true }))
}

/** Adds a care-label photo and re-tags so fibers and brand come from the label. */
export async function addLabel(key: string, file: Blob) {
  try {
    const label = await processLabel(file)
    patch(key, { label })
    runTag(key)
  } catch {
    patch(key, { tagError: "Couldn't read that label photo." })
  }
}

export function runTag(key: string) {
  const d = find(key)
  const s = getSettings()
  if (!d?.photo || !s.geminiKey || !s.geminiModel) return
  patch(key, { tagging: 'busy', tagError: undefined })
  tagQueued(s.geminiKey, s.geminiModel, d.photo.full, d.label)
    .then((t) => applyTagging(key, t))
    .catch((e) => patch(key, { tagging: 'error', tagError: (e as Error).message }))
}

function applyTagging(key: string, t: Tagging) {
  const d = find(key)
  if (!d) return
  const change: Partial<Draft> = { tagging: 'done' }
  const fromLabel = !!d.label
  for (const [k, v] of Object.entries(t) as [keyof Tagging, unknown][]) {
    if (v === undefined || d.touched.includes(k)) continue
    // A label reading always replaces earlier fiber guesses.
    if (!fromLabel && (k === 'fabrics' || k === 'blend') && d.fabricEstimated === false) continue
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

export function remove(key: string) {
  const d = find(key)
  if (d?.thumbUrl) URL.revokeObjectURL(d.thumbUrl)
  drafts = drafts.filter((x) => x.key !== key)
  emit()
}

export function clearDrafts() {
  drafts.forEach((d) => d.thumbUrl && URL.revokeObjectURL(d.thumbUrl))
  drafts = []
  emit()
}
