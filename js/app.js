'use strict';

// ── State ──────────────────────────────────────────────────────────────────────

const State = {
    settings: { kerf: 3, allowRotation: true, snapToGrid: false },
    sheets: [],
    parts: [],
    results: null,
    ui: {
        activeResultIdx: 0,
        activeInstanceIdx: 0,
    },
};

let _sheetEditId  = null;  // null = adding new
let _partEditId   = null;

const optimizer = new CutlistOptimizer();
const csvParser  = new CSVParser();
const pdfExp     = new PDFExporter();
let   renderer   = null;

// ── Colour helpers ─────────────────────────────────────────────────────────────

const SHEET_COLORS = ['#d4a76a','#c4a882','#b5c3a0','#a0b8c5','#c5a0b8'];
let _sheetColorIdx = 0;

function nextSheetColor() {
    return SHEET_COLORS[_sheetColorIdx++ % SHEET_COLORS.length];
}

// ── ID generation ──────────────────────────────────────────────────────────────

function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
}

// ── Boot ───────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('main-canvas');
    renderer = new CutlistRenderer(canvas);
    renderer.onZoomChange = z => {
        document.getElementById('stat-zoom').textContent = `${Math.round(z * 100)}%`;
    };
    renderer.onSelectionChange = pl => updateSelectionInfo(pl);
    renderer.onMoved = (pl, ok) => {
        if (ok) showToast('Del flyttet.', 'info');
        else    showToast('Overlapp – posisjon tilbakestilt.', 'warn');
        updateStats();
    };
    renderer.onDblClick = hit => {
        if (!hit) return;
        renderer.selected = hit;
        renderer.render();
        _tryRotate();
    };

    bindTopBarEvents();
    bindSettingsEvents();
    bindSheetEvents();
    bindPartEvents();
    bindCanvasControls();

    renderSidebar();
});

// ── Demo data ─────────────────────────────────────────────────────────────────

function loadDemo() {
    State.sheets = [
        { id: uid('s'), name: 'Kryssfiner 18mm', width: 2440, height: 1220, qty: 3, color: '#d4a76a' },
        { id: uid('s'), name: 'MDF 12mm',        width: 2440, height: 1220, qty: 2, color: '#c4a882' },
    ];
    State.parts = [
        { id: uid('p'), name: 'Sideplate',  width: 800,  height: 600,  qty: 4, material: 'Kryssfiner 18mm' },
        { id: uid('p'), name: 'Topp/Bunn',  width: 800,  height: 400,  qty: 4, material: 'Kryssfiner 18mm' },
        { id: uid('p'), name: 'Hylle',      width: 760,  height: 380,  qty: 6, material: 'Kryssfiner 18mm' },
        { id: uid('p'), name: 'Bakplate',   width: 790,  height: 590,  qty: 2, material: 'MDF 12mm' },
        { id: uid('p'), name: 'Dør',        width: 400,  height: 590,  qty: 4, material: 'MDF 12mm' },
    ];
    renderSidebar();
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function bindTopBarEvents() {
    document.getElementById('btn-import-csv').addEventListener('click', () => {
        document.getElementById('csv-file-input').click();
    });
    document.getElementById('csv-file-input').addEventListener('change', handleCSVImport);
    document.getElementById('btn-optimize').addEventListener('click', runOptimizer);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-import-demo').addEventListener('click', () => {
        loadDemo();
        showToast('Demo-data lastet.', 'info');
    });
}

async function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
        const text = await file.text();
        const { sheets, parts } = csvParser.parse(text);

        if (sheets.length > 0) {
            sheets.forEach(s => s.color = s.color || nextSheetColor());
            State.sheets.push(...sheets);
        }
        if (parts.length > 0) State.parts.push(...parts);

        renderSidebar();
        showToast(`Importerte ${parts.length} deler${sheets.length ? ' og ' + sheets.length + ' plater' : ''}.`, 'success');
    } catch (err) {
        showToast('CSV-feil: ' + err.message, 'error');
    }
}

