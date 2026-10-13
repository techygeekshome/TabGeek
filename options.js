const $ = (id) => document.getElementById(id);
const send = (m) => chrome.runtime.sendMessage(m);
const ORIGINS = { origins: ['http://*/*', 'https://*/*'] };
let S;
const NAMES = { 'suspend-tab': 'Put this tab to sleep', 'suspend-others': 'Put other tabs in this window to sleep', 'wake-all': 'Wake all tabs in this window' };

async function load() {
  S = (await send({ type: 'status' })).settings;
  // Unsaved-typing checks only count as on while the browser still allows the access they need.
  if (S.skipForms && !(await chrome.permissions.contains(ORIGINS))) S = await send({ type: 'save', settings: { ...S, skipForms: false } });
  draw();
}
function draw() {
  $('minutes').value = String(S.minutes);
  for (const k of ['skipPinned', 'skipAudible', 'skipForms']) $(k).checked = S[k];
  const box = $('sites'); box.textContent = '';
  for (const h of S.whitelist) {
    const c = document.createElement('span'); c.textContent = h;
    const x = document.createElement('button'); x.className = 'small'; x.textContent = '×'; x.title = 'Remove ' + h; x.setAttribute('aria-label', 'Remove ' + h);
    x.addEventListener('click', () => save({ whitelist: S.whitelist.filter((w) => w !== h) }));
    c.appendChild(x); box.appendChild(c);
  }
  $('noSites').hidden = S.whitelist.length > 0;
}
async function save(patch) { S = await send({ type: 'save', settings: { ...S, ...patch } }); draw(); }

$('minutes').addEventListener('change', () => save({ minutes: Number($('minutes').value) }));
$('skipPinned').addEventListener('change', () => save({ skipPinned: $('skipPinned').checked }));
$('skipAudible').addEventListener('change', () => save({ skipAudible: $('skipAudible').checked }));
$('skipForms').addEventListener('change', () => {
  const on = $('skipForms').checked;
  if (!on) { save({ skipForms: false }); chrome.permissions.remove(ORIGINS).catch(() => {}); return; }
  // Asked straight from the click, so the browser shows its prompt.
  chrome.permissions.request(ORIGINS).then((ok) => save({ skipForms: !!ok }), () => save({ skipForms: false }));
});
$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const before = S.whitelist.length, v = $('addSite').value;
  save({ whitelist: [...S.whitelist, v] }).then(() => {
    $('addErr').textContent = S.whitelist.length > before || !v.trim() ? '' : 'That does not look like a web address. Try something like example.com';
    if (!$('addErr').textContent) $('addSite').value = '';
  });
});
$('editKeys').addEventListener('click', (e) => {
  e.preventDefault();
  if (chrome.commands.openShortcutSettings) chrome.commands.openShortcutSettings();
  else chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
chrome.commands.getAll().then((cmds) => {
  const tb = document.querySelector('#keys tbody');
  for (const name of Object.keys(NAMES)) {
    const c = cmds.find((x) => x.name === name);
    if (!c) continue;
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = NAMES[c.name];
    const b = document.createElement('td');
    if (c.shortcut) { const k = document.createElement('kbd'); k.textContent = c.shortcut; b.appendChild(k); } else { b.textContent = 'Not set'; b.className = 'muted'; }
    tr.append(a, b); tb.appendChild(tr);
  }
});
load();
