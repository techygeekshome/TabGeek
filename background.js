// TabGeek background (service worker in Chromium, event page in Firefox).
//
// Tabs are put to sleep with tabs.discard: the browser unloads the page from memory but keeps the tab,
// its title, icon and history. Clicking the tab loads it again. No page is replaced and nothing is injected,
// except the optional "unsaved typing" check, which only runs where you have given TabGeek access.
//
// "Last used" is the moment you left a tab (switched away from it), kept in storage.session, because the
// browser's own lastAccessed is the moment the tab was last switched TO.

const DEF = { minutes: 30, skipPinned: true, skipAudible: true, skipForms: false, whitelist: [] };
const SWEEP = 'sweep';

async function settings() {
  const { settings: s } = await chrome.storage.local.get('settings');
  return { ...DEF, ...(s || {}) };
}
function clean(s) {
  const r = { ...DEF, ...(s || {}) };
  r.minutes = Math.max(0, Math.min(60 * 24 * 7, Math.round(Number(r.minutes) || 0)));
  for (const k of ['skipPinned', 'skipAudible', 'skipForms']) r[k] = !!r[k];
  r.whitelist = [...new Set((Array.isArray(r.whitelist) ? r.whitelist : []).map(normHost).filter(Boolean))].sort();
  return r;
}
function normHost(h) {
  h = String(h || '').trim().toLowerCase();
  if (!h) return '';
  try { if (/^[a-z][a-z0-9+.-]*:\/\//.test(h)) h = new URL(h).hostname; } catch { return ''; }
  h = h.replace(/^\*\./, '').replace(/^www\./, '').replace(/[/:].*$/, '');
  return /^[a-z0-9.-]+$/.test(h) && h.includes('.') || h === 'localhost' ? h : '';
}
function hostOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : ''; } catch { return ''; } }
function listed(host, list) { return !!host && list.some((w) => host === w || host.endsWith('.' + w)); }

// ---------- "last used" times ----------
async function session() {
  const r = await chrome.storage.session.get(['seen', 'active', 'awake', 'boot']);
  return { seen: r.seen || {}, active: r.active || {}, awake: r.awake || {}, boot: r.boot || 0 };
}
// One change at a time, so two quick tab switches can't overwrite each other's notes.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

const touch = (tabId, also) => serial(async () => {
  const s = await session(), now = Date.now();
  if (tabId != null) s.seen[tabId] = now;
  if (also) also(s, now);
  await chrome.storage.session.set({ seen: s.seen, active: s.active });
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => touch(tabId, (s, now) => {
  const prev = s.active[windowId];
  if (prev != null && prev !== tabId) s.seen[prev] = now; // you just left this one
  s.active[windowId] = tabId;
}));
chrome.tabs.onCreated.addListener((t) => touch(t.id));
chrome.tabs.onRemoved.addListener((tabId) => serial(async () => {
  const s = await session();
  delete s.seen[tabId]; delete s.awake[tabId];
  await chrome.storage.session.set({ seen: s.seen, awake: s.awake });
}));
chrome.tabs.onReplaced.addListener((added, removed) => serial(async () => {
  const s = await session();
  if (s.seen[removed]) s.seen[added] = s.seen[removed];
  if (s.awake[removed]) s.awake[added] = true;
  delete s.seen[removed]; delete s.awake[removed];
  for (const w in s.active) if (s.active[w] === removed) s.active[w] = added;
  await chrome.storage.session.set({ seen: s.seen, awake: s.awake, active: s.active });
}));
// A tab loading a new page in the background counts as used (for example a link opened in a new tab).
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) touch(tabId); });

