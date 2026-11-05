// Photos being reviewed before they join the closet. Kept in memory only.
import { useEffect, useState } from 'preact/hooks'
import type { ColorFamily, Formality, ItemType, Occasion, Weight } from './model'
import { type Processed, processPhoto } from './photo'

export interface Draft {
  key: string
  photo?: Processed
  thumbUrl?: string
  failed?: boolean
  name: string
  type?: ItemType
  colorFamily?: ColorFamily
  weight?: Weight
  formality?: Formality
  contexts: Occasion[]
  hero: boolean
  paletteFail: boolean
}

let drafts: Draft[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let seq = 0

export const getDrafts = () => drafts

export function useDrafts(): Draft[] {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return drafts
}

export function addPhoto(blob: Blob) {
  const key = `d${Date.now()}-${seq++}`
  drafts = [...drafts, { key, name: '', contexts: [], hero: false, paletteFail: false }]
  emit()
  processPhoto(blob)
    .then((p) => patch(key, { photo: p, thumbUrl: URL.createObjectURL(p.thumb) }))
    .catch(() => patch(key, { failed: true }))
}

export function patch(key: string, change: Partial<Draft>) {
  drafts = drafts.map((d) => (d.key === key ? { ...d, ...change } : d))
  emit()
}

export function remove(key: string) {
  const d = drafts.find((x) => x.key === key)
  if (d?.thumbUrl) URL.revokeObjectURL(d.thumbUrl)
  drafts = drafts.filter((x) => x.key !== key)
  emit()
}

export function clearDrafts() {
  drafts.forEach((d) => d.thumbUrl && URL.revokeObjectURL(d.thumbUrl))
  drafts = []
  emit()
}
