/* Merge Studio: radial console */
(() => {
'use strict';
const MAX = 20, HOLD_MS = 350, SLOP = 6;
const $ = id => document.getElementById(id);
const stage = $('stage'), con = $('console'), ring = $('ring'), caption = $('console-caption'),
  fileInput = $('file-input'), queue = $('queue'), fileList = $('file-list'), countEl = $('count'),
  badge = $('mode-badge'), nameIn = $('filename-input'), extEl = $('ext-preview'),
  clearBtn = $('clear-btn'), progW = $('progress-wrap'), toastEl = $('toast');

let files = [], busy = false, isOpen = false, expanded = null, hoverEl = null, collapseT = null;

/* ---------- ring geometry ---------- */
const NS = 'http://www.w3.org/2000/svg', CX = 300, CY = 300, INSET = 7, MAIN = [100, 190], KID = [200, 280];
const pt = (a, r) => [CX + r * Math.cos(a * Math.PI / 180), CY - r * Math.sin(a * Math.PI / 180)];
const mid = (a, r) => pt((a[0] + a[1]) / 2, (r[0] + r[1]) / 2);
function sector(a, r) {
  const da = INSET / ((r[0] + r[1]) / 2) * 180 / Math.PI, a0 = a[0] + da, a1 = a[1] - da, r0 = r[0] + INSET, r1 = r[1] - INSET;
  const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
  return `M${x0} ${y0}A${r1} ${r1} 0 0 0 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 1 ${x3} ${y3}Z`;
}
const mk = (n, at = {}, p) => { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, at[k]); if (p) p.appendChild(e); return e; };

const OPS = [
  { op: 'merge', label: 'Merge', sub: 'combine files', a: [148, 212], kids: [
    { op: 'merge:pdf',   label: 'PDF',   sub: '.pdf',  a: [128, 160], c: '#EE7C53' },
    { op: 'merge:pptx',  label: 'PPT',   sub: '.pptx', a: [164, 196], c: '#b37fa0' },
    { op: 'merge:mixed', label: 'Mixed', sub: '.pdf',  a: [200, 232], c: '#c49a27' } ] },
  { op: 'convert', label: 'Convert', sub: 'from PDF', a: [-32, 32], kids: [
    { op: 'convert:word', label: 'Word',       sub: '.docx', a: [2, 34],   c: '#8fa6c9' },
    { op: 'convert:ppt',  label: 'PowerPoint', sub: '.pptx', a: [-34, -2], c: '#b37fa0' } ] }
];

function petal(d, r, cls, parent, i) {
  const g = mk('g', { class: `petal ${cls}`, 'data-op': d.op, role: 'button', tabindex: -1, 'aria-label': d.label });
  const [x, y] = mid(d.a, r), [px, py] = parent ? mid(parent.a, MAIN) : [CX, CY];
  g.style.cssText = `--tx:${px - x}px;--ty:${py - y}px;--i:${i};` + (d.c ? `--acc:${d.c}` : '');
  if (parent) g.dataset.parent = parent.op;
  mk('title', {}, g);
  const p = sector(d.a, r); mk('path', { class: 'bd', d: p }, g); mk('path', { class: 'fl', d: p }, g);
  mk('text', { class: 'lb', x, y: y - 2 }, g).textContent = d.label;
  mk('text', { class: 'sb', x, y: y + 17 }, g).textContent = d.sub;
  ring.appendChild(g);
}
mk('circle', { class: 'halo', cx: CX, cy: CY, r: 292 }, ring);
OPS.forEach(p => { petal(p, MAIN, 'main', null, 0); p.kids.forEach((k, i) => petal(k, KID, 'kid', p, i)); });

const hub = mk('g', { class: 'hub', role: 'button', tabindex: 0, 'aria-label': 'Upload files', transform: `translate(${CX} ${CY})` }, ring);
mk('circle', { class: 'hub-glow', r: 80 }, hub); mk('circle', { class: 'hub-bd', r: 80 }, hub); mk('circle', { class: 'hub-fl', r: 80 }, hub);
mk('circle', { class: 'hub-spin', r: 90 }, hub);
const up = mk('g', { class: 'hub-up' }, hub), xx = mk('g', { class: 'hub-x' }, hub);
mk('path', { class: 'hub-ic', d: 'M0-14V-38M-12-26L0-38L12-26' }, up);
mk('text', { class: 'hub-lb hub-up-lb', y: 24 }, up).textContent = 'Upload';
mk('path', { class: 'hub-ic', d: 'M-10-38L10-18M10-38L-10-18' }, xx);
mk('text', { class: 'hub-lb', y: 24 }, xx).textContent = 'Close';
const upLabel = up.querySelector('.hub-up-lb');

/* ---------- operation rules ---------- */
const stats = () => { const pdf = files.filter(f => f.ext === '.pdf').length; return { n: files.length, pdf, ppt: files.length - pdf }; };
const ok = label => ({ ok: true, label }), no = reason => ({ ok: false, reason });
function describe(op) {
  const s = stats(), two = s.n < 2 ? no('Add at least 2 files to merge') : null;
  switch (op) {
    case 'merge': return two || ok('merge');
    case 'merge:pdf': return two || (s.ppt ? no('Queue has presentations. Use Mixed.') : ok('merge into a PDF'));
    case 'merge:pptx': return two || (s.pdf ? no('Queue has PDFs. Use Mixed.') : ok('merge into a PPTX'));
    case 'merge:mixed': return two || ok('merge into a PDF');
    case 'convert': case 'convert:word': case 'convert:ppt': {
      if (!s.pdf) return no('Convert needs at least one PDF');
      const t = op === 'convert:word' ? 'Word' : 'PowerPoint';
      return ok(op === 'convert' ? 'convert' : `convert ${s.pdf} PDF${s.pdf > 1 ? 's' : ''} to ${t}`);
    }
  }
}

/* ---------- ring open / close / expand ---------- */
function setExpanded(g) { expanded = g; con.dataset.exp = g || ''; syncFocus(); }
function syncFocus() {
  ring.querySelectorAll('.petal').forEach(p => {
    const vis = isOpen && (p.classList.contains('main') || p.dataset.parent === expanded);
    p.tabIndex = vis ? 0 : -1;
  });
}
function openRing() { if (busy || !files.length) return false; isOpen = true; con.classList.add('is-open'); syncFocus(); caption_(); return true; }
function closeRing() { isOpen = false; con.classList.remove('is-open'); setExpanded(null); setHover(null); caption_(); }
function caption_() {
  caption.textContent = busy ? 'Working on it…' : !files.length ? 'Tap Upload or drop PDF and PPT files here. Up to 20 files.'
    : isOpen ? 'Drag your files onto Merge or Convert.' : 'Hold Upload to open Merge and Convert, then drag your files onto one.';
  upLabel.textContent = busy ? 'Working' : 'Upload';
}

function opAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) { const g = el.closest && el.closest('#ring [data-op]'); if (g) return g; }
  return null;
}
function setHover(g) {
  if (hoverEl) hoverEl.classList.remove('is-hover');
  hoverEl = g; if (g) g.classList.add('is-hover');
  const op = g && g.dataset.op;
  extEl.textContent = op && op.startsWith('merge:') ? (op === 'merge:pptx' ? '.pptx' : '.pdf') : defaultExt();
}
function hoverAt(x, y) {
  const g = opAt(x, y);
  if (g) { clearTimeout(collapseT); collapseT = null; const grp = g.dataset.op.split(':')[0]; if (expanded !== grp) setExpanded(grp); setHover(g); }
  else { setHover(null); if (expanded && !collapseT) collapseT = setTimeout(() => { collapseT = null; setExpanded(null); }, 400); }
  return g;
}

