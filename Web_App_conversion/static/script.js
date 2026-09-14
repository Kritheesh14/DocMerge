function enterApp() {
  const welcome = document.getElementById('welcome-page');
  const app = document.getElementById('app-page');
  welcome.classList.add('exiting');
  setTimeout(() => {
    welcome.style.display = 'none';
    app.classList.add('visible');
  }, 650);
}

function goBack() {
  const welcome = document.getElementById('welcome-page');
  const app = document.getElementById('app-page');
  app.classList.remove('visible');
  app.style.display = 'none';
  welcome.style.display = '';
  welcome.classList.remove('exiting');
  welcome.style.opacity = '1';
  welcome.style.transform = 'none';
}

let files = [];
let dragSrc = null;

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const fileList   = document.getElementById('file-list');
const countEl    = document.getElementById('count');
const modeBadge  = document.getElementById('mode-badge');
const filenameIn = document.getElementById('filename-input');
const extPreview = document.getElementById('ext-preview');
const mergeBtn   = document.getElementById('merge-btn');
const clearBtn   = document.getElementById('clear-btn');
const progressW  = document.getElementById('progress-wrap');
const progressB  = document.getElementById('progress-bar');
const toast      = document.getElementById('toast');

(async () => { await loadFiles(); })();

async function loadFiles() {
  try {
    const r = await fetch('/files');
    const d = await r.json();
    files = d.files || [];
    render();
  } catch(e) { /* offline / standalone preview */ }
}

fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  uploadFiles(e.dataTransfer.files);
});

async function uploadFiles(fileObjs) {
  if (!fileObjs.length) return;
  const form = new FormData();
  let count = 0;
  for (const f of fileObjs) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['pdf','pptx','ppt'].includes(ext)) continue;
    if (files.length + count >= 20) break;
    form.append('files', f);
    count++;
  }
  if (!count) { showToast('Only PDF, PPTX, and PPT files are accepted.', 'error'); return; }
  setProgress(true, true);
  try {
    const r = await fetch('/upload', { method: 'POST', body: form });
    const d = await r.json();
    setProgress(false);
    if (d.error) { showToast(d.error, 'error'); return; }
    files = [...files, ...d.added];
    render();
    showToast(`Added ${d.added.length} file${d.added.length > 1 ? 's' : ''}`, 'success');
  } catch(e) { setProgress(false); showToast('Upload failed.', 'error'); }
  fileInput.value = '';
}

async function removeFile(id) {
  try {
    await fetch('/remove', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) });
  } catch(e) {}
  files = files.filter(f => f.id !== id);
  render();
}

clearBtn.addEventListener('click', async () => {
  try { await fetch('/clear', { method: 'POST' }); } catch(e) {}
  files = [];
  render();
});

async function saveOrder() {
  try {
    await fetch('/reorder', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ids: files.map(f => f.id)}) });
  } catch(e) {}
}

function moveFile(id, dir) {
  const i = files.findIndex(f => f.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= files.length) return;
  [files[i], files[j]] = [files[j], files[i]];
  render();
  saveOrder();
}

mergeBtn.addEventListener('click', async () => {
  if (files.length < 2) { showToast('Add at least 2 files to merge.', 'error'); return; }
  mergeBtn.disabled = true;
  mergeBtn.textContent = 'Merging...';
  setProgress(true, true);
  const outName = filenameIn.value.trim() || 'merged';
  try {
    const r = await fetch('/merge', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ filename: outName })
    });
    setProgress(false);
    mergeBtn.disabled = false;
    mergeBtn.textContent = 'Merge Files';
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      showToast(d.error || 'Merge failed.', 'error');
      return;
    }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const cd   = r.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/);
    a.download = match ? match[1] : `${outName}${extPreview.textContent}`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Download started', 'success');
  } catch(e) {
    setProgress(false);
    mergeBtn.disabled = false;
    mergeBtn.textContent = 'Merge Files';
    showToast('Merge failed.', 'error');
  }
});

function render() {
  countEl.textContent = files.length;
  mergeBtn.disabled = files.length < 2;
  const exts = [...new Set(files.map(f => f.ext))];
  const allPdf  = exts.every(e => e === '.pdf');
  const allPptx = exts.every(e => e === '.pptx' || e === '.ppt');
  if (files.length === 0) {
    modeBadge.style.display = 'none';
    extPreview.textContent = '.pdf';
  } else {
    modeBadge.style.display = 'block';
    if (allPdf) {
      modeBadge.className = 'pdf';
      modeBadge.textContent = 'All PDFs detected — output will be a merged PDF';
      extPreview.textContent = '.pdf';
    } else if (allPptx) {
      modeBadge.className = 'pptx';
      modeBadge.textContent = 'All presentations detected — output will be a merged PPTX';
      extPreview.textContent = '.pptx';
    } else {
      modeBadge.className = 'mixed';
      modeBadge.textContent = 'Mixed formats — PPTXs will be converted to PDF, then merged';
      extPreview.textContent = '.pdf';
    }
  }
  if (files.length === 0) {
    fileList.innerHTML = '<div class="empty-state">No files yet — add some above</div>';
    return;
  }
  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const extKey = f.ext === '.pdf' ? 'pdf' : 'pptx';
    const row    = document.createElement('div');
    row.className = 'file-row';
    row.dataset.id = f.id;
    row.draggable = true;
    row.innerHTML = `
      <span class="drag-handle">⣿</span>
      <span class="row-index ${extKey}">${i + 1}</span>
      <span class="row-name" title="${f.name}">${f.name}</span>
      <span class="row-ext ${extKey}">${f.ext.replace('.','').toUpperCase()}</span>
      <div class="row-btns">
        <button class="icon-btn" title="Move up"   onclick="moveFile('${f.id}',-1)">▲</button>
        <button class="icon-btn" title="Move down" onclick="moveFile('${f.id}',1)">▼</button>
        <button class="icon-btn remove" title="Remove" onclick="removeFile('${f.id}')">✕</button>
      </div>`;
    row.addEventListener('dragstart', () => { dragSrc = f.id; row.classList.add('dragging'); });
    row.addEventListener('dragend',   () => row.classList.remove('dragging'));
    row.addEventListener('dragover',  e => { e.preventDefault(); row.classList.add('drag-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-target'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-target');
      if (!dragSrc || dragSrc === f.id) return;
      const fromIdx = files.findIndex(x => x.id === dragSrc);
      const toIdx   = files.findIndex(x => x.id === f.id);
      files.splice(toIdx, 0, files.splice(fromIdx, 1)[0]);
      render();
      saveOrder();
    });
    fileList.appendChild(row);
  });
}

function setProgress(active, indeterminate = false) {
  progressW.className = 'progress-wrap' + (active ? ' active' : '') + (indeterminate ? ' indeterminate' : '');
  if (!active) progressB.style.width = '0%';
}

let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'show' + (type ? ' ' + type : '');
  toastTimer = setTimeout(() => { toast.className = ''; }, 3200);
}

/* ============================================
   DOCUMENT TOOL STATE
============================================ */
let activeTool = 'merge';