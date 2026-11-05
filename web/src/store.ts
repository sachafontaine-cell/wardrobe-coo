// In-memory state for instant reads. Data mirrors to localStorage (instant start) and
// IndexedDB (durable); photos live in IndexedDB as blobs.
import { createStore, del, get, set } from 'idb-keyval'
import { useEffect, useState } from 'preact/hooks'
import { type AppData, emptyData } from './model'

const KEY = 'wardrobe-coo:data'
const idb = typeof indexedDB !== 'undefined' ? createStore('wardrobe-coo', 'kv') : undefined

let data: AppData = readLocal() ?? emptyData()
export let loadFailed = false
const listeners = new Set<() => void>()

function readLocal(): AppData | undefined {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as AppData) : undefined
  } catch {
    return undefined
  }
}

/** Fall back to IndexedDB when localStorage was cleared. Call once at startup. */
export async function hydrate(): Promise<void> {
  try { await navigator.storage?.persist?.() } catch { /* not granted: fine */ }
  if (!idb) return
  try {
    const saved = await get<AppData>(KEY, idb)
    if (saved && (!readLocal() || (saved.items.length > data.items.length && data.items.length === 0))) {
      data = saved
      emit()
    }
  } catch {
    loadFailed = !readLocal()
  }
}

export const getData = () => data

let saveTimer: ReturnType<typeof setTimeout> | undefined
export function update(fn: (d: AppData) => AppData): void {
  const next = fn(data)
  if (next === data) return
  data = next
  emit()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 0) // after paint: never blocks a tap
}

function save() {
  const json = JSON.stringify(data)
  try { localStorage.setItem(KEY, json) } catch { /* quota: IndexedDB still has it */ }
  if (idb) set(KEY, data, idb).catch(() => {})
}

export function replaceAll(d: AppData) { update(() => d) }

function emit() { listeners.forEach((l) => l()) }

export function useData(): AppData {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return data
}

// ---- Photos ----
const urlCache = new Map<string, string>()
const photoListeners = new Set<() => void>()

const pkey = (id: string, thumb: boolean) => `${thumb ? 't' : 'p'}:${id}`

export async function putPhoto(id: string, full: Blob, thumb: Blob): Promise<void> {
  if (!idb) return
  await Promise.all([set(pkey(id, false), full, idb), set(pkey(id, true), thumb, idb)])
  for (const t of [true, false]) {
    const k = pkey(id, t)
    const old = urlCache.get(k)
    if (old) URL.revokeObjectURL(old)
    urlCache.delete(k)
  }
  urlCache.set(pkey(id, true), URL.createObjectURL(thumb))
  urlCache.set(pkey(id, false), URL.createObjectURL(full))
  photoListeners.forEach((l) => l())
}

export async function getPhotoBlob(id: string, thumb: boolean): Promise<Blob | undefined> {
  return idb ? get<Blob>(pkey(id, thumb), idb) : undefined
}

export async function deletePhotos(id: string): Promise<void> {
  if (!idb) return
  await Promise.all([del(pkey(id, false), idb), del(pkey(id, true), idb)])
}

const pending = new Map<string, Promise<void>>()
function load(k: string, id: string, thumb: boolean) {
  if (urlCache.has(k) || pending.has(k) || !idb) return
  pending.set(k, get<Blob>(pkey(id, thumb), idb).then((b) => {
    if (b) urlCache.set(k, URL.createObjectURL(b))
    pending.delete(k)
    photoListeners.forEach((l) => l())
  }))
}

/** Object URL for a photo, loading it from IndexedDB on first use. */
export function usePhoto(id: string | undefined, thumb: boolean, enabled = true): string | undefined {
  const [, force] = useState(0)
  const k = id ? pkey(id, thumb) : ''
  useEffect(() => {
    if (!id || !enabled) return
    const l = () => force((n) => n + 1)
    photoListeners.add(l)
    load(k, id, thumb)
    return () => { photoListeners.delete(l) }
  }, [k, enabled])
  return id && enabled ? urlCache.get(k) : undefined
}

/** Warm the thumbnail cache so the Closet grid paints in one frame. */
export function preloadThumbs(ids: string[]) { ids.forEach((id) => load(pkey(id, true), id, true)) }