/* ---------- hub: tap = upload, hold = open ---------- */
let holdT = null, held = false;
hub.addEventListener('pointerdown', e => {
  if (busy || e.button > 0) return;
  held = false; clearTimeout(holdT);
  if (files.length) holdT = setTimeout(() => { held = true; if (!isOpen) openRing(); }, HOLD_MS);
});
hub.addEventListener('pointerleave', () => clearTimeout(holdT));
hub.addEventListener('pointerup', () => { clearTimeout(holdT); if (busy) return; if (held) { held = false; return; } isOpen ? closeRing() : fileInput.click(); });
hub.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (openRing()) ring.querySelector('.petal.main').focus(); }
});
hub.addEventListener('contextmenu', e => e.preventDefault());

ring.addEventListener('click', e => { const g = e.target.closest('[data-op]'); if (g) activate(g.dataset.op); });
ring.addEventListener('keydown', e => {
  const g = e.target.closest && e.target.closest('[data-op]');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(g.dataset.op); }
});
function activate(op) {
  if (!isOpen || busy) return;
  const d = describe(op);
  if (!op.includes(':')) { setExpanded(expanded === op ? null : op); const k = ring.querySelector(`.petal[data-parent="${op}"]`); if (k && expanded) setTimeout(() => k.focus(), 60); return; }
  if (!d.ok) { toast(d.reason, 'error'); return; }
  closeRing(); runOp(op);
}
document.addEventListener('pointerdown', e => { if (isOpen && !drag && !con.contains(e.target) && !e.target.closest('#file-list')) closeRing(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (drag) endDrag(false, e); else if (isOpen) { closeRing(); hub.focus(); } } });

