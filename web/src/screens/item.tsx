import { useEffect, useRef, useState } from 'preact/hooks'
import type { Item } from '../model'
import { Picture, Sheet } from '../ui'
import { TagEditor } from './tagEditor'

interface Text { label: string; key: 'name' | 'brand' | 'size' | 'care' | 'notes' }
const DETAILS: Text[] = [{ label: 'Brand', key: 'brand' }, { label: 'Size', key: 'size' }, { label: 'Care', key: 'care' }, { label: 'Notes', key: 'notes' }]

interface Props {
  item: Item
  canTag: boolean
  onRetag: (onStatus: (s: string) => void) => Promise<string>
  onAddLabel: (f: File, onStatus: (s: string) => void) => Promise<string>
  labelUrl: (n: number) => Promise<string | undefined>
  onFindReplacement: () => void
  onBack: () => void
  onChange: (i: Item) => void
  onDonate: () => void
  onTakePhoto: () => void
  onPickedPhoto: (f: File) => void
}

export function ItemDetail({ item, canTag, onRetag, onAddLabel, labelUrl, onFindReplacement, onBack, onChange, onDonate, onTakePhoto, onPickedPhoto }: Props) {
  const [text, setText] = useState<Text | null>(null)
  const [menu, setMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLInputElement>(null)
  const [tagMsg, setTagMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const run = (label?: File) => {
    setBusy(true)
    setTagMsg(label ? 'Reading the label…' : 'Tagging…')
    ;(label ? onAddLabel(label, setTagMsg) : onRetag(setTagMsg)).then((m) => { setBusy(false); setTagMsg(m) })
  }
  const [labelUrls, setLabelUrls] = useState<string[]>([])
  const [viewing, setViewing] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const made: string[] = []
    Promise.all(Array.from({ length: item.labels ?? 0 }, (_, n) => labelUrl(n))).then((urls) => {
      const ok = urls.filter(Boolean) as string[]
      made.push(...ok)
      if (live) setLabelUrls(ok)
    })
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)) }
  }, [item.id, item.labels])

  return (
    <div class="main stack" style={{ gap: 12, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <div class="row">
        <button class="back press" onClick={onBack}>‹ Back</button>
        <span class="muted">{item.id}</span>
      </div>
      <Picture id={item.id} hasPhoto={item.hasPhoto} type={item.type} color={item.colorFamily} full class="detail-pic" />
      {item.fitNote && <div class="note">Fit check: {item.fitNote}. Alter or replace.</div>}
      <button style={{ textAlign: 'left' }} onClick={() => setText({ label: 'Name', key: 'name' })}><h1 class="headline">{item.name}</h1></button>

      {item.status === 'DONATED' && <div class="note">Donated{item.donatedOn ? ` on ${item.donatedOn}` : ''}. Tap Restore to bring it back.</div>}
      <div class="card card-pad">
        <TagEditor v={item} set={(c) => onChange({ ...item, ...c, ...(c.type === undefined && 'type' in c ? { type: item.type } : {}) } as Item)} showCondition />
      </div>
      <div class="card">
      <div class="labels-row" style={{ padding: '12px 16px 8px' }}>
        <span class="label" style={{ marginRight: 4 }}>Labels</span>
        {labelUrls.map((u, n) => (
          <button key={u} class="label-thumb press" onClick={() => setViewing(u)} aria-label={`View label ${n + 1}`}><img src={u} alt="" /></button>
        ))}
        <button class="label-add press" disabled={busy} aria-label="Add label photo" onClick={() => labelRef.current?.click()}>+</button>
        {!labelUrls.length && <span class="muted">Snap the size or care tag</span>}
      </div>
        {DETAILS.map((f) => (
          <button key={f.key} class="kv" onClick={() => setText(f)}><span class="k">{f.label}</span><span class="v">{item[f.key] || 'Add'}</span></button>
        ))}
      </div>

      <div class="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <button class="btn btn-secondary btn-sm press" style={{ width: '100%' }} onClick={() => setMenu(!menu)}>Replace photo</button>
          {menu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setMenu(false)} />
              <div class="menu" style={{ bottom: 54, left: 0 }}>
                <button onClick={() => { setMenu(false); onTakePhoto() }}>Take photo</button>
                <button onClick={() => { setMenu(false); fileRef.current?.click() }}>Choose from your photos</button>
              </div>
            </>
          )}
        </div>
        <button class="btn btn-danger btn-sm press" style={{ flex: 1 }} onClick={onDonate}>{item.status === 'DONATED' ? 'Restore' : 'Donate'}</button>
      </div>
      {item.hasPhoto && (
        <div class="row" style={{ gap: 8 }}>
          <button class="btn btn-secondary btn-sm press grow" disabled={busy} onClick={() => run()}>{canTag ? 'Auto-tag again' : 'Set up auto-tag'}</button>
        </div>
      )}
      {tagMsg && (
        <div class="row muted" style={{ gap: 6 }}>
          {busy && <div class="spinner" style={{ width: 14, height: 14 }} />}
          <span class="grow">{tagMsg}{busy ? ' · keep the app open' : ''}</span>
        </div>
      )}
      <button class="btn btn-primary btn-sm press" onClick={onFindReplacement}>Find a replacement</button>
      <input ref={labelRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0]
        ;(e.target as HTMLInputElement).value = ''
        if (f) run(f)
      }} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0]
        if (f) onPickedPhoto(f)
        ;(e.target as HTMLInputElement).value = ''
      }} />

      {viewing && <div class="viewer" onClick={() => setViewing(null)}><img src={viewing} alt="Label" /></div>}
      {text && <TextSheet field={text} item={item} onSave={(i) => { onChange(i); setText(null) }} onClose={() => setText(null)} />}
    </div>
  )
}

function TextSheet({ field, item, onSave, onClose }: { field: Text; item: Item; onSave: (i: Item) => void; onClose: () => void }) {
  const [v, setV] = useState(item[field.key] ?? '')
  const save = () => onSave({ ...item, [field.key]: field.key === 'name' ? v.trim() || item.name : v.trim() })
  return (
    <Sheet title={field.label} onClose={onClose} foot={<button class="btn btn-primary press grow" onClick={save}>Save</button>}>
      <input class="field" autoFocus value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
    </Sheet>
  )
}
