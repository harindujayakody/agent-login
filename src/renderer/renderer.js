const api = window.api;
const $ = (sel) => document.querySelector(sel);

let profiles = [];
let running = new Set();
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
  if (!iso) return 'never opened';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'opened just now';
  if (s < 3600) return `opened ${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `opened ${Math.floor(s / 3600)} h ago`;
  return `opened ${Math.floor(s / 86400)} d ago`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function cardHtml(p) {
  const on = running.has(p.id);
  const tags = [];
  if (p.startUrl) tags.push(hostOf(p.startUrl));
  tags.push(p.proxy?.type && p.proxy.type !== 'none' ? `${p.proxy.type.toUpperCase()} ${p.proxy.host}` : 'Direct');
  if (p.language) tags.push(p.language);
  if (p.timezone) tags.push(p.timezone);
  return `
    <div class="card ${on ? 'running' : ''}" style="--card-color:${escapeHtml(p.color)}" data-id="${p.id}">
      <div class="card-head">
        <div class="avatar">${escapeHtml(p.name.charAt(0).toUpperCase())}</div>
        <div style="min-width:0">
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-sub">${escapeHtml(timeAgo(p.lastOpenedAt))}</div>
        </div>
        <span class="badge ${on ? 'on' : ''}">${on ? '● Running' : 'Stopped'}</span>
      </div>
      <div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
      ${p.notes ? `<div class="notes">${escapeHtml(p.notes)}</div>` : ''}
      <div class="card-actions">
        ${on
          ? '<button class="launch stop" data-act="stop">Close browser</button>'
          : '<button class="launch primary" data-act="launch">Open browser</button>'}
        <button data-act="edit">Edit</button>
        <div class="menu-wrap">
          <button data-act="menu" title="More">⋯</button>
        </div>
      </div>
    </div>`;
}

function render() {
  const q = $('#search').value.trim().toLowerCase();
  const list = profiles.filter((p) =>
    !q || [p.name, p.owner, p.notes, p.startUrl].some((v) => (v || '').toLowerCase().includes(q)));

  $('#empty').classList.toggle('hidden', profiles.length > 0);
  $('#stats').innerHTML = profiles.length ? `
    <div class="stat"><b>${profiles.length}</b><span>Profiles</span></div>
    <div class="stat"><b>${running.size}</b><span>Running now</span></div>
    <div class="stat"><b>${profiles.filter((p) => p.proxy?.type !== 'none').length}</b><span>Using a proxy</span></div>` : '';

  // Group cards by owner so each family member's profiles sit together.
  const groups = new Map();
  for (const p of list.sort((a, b) => a.name.localeCompare(b.name))) {
    const key = p.owner || 'Ungrouped';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === 'Ungrouped') - (b === 'Ungrouped') || a.localeCompare(b));
  const showTitles = keys.length > 1;
  $('#grid').innerHTML = keys.map((k) =>
    (showTitles ? `<div class="group-title">${escapeHtml(k)}</div>` : '') + groups.get(k).map(cardHtml).join('')
  ).join('');
}

async function refresh() {
  profiles = await api.listProfiles();
  running = new Set(await api.runningProfiles());
  render();
}

// ---------- Editor ----------
const form = $('#editor-form');

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
}

function openEditor(p) {
  editingId = p?.id || null;
  $('#editor-title').textContent = p ? `Edit “${p.name}”` : 'New profile';
  form.reset();
  const v = p || { color: '#e60023', startUrl: 'https://www.pinterest.com', proxy: { type: 'none' } };
  form.name.value = v.name || '';
  form.owner.value = v.owner || '';
  form.color.value = v.color || '#e60023';
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

// ---------- Card actions ----------
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
    <button data-act="clear">Clear browsing data…</button>
    <button data-act="delete" class="danger">Delete profile…</button>`;
  menu.dataset.id = id;
  wrap.appendChild(menu);
}

$('#grid').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]')?.dataset.id || btn.closest('.menu')?.dataset.id;
  const p = profiles.find((x) => x.id === id);
  if (!p) return;
  const act = btn.dataset.act;
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
setInterval(render, 60000); // keep "opened X min ago" fresh
