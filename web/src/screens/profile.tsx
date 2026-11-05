import { useRef, useState } from 'preact/hooks'
import type { AppData } from '../model'
import { Crest } from '../ui'

interface Props { data: AppData; version: string; onExport: () => Promise<void>; onImport: (f: File) => Promise<string> }

export function Profile({ data, version, onExport, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const kv = (k: string, v: string | number) => <div class="kv"><span class="k">{k}</span><span class="v">{v}</span></div>
  return (
    <div class="main stack">
      <div class="row"><Crest /><h1 class="title">Profile</h1></div>
      <div class="card card-pad stack" style={{ gap: 8 }}>
        <div>Coming in update 3</div>
        <div class="muted">Sizes, colors, style, brands and settings. Your style rules from the spec are already built into the daily pick.</div>
      </div>
      <div class="card">
        {kv('Items in closet', data.items.filter((i) => i.status === 'ACTIVE').length)}
        {kv('Outfits logged (14 days)', data.history.length)}
        {kv('Version', version)}
      </div>
      <div class="card card-pad stack" style={{ gap: 10 }}>
        <div>Backup</div>
        <div class="muted">Your closet lives only on this phone. Save a backup file now and then, for example to Google Drive.</div>
        <div class="row" style={{ gap: 8 }}>
          <button class="btn btn-secondary btn-sm press grow" onClick={() => { setStatus('Preparing…'); onExport().then(() => setStatus('')).catch(() => setStatus('Backup failed.')) }}>Save backup</button>
          <button class="btn btn-secondary btn-sm press grow" onClick={() => fileRef.current?.click()}>Restore</button>
        </div>
        {status && <div class="muted">{status}</div>}
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0]
          ;(e.target as HTMLInputElement).value = ''
          if (f) { setStatus('Restoring…'); onImport(f).then(setStatus) }
        }} />
      </div>
    </div>
  )
}