/* ---------- queue drag: reorder (handle) or carry all files (row) ---------- */
let drag = null;
const dragMoveFn = e => onMove(e), dragUpFn = e => endDrag(true, e), dragCancelFn = () => endDrag(false);
fileList.addEventListener('pointerdown', e => {
  if (busy || e.button > 0) return;
  const row = e.target.closest('.file-row'); if (!row || e.target.closest('.icon-btn')) return;
  drag = { mode: e.target.closest('.drag-handle') ? 'reorder' : 'queue', id: row.dataset.id, row, x0: e.clientX, y0: e.clientY, on: false, chip: null, auto: false, target: null };
  window.addEventListener('pointermove', dragMoveFn); window.addEventListener('pointerup', dragUpFn); window.addEventListener('pointercancel', dragCancelFn);
});
function onMove(e) {
  if (!drag) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < SLOP) return;
    drag.on = true; document.body.classList.add('is-dragging'); drag.row.classList.add('dragging');
    if (drag.mode === 'queue') {
      drag.auto = !isOpen; if (!isOpen) openRing(); fileList.classList.add('lifting');
      drag.chip = document.createElement('div'); drag.chip.className = 'drag-chip';
      drag.chip.innerHTML = `<span>⧉ ${files.length} file${files.length > 1 ? 's' : ''}</span><span class="msg"></span>`; document.body.appendChild(drag.chip);
    }
  }
  if (drag.mode === 'queue') {
    drag.chip.style.left = e.clientX + 'px'; drag.chip.style.top = e.clientY + 'px';
    const g = hoverAt(e.clientX, e.clientY), op = g && g.dataset.op, d = op ? describe(op) : null;
    drag.chip.dataset.state = d ? (d.ok ? 'ok' : 'bad') : '';
    drag.chip.lastChild.textContent = !d ? 'Move onto Merge or Convert' : !d.ok ? d.reason : op.includes(':') ? `Release to ${d.label}` : 'Pick a format';
  } else {
    fileList.querySelectorAll('.drag-target').forEach(r => r.classList.remove('drag-target'));
    const r = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.classList && x.classList.contains('file-row') && x !== drag.row);
    drag.target = r ? r.dataset.id : null; if (r) r.classList.add('drag-target');
  }
}
function endDrag(commit, e) {
  if (!drag) return;
  const d = drag; drag = null;
  window.removeEventListener('pointermove', dragMoveFn); window.removeEventListener('pointerup', dragUpFn); window.removeEventListener('pointercancel', dragCancelFn);
  document.body.classList.remove('is-dragging'); fileList.classList.remove('lifting');
  d.row.classList.remove('dragging'); fileList.querySelectorAll('.drag-target').forEach(r => r.classList.remove('drag-target'));
  if (d.chip) d.chip.remove();
  if (!d.on) return;
  if (d.mode === 'reorder') {
    if (commit && d.target) { const a = files.findIndex(f => f.id === d.id), b = files.findIndex(f => f.id === d.target); files.splice(b, 0, files.splice(a, 1)[0]); render(); saveOrder(); }
    return;
  }
  const g = commit && e ? opAt(e.clientX, e.clientY) : null, op = g && g.dataset.op;
  setHover(null);
  if (op && op.includes(':')) { const v = describe(op); if (!v.ok) { toast(v.reason, 'error'); if (d.auto) closeRing(); return; } closeRing(); runOp(op); }
  else if (d.auto) closeRing();
}

