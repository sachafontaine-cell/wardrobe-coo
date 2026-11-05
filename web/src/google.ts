// Google Calendar + Drive backup through a small Apps Script that runs in Sacha's own
// Google account. The app pairs with it once using a random secret.
import { type GoogleLink, getSettings, setSettings } from './settings'

export const APPS_SCRIPT = `// Wardrobe COO helper: reads your Google Calendar and saves closet backups to Drive.
// It runs as you. Only the phone that pairs with it first can call it.
// To pair a new phone: run unpair() once from this editor, then connect again in the app.
const FOLDER = 'Wardrobe COO backups';
const KEEP = 5;

function doGet(e) { return handle(e.parameter || {}); }
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return handle(p);
}

function handle(p) {
  try {
    const props = PropertiesService.getScriptProperties();
    const saved = props.getProperty('SECRET');
    if (p.action === 'pair') {
      if (!p.secret || String(p.secret).length < 32) return out({ error: 'bad_secret' });
      if (saved && saved !== p.secret) return out({ error: 'already_paired' });
      props.setProperty('SECRET', p.secret);
      return out({ ok: true, email: Session.getEffectiveUser().getEmail() });
    }
    if (!saved || p.secret !== saved) return out({ error: 'denied' });
    if (p.action === 'ping') return out({ ok: true, email: Session.getEffectiveUser().getEmail() });
    if (p.action === 'events') return out({ ok: true, events: events(p.start, p.end) });
    if (p.action === 'backup') return out(backup(p.name, p.content));
    return out({ error: 'unknown_action' });
  } catch (err) {
    return out({ error: String(err) });
  }
}

function events(startIso, endIso) {
  const start = new Date(startIso), end = new Date(endIso);
  const list = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    const id = cal.getId();
    if (cal.isHidden() || !cal.isSelected() || /#holiday|#contacts|#weather|addressbook/.test(id)) return;
    cal.getEvents(start, end).forEach(function (ev) {
      try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; } catch (x) {}
      const text = [ev.getLocation(), ev.getDescription()].join(' ');
      list.push({
        title: ev.getTitle(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        allDay: ev.isAllDayEvent(),
        location: ev.getLocation() || '',
        guests: ev.getGuestList().length,
        video: /meet\\.google\\.com|zoom\\.us|teams\\.microsoft|webex/i.test(text),
      });
    });
  });
  return list;
}

function backup(name, content) {
  if (!content) return { error: 'empty' };
  const it = DriveApp.getFoldersByName(FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
  folder.createFile(name || 'wardrobe-backup.json', content, 'application/json');
  const files = [];
  const fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(KEEP).forEach(function (f) { f.setTrashed(true); });
  return { ok: true };
}

function unpair() { PropertiesService.getScriptProperties().deleteProperty('SECRET'); }

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`

export interface CalEvent { title: string; start: string; end: string; allDay: boolean; location: string; guests: number; video: boolean }

const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')

export const validScriptUrl = (u: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim())

async function call<T>(link: GoogleLink, params: Record<string, string>, content?: string): Promise<T> {
  const r = content !== undefined
    ? await fetch(link.url, { method: 'POST', body: JSON.stringify({ ...params, secret: link.secret, content }) })
    : await fetch(`${link.url}?${new URLSearchParams({ ...params, secret: link.secret })}`)
  if (!r.ok) throw new Error(`Google script error ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j as T
}

/** Pairs this phone with the user's script. Returns a message for the UI. */
export async function connectGoogle(url: string): Promise<string> {
  url = url.trim()
  if (!validScriptUrl(url)) return 'That doesn\'t look like a web app URL. It should end in /exec.'
  const link: GoogleLink = { url, secret: getSettings().google?.secret ?? randomSecret() }
  try {
    const r = await call<{ email: string }>(link, { action: 'pair' })
    setSettings({ google: { ...link, email: r.email } })
    return ''
  } catch (e) {
    const m = String((e as Error).message)
    if (m.includes('already_paired')) return 'That script is paired with another phone. In the script editor, run unpair(), then try again.'
    return 'Couldn\'t reach the script. Check that access is set to "Anyone", then try again.'
  }
}

export const disconnectGoogle = () => setSettings({ google: undefined })

export async function fetchEvents(date: string): Promise<CalEvent[]> {
  const link = getSettings().google
  if (!link) return []
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start.getTime() + 86400000)
  const r = await call<{ events: CalEvent[] }>(link, { action: 'events', start: start.toISOString(), end: end.toISOString() })
  return r.events ?? []
}

export async function uploadBackup(name: string, content: string): Promise<void> {
  const link = getSettings().google
  if (!link) throw new Error('not connected')
  await call(link, { action: 'backup', name }, content)
}