// ── Settings ──────────────────────────────────────────────────────────────────

function bindSettingsEvents() {
    document.getElementById('kerf').addEventListener('input', e => {
        State.settings.kerf = parseFloat(e.target.value) || 0;
    });
    document.getElementById('allow-rotation').addEventListener('change', e => {
        State.settings.allowRotation = e.target.checked;
    });
    document.getElementById('snap-to-grid').addEventListener('change', e => {
        State.settings.snapToGrid = e.target.checked;
        renderer.snapEnabled = e.target.checked;
        renderer.render();
    });
}

// ── Optimizer ─────────────────────────────────────────────────────────────────

function runOptimizer() {
    if (!State.sheets.length) { showToast('Legg til minst én plate først.', 'warn'); return; }
    if (!State.parts.length)  { showToast('Legg til minst én del først.', 'warn'); return; }

    const btn = document.getElementById('btn-optimize');
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Beregner…';

    // Run async so UI can repaint
    setTimeout(() => {
        try {
            State.results = optimizer.optimize(State.sheets, State.parts, State.settings);
            State.ui.activeResultIdx   = 0;
            State.ui.activeInstanceIdx = 0;
            renderResults();
            showToast(`Ferdig! ${State.results.totalSheets} plater, ${State.results.totalEfficiency.toFixed(1)}% effektivitet.`, 'success');
        } catch (err) {
            showToast('Optimeringsfeil: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.querySelector('.btn-label').textContent = 'Optimaliser';
        }
    }, 30);
}

// ── PDF export ────────────────────────────────────────────────────────────────

function exportPDF() {
    if (!State.results) { showToast('Kjør optimaliseringen først.', 'warn'); return; }
    try {
        pdfExp.export(State.results, State.settings);
        showToast('PDF eksportert.', 'success');
    } catch (err) {
        showToast('PDF-feil: ' + err.message, 'error');
    }
}

// ── Results rendering ─────────────────────────────────────────────────────────

function renderResults() {
    const res = State.results;
    if (!res) return;

    const tabBar = document.getElementById('sheet-tabs');
    tabBar.innerHTML = '';

    // Flatten all instances into tabs
    const allInstances = [];
    for (const sr of res.sheetResults) {
        for (const inst of sr.instances) {
            allInstances.push({ sr, inst });
        }
    }

    allInstances.forEach(({ sr, inst }, idx) => {
        const tab = document.createElement('button');
        tab.className = 'sheet-tab' + (idx === 0 ? ' active' : '');
        tab.innerHTML = `<span>${sr.sheetDef.name} #${inst.index + 1}</span>
                         <span class="tab-eff">${inst.efficiency.toFixed(0)}%</span>`;
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            showInstance(inst);
        });
        tabBar.appendChild(tab);
    });

    document.getElementById('canvas-empty-state').style.display = 'none';

    if (allInstances.length > 0) {
        showInstance(allInstances[0].inst);
    }

    updateStats();

    if (res.unplaced.length > 0) {
        showToast(`${res.unplaced.length} del(er) fikk ikke plass – sjekk platedimensjoner.`, 'warn');
    }
}

function showInstance(inst) {
    renderer.setInstance(inst, State.settings.kerf);
    updateStats();
}

function updateStats() {
    const inst = renderer.instance;
    if (!inst) return;

    document.getElementById('stat-current-sheet').textContent =
        `${inst.sheetDef.name} #${inst.index + 1}`;
    document.getElementById('stat-efficiency').textContent =
        `${inst.efficiency.toFixed(1)}%`;
    document.getElementById('stat-parts-placed').textContent =
        inst.placements.length;
    document.getElementById('stat-unplaced').textContent =
        State.results ? State.results.unplaced.length : '-';
}

function updateSelectionInfo(pl) {
    // Future: show detail panel
}

// ── Sheet CRUD ────────────────────────────────────────────────────────────────

