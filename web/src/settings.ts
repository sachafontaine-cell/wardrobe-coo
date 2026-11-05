// Per-phone settings and connections, kept out of the closet data.
import { useEffect, useState } from 'preact/hooks'

export interface GoogleLink { url: string; secret: string; email?: string }
export interface Settings {
  geminiKey?: string
  geminiModel?: string
  google?: GoogleLink
  setupHidden?: boolean
}

const KEY = 'wardrobe-coo:settings'
let settings: Settings = read()
const listeners = new Set<() => void>()

function read(): Settings {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Settings } catch { return {} }
}

export const getSettings = () => settings

export function setSettings(change: Partial<Settings>) {
  settings = { ...settings, ...change }
  for (const k of Object.keys(settings) as (keyof Settings)[]) if (settings[k] === undefined) delete settings[k]
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return settings
}

/** Small JSON cache in localStorage. */
export function cacheGet<T>(key: string): T | undefined {
  try { const s = localStorage.getItem('wardrobe-coo:' + key); return s ? (JSON.parse(s) as T) : undefined } catch { return undefined }
}
export function cacheSet(key: string, v: unknown) {
  try { localStorage.setItem('wardrobe-coo:' + key, JSON.stringify(v)) } catch { /* ignore */ }
}
