import { useRef, useState } from 'preact/hooks'
import { COLORS, FABRICS, FITS, FORMALITIES, type Item, OCCASIONS, PATTERNS, TYPES, WEIGHTS, labelOf } from '../model'
import { type Draft, addLabel, canSave, edit, geminiReady, remove, removeLabel, runTag, skipTag, useDrafts } from '../drafts'
import { lookalike } from '../ops'
import { Chips, Picture } from '../ui'

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
          {gemini ? 'Safe on your phone. Tagging keeps going if you leave. Check the chips, then tap Looks right.' : <>Pick a type for each item. <button class="link" onClick={onSetup}>Connect Gemini</button> to fill these in for you.</>}
        </div>
        {!drafts.length && <div class="card card-pad">All caught up.</div>}
        {drafts.map((d) => <DraftCard key={d.key} d={d} existing={existing} gemini={gemini} onSave={() => onSave([d.key])} />)}
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

function DraftCard({ d, existing, gemini, onSave }: { d: Draft; existing: Item[]; gemini: boolean; onSave: () => void }) {
  const labelRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  // Tagged items show as a one-glance summary; tap Edit to change any chip.
  const expanded = open || !gemini || d.tagging === 'error' || (d.tagging === 'done' && !d.type)
  const summary = [
    labelOf(TYPES, d.type), [labelOf(COLORS, d.colorFamily), d.exactColor && `(${d.exactColor})`].filter(Boolean).join(' '),
    labelOf(WEIGHTS, d.weight), labelOf(FORMALITIES, d.formality), labelOf(PATTERNS, d.pattern), labelOf(FITS, d.fit),
    d.contexts.map((c) => labelOf(OCCASIONS, c)).join(', '),
    d.fabrics.map((c) => labelOf(FABRICS, c)).join(' + ') + (d.fabrics.length && d.fabricEstimated ? ' (est.)' : ''),
    d.hero && 'Hero',
  ].filter(Boolean).join(' · ')
  const twin = lookalike(existing, d.type, d.colorFamily, d.pattern)
  const toggle = <T extends string>(cur: T | undefined, c: T) => (cur === c ? undefined : c)
  const flip = <T extends string>(list: T[], c: T) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c])
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
      {(d.brand || d.size || d.blend || d.exactColor || d.care) && (
        <div class="muted">{[d.brand, d.size && `Size ${d.size}`, d.exactColor, d.blend, d.care].filter(Boolean).join(' · ')}</div>
      )}
      {!expanded && d.tagging === 'done' && <div style={{ fontSize: 15, lineHeight: 1.45 }}>{summary}</div>}
      {!expanded && d.paletteFail && <div class="muted">Off palette{d.failReason ? `: ${d.failReason}` : ''}</div>}
      {expanded && <>
      <div class="label">Type</div>
      <Chips options={TYPES} selected={d.type ? [d.type] : []} onToggle={(c) => edit(d.key, { type: c })} />
      <div class="label">Color family</div>
      <Chips options={COLORS} selected={d.colorFamily ? [d.colorFamily] : []} onToggle={(c) => edit(d.key, { colorFamily: toggle(d.colorFamily, c) })} />
      <div class="label">Weight</div>
      <Chips options={WEIGHTS} selected={d.weight ? [d.weight] : []} onToggle={(c) => edit(d.key, { weight: toggle(d.weight, c) })} />
      <div class="label">Formality</div>
      <Chips options={FORMALITIES} selected={d.formality ? [d.formality] : []} onToggle={(c) => edit(d.key, { formality: toggle(d.formality, c) })} />
      <div class="label">Context</div>
      <Chips options={OCCASIONS} selected={d.contexts} onToggle={(c) => edit(d.key, { contexts: flip(d.contexts, c) })} />
      <div class="label">Pattern</div>
      <Chips options={PATTERNS} selected={d.pattern ? [d.pattern] : []} onToggle={(c) => edit(d.key, { pattern: toggle(d.pattern, c) })} />
      <div class="label">Fabric{d.fabricEstimated ? ' (estimated)' : ''}</div>
      <Chips options={FABRICS} selected={d.fabrics} onToggle={(c) => edit(d.key, { fabrics: flip(d.fabrics, c), fabricEstimated: false })} />
      <div class="row" style={{ gap: 20, alignItems: 'flex-start' }}>
        <div class="stack" style={{ gap: 6 }}>
          <div class="label">Hero</div>
          <Chips options={[{ code: 'Y', label: 'Yes' }, { code: 'N', label: 'No' }]} selected={[d.hero ? 'Y' : 'N']} onToggle={(c) => edit(d.key, { hero: c === 'Y' })} />
        </div>
        <div class="stack" style={{ gap: 6 }}>
          <div class="label">Palette</div>
          <Chips options={[{ code: 'PASS', label: 'Pass' }, { code: 'FAIL', label: 'Fail' }]} selected={[d.paletteFail ? 'FAIL' : 'PASS']} onToggle={(c) => edit(d.key, { paletteFail: c === 'FAIL' })} />
        </div>
      </div>
      {d.paletteFail && d.failReason && <div class="muted">Off palette: {d.failReason}</div>}
      </>}
      {twin && <div class="note">Looks like {twin.id} ({twin.name}). Save anyway?</div>}
      <div class="row" style={{ gap: 8 }}>
        {!expanded && <button class="btn btn-secondary press" style={{ flex: '0 0 30%' }} onClick={() => setOpen(true)}>Edit</button>}
        <button class="btn btn-secondary press grow" disabled={!canSave(d)} onClick={onSave}>
          {d.tagging === 'busy' ? 'Tagging…' : !d.type ? 'Pick a type first' : 'Looks right · Save'}
        </button>
      </div>
    </div>
  )
}