// ---------- checks ----------
function pageHasTyping() {
  // Runs in the page (only on sites TabGeek has access to). True if any form field differs from how the page loaded it.
  const skip = ['hidden', 'submit', 'button', 'reset', 'image', 'range', 'color'];
  for (const e of document.querySelectorAll('input, textarea, select')) {
    if (e.disabled) continue;
    if (e.tagName === 'SELECT') {
      const o = [...e.options];
      if (e.multiple) { if (o.some((x) => x.selected !== x.defaultSelected)) return true; continue; }
      // With nothing marked as the default, a drop-down starts on its first option.
      const d = o.findIndex((x) => x.defaultSelected), start = d >= 0 ? d : (e.size > 1 ? -1 : 0);
      if (o.length && e.selectedIndex !== start) return true;
      continue;
    }
    if (e.type === 'checkbox' || e.type === 'radio') { if (e.checked !== e.defaultChecked) return true; continue; }
    if (e.type === 'file') { if (e.files && e.files.length) return true; continue; }
    if (skip.includes(e.type)) continue;
    if (e.value !== e.defaultValue) return true;
  }
  // A text editor (such as an email being written) that still has the cursor in it.
  const a = document.activeElement;
  return !!(a && a.isContentEditable && (a.innerText || '').trim());
}
async function hasTyping(tabId) {
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: pageHasTyping });
    return res.some((r) => r && r.result === true);
  } catch { return false; } // no access to this site, or a browser page
}
// Why a tab must stay awake, or '' if it may sleep. Manual "suspend this tab" only honours unsaved typing.
async function keepReason(t, s, ses, manual) {
  if (t.discarded) return 'asleep';
  if (!manual) {
    if (t.active) return 'active';
    if (s.skipPinned && t.pinned) return 'pinned';
    if (s.skipAudible && t.audible) return 'audible';
    if (ses.awake[t.id]) return 'awake';
    if (listed(hostOf(t.url || ''), s.whitelist)) return 'whitelist';
    if (t.autoDiscardable === false) return 'awake';
  }
  if (s.skipForms && /^https?:/.test(t.url || '') && await hasTyping(t.id)) return 'typing';
  return '';
}

async function discard(tabId) {
  try {
    const r = await chrome.tabs.discard(tabId);
    // Chrome hands back the tab (sometimes with a new id), Firefox hands back nothing.
    const id = r && r.id != null ? r.id : tabId;
    const t = await chrome.tabs.get(id).catch(() => null);
    return !!(t && t.discarded);
  } catch { return false; }
}

// ---------- the timer ----------
async function sweep() {
  const s = await settings();
  if (!s.minutes) return { slept: 0 };
  const ses = await session(), now = Date.now(), limit = s.minutes * 60000;
  let boot = ses.boot;
  if (!boot) { boot = now; await chrome.storage.session.set({ boot }); }
  const tabs = await chrome.tabs.query({});
  let slept = 0, noted = false;
  for (const t of tabs) {
    if (t.active || t.discarded) continue;
    let since = ses.seen[t.id];
    // Tabs TabGeek has not seen used yet: count from when TabGeek started, never from earlier.
    if (!since) { since = Math.max(boot, t.lastAccessed || 0); ses.seen[t.id] = since; noted = true; }
    if (now - since < limit) continue;
    if (await keepReason(t, s, ses, false)) continue;
    if (await discard(t.id)) slept++;
  }
  if (noted) await serial(async () => {
    const cur = await session();
    await chrome.storage.session.set({ seen: { ...ses.seen, ...cur.seen } });
  });
  return { slept };
}
async function ensureAlarm() {
  const a = await chrome.alarms.get(SWEEP);
  if (!a) chrome.alarms.create(SWEEP, { periodInMinutes: 1, delayInMinutes: 1 });
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === SWEEP) sweep(); });
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

