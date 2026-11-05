import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Item } from '../model'
import { SUGGESTIONS } from '../ask'
import { Chip, Picture } from '../ui'

export interface Msg { role: 'user' | 'model'; text: string; notes?: { text: string; undo?: () => void }[]; sources?: { title: string; url: string }[]; error?: boolean }

interface Props {
  msgs: Msg[]
  busy: boolean
  items: Map<string, Item>
  prefill?: string
  canAsk: boolean
  onSend: (text: string) => void
  onClose: () => void
  onSetup: () => void
  onOpenItem: (id: string) => void
}

export function AskSheet({ msgs, busy, items, prefill, canAsk, onSend, onClose, onSetup, onOpenItem }: Props) {
  const [text, setText] = useState(prefill ?? '')
  const input = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { if (prefill) { setText(prefill); input.current?.focus() } }, [prefill])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, busy])
  const send = () => { const t = text.trim(); if (!t || busy) return; onSend(t); setText('') }
  const pick = (p: string) => { setText(p); input.current?.focus(); if (!p.endsWith(' ')) { onSend(p); setText('') } }

  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="sheet" style={{ height: '92%' }}>
        <div class="sheet-head">
          <div class="grabber" />
          <div class="row"><h2 class="title grow">Ask</h2><button class="press" style={{ fontSize: 22, width: 44, height: 44 }} onClick={onClose} aria-label="Close">✕</button></div>
          <div class="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
            {SUGGESTIONS.map((s) => <Chip key={s.label} label={s.label} on={false} onClick={() => pick(s.prompt)} />)}
          </div>
        </div>
        <div ref={list} class="sheet-body" style={{ flex: 1, gap: 12 }}>
          {!canAsk && (
            <div class="card card-pad stack" style={{ gap: 10 }}>
              <div>Ask uses Gemini.</div>
              <button class="btn btn-primary btn-sm press" onClick={onSetup}>Connect Gemini</button>
            </div>
          )}
          {canAsk && msgs.length === 0 && <div class="muted">Shopping, packing, tonight's dinner, adding or donating by text. I know your closet and today.</div>}
          {msgs.map((m, k) => m.role === 'user'
            ? <div key={k} class="bubble">{m.text}</div>
            : (
              <div key={k} class={`card card-pad answer ${m.error ? 'err' : ''}`}>
                <Rich text={m.text} items={items} onOpenItem={onOpenItem} />
                {m.notes?.map((n, j) => (
                  <div key={j} class="row confirm"><span class="grow">✓ {n.text}</span>{n.undo && <button class="link" onClick={n.undo}>Undo</button>}</div>
                ))}
                {!!m.sources?.length && (
                  <div class="muted" style={{ fontSize: 12 }}>Sources: {m.sources.map((s, j) => <a key={j} href={s.url} target="_blank" rel="noopener" style={{ marginRight: 8 }}>{s.title || 'link'}</a>)}</div>
                )}
              </div>
            ))}
          {busy && <div class="row muted" style={{ gap: 8 }}><div class="spinner" style={{ width: 16, height: 16 }} />Thinking…</div>}
        </div>
        <div class="sheet-foot" style={{ alignItems: 'flex-end' }}>
          <textarea ref={input} class="field grow" rows={1} placeholder="Ask anything…" value={text} disabled={!canAsk}
            style={{ height: 'auto', minHeight: 52, maxHeight: 140, padding: '14px 16px', borderRadius: 26, resize: 'none' }}
            onInput={(e) => { const t = e.target as HTMLTextAreaElement; setText(t.value); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button class="press send" disabled={!text.trim() || busy || !canAsk} onClick={send} aria-label="Send">→</button>
        </div>
      </div>
    </div>
  )
}

const TOKEN = /\[\[([A-Z]+-\d{3})\]\]/g

/** Minimal markdown: bullets, numbers, bold, links, and [[ID]] item tokens. */
function Rich({ text, items, onOpenItem }: { text: string; items: Map<string, Item>; onOpenItem: (id: string) => void }) {
  const blocks: ComponentChildren[] = []
  text.split('\n').forEach((raw, k) => {
    const line = raw.trimEnd()
    if (!line.trim()) return
    const ids = [...line.matchAll(TOKEN)].map((m) => m[1]).filter((id) => items.has(id))
    const rest = line.replace(TOKEN, '').replace(/[*_:·,+\-•\s]|and/g, '')
    const label = line.match(/^\s*(?:[-*•]\s*)?\*\*(.+?)\*\*/)?.[1]?.replace(/:$/, '')
    if (ids.length >= 2 && rest.length <= (label ?? '').replace(/[\s:]/g, '').length + 2) {
      blocks.push(
        <div key={k} class="stack" style={{ gap: 6 }}>
          {label && <div style={{ fontWeight: 600 }}>{label}</div>}
          <div class="strip">{ids.map((id) => <Thumb key={id} item={items.get(id)!} onOpen={onOpenItem} />)}</div>
        </div>,
      )
      return
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    const head = line.match(/^#{1,4}\s+(.*)$/)
    const body = bullet?.[1] ?? num?.[2] ?? head?.[1] ?? line
    const content = <Inline text={body} items={items} onOpenItem={onOpenItem} />
    blocks.push(
      bullet ? <div key={k} class="li"><span>•</span><div>{content}</div></div>
        : num ? <div key={k} class="li"><span>{num[1]}.</span><div>{content}</div></div>
        : head ? <div key={k} style={{ fontWeight: 600 }}>{content}</div>
        : <div key={k} class={/^bottom line/i.test(body) ? 'bottom' : ''}>{content}</div>,
    )
  })
  return <div class="rich">{blocks}</div>
}

function Inline({ text, items, onOpenItem }: { text: string; items: Map<string, Item>; onOpenItem: (id: string) => void }) {
  const out: ComponentChildren[] = []
  const re = /\[\[([A-Z]+-\d{3})\]\]|\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      const it = items.get(m[1])
      out.push(it ? <button class="itemchip" onClick={() => onOpenItem(it.id)}><Picture id={it.id} hasPhoto={it.hasPhoto} type={it.type} color={it.colorFamily} class="mini" />{it.name}</button> : m[1])
    } else if (m[2]) out.push(<b>{m[2]}</b>)
    else if (m[3]) out.push(<a href={m[4]} target="_blank" rel="noopener">{m[3]}</a>)
    else if (m[5]) out.push(<a href={m[5]} target="_blank" rel="noopener">{new URL(m[5]).hostname.replace(/^www\./, '')}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function Thumb({ item, onOpen }: { item: Item; onOpen: (id: string) => void }) {
  return (
    <button class="thumb press" onClick={() => onOpen(item.id)}>
      <Picture id={item.id} hasPhoto={item.hasPhoto} type={item.type} color={item.colorFamily} />
      <span>{item.name}</span>
    </button>
  )
}
