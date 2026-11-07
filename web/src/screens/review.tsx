import { useRef } from 'preact/hooks'
import type { Item } from '../model'
import { type Draft, addLabel, canSave, edit, geminiReady, remove, removeLabel, runTag, skipTag, useDrafts } from '../drafts'
import { lookalike } from '../ops'
import { Picture } from '../ui'
import { TagEditor } from './tagEditor'

interface Props { existing: Item[]; onAddMore: () => void; onSave: (keys: string[]) => void; onBack: () => void; onSetup: () => void }

/** The "To review" queue. Saved on the phone; tagging keeps going if you leave. */
export function Review({ existing, onAddMore, onSave, onBack, onSetup }: Props) {
  const drafts = useDrafts()
  const ready = drafts.filter(canSave)
  const busy = drafts.filter((d) => d.tagging === 'busy' || (!d.photo && !d.failed)).length
  const gemini = geminiReady()
  return (
    <div class="shell">
      <div class="main stack" style={{ gap: 12, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <div class="row">
          <button class="back press" style={{ fontSize: 26 }} onClick={onBack} aria-label="Back">‹</button>
          <h1 class="title grow">To review · {drafts.length}</h1>
          <button class="press" style={{ fontSize: 15, fontWeight: 500, height: 44 }} onClick={onAddMore}>+ More</button>
        </div>
        <div class="muted">
          {gemini ? 'Safe on your phone. Tagging keeps going if you leave. Fix any chip, then tap Looks right.' : <>Pick a type for each item. <button class="link" onClick={onSetup}>Connect Gemini</button> to fill these in for you.</>}
        </div>
        {!drafts.length && <div class="card card-pad">All caught up.</div>}
        {drafts.map((d) => <DraftCard key={d.key} d={d} existing={existing} onSave={() => onSave([d.key])} />)}
      </div>
      <div style={{ padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button class="btn btn-primary press" style={{ width: '100%' }} disabled={!ready.length} onClick={() => onSave(ready.map((d) => d.key))}>
          {ready.length ? `Save ${ready.length === drafts.length && ready.length > 1 ? 'all ' : ''}${ready.length} to closet` : busy ? `Tagging ${busy}… you can leave` : 'Pick a type to save'}
        </button>
        {ready.length > 0 && busy > 0 && <div class="muted" style={{ textAlign: 'center', marginTop: 6 }}>{busy} still tagging. They'll wait here.</div>}
      </div>
    </div>
  )
}

function DraftCard({ d, existing, onSave }: { d: Draft; existing: Item[]; onSave: () => void }) {
  const labelRef = useRef<HTMLInputElement>(null)
  const twin = lookalike(existing, d.type, d.colorFamily, d.pattern)
  const status = d.tagging === 'busy' ? (d.tagStatus ?? 'Tagging…') : d.tagging === 'error' ? (d.tagError === 'Skipped' ? 'Fill in by hand.' : `Couldn't tag: ${d.tagError}. Fill in by hand or retry.`) :
    d.tagging === 'done' ? (d.labels.length ? 'Tagged · read from label' : 'Tagged · fibers estimated. Add a label for exact fibers and size.') : ''
  return (
    <div class="card card-pad stack" style={{ gap: 10, padding: 12 }}>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 92, height: 92, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {d.photo ? <Picture src={d.thumbUrl} class="thumb92" /> : d.failed ? <span style={{ fontSize: 12, color: 'var(--red-text)' }}>Couldn't read photo</span> : <div class="spinner" />}
        </div>
        <div class="grow stack" style={{ gap: 6 }}>
          <input class="field" style={{ height: 44 }} placeholder="Name (optional)" value={d.name} onInput={(e) => edit(d.key, { name: (e.target as HTMLInputElement).value })} />
          {status && (
            <div class="row" style={{ gap: 6, fontSize: 13, color: d.tagging === 'error' ? 'var(--red-text)' : 'var(--muted)' }}>
              {d.tagging === 'busy' && <div class="spinner" style={{ width: 14, height: 14 }} />}
              <span class="grow">{status}</span>
              {d.tagging === 'error' && <button class="link" onClick={() => runTag(d.key)}>Retry</button>}
              {d.tagging === 'done' && <button class="link" onClick={() => runTag(d.key)}>Re-tag</button>}
              {d.tagging === 'busy' && <button class="link" onClick={() => skipTag(d.key)}>Skip</button>}
            </div>
          )}
          <button class="link" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => remove(d.key)}>Remove</button>
        </div>
      </div>
      <div class="labels-row">
        <span class="label" style={{ marginRight: 4 }}>Labels</span>
        {d.labels.map((l, n) => (
          <div key={l.url} class="label-thumb">
            <img src={l.url} alt={`Label ${n + 1}`} />
            <button class="rm" aria-label="Remove label" onClick={() => removeLabel(d.key, n)}>✕</button>
          </div>
        ))}
        {Array.from({ length: d.labelsPending }, (_, n) => <div key={`p${n}`} class="label-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div class="spinner" style={{ width: 16, height: 16 }} /></div>)}
        <button class="label-add press" aria-label="Add label photo" onClick={() => labelRef.current?.click()}>+</button>
      </div>
      <input ref={labelRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0]
        ;(e.target as HTMLInputElement).value = ''
        if (f) addLabel(f, d.key)
      }} />
      {(d.brand || d.size || d.care) && (
        <div class="muted">{[d.brand, d.size && `Size ${d.size}`, d.care].filter(Boolean).join(' · ')}</div>
      )}
      <TagEditor v={d} set={(c) => edit(d.key, c)} />
      {twin && <div class="note">Looks like {twin.id} ({twin.name}). Save anyway?</div>}
      <button class="btn btn-secondary press" disabled={!canSave(d)} onClick={onSave}>
        {d.tagging === 'busy' ? 'Tagging…' : !d.type ? 'Pick a type first' : 'Looks right · Save'}
      </button>
    </div>
  )
}
