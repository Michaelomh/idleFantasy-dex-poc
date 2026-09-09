// PROTOTYPE — throwaway. Answers ticket #4: does the ingestion flow feel good?
// Everything here is deliberately unabstracted and unpolished.

// ---------------------------------------------------------------------------
// Save Export validation: content, never MIME.
// ---------------------------------------------------------------------------
// The PlayerExport envelope. `sig` and `coins` are present in every real export,
// but requiring all twelve makes the check brittle against a future field rename,
// so the gate is: parses as a JSON object, and carries the core five.
const ENVELOPE_KEYS = [
  'skillLevels', 'skillXp', 'inventory', 'equipped', 'flags', 'pets',
  'coins', 'questProgress', 'farmingPatches', 'sessions', 'exported_at', 'sig',
];
const REQUIRED_KEYS = ['skillLevels', 'inventory', 'flags', 'questProgress', 'exported_at'];

function validate(text, fileName) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: 'Not JSON at all — ' + err.message };
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: 'JSON, but not an object' };
  }
  const present = ENVELOPE_KEYS.filter((k) => k in doc);
  const missing = REQUIRED_KEYS.filter((k) => !(k in doc));
  if (missing.length) {
    return {
      ok: false,
      reason: 'JSON object, but not an Idle Fantasy save — missing ' + missing.join(', '),
      present,
    };
  }

  // `flags` ships as a JSON string inside the JSON. Parse it a second time:
  // it carries enemy_kills and seen_item_keys, the two lifetime ledgers.
  let flags = {};
  let flagsNote = null;
  try {
    flags = typeof doc.flags === 'string' ? JSON.parse(doc.flags) : (doc.flags || {});
  } catch (err) {
    flagsNote = 'flags present but did not parse: ' + err.message;
  }

  const questProgress = Array.isArray(doc.questProgress) ? doc.questProgress : [];
  const skillLevels = parseMaybeString(doc.skillLevels) || {};

  return {
    ok: true,
    present,
    // The filename prefix is a hint we record and never gate on — users rename files.
    filenameHint: /^fantasyidler_(auto|save)_/.test(fileName || '') ? fileName : null,
    playerState: {
      exportedAt: normaliseEpoch(doc.exported_at),
      character: flags.character_name || flags.characterName || null,
      skills: Object.keys(skillLevels).length,
      questsCompleted: questProgress.filter((q) => q && q.completed).length,
      questRows: questProgress.length,
      enemiesKilled: Object.keys(flags.enemy_kills || {}).length,
      seenItems: (flags.seen_item_keys || []).length,
      sessions: Array.isArray(doc.sessions) ? doc.sessions.length : 0,
      coins: doc.coins ?? null,
      flagsNote,
    },
  };
}