/* ---------- upload ---------- */
fileInput.addEventListener('change', () => { uploadFiles(fileInput.files); });
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; con.classList.add('file-over'); } });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; con.classList.remove('file-over'); } });
window.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; con.classList.remove('file-over'); uploadFiles(e.dataTransfer.files); });

async function uploadFiles(list) {
  const form = new FormData(); let n = 0;
  for (const f of list) {
    if (!['pdf', 'pptx', 'ppt'].includes(f.name.split('.').pop().toLowerCase()) || files.length + n >= MAX) continue;
    form.append('files', f); n++;
  }
  fileInput.value = '';
  if (!n) { toast(files.length >= MAX ? `Queue is full (${MAX} files).` : 'Only PDF, PPTX and PPT files are accepted.', 'error'); return; }
  progress(true);
  try {
    const d = await (await fetch('/upload', { method: 'POST', body: form })).json();
    if (d.error) { toast(d.error, 'error'); return; }
    files = [...files, ...d.added]; render(); toast(`Added ${d.added.length} file${d.added.length > 1 ? 's' : ''}`, 'success');
  } catch (_) { toast('Upload failed.', 'error'); } finally { progress(false); }
}
async function post(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
const saveOrder = () => post('/reorder', { ids: files.map(f => f.id) }).catch(() => {});
fileList.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.file-row').dataset.id, i = files.findIndex(f => f.id === id);
  if (b.dataset.act === 'rm') { post('/remove', { id }).catch(() => {}); files.splice(i, 1); if (!files.length) closeRing(); render(); }
  else { const j = i + (b.dataset.act === 'up' ? -1 : 1); if (j < 0 || j >= files.length) return; [files[i], files[j]] = [files[j], files[i]]; render(); saveOrder(); }
});
clearBtn.addEventListener('click', () => { post('/clear').catch(() => {}); files = []; closeRing(); render(); });

/* ---------- run an operation ---------- */
async function runOp(op) {
  const [kind, sub] = op.split(':'); busy = true; con.classList.add('busy'); caption_(); progress(true);
  try {
    let r, fallback;
    if (kind === 'merge') {
      const name = nameIn.value.trim() || 'merged';
      r = await post('/merge', { filename: name, mode: sub }); fallback = name + (sub === 'pptx' ? '.pptx' : '.pdf');
    } else {
      const ids = files.filter(f => f.ext === '.pdf').map(f => f.id);
      r = await post(`/convert/${sub}`, { ids }); fallback = ids.length > 1 ? `converted_${sub}.zip` : 'converted';
    }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Operation failed.');
    const blob = await r.blob(), cd = r.headers.get('Content-Disposition') || '', m = cd.match(/filename="?([^";]+)"?/i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m ? m[1] : fallback;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const skipped = kind === 'convert' ? stats().ppt : 0;
    toast(skipped ? `Download started. Skipped ${skipped} non-PDF file${skipped > 1 ? 's' : ''}.` : 'Download started', 'success');
  } catch (err) { toast(err.message || 'Operation failed.', 'error'); }
  finally { busy = false; con.classList.remove('busy'); progress(false); caption_(); }
}

/* ---------- render ---------- */
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const defaultExt = () => { const s = stats(); return s.n && !s.pdf ? '.pptx' : '.pdf'; };
function render() {
  const s = stats(), was = queue.hidden;
  queue.hidden = !files.length; if (was && files.length) { queue.classList.remove('enter'); void queue.offsetWidth; queue.classList.add('enter'); }
  stage.classList.toggle('has-files', !!files.length); con.classList.toggle('has-files', !!files.length);
  countEl.textContent = files.length;
  fileList.innerHTML = files.map((f, i) => { const k = f.ext === '.pdf' ? 'pdf' : 'pptx';
    return `<div class="file-row" data-id="${esc(f.id)}"><span class="drag-handle" title="Drag to reorder">⣿</span><span class="row-index ${k}">${i + 1}</span>
      <span class="row-name" title="${esc(f.name)}">${esc(f.name)}</span><span class="row-ext ${k}">${f.ext.slice(1).toUpperCase()}</span>
      <div class="row-btns"><button class="icon-btn" data-act="up" title="Move up">▲</button><button class="icon-btn" data-act="dn" title="Move down">▼</button><button class="icon-btn remove" data-act="rm" title="Remove">✕</button></div></div>`; }).join('');
  badge.style.display = files.length ? 'block' : 'none';
  badge.className = !s.ppt ? 'pdf' : !s.pdf ? 'pptx' : 'mixed';
  badge.textContent = !s.ppt ? 'All PDFs: merge as PDF' : !s.pdf ? 'All presentations: merge as PPTX, or Mixed for a PDF' : 'Mixed formats: choose Mixed to merge into one PDF';
  extEl.textContent = defaultExt();
  ring.querySelectorAll('.petal').forEach(g => { const d = describe(g.dataset.op);
    g.classList.toggle('disabled', !d.ok); g.setAttribute('aria-disabled', !d.ok); g.querySelector('title').textContent = d.ok ? g.dataset.op : d.reason; });
  caption_();
}

