const $ = (id) => document.getElementById(id);
// "?tab=<id>" lets the popup be opened in a normal tab for tests and demo recordings. It only picks which tab to show.
const forced = Number(new URLSearchParams(location.search).get('tab')) || 0;
const send = (m) => chrome.runtime.sendMessage(m);
let tab, host = '', S = null;

function hostOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : ''; } catch { return ''; } }
const listed = (h, list) => !!h && list.some((w) => h === w || h.endsWith('.' + w));
const WHY = {
  pinned: 'This tab is pinned, so it stays awake. You can change that in Settings.',
  audible: 'This tab is playing sound, so it stays awake while it plays.',
  awake: 'You asked TabGeek to keep this tab awake.',
  whitelist: 'This site is on your never-sleep list.',
};

async function init() {
  tab = forced ? await chrome.tabs.get(forced) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  host = hostOf(tab.url || '');
  $('host').textContent = host || tab.title || 'This tab';
  $('siteName').textContent = host || 'this site';
  if (!host) $('site').disabled = true;
  try {
    const cmds = await chrome.commands.getAll();
    const k = (n) => (cmds.find((c) => c.name === n) || {}).shortcut;
    const a = k('suspend-tab'), b = k('suspend-others');
    $('keys').textContent = [a && a + ' sleeps this tab', b && b + ' sleeps the rest'].filter(Boolean).join(' · ');
  } catch {}
  await refresh();
}
async function refresh() {
  const r = await send({ type: 'status', tabId: tab.id });
  S = r.settings;
  $('n').textContent = r.asleep;
  $('of').textContent = `of ${r.total} ${r.total === 1 ? 'tab' : 'tabs'} asleep`;
  $('bar').style.width = (r.total ? Math.round(100 * r.asleep / r.total) : 0) + '%';
  $('sub').textContent = S.minutes
    ? `Tabs sleep after ${label(S.minutes)} without use. Sleeping tabs stay in your tab bar and load again when you click them.`
    : 'Automatic sleep is off. Use the buttons or keyboard shortcuts to put tabs to sleep.';
  if (document.activeElement !== $('minutes')) $('minutes').value = String(S.minutes);
  $('site').checked = listed(host, S.whitelist);
  $('awake').checked = r.awake;
  $('why').textContent = WHY[r.why] || '';
  const list = $('list'); list.textContent = '';
  for (const t of r.list) {
    const a = document.createElement('a'); a.href = '#'; a.title = 'Wake and open: ' + t.title;
    let ic;
    // Site icons are only shown when the browser already holds them as data; nothing is fetched from the web.
    if (/^data:image\//.test(t.icon)) { ic = document.createElement('img'); ic.src = t.icon; ic.alt = ''; }
    else { ic = document.createElement('i'); ic.className = 'fi'; ic.textContent = (hostOf(t.url || '') || '?')[0].toUpperCase(); }
    const sp = document.createElement('span'); sp.textContent = t.title;
    a.append(ic, sp);
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await chrome.tabs.update(t.id, { active: true });
      await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
      if (!forced) window.close(); else refresh();
    });
    list.appendChild(a);
  }
}
function label(m) { return m < 60 ? m + ' minutes' : m === 60 ? '1 hour' : m < 1440 ? m / 60 + ' hours' : m === 1440 ? '1 day' : Math.round(m / 1440) + ' days'; }
function say(t, bad) { $('msg').textContent = t; $('msg').className = 'msg' + (bad ? ' bad' : ''); }
async function save(patch) { S = await send({ type: 'save', settings: { ...S, ...patch } }); await refresh(); }

$('this').addEventListener('click', async () => {
  const r = await send({ type: 'suspend-tab', tabId: tab.id });
  if (r.ok) { say('This tab is asleep.'); if (!forced) setTimeout(() => window.close(), 400); }
  else say(r.why === 'only' ? 'This is the only tab in the window, so there is nowhere to move to. Open another tab first.'
    : r.why === 'typing' ? 'This tab has typing that is not saved, so TabGeek left it awake.' : 'This tab could not be put to sleep.', true);
  await refresh();
});
$('others').addEventListener('click', async () => {
  const r = await send({ type: 'suspend-others', windowId: tab.windowId });
  say(`${r.n} ${r.n === 1 ? 'tab' : 'tabs'} put to sleep` + (r.kept ? `, ${r.kept} kept awake by your settings.` : '.'));
  await refresh();
});
$('wake').addEventListener('click', async () => {
  const r = await send({ type: 'wake-all', windowId: tab.windowId });
  say(r.n ? `Waking ${r.n} ${r.n === 1 ? 'tab' : 'tabs'}.` : 'No tabs in this window are asleep.');
  setTimeout(refresh, 600);
});
$('minutes').addEventListener('change', () => save({ minutes: Number($('minutes').value) }));
$('site').addEventListener('change', () => {
  const w = S.whitelist.filter((x) => !(host === x || host.endsWith('.' + x)));
  if ($('site').checked) w.push(host);
  save({ whitelist: w });
});
$('awake').addEventListener('change', async () => { await send({ type: 'awake', tabId: tab.id, on: $('awake').checked }); refresh(); });
$('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); if (!forced) window.close(); });

init();