function parseMaybeString(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

// exported_at is a wall-clock epoch with no documented unit. Treat anything that
// would land before 2001 as seconds rather than milliseconds.
function normaliseEpoch(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e11 ? n * 1000 : n;
}

// ---------------------------------------------------------------------------
// Staleness — derived, never stored. Labels, does not block.
// ---------------------------------------------------------------------------
const HOUR = 3600 * 1000;
function staleness(exportedAt, now = Date.now()) {
  if (!exportedAt) return { tier: 'unknown', label: 'export time unknown', age: null };
  const age = now - exportedAt;
  if (age < 0) return { tier: 'future', label: 'exported in the future (clock skew?)', age };
  if (age < 12 * HOUR) return { tier: 'fresh', label: 'fresh', age };
  if (age < 48 * HOUR) return { tier: 'aging', label: 'aging', age };
  return { tier: 'stale', label: 'stale', age };
}

function humanAge(ms) {
  if (ms == null) return '—';
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return mins + 'm';
  const hours = Math.round(abs / HOUR);
  if (hours < 48) return hours + 'h';
  return Math.round(abs / (24 * HOUR)) + 'd';
}

// ---------------------------------------------------------------------------
// Ingestion — one path for every Save Source.
// ---------------------------------------------------------------------------
async function ingest({ text, fileName, fileType, source }) {
  const result = validate(text, fileName);
  const arrival = { source, fileName, fileType, at: Date.now() };

  if (!result.ok) {
    log('rejected', `${source}: ${result.reason}`, arrival);
    render({ lastRejection: { ...arrival, reason: result.reason } });
    return;
  }

  const incoming = result.playerState;
  const cached = await idbGet('state', 'current');

  // Two collisions the flow has to have an answer for.
  if (cached && cached.playerState.character && incoming.character &&
      cached.playerState.character !== incoming.character) {
    // A different save slot. v1 tracks one character; say so rather than
    // silently swapping the Ledger's subject.
    log('slot-conflict',
      `${incoming.character} is a different character to the cached ${cached.playerState.character}`, arrival);
    render({ pendingDecision: { kind: 'different-character', incoming, arrival, text } });
    return;
  }
  if (cached && cached.playerState.exportedAt && incoming.exportedAt &&
      incoming.exportedAt < cached.playerState.exportedAt) {
    log('older',
      `incoming export is ${humanAge(cached.playerState.exportedAt - incoming.exportedAt)} older than the cached one`, arrival);
    render({ pendingDecision: { kind: 'older-export', incoming, arrival, text } });
    return;
  }

  await commit(incoming, arrival, result);
}

async function commit(playerState, arrival, result) {
  await idbPut('state', 'current', {
    playerState,
    arrival,
    envelopePresent: result ? result.present : null,
    filenameHint: result ? result.filenameHint : null,
    ingestedAt: Date.now(),
  });
  log('accepted', `${arrival.source}: ${playerState.character || 'unnamed character'}, exported ${humanAge(Date.now() - playerState.exportedAt)} ago`, arrival);
  render();
}

// ---------------------------------------------------------------------------
// Save Source: desktop persistent directory handle
// ---------------------------------------------------------------------------
const supportsDirHandle = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

async function pickBackupDir() {
  const handle = await window.showDirectoryPicker({ id: 'if-backups', mode: 'read' });
  await idbPut('handles', 'backupDir', handle);
  log('dir-linked', `linked folder "${handle.name}"`);
  await scanBackupDir({ userGesture: true });
}

async function scanBackupDir({ userGesture = false } = {}) {
  const handle = await idbGet('handles', 'backupDir');
  if (!handle) { log('dir-scan', 'no folder linked'); return; }

  let perm = await handle.queryPermission({ mode: 'read' });
  if (perm !== 'granted') {
    if (!userGesture) {
      // The re-permission prompt needs a user gesture, so on a cold visit all we
      // can do is surface the button. This is the desktop flow's one rough edge.
      log('dir-permission', `folder "${handle.name}" needs re-permission (${perm})`);
      render({ needsRepermission: handle.name });
      return;
    }
    perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') { log('dir-permission', 're-permission denied'); return; }
  }

  // Pick the newest valid Save Export in the folder, by exported_at, not by mtime.
  let best = null;
  let looked = 0;
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue;
    looked++;
    const file = await entry.getFile();
    if (file.size > 20 * 1024 * 1024) continue;
    const text = await file.text();
    const res = validate(text, file.name);
    if (!res.ok) continue;
    if (!best || (res.playerState.exportedAt || 0) > (best.res.playerState.exportedAt || 0)) {
      best = { res, text, file };
    }
  }
  log('dir-scan', `looked at ${looked} file(s) in "${handle.name}", ${best ? 'newest valid: ' + best.file.name : 'found no valid Save Export'}`);
  if (best) {
    await ingest({ text: best.text, fileName: best.file.name, fileType: best.file.type || '(none)', source: 'directory handle' });
  } else {
    render();
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
const events = [];
function log(kind, message, extra) {
  events.unshift({ at: new Date().toLocaleTimeString(), kind, message, extra });
  renderLog();
}

let view = {};
async function render(patch = {}) {
  view = { ...patch };
  const cached = await idbGet('state', 'current');
  const dirHandle = await idbGet('handles', 'backupDir');
  const el = document.getElementById('state');

  const rows = [];
  if (!cached) {
    rows.push(row('Save Source state', 'EMPTY — nothing cached, the app has no Player State'));
  } else {
    const s = staleness(cached.playerState.exportedAt);
    rows.push(row('Save Source state', 'LOADED from IndexedDB, no upload needed'));
    rows.push(row('Staleness', `${s.label} — data is ${humanAge(s.age)} old`, s.tier));
    rows.push(row('Character', cached.playerState.character || '(no name in flags)'));
    rows.push(row('Exported at', cached.playerState.exportedAt ? new Date(cached.playerState.exportedAt).toLocaleString() : 'unknown'));
    rows.push(row('Ingested via', `${cached.arrival.source} — file "${cached.arrival.fileName}" declared as ${cached.arrival.fileType || '(empty MIME)'}`));
    rows.push(row('Filename hint', cached.filenameHint ? 'matched fantasyidler_ prefix' : 'no prefix match (fine, not a requirement)'));
    rows.push(row('Envelope keys present', `${cached.envelopePresent.length}/12 — ${cached.envelopePresent.join(', ')}`));
    rows.push(row('Player State', `${cached.playerState.skills} skills · ${cached.playerState.questsCompleted}/${cached.playerState.questRows} quests completed · ${cached.playerState.enemiesKilled} enemies killed · ${cached.playerState.seenItems} items seen · ${cached.playerState.sessions} sessions · ${cached.playerState.coins} coins`));
    if (cached.playerState.flagsNote) rows.push(row('flags', cached.playerState.flagsNote, 'stale'));
  }
  rows.push(row('Share Target', navigator.userAgent.includes('Android') ? 'device is Android — share a save into the installed app to test' : 'desktop — Share Target is Android-only, use the simulate buttons'));
  rows.push(row('Directory handle', supportsDirHandle ? (dirHandle ? `linked to "${dirHandle.name}"` : 'supported, no folder linked yet') : 'not supported in this browser (baseline upload still works)'));

  el.innerHTML = rows.join('');

  const banner = document.getElementById('banner');
  if (view.needsRepermission) {
    banner.className = 'banner warn';
    banner.innerHTML = `Folder "<b>${view.needsRepermission}</b>" needs permission again. <button id="repermit">Reconnect folder</button>`;
    document.getElementById('repermit').onclick = () => scanBackupDir({ userGesture: true });
  } else if (view.lastRejection) {
    banner.className = 'banner bad';
    banner.textContent = `Rejected "${view.lastRejection.fileName}" (${view.lastRejection.fileType || 'empty MIME'}): ${view.lastRejection.reason}`;
  } else if (view.pendingDecision) {
    const d = view.pendingDecision;
    banner.className = 'banner warn';
    const msg = d.kind === 'different-character'
      ? `That save is for <b>${d.incoming.character}</b>, but the app is showing <b>the cached character</b>. Replace it?`
      : `That save was exported <b>${humanAge(Date.now() - d.incoming.exportedAt)}</b> ago — older than the one already cached. Use it anyway?`;
    banner.innerHTML = `${msg} <button id="force">Replace</button> <button id="keep">Keep current</button>`;
    document.getElementById('force').onclick = async () => {
      await commit(d.incoming, d.arrival, validate(d.text, d.arrival.fileName));
    };
    document.getElementById('keep').onclick = () => { log('kept', 'kept the cached export'); render(); };
  } else {
    banner.className = 'banner hidden';
    banner.textContent = '';
  }
}

function row(k, v, tier) {
  const cls = tier ? ` class="tier-${tier}"` : '';
  return `<div class="row"><span class="k">${k}</span><span class="v"${cls}>${v}</span></div>`;
}

function renderLog() {
  document.getElementById('log').innerHTML = events.map((e) =>
    `<div class="ev ev-${e.kind}"><span class="t">${e.at}</span><span class="kind">${e.kind}</span><span class="msg">${e.message}</span></div>`
  ).join('');
}

// --- Simulated arrivals, so the state machine is drivable without a phone -----
const SIM = {};
function nowMinus(hours) { return Date.now() - hours * HOUR; }
function fakeSave({ character = 'Kyrasoar', hoursAgo = 1, kills = 41, seen = 120, quests = 96 } = {}) {
  return JSON.stringify({
    skillLevels: JSON.stringify({ fishing: 71, mining: 55, woodcutting: 60 }),
    skillXp: JSON.stringify({ fishing: 814000 }),
    inventory: JSON.stringify({ raw_shark: 812 }),
    equipped: JSON.stringify({ weapon: 'rune_sword' }),
    flags: JSON.stringify({
      character_name: character,
      last_seen_version_code: 149002,
      enemy_kills: Object.fromEntries(Array.from({ length: kills }, (_, i) => ['enemy_' + i, i + 1])),
      seen_item_keys: Array.from({ length: seen }, (_, i) => 'item_' + i),
    }),
    pets: JSON.stringify(['pet_rock']),
    coins: 1204553,
    questProgress: Array.from({ length: 189 }, (_, i) => ({ questId: 'q' + i, progress: 1, completed: i < quests, completedAt: 0 })),
    farmingPatches: [],
    sessions: [{ skill: 'fishing', frames: 60 }],
    exported_at: nowMinus(hoursAgo),
    sig: 'deadbeef',
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await ingest({ text: await file.text(), fileName: file.name, fileType: file.type || '', source: 'manual upload' });
    e.target.value = '';
  });

  const dirBtn = document.getElementById('linkdir');
  if (!supportsDirHandle) { dirBtn.disabled = true; dirBtn.title = 'showDirectoryPicker not supported'; }
  dirBtn.onclick = () => pickBackupDir().catch((err) => log('dir-error', String(err)));
  document.getElementById('rescan').onclick = () => scanBackupDir({ userGesture: true }).catch((err) => log('dir-error', String(err)));

  const sims = [
    ['fresh save (1h old)', () => ingest({ text: fakeSave({ hoursAgo: 1, kills: 41 }), fileName: 'fantasyidler_auto_1_Kyrasoar', fileType: 'application/octet-stream', source: 'simulated share' })],
    ['same save, 3 days old', () => ingest({ text: fakeSave({ hoursAgo: 72, kills: 41 }), fileName: 'fantasyidler_auto_1_Kyrasoar', fileType: 'application/octet-stream', source: 'simulated share' })],
    ['newer save (progress made)', () => ingest({ text: fakeSave({ hoursAgo: 0.2, kills: 58, seen: 190, quests: 121 }), fileName: 'fantasyidler_auto_1_Kyrasoar', fileType: '', source: 'simulated share' })],
    ['an OLDER save than cached', () => ingest({ text: fakeSave({ hoursAgo: 200, kills: 20 }), fileName: 'fantasyidler_save_1_Kyrasoar.json', fileType: 'application/json', source: 'simulated share' })],
    ['a different character', () => ingest({ text: fakeSave({ character: 'Bramblefoot', hoursAgo: 2 }), fileName: 'fantasyidler_auto_2_Bramblefoot', fileType: 'application/octet-stream', source: 'simulated share' })],
    ['a holiday photo (not JSON)', () => ingest({ text: '��JFIF binary junk', fileName: 'IMG_4021.jpg', fileType: 'image/jpeg', source: 'simulated share' })],
    ['some other app’s JSON', () => ingest({ text: JSON.stringify({ version: 3, todos: [] }), fileName: 'notes.json', fileType: 'application/json', source: 'simulated share' })],
    ['pre-v1.8.11 save (empty ledgers)', () => ingest({ text: fakeSave({ hoursAgo: 5, kills: 0, seen: 0, quests: 40 }), fileName: 'fantasyidler_auto_1_Kyrasoar', fileType: '', source: 'simulated share' })],
  ];
  const simBox = document.getElementById('sims');
  sims.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => fn().catch((err) => log('error', String(err)));
    simBox.appendChild(b);
  });

  document.getElementById('wipe').onclick = async () => {
    await idbDel('state', 'current');
    await idbDel('handles', 'backupDir');
    log('wiped', 'cleared cached Player State and folder handle');
    render();
  };

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (err) { log('sw-error', String(err)); }
  }

  // A share arrived: the SW redirected here after stashing the file.
  if (new URLSearchParams(location.search).has('shared')) {
    history.replaceState({}, '', '/');
    const pending = await idbGet('pending', 'share');
    await idbDel('pending', 'share');
    if (!pending) {
      log('share-error', 'redirected as a share, but nothing was stashed');
    } else if (pending.error) {
      log('share-error', pending.error);
    } else {
      log('share-received', `share sheet handed over "${pending.name}" declared as ${pending.type || 'EMPTY MIME'} (${pending.size} bytes)`);
      await ingest({ text: pending.text, fileName: pending.name, fileType: pending.type, source: 'share target' });
    }
  }

  await render();
  // Cold-visit desktop refresh: check the linked folder without a user gesture.
  if (supportsDirHandle && await idbGet('handles', 'backupDir')) {
    await scanBackupDir({ userGesture: false });
  }
});