/* ---------- helpers ---------- */
const progress = on => { progW.className = 'progress-wrap' + (on ? ' active indeterminate' : ''); };
let toastT; function toast(msg, type = '') { clearTimeout(toastT); toastEl.textContent = msg; toastEl.className = 'show ' + type; toastT = setTimeout(() => toastEl.className = '', 3200); }

/* ---------- neural noise background (WebGL) ---------- */
(function neuralBackground() {
  const cv = $('bg-noise'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes, uM; uniform float uT, uE, uS;
mat2 R(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float neuro(vec2 uv, float t) {
  vec2 acc = vec2(0.), res = vec2(0.); float sc = 6.;
  for (int j = 0; j < 14; j++) {
    uv = R(1.) * uv; acc = R(1.) * acc;
    vec2 l = uv * sc + float(j) + acc - t;
    acc += sin(l);
    res += (.5 + .5 * cos(l)) / sc;
    sc *= 1.2;
  }
  return res.x + res.y;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  vec2 m = (uM * uRes - .5 * uRes) / uRes.y, d = uv - m;
  float well = exp(-dot(d, d) * 7.);
  uv -= d * well * (.25 + .5 * uE);
  uv.y += uS * .35;
  float n = neuro(uv * .75, uT * .3);
  float v = pow(clamp((n - .45) / .85, 0., 1.), 2.2);
  v = clamp(v * (.75 + well * 1.4 + uE * .6), 0., 1.4);
  vec3 ink = vec3(.09, .05, .23), uvc = vec3(.48, .36, 1.), rose = vec3(1., .24, .55), ember = vec3(1., .48, .27);
  vec3 c = mix(uvc, rose, smoothstep(-.7, .7, uv.x + .3 * sin(uT * .2)));
  c = mix(c, ember, smoothstep(.45, 1., v) * .8 + well * .25);
  vec3 col = ink + c * v * .9 + ember * well * .1;
  vec2 q = gl_FragCoord.xy / uRes - .5;
  gl_FragColor = vec4(col * (1. - .7 * dot(q, q)), 1.);
}`;
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); return; }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n), uRes = U('uRes'), uM = U('uM'), uT = U('uT'), uE = U('uE'), uS = U('uS');

  const Q = .45; // render at ~half resolution; the haze doesn't need more
  const resize = () => { cv.width = Math.ceil(innerWidth * Q); cv.height = Math.ceil(innerHeight * Q); gl.viewport(0, 0, cv.width, cv.height); };
  resize(); addEventListener('resize', resize);
  let mx = .5, my = .5, sx = .5, sy = .5, energy = 0;
  if (!still) addEventListener('pointermove', e => { mx = e.clientX / innerWidth; my = 1 - e.clientY / innerHeight; });

  let n = 0;
  function frame(now) {
    if (drag || (isOpen && n++ % 3)) { requestAnimationFrame(frame); return; } // hold still while dragging, ease off while the ring is open
    sx += (mx - sx) * .08; sy += (my - sy) * .08;
    energy += (Math.min(1, Math.hypot(mx - sx, my - sy) * 18) - energy) * .08;
    gl.uniform2f(uRes, cv.width, cv.height); gl.uniform2f(uM, sx, sy);
    gl.uniform1f(uT, still ? 4 : now * .001); gl.uniform1f(uE, energy); gl.uniform1f(uS, scrollY / innerHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!isOpen && !drag && !still) con.style.transform = `perspective(1100px) rotateY(${(sx - .5) * 7}deg) rotateX(${(sy - .5) * 6}deg)`;
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

fetch('/files').then(r => r.json()).then(d => { files = d.files || []; render(); }).catch(() => render());
})();