function bindSheetEvents() {
    document.getElementById('btn-add-sheet').addEventListener('click', e => { e.stopPropagation(); openSheetModal(null); });
    document.getElementById('btn-save-sheet').addEventListener('click', saveSheet);
    document.getElementById('btn-cancel-sheet').addEventListener('click', closeSheetModal);
    document.getElementById('btn-close-sheet-modal').addEventListener('click', closeSheetModal);
    document.getElementById('sheet-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeSheetModal();
    });
}

function openSheetModal(id) {
    _sheetEditId = id;
    const modal = document.getElementById('sheet-modal');
    const title = document.getElementById('sheet-modal-title');
    if (id) {
        const s = State.sheets.find(s => s.id === id);
        title.textContent = 'Rediger plate';
        document.getElementById('sheet-name').value  = s.name;
        document.getElementById('sheet-width').value = s.width;
        document.getElementById('sheet-height').value= s.height;
        document.getElementById('sheet-qty').value   = s.qty;
        document.getElementById('sheet-color').value = s.color;
    } else {
        title.textContent = 'Legg til plate';
        document.getElementById('sheet-name').value  = '';
        document.getElementById('sheet-width').value = 2440;
        document.getElementById('sheet-height').value= 1220;
        document.getElementById('sheet-qty').value   = 1;
        document.getElementById('sheet-color').value = nextSheetColor();
    }
    modal.classList.remove('hidden');
    document.getElementById('sheet-name').focus();
}

function closeSheetModal() {
    document.getElementById('sheet-modal').classList.add('hidden');
}

function saveSheet() {
    const name  = document.getElementById('sheet-name').value.trim();
    const width = parseFloat(document.getElementById('sheet-width').value);
    const height= parseFloat(document.getElementById('sheet-height').value);
    const qty   = parseInt(document.getElementById('sheet-qty').value,10);
    const color = document.getElementById('sheet-color').value;

    if (!name || !width || !height || qty < 1) {
        showToast('Fyll ut alle felt korrekt.', 'warn'); return;
    }

    if (_sheetEditId) {
        const s = State.sheets.find(s => s.id === _sheetEditId);
        Object.assign(s, { name, width, height, qty, color });
    } else {
        State.sheets.push({ id: uid('s'), name, width, height, qty, color });
    }

    closeSheetModal();
    renderSidebar();
    showToast(`Plate "${name}" lagret.`, 'success');
}

// ── Part CRUD ─────────────────────────────────────────────────────────────────

function bindPartEvents() {
    document.getElementById('btn-add-part').addEventListener('click', e => { e.stopPropagation(); openPartModal(null); });
    document.getElementById('btn-save-part').addEventListener('click', savePart);
    document.getElementById('btn-cancel-part').addEventListener('click', closePartModal);
    document.getElementById('btn-close-part-modal').addEventListener('click', closePartModal);
    document.getElementById('part-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closePartModal();
    });
}

function openPartModal(id) {
    _partEditId = id;
    const modal = document.getElementById('part-modal');
    const title = document.getElementById('part-modal-title');

    // Populate material dropdown
    const sel = document.getElementById('part-material');
    sel.innerHTML = '<option value="">Ingen spesifikk</option>';
    for (const s of State.sheets) {
        const opt = document.createElement('option');
        opt.value = s.name; opt.textContent = s.name;
        sel.appendChild(opt);
    }

    if (id) {
        const p = State.parts.find(p => p.id === id);
        title.textContent = 'Rediger del';
        document.getElementById('part-name').value  = p.name;
        document.getElementById('part-width').value = p.width;
        document.getElementById('part-height').value= p.height;
        document.getElementById('part-qty').value   = p.qty;
        sel.value = p.material || '';
    } else {
        title.textContent = 'Legg til del';
        document.getElementById('part-name').value  = '';
        document.getElementById('part-width').value = '';
        document.getElementById('part-height').value= '';
        document.getElementById('part-qty').value   = 1;
        sel.value = State.sheets[0]?.name || '';
    }
    modal.classList.remove('hidden');
    document.getElementById('part-name').focus();
}

