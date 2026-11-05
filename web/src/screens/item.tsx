import { useRef, useState } from 'preact/hooks'
import {
  COLORS, CONDITIONS, FABRICS, FITS, FORMALITIES, type Item, OCCASIONS, type Opt, PATTERNS, SEASONS, STATUSES, TYPES, WEIGHTS,
} from '../model'
import { Chips, Picture, Sheet } from '../ui'

interface Tag { label: string; options: readonly Opt[]; multi: boolean; get: (i: Item) => string[]; set: (i: Item, v: string[]) => Item }

const single = <K extends keyof Item>(label: string, options: readonly Opt[], key: K, required = false): Tag => ({
  label, options, multi: false,
  get: (i) => (i[key] ? [String(i[key])] : []),
  set: (i, v) => (required && !v[0] ? i : ({ ...i, [key]: v[0] as Item[K] })),
})
const yesNo: readonly Opt[] = [{ code: 'Y', label: 'Yes' }, { code: 'N', label: 'No' }]
const passFail: readonly Opt[] = [{ code: 'PASS', label: 'Pass' }, { code: 'FAIL', label: 'Fail' }]

const TAGS: Tag[] = [
  single('Type', TYPES, 'type', true),
  { label: 'Context', options: OCCASIONS, multi: true, get: (i) => i.contexts, set: (i, v) => ({ ...i, contexts: v as Item['contexts'] }) },
  single('Weight', WEIGHTS, 'weight'),
  single('Formality', FORMALITIES, 'formality'),
  single('Color family', COLORS, 'colorFamily'),
  single('Pattern', PATTERNS, 'pattern'),
  { label: 'Fabric', options: FABRICS, multi: true, get: (i) => i.fabrics, set: (i, v) => ({ ...i, fabrics: v as Item['fabrics'] }) },
  single('Season', SEASONS, 'season'),
  single('Fit', FITS, 'fit'),
  { label: 'Hero', options: yesNo, multi: false, get: (i) => [i.hero ? 'Y' : 'N'], set: (i, v) => ({ ...i, hero: v[0] === 'Y' }) },
  { label: 'Palette fit', options: passFail, multi: false, get: (i) => [i.paletteFail ? 'FAIL' : 'PASS'], set: (i, v) => ({ ...i, paletteFail: v[0] === 'FAIL' }) },
  single('Condition', CONDITIONS, 'condition', true),
  single('Status', STATUSES, 'status', true),
]

interface Text { label: string; key: 'name' | 'brand' | 'exactColor' | 'blend' | 'notes' }
const DETAILS: Text[] = [
  { label: 'Brand', key: 'brand' }, { label: 'Exact color', key: 'exactColor' }, { label: 'Blend', key: 'blend' }, { label: 'Notes', key: 'notes' },
]

interface Props {
  item: Item
  canTag: boolean
  onRetag: (label?: File) => Promise<string>
  onFindReplacement: () => void
  onBack: () => void
  onChange: (i: Item) => void
  onDonate: () => void
  onTakePhoto: () => void
  onPickedPhoto: (f: File) => void
}

export function ItemDetail({ item, canTag, onRetag, onFindReplacement, onBack, onChange, onDonate, onTakePhoto, onPickedPhoto }: Props) {
  const [tag, setTag] = useState<Tag | null>(null)
  const [text, setText] = useState<Text | null>(null)
  const [menu, setMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLInputElement>(null)
  const [tagMsg, setTagMsg] = useState('')
  const run = (label?: File) => { setTagMsg('Tagging…'); onRetag(label).then(setTagMsg) }

  return (
    <div class="main stack" style={{ gap: 12, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <div class="row">
        <button class="back press" onClick={onBack}>‹ Back</button>
        <span class="muted">{item.id}</span>
      </div>
      <Picture id={item.id} hasPhoto={item.hasPhoto} type={item.type} color={item.colorFamily} full class="detail-pic" />
      {item.fitNote && <div class="note">Fit check: {item.fitNote}. Alter or replace.</div>}
      <button style={{ textAlign: 'left' }} onClick={() => setText({ label: 'Name', key: 'name' })}><h1 class="headline">{item.name}</h1></button>

      <div class="card">
        {TAGS.map((t) => {
          const v = t.get(item)
          const label = v.length ? t.options.filter((o) => v.includes(o.code)).map((o) => o.label).join(' · ') : 'Not set'
          return <button key={t.label} class="kv" onClick={() => setTag(t)}><span class="k">{t.label}</span><span class="v">{label} ›</span></button>
        })}
      </div>
      <div class="card">
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
          <button class="btn btn-secondary btn-sm press grow" disabled={tagMsg === 'Tagging…'} onClick={() => run()}>{canTag ? 'Auto-tag' : 'Set up auto-tag'}</button>
          {canTag && <button class="btn btn-secondary btn-sm press grow" disabled={tagMsg === 'Tagging…'} onClick={() => labelRef.current?.click()}>Read care label</button>}
        </div>
      )}
      {tagMsg && <div class="muted">{tagMsg}</div>}
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

      {tag && <TagSheet tag={tag} item={item} onSave={(i) => { onChange(i); setTag(null) }} onClose={() => setTag(null)} />}
      {text && <TextSheet field={text} item={item} onSave={(i) => { onChange(i); setText(null) }} onClose={() => setText(null)} />}
    </div>
  )
}

function TagSheet({ tag, item, onSave, onClose }: { tag: Tag; item: Item; onSave: (i: Item) => void; onClose: () => void }) {
  const [sel, setSel] = useState(tag.get(item))
  return (
    <Sheet title={tag.label} onClose={onClose} foot={tag.multi ? <button class="btn btn-primary press grow" onClick={() => onSave(tag.set(item, sel))}>Done</button> : undefined}>
      <Chips options={tag.options} selected={sel} onToggle={(c) => {
        if (tag.multi) setSel(sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c])
        else onSave(tag.set(item, [c]))
      }} />
    </Sheet>
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