// ---------- actions ----------
async function suspendThis(tab) {
  const s = await settings(), ses = await session();
  if (tab.discarded) return { ok: true, n: 0 };
  const why = await keepReason(tab, s, ses, true);
  if (why) return { ok: false, why };
  if (tab.active) {
    // The browser won't unload the tab you are looking at, so move to the next tab first (awake ones preferred).
    const all = await chrome.tabs.query({ windowId: tab.windowId });
    const others = all.filter((x) => x.id !== tab.id);
    if (!others.length) return { ok: false, why: 'only' };
    const dist = (x) => Math.abs(x.index - tab.index) + (x.index < tab.index ? 0.5 : 0) + (x.discarded ? 1000 : 0);
    const next = others.sort((a, b) => dist(a) - dist(b))[0];
    await chrome.tabs.update(next.id, { active: true });
    await new Promise((r) => setTimeout(r, 150));
  }
  return { ok: await discard(tab.id), n: 1 };
}
async function suspendOthers(windowId) {
  const s = await settings(), ses = await session();
  const tabs = await chrome.tabs.query({ windowId });
  let n = 0, kept = 0;
  for (const t of tabs) {
    if (t.active || t.discarded) continue;
    if (await keepReason(t, s, ses, false)) { kept++; continue; }
    if (await discard(t.id)) n++;
  }
  return { ok: true, n, kept };
}
async function wakeAll(windowId) {
  const tabs = await chrome.tabs.query({ windowId, discarded: true });
  for (const t of tabs) await chrome.tabs.reload(t.id).catch(() => {});
  return { ok: true, n: tabs.length };
}
async function counts() {
  const all = await chrome.tabs.query({});
  const asleep = all.filter((t) => t.discarded);
  return { total: all.length, asleep: asleep.length,
    list: asleep.slice(0, 60).map((t) => ({ id: t.id, title: t.title || t.url, url: t.url, icon: t.favIconUrl || '', windowId: t.windowId })) };
}
async function activeTab() { return (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]; }

async function onCommand(cmd, tab) {
  tab = tab && tab.id != null ? tab : await activeTab();
  if (!tab) return;
  if (cmd === 'suspend-tab') return suspendThis(tab);
  if (cmd === 'suspend-others') return suspendOthers(tab.windowId);
  if (cmd === 'wake-all') return wakeAll(tab.windowId);
}
chrome.commands.onCommand.addListener(onCommand);

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    switch (m.type) {
      case 'status': {
        const [c, s, ses] = await Promise.all([counts(), settings(), session()]);
        let why = '';
        if (m.tabId != null) { const t = await chrome.tabs.get(m.tabId).catch(() => null); if (t) why = await keepReasonQuick(t, s, ses); }
        return { ...c, settings: s, awake: !!ses.awake[m.tabId], why };
      }
      case 'suspend-tab': return suspendThis(await chrome.tabs.get(m.tabId));
      case 'suspend-others': return suspendOthers(m.windowId);
      case 'wake-all': return wakeAll(m.windowId);
      case 'awake': return serial(async () => {
        const ses = await session();
        if (m.on) ses.awake[m.tabId] = true; else delete ses.awake[m.tabId];
        await chrome.storage.session.set({ awake: ses.awake });
        return { ok: true };
      });
      case 'save': {
        const s = clean(m.settings);
        await chrome.storage.local.set({ settings: s });
        await ensureAlarm();
        return s;
      }
      case 'sweep': return sweep();
    }
  })().then(reply, (e) => reply({ error: String(e && e.message || e) }));
  return true;
});
// Same as keepReason, without the page check (the popup only needs the simple reasons).
async function keepReasonQuick(t, s, ses) {
  if (s.skipPinned && t.pinned) return 'pinned';
  if (s.skipAudible && t.audible) return 'audible';
  if (ses.awake[t.id]) return 'awake';
  if (listed(hostOf(t.url || ''), s.whitelist)) return 'whitelist';
  return '';
}

// Wake-up: note the tabs that are open right now, and make sure the timer exists.
(async () => {
  await serial(async () => {
    const s = await session(), now = Date.now();
    if (!s.boot) await chrome.storage.session.set({ boot: now });
    const act = await chrome.tabs.query({ active: true });
    for (const t of act) { s.active[t.windowId] = t.id; s.seen[t.id] = now; }
    await chrome.storage.session.set({ active: s.active, seen: s.seen });
  });
  await ensureAlarm();
})();
