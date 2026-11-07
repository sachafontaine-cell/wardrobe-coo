import { useRef, useState } from 'preact/hooks'
import { type AppData, type Profile as ProfileData, profileOf } from '../model'
import { SECTIONS, SectionSheet } from './profileSections'
import { nextReviewDate } from '../review'
import { prettyDate } from '../dates'
import { MODEL_LOGIC, pickModel, tagLog, testGemini, workingModel } from '../gemini'
import { APPS_SCRIPT, connectGoogle, disconnectGoogle } from '../google'
import { getSettings, setSettings, useSettings } from '../settings'
import { Crest } from '../ui'

interface Props {
  data: AppData
  version: string
  onExport: () => Promise<void>
  onImport: (f: File) => Promise<string>
  onBackupNow: () => Promise<void>
  onConnected: () => void
  onProfile: (p: ProfileData) => void
  onRunCheck: () => void
  onFitCheck: () => void
  today: string
}

export function Profile({ data, version, onExport, onImport, onBackupNow, onConnected, onProfile, onRunCheck, onFitCheck, today }: Props) {
  const profile = profileOf(data)
  const [open, setOpen] = useState<(typeof SECTIONS)[number] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const s = useSettings()
  const kv = (k: string, v: string | number) => <div class="kv"><span class="k">{k}</span><span class="v">{v}</span></div>
  return (
    <div class="main stack">
      <div class="row">
        <Crest />
        <div class="grow">
          <h1 class="title">Profile</h1>
          <div class="muted">{profile.updated ? `Last updated ${prettyDate(profile.updated)}` : 'Defaults from your style guide'}</div>
        </div>
      </div>

      <div class="card">
        {SECTIONS.map((s) => (
          <button key={s.title} class="kv" onClick={() => setOpen(s)}><span>{s.title}</span><span class="v muted">{s.summary(profile)} ›</span></button>
        ))}
      </div>

      <div class="card">
        <div class="kv"><span class="k">Next closet check</span><span class="v">{prettyDate(nextReviewDate(today))}</span></div>
        <button class="kv" onClick={onRunCheck}><span>Run closet check now</span><span class="v muted">›</span></button>
        <button class="kv" onClick={onFitCheck}><span>Fit check</span><span class="v muted">›</span></button>
      </div>

      <GeminiCard connected={!!s.geminiKey} model={s.geminiModel} />
      <GoogleCard email={s.google?.email} connected={!!s.google} lastBackup={data.prefs.lastBackup} onBackupNow={onBackupNow} onConnected={onConnected} />

      <div class="card">
        {kv('Items in closet', data.items.filter((i) => i.status === 'ACTIVE').length)}
        {kv('Outfits logged (14 days)', data.history.length)}
        {kv('Version', version)}
      </div>

      <div class="card card-pad stack" style={{ gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Backup file</div>
        <div class="muted">Save a copy anywhere, or restore one (including from Drive).</div>
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

      {open && <SectionSheet section={open} profile={profile} onClose={() => setOpen(null)} onSave={(p) => { onProfile(p); setOpen(null) }} />}
    </div>
  )
}

function GeminiCard({ connected, model }: { connected: boolean; model?: string }) {
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const k = key.trim()
    if (!k) return
    setBusy(true); setMsg('Checking…')
    try {
      const m = await pickModel(k)
      setSettings({ geminiKey: k, geminiModel: m, modelLogic: MODEL_LOGIC })
      setKey(''); setMsg('')
    } catch (e) {
      setMsg((e as Error).message || "Couldn't reach Gemini. Check your connection.")
    }
    setBusy(false)
  }
  return (
    <div class="card card-pad stack" style={{ gap: 10 }}>
      <div class="row">
        <div class="grow" style={{ fontWeight: 600 }}>Gemini · photo tagging</div>
        {connected && <span class="status-ok" style={{ fontSize: 14 }}>✓ Connected</span>}
      </div>
      {connected ? (
        <>
          <div class="muted">Using {workingModel() && workingModel() !== model ? `${workingModel()} (${model} was busy)` : model}. If a model is busy, the app switches to another one. Your key is stored only on this phone.</div>
          <div class="row" style={{ gap: 16 }}>
            <button class="link" disabled={busy} onClick={() => {
              const s = getSettings()
              if (!s.geminiKey || !s.geminiModel) return
              setBusy(true); setMsg('Testing…')
              testGemini(s.geminiKey, s.geminiModel).then((r) => setMsg(`Working ✓ ${r.model} answered in ${r.sec.toFixed(1)} s${r.model !== s.geminiModel ? ` (${s.geminiModel} is busy right now, so the app uses ${r.model})` : ''}`)).catch((e) => setMsg(`Not working: ${(e as Error).message}`)).finally(() => setBusy(false))
            }}>Test</button>
            <button class="link" onClick={() => { setSettings({ geminiKey: undefined, geminiModel: undefined, modelLogic: undefined }); setMsg('') }}>Remove key</button>
          </div>
          {msg && <div class="muted">{msg}</div>}
          <TagLog />
        </>
      ) : (
        <>
          <ol class="steps">
            <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → <b>Create API key</b> → copy it.</li>
            <li>Paste it here.</li>
          </ol>
          <div class="row" style={{ gap: 8 }}>
            <input class="field grow" placeholder="Paste Gemini API key" value={key} autoComplete="off" spellcheck={false}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
            <button class="btn btn-primary btn-sm press" disabled={busy || !key.trim()} onClick={save}>Save</button>
          </div>
          {msg && <div class="muted">{msg}</div>}
        </>
      )}
    </div>
  )
}

/** Recent tagging tries, newest first: what to screenshot if tagging misbehaves. */
function TagLog() {
  const log = tagLog().slice(0, 6)
  if (!log.length) return null
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return (
    <details>
      <summary class="muted" style={{ cursor: 'pointer' }}>Recent tagging</summary>
      <div class="stack" style={{ gap: 4, marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
        {log.map((e) => (
          <div key={e.at}>{time(e.at)} · {e.model.replace(/^gemini-/, '')} · {e.kb} KB · {e.sec} s{e.first ? ` (first words ${e.first} s)` : ''} · <span style={{ color: e.outcome.startsWith('OK') ? 'var(--text)' : 'var(--red-text)' }}>{e.outcome}</span></div>
        ))}
      </div>
    </details>
  )
}

function GoogleCard({ connected, email, lastBackup, onBackupNow, onConnected }: {
  connected: boolean; email?: string; lastBackup?: string; onBackupNow: () => Promise<void>; onConnected: () => void
}) {
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const connect = async () => {
    setBusy(true); setMsg('Connecting…')
    const err = await connectGoogle(url)
    setMsg(err); setBusy(false)
    if (!err) { setUrl(''); onConnected() }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(APPS_SCRIPT); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { setMsg("Couldn't copy. Open this app on a computer to copy the script.") }
  }
  return (
    <div class="card card-pad stack" style={{ gap: 10 }}>
      <div class="row">
        <div class="grow" style={{ fontWeight: 600 }}>Google · calendar + auto backup</div>
        {connected && <span class="status-ok" style={{ fontSize: 14 }}>✓ Connected</span>}
      </div>
      {connected ? (
        <>
          <div class="muted">{email ? `${email}. ` : ''}Reads today's calendar. Backs up your closet to Drive weekly.</div>
          <div class="muted">Last backup: {lastBackup ? prettyDate(lastBackup) : 'not yet'}</div>
          <div class="row" style={{ gap: 16 }}>
            <button class="link" disabled={busy} onClick={() => { setBusy(true); setMsg('Backing up…'); onBackupNow().then(() => setMsg('Backed up to Drive.')).catch(() => setMsg("Backup didn't finish. Try again.")).finally(() => setBusy(false)) }}>Back up now</button>
            <button class="link" onClick={disconnectGoogle}>Disconnect</button>
          </div>
          {msg && <div class="muted">{msg}</div>}
        </>
      ) : (
        <>
          <div class="muted">A small script in your own Google account. Easiest on a computer: open this app's link there.</div>
          <ol class="steps">
            <li><button class="link" onClick={copy}>{copied ? 'Copied ✓' : 'Copy the script'}</button></li>
            <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> (new project). Select all, paste, then Save.</li>
            <li><b>Deploy → New deployment →</b> gear icon → <b>Web app</b>. Execute as <b>Me</b>, access <b>Anyone</b>. Deploy.</li>
            <li>Authorize: pick your account → <b>Advanced → Go to project → Allow</b>. Copy the <b>Web app URL</b>.</li>
            <li>Paste it here on your phone.</li>
          </ol>
          <div class="row" style={{ gap: 8 }}>
            <input class="field grow" placeholder="https://script.google.com/macros/s/…/exec" value={url} autoComplete="off" spellcheck={false}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
            <button class="btn btn-primary btn-sm press" disabled={busy || !url.trim()} onClick={connect}>Connect</button>
          </div>
          {msg && <div class="muted">{msg}</div>}
        </>
      )}
    </div>
  )
}