function closePartModal() {
    document.getElementById('part-modal').classList.add('hidden');
}

function savePart() {
    const name    = document.getElementById('part-name').value.trim();
    const width   = parseFloat(document.getElementById('part-width').value);
    const height  = parseFloat(document.getElementById('part-height').value);
    const qty     = parseInt(document.getElementById('part-qty').value, 10);
    const material= document.getElementById('part-material').value;

    if (!name || !width || !height || qty < 1) {
        showToast('Fyll ut alle felt korrekt.', 'warn'); return;
    }

    if (_partEditId) {
        const p = State.parts.find(p => p.id === _partEditId);
        Object.assign(p, { name, width, height, qty, material });
    } else {
        State.parts.push({ id: uid('p'), name, width, height, qty, material });
    }

    closePartModal();
    renderSidebar();
    showToast(`Del "${name}" lagret.`, 'success');
}

// ── Sidebar rendering ─────────────────────────────────────────────────────────

function renderSidebar() {
    renderSheetList();
    renderPartList();
}

function renderSheetList() {
    const el = document.getElementById('sheets-list');
    if (!State.sheets.length) {
        el.innerHTML = '<p class="empty-hint">Ingen plater lagt til ennå.</p>';
        return;
    }
    el.innerHTML = State.sheets.map(s => `
        <div class="list-item" data-id="${s.id}">
            <span class="color-dot" style="background:${s.color}"></span>
            <span class="item-name">${s.name}</span>
            <span class="item-meta">${s.width}×${s.height} ×${s.qty}</span>
            <div class="item-actions">
                <button class="icon-btn" onclick="openSheetModal('${s.id}')" title="Rediger">
                    <span class="material-icons">edit</span>
                </button>
                <button class="icon-btn danger" onclick="deleteSheet('${s.id}')" title="Slett">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

function renderPartList() {
    const el = document.getElementById('parts-list');
    if (!State.parts.length) {
        el.innerHTML = '<p class="empty-hint">Ingen deler lagt til ennå.</p>';
        return;
    }

    const totalQty = State.parts.reduce((s, p) => s + (p.qty || 1), 0);
    const countEl = document.getElementById('parts-count');
    if (countEl) countEl.textContent = totalQty;

    el.innerHTML = State.parts.map(p => `
        <div class="list-item" data-id="${p.id}">
            <span class="item-name">${p.name}</span>
            <span class="item-meta">${p.width}×${p.height}  ×${p.qty}</span>
            ${p.material ? `<span class="item-badge">${p.material}</span>` : ''}
            <div class="item-actions">
                <button class="icon-btn" onclick="openPartModal('${p.id}')" title="Rediger">
                    <span class="material-icons">edit</span>
                </button>
                <button class="icon-btn danger" onclick="deletePart('${p.id}')" title="Slett">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

function deleteSheet(id) {
    if (!confirm('Slett denne platen?')) return;
    State.sheets = State.sheets.filter(s => s.id !== id);
    renderSidebar();
}

function deletePart(id) {
    State.parts = State.parts.filter(p => p.id !== id);
    renderSidebar();
}

// ── Canvas controls ───────────────────────────────────────────────────────────

function bindCanvasControls() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => renderer.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => renderer.zoomOut());
    document.getElementById('btn-zoom-fit').addEventListener('click', () => renderer.fitToScreen());

    window.addEventListener('keydown', e => {
        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (renderer.selected) _tryRotate();
        }
    });
}

function _tryRotate() {
    if (!State.settings.allowRotation) {
        showToast('Rotasjon er ikke tillatt – aktiver "Tillat rotasjon av deler".', 'warn');
        return;
    }
    const ok = renderer.rotateSelected();
    if (!ok) showToast('Kan ikke rotere – overlapp eller utenfor plate.', 'warn');
}

// ── Toast notifications ───────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
