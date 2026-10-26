// `api` is the global exposed by preload.js via contextBridge. It can't be
// redeclared here: a top-level `const api` throws and stops the whole script.
const $ = (sel) => document.querySelector(sel);

const ALL = '__all__';
const UNGROUPED = '__none__';

let profiles = [];
let running = new Set();
let selected = new Set();
let activeGroup = ALL;
let editingId = null;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    // Electron prefixes IPC errors with "Error invoking remote method ...: Error: "
    toast(String(err.message || err).replace(/^.*Error: /, ''), true);
  }
}

function timeAgo(iso) {
  if (!iso) return 'Never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ---------- Sidebar groups ----------
function groupKey(p) {
  return p.owner || UNGROUPED;
}

function renderGroups() {
  const counts = new Map();
  for (const p of profiles) counts.set(groupKey(p), (counts.get(groupKey(p)) || 0) + 1);
  if (activeGroup !== ALL && !counts.has(activeGroup)) activeGroup = ALL;

  const named = [...counts.keys()].filter((k) => k !== UNGROUPED).sort((a, b) => a.localeCompare(b));
  const items = [{ key: ALL, label: 'All profiles', count: profiles.length }];
  for (const k of named) {
    const color = profiles.find((p) => p.owner === k)?.color;
    items.push({ key: k, label: k, count: counts.get(k), color });
  }
  if (counts.has(UNGROUPED) && named.length) items.push({ key: UNGROUPED, label: 'Ungrouped', count: counts.get(UNGROUPED) });

  $('#groups').innerHTML = items.map((g) => `
    <button class="nav-item ${g.key === activeGroup ? 'active' : ''}" data-group="${escapeHtml(g.key)}">
      ${g.key === ALL
        ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h16v2H4v-2Z"/></svg>'
        : `<span class="dot" style="background:${escapeHtml(g.color || '#9aa3b5')}"></span>`}
      <span>${escapeHtml(g.label)}</span>
      <span class="count">${g.count}</span>
    </button>`).join('');
}

$('#groups').addEventListener('click', (e) => {
  const b = e.target.closest('[data-group]');
  if (!b) return;
  activeGroup = b.dataset.group;
  render();
});

// ---------- Table ----------
function visibleProfiles() {
  const q = $('#search').value.trim().toLowerCase();
  return profiles
    .filter((p) => activeGroup === ALL || groupKey(p) === activeGroup)
    .filter((p) => !q || [p.name, p.owner, p.notes, p.startUrl].some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rowHtml(p) {
  const on = running.has(p.id);
  const proxy = p.proxy?.type && p.proxy.type !== 'none'
    ? `<span class="chip proxy">${escapeHtml(p.proxy.type.toUpperCase())} · ${escapeHtml(p.proxy.host)}:${escapeHtml(p.proxy.port)}</span>`
    : '<span class="cell-muted">Direct</span>';
  return `
    <tr data-id="${p.id}" class="${selected.has(p.id) ? 'selected' : ''}">
      <td class="col-check"><input type="checkbox" data-act="select" ${selected.has(p.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(p.name)}"></td>
      <td>
        <div class="p-name">
          <div class="avatar" style="--card-color:${escapeHtml(p.color)}">${escapeHtml(p.name.charAt(0).toUpperCase())}</div>
          <div style="min-width:0">
            <div class="p-title">${escapeHtml(p.name)}</div>
            ${p.notes ? `<div class="p-notes">${escapeHtml(p.notes)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${p.owner ? `<span class="chip">${escapeHtml(p.owner)}</span>` : '<span class="cell-muted">—</span>'}</td>
      <td>${proxy}</td>
      <td class="cell-muted col-start">${p.startUrl ? escapeHtml(hostOf(p.startUrl)) : '—'}</td>
      <td class="cell-muted col-last">${escapeHtml(timeAgo(p.lastOpenedAt))}</td>
      <td><span class="status ${on ? 'on' : ''}">${on ? 'Running' : 'Stopped'}</span></td>
      <td class="col-actions">
        <div class="row-actions">
          ${on
            ? '<button class="start stop sm" data-act="stop">Stop</button>'
            : '<button class="start primary sm" data-act="launch">Start</button>'}
          <button class="icon" data-act="edit" title="Edit">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25Zm15.71-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.83 1.83 3.91 3.91 1.83-1.83Z"/></svg>
          </button>
          <div class="menu-wrap">
            <button class="icon" data-act="menu" title="More">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/></svg>
            </button>
          </div>
        </div>
      </td>
    </tr>`;
}

function render() {
  // Drop selections for profiles that no longer exist.
  selected = new Set([...selected].filter((id) => profiles.some((p) => p.id === id)));
  renderGroups();

  const list = visibleProfiles();
  const hasProfiles = profiles.length > 0;
  $('#empty').classList.toggle('hidden', hasProfiles);
  $('#table-card').classList.toggle('hidden', !hasProfiles);
  $('#no-match').classList.toggle('hidden', !hasProfiles || list.length > 0);

  const groupLabel = activeGroup === ALL ? 'All profiles' : activeGroup === UNGROUPED ? 'Ungrouped' : activeGroup;
  $('#page-title').textContent = groupLabel;
  const runningHere = list.filter((p) => running.has(p.id)).length;
  $('#page-sub').textContent = hasProfiles ? `${list.length} profile${list.length === 1 ? '' : 's'} · ${runningHere} running` : '';

  $('#rows').innerHTML = list.map(rowHtml).join('');

  const visibleSelected = list.filter((p) => selected.has(p.id)).length;
  const all = $('#check-all');
  all.checked = list.length > 0 && visibleSelected === list.length;
  all.indeterminate = visibleSelected > 0 && visibleSelected < list.length;

  $('#bulkbar').classList.toggle('hidden', selected.size === 0);
  $('#bulk-count').textContent = `${selected.size} selected`;
}

async function refresh() {
  profiles = await api.listProfiles();
  running = new Set(await api.runningProfiles());
  render();
}

// ---------- Selection & bulk actions ----------
$('#check-all').addEventListener('change', (e) => {
  for (const p of visibleProfiles()) {
    if (e.target.checked) selected.add(p.id);
    else selected.delete(p.id);
  }
  render();
});

$('#bulk-clear').addEventListener('click', () => {
  selected.clear();
  render();
});

$('#bulk-start').addEventListener('click', () => guard(async () => {
  const ids = [...selected].filter((id) => !running.has(id));
  for (const id of ids) await api.launchProfile(id);
  toast(ids.length ? `Starting ${ids.length} profile${ids.length === 1 ? '' : 's'}…` : 'All selected profiles are already running');
  await refresh();
}));

$('#bulk-stop').addEventListener('click', () => guard(async () => {
  const ids = [...selected].filter((id) => running.has(id));
  for (const id of ids) await api.stopProfile(id);
  toast(ids.length ? `Stopping ${ids.length} profile${ids.length === 1 ? '' : 's'}` : 'None of the selected profiles are running');
}));

// ---------- Editor ----------
const form = $('#editor-form');

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
}

function openEditor(p) {
  editingId = p?.id || null;
  $('#editor-title').textContent = p ? `Edit “${p.name}”` : 'Create profile';
  form.reset();
  const defaults = {
    color: '#2f6bff',
    startUrl: 'https://www.pinterest.com',
    owner: activeGroup !== ALL && activeGroup !== UNGROUPED ? activeGroup : '',
    proxy: { type: 'none' },
  };
  const v = p || defaults;
  form.name.value = v.name || '';
  form.owner.value = v.owner || '';
  form.color.value = v.color || '#2f6bff';
  form.startUrl.value = v.startUrl || '';
  form.notes.value = v.notes || '';
  form.proxyType.value = v.proxy?.type || 'none';
  form.proxyHost.value = v.proxy?.host || '';
  form.proxyPort.value = v.proxy?.port || '';
  form.language.value = v.language || '';
  form.timezone.value = v.timezone || '';
  form.windowWidth.value = v.windowWidth || '';
  form.windowHeight.value = v.windowHeight || '';
  form.userAgent.value = v.userAgent || '';
  switchTab('general');
  $('#editor').showModal();
  form.name.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  guard(async () => {
    const proxyType = form.proxyType.value;
    if (proxyType !== 'none' && (!form.proxyHost.value.trim() || !form.proxyPort.value)) {
      switchTab('network');
      throw new Error('Enter the proxy host and port, or choose "No proxy".');
    }
    await api.saveProfile({
      id: editingId,
      name: form.name.value,
      owner: form.owner.value,
      color: form.color.value,
      startUrl: form.startUrl.value,
      notes: form.notes.value,
      language: form.language.value,
      timezone: form.timezone.value,
      userAgent: form.userAgent.value,
      windowWidth: form.windowWidth.value,
      windowHeight: form.windowHeight.value,
      proxy: { type: proxyType, host: form.proxyHost.value, port: form.proxyPort.value },
    });
    $('#editor').close();
    toast(editingId ? 'Profile updated' : 'Profile created');
    await refresh();
  });
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
$('#editor-cancel').addEventListener('click', () => $('#editor').close());
$('#btn-new').addEventListener('click', () => openEditor(null));
$('#btn-new-empty').addEventListener('click', () => openEditor(null));
$('#search').addEventListener('input', render);

// ---------- Row actions ----------
function closeMenus() {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
}

function openMenu(wrap, id) {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <button data-act="duplicate">Duplicate settings</button>
    <button data-act="folder">Open data folder</button>
    <hr>
    <button data-act="clear">Clear browsing data…</button>
    <button data-act="delete" class="danger">Delete profile…</button>`;
  menu.dataset.id = id;
  wrap.appendChild(menu);
}

$('#rows').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.menu')?.dataset.id || btn.closest('[data-id]')?.dataset.id;
  const p = profiles.find((x) => x.id === id);
  if (!p) return;
  const act = btn.dataset.act;
  if (act === 'select') {
    if (btn.checked) selected.add(id);
    else selected.delete(id);
    return render();
  }
  if (act === 'menu') {
    e.stopPropagation();
    return openMenu(btn.parentElement, id);
  }
  closeMenus();
  guard(async () => {
    switch (act) {
      case 'launch':
        await api.launchProfile(id);
        toast(`Opening ${p.name}…`);
        break;
      case 'stop':
        await api.stopProfile(id);
        break;
      case 'edit':
        openEditor(p);
        break;
      case 'duplicate': {
        const { id: _drop, createdAt, updatedAt, lastOpenedAt, ...copy } = p;
        await api.saveProfile({ ...copy, name: `${p.name} (copy)` });
        toast('Duplicated – the copy starts with empty cookies and logins');
        break;
      }
      case 'folder':
        await api.openProfileFolder(id);
        break;
      case 'clear':
        if (await api.clearProfile(id)) toast('Browsing data cleared');
        break;
      case 'delete':
        if (await api.deleteProfile(id)) toast('Profile deleted');
        break;
    }
    await refresh();
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu')) closeMenus();
});

api.onRunningChanged((ids) => {
  running = new Set(ids);
  refresh();
});

// ---------- Settings ----------
const sForm = $('#settings-form');

async function openSettings() {
  const s = await api.getSettings();
  const sel = $('#browser-select');
  sel.innerHTML = s.detected.map((b) => `<option value="${escapeHtml(b.path)}">${escapeHtml(b.name)} — ${escapeHtml(b.path)}</option>`).join('')
    + '<option value="">Custom path…</option>';
  const custom = s.browserPath && !s.detected.some((b) => b.path === s.browserPath);
  sel.value = custom ? '' : (s.browserPath || s.effectiveBrowserPath || '');
  $('#browser-path').value = s.browserPath || '';
  $('#browser-path').disabled = sel.value !== '';
  $('#data-dir').textContent = s.dataDir;
  $('#settings').showModal();
}

$('#browser-select').addEventListener('change', (e) => {
  $('#browser-path').disabled = e.target.value !== '';
  if (e.target.value) $('#browser-path').value = e.target.value;
});
$('#browser-browse').addEventListener('click', () => guard(async () => {
  const p = await api.pickBrowser();
  if (p) {
    $('#browser-select').value = '';
    $('#browser-path').disabled = false;
    $('#browser-path').value = p;
  }
}));
$('#settings-cancel').addEventListener('click', () => $('#settings').close());
$('#btn-settings').addEventListener('click', () => guard(openSettings));
sForm.addEventListener('submit', (e) => {
  e.preventDefault();
  guard(async () => {
    const sel = $('#browser-select').value;
    await api.saveSettings({ browserPath: sel || $('#browser-path').value.trim() });
    $('#settings').close();
    toast('Settings saved');
  });
});

refresh();
setInterval(render, 60000); // keep "Last opened" times fresh
