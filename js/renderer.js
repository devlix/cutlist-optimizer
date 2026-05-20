'use strict';

class CutlistRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.instance = null;
        this.kerf = 3;

        this.zoom = 1;
        this.panX = 20;
        this.panY = 20;

        this.selected = null;
        this.drag = null;
        this.isPanning = false;
        this.lastMX = 0;
        this.lastMY = 0;

        this.onZoomChange = null;
        this.onSelectionChange = null;
        this.onMoved = null;

        this._bindEvents();
        this._watchResize();
    }

    setInstance(instance, kerf = 3) {
        this.instance = instance;
        this.kerf = kerf;
        this.selected = null;
        this.drag = null;
        this.fitToScreen();
    }

    fitToScreen() {
        if (!this.instance) return;
        const { width: sw, height: sh } = this.instance.sheetDef;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const pad = 48;
        this.zoom = Math.min((cw - pad * 2) / sw, (ch - pad * 2) / sh);
        this.panX = (cw - sw * this.zoom) / 2;
        this.panY = (ch - sh * this.zoom) / 2;
        this._emitZoom();
        this.render();
    }

    zoomIn()  { this._zoomAround(this.canvas.width/2, this.canvas.height/2, 1.25); }
    zoomOut() { this._zoomAround(this.canvas.width/2, this.canvas.height/2, 0.8); }

    render() {
        const ctx = this.ctx;
        const { width: cw, height: ch } = this.canvas;
        ctx.clearRect(0, 0, cw, ch);
        this._drawCheckerBg(cw, ch);
        if (!this.instance) return;
        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.zoom, this.zoom);
        this._drawSheet();
        this._drawPlacements();
        ctx.restore();
    }

    _drawCheckerBg(cw, ch) {
        const ctx = this.ctx;
        const cs = 20;
        for (let x = 0; x < cw; x += cs) {
            for (let y = 0; y < ch; y += cs) {
                ctx.fillStyle = ((x/cs + y/cs) % 2 === 0) ? '#e8e8e8' : '#f5f5f5';
                ctx.fillRect(x, y, cs, cs);
            }
        }
    }

    _drawSheet() {
        const ctx = this.ctx;
        const { width: sw, height: sh, color } = this.instance.sheetDef;
        ctx.shadowColor = 'rgba(0,0,0,.25)';
        ctx.shadowBlur  = 18 / this.zoom;
        ctx.shadowOffsetX = ctx.shadowOffsetY = 6 / this.zoom;
        ctx.fillStyle = color || '#d4a76a';
        ctx.fillRect(0, 0, sw, sh);
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#795548';
        ctx.lineWidth = 1.5 / this.zoom;
        ctx.strokeRect(0, 0, sw, sh);
        const fs = Math.max(11, 13 / this.zoom);
        ctx.fillStyle = '#4e342e';
        ctx.font = `${fs}px Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${sw} mm`, sw / 2, -6 / this.zoom);
        ctx.save();
        ctx.translate(-8 / this.zoom, sh / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'top';
        ctx.fillText(`${sh} mm`, 0, 0);
        ctx.restore();
    }

    _drawPlacements() {
        const ctx = this.ctx;
        if (!this.instance) return;

        for (const p of this.instance.placements) {
            const sel       = p === this.selected;
            const isDragged = this.drag?.p === p;
            const isInvalid = isDragged && this.drag.isInvalid;

            // Fill – red when dragged into a kerf-violation position
            ctx.fillStyle = isInvalid
                ? 'rgba(244,67,54,0.75)'
                : (p.color || '#90a4ae') + (sel ? 'ee' : 'cc');
            ctx.fillRect(p.x, p.y, p.width, p.height);

            // Border
            ctx.strokeStyle = isInvalid ? '#c62828'
                            : sel       ? '#1565c0'
                            : this._darken(p.color || '#90a4ae', 50);
            ctx.lineWidth = (isInvalid || sel ? 2.5 : 1) / this.zoom;
            ctx.strokeRect(p.x, p.y, p.width, p.height);

            // Kerf-zone: dashed outline showing the saw blade exclusion zone
            if (isDragged && this.kerf > 0) {
                const k = this.kerf;
                ctx.strokeStyle = isInvalid
                    ? 'rgba(198,40,40,0.55)'
                    : 'rgba(25,118,210,0.40)';
                ctx.lineWidth = 1 / this.zoom;
                ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
                ctx.strokeRect(p.x - k, p.y - k, p.width + k * 2, p.height + k * 2);
                ctx.setLineDash([]);
            }

            const screenW = p.width  * this.zoom;
            const screenH = p.height * this.zoom;
            if (screenW > 40 && screenH > 24) this._drawLabel(p, screenW, screenH);
            if (sel && !isDragged) this._drawHandles(p);
        }
    }

    _drawLabel(p, screenW, screenH) {
        const ctx = this.ctx;
        const fs = Math.max(8, Math.min(14, screenW / 8)) / this.zoom;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const light = this._isLight(p.color || '#90a4ae');
        ctx.font = `500 ${fs}px Roboto, Arial, sans-serif`;
        ctx.fillStyle = light ? '#1a1a1a' : '#ffffff';
        ctx.fillText(p.rotated ? `${p.partName} ↻` : p.partName, cx, cy - fs * 0.6);
        if (screenH > 38) {
            ctx.font = `${fs * 0.8}px Roboto, Arial, sans-serif`;
            ctx.fillStyle = light ? '#333' : '#ddd';
            ctx.fillText(`${p.width}×${p.height}`, cx, cy + fs * 0.7);
        }
    }

    _drawHandles(p) {
        const ctx = this.ctx;
        const hs = 5 / this.zoom;
        ctx.fillStyle = '#1565c0';
        for (const [hx, hy] of [
            [p.x, p.y], [p.x + p.width, p.y],
            [p.x, p.y + p.height], [p.x + p.width, p.y + p.height],
        ]) ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
    }

    _darken(hex, amt = 40) {
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
    }

    _isLight(hex) {
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return (r*299 + g*587 + b*114) / 1000 > 145;
    }

    _canvasToSheet(cx, cy) {
        return { x: (cx - this.panX) / this.zoom, y: (cy - this.panY) / this.zoom };
    }

    _hitTest(cx, cy) {
        if (!this.instance) return null;
        const { x: sx, y: sy } = this._canvasToSheet(cx, cy);
        return [...this.instance.placements].reverse().find(p =>
            sx >= p.x && sx <= p.x + p.width &&
            sy >= p.y && sy <= p.y + p.height
        ) || null;
    }

    _zoomAround(cx, cy, factor) {
        const nz = Math.max(0.05, Math.min(20, this.zoom * factor));
        this.panX = cx - (cx - this.panX) * (nz / this.zoom);
        this.panY = cy - (cy - this.panY) * (nz / this.zoom);
        this.zoom = nz;
        this._emitZoom();
        this.render();
    }

    _emitZoom() { if (this.onZoomChange) this.onZoomChange(this.zoom); }

    _bindEvents() {
        const c = this.canvas;
        c.addEventListener('wheel', e => {
            e.preventDefault();
            const r = c.getBoundingClientRect();
            this._zoomAround(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89);
        }, { passive: false });
        c.addEventListener('mousedown', e => this._onDown(e));
        c.addEventListener('mousemove', e => this._onMove(e));
        window.addEventListener('mouseup',  e => this._onUp(e));
    }

    _watchResize() {
        const ro = new ResizeObserver(() => {
            const p = this.canvas.parentElement;
            this.canvas.width  = p.clientWidth;
            this.canvas.height = p.clientHeight;
            this.render();
        });
        ro.observe(this.canvas.parentElement);
    }

    _cx(e) { return e.clientX - this.canvas.getBoundingClientRect().left; }
    _cy(e) { return e.clientY - this.canvas.getBoundingClientRect().top;  }

    _onDown(e) {
        const cx = this._cx(e), cy = this._cy(e);
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            this.isPanning = true;
            this.lastMX = cx; this.lastMY = cy;
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        if (e.button === 0) {
            const hit = this._hitTest(cx, cy);
            if (hit) {
                this.selected = hit;
                const { x: sx, y: sy } = this._canvasToSheet(cx, cy);
                this.drag = { p: hit, offX: sx - hit.x, offY: sy - hit.y, origX: hit.x, origY: hit.y };
                this.canvas.style.cursor = 'grabbing';
            } else {
                this.selected = null;
                this.isPanning = true;
                this.lastMX = cx; this.lastMY = cy;
            }
            if (this.onSelectionChange) this.onSelectionChange(this.selected);
            this.render();
        }
    }

    _onMove(e) {
        const cx = this._cx(e), cy = this._cy(e);
        if (this.isPanning) {
            this.panX += cx - this.lastMX;
            this.panY += cy - this.lastMY;
            this.lastMX = cx; this.lastMY = cy;
            this.render();
            return;
        }
        if (this.drag) {
            const { x: sx, y: sy } = this._canvasToSheet(cx, cy);
            const { p } = this.drag;
            const { width: sw, height: sh } = this.instance.sheetDef;
            p.x = Math.max(0, Math.min(sw - p.width,  sx - this.drag.offX));
            p.y = Math.max(0, Math.min(sh - p.height, sy - this.drag.offY));
            this.drag.isInvalid = this._hasOverlap(p);
            this.render();
            return;
        }
        this.canvas.style.cursor = this._hitTest(cx, cy) ? 'grab' : 'default';
    }

    _onUp(e) {
        if (this.drag) {
            const { p } = this.drag;
            const overlap = this._hasOverlap(p);
            if (overlap) { p.x = this.drag.origX; p.y = this.drag.origY; this._flashError(p); }
            if (this.onMoved) this.onMoved(p, !overlap);
            this.drag = null;
            this.render();
        }
        if (this.isPanning) { this.isPanning = false; this.canvas.style.cursor = 'default'; }
    }

    _hasOverlap(moved) {
        if (!this.instance) return false;
        const k = this.kerf;
        for (const p of this.instance.placements) {
            if (p === moved) continue;
            if (moved.x < p.x + p.width  + k &&
                moved.x + moved.width  + k > p.x &&
                moved.y < p.y + p.height + k &&
                moved.y + moved.height + k > p.y) return true;
        }
        return false;
    }

    _flashError(p) {
        const orig = p.color;
        p.color = '#f44336';
        this.render();
        setTimeout(() => { p.color = orig; this.render(); }, 400);
    }
}

window.CutlistRenderer = CutlistRenderer;
