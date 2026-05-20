'use strict';

// MAXRECTS bin packing – Jukka Jylänki (2010)
// BSSF (Best Short Side Fit) heuristic

class MaxRectsBin {
    constructor(width, height, kerf) {
        this.W = width;
        this.H = height;
        this.kerf = kerf;
        this.free = [{ x: 0, y: 0, w: width, h: height }];
        this.used = [];
    }

    insert(pw, ph, allowRotation) {
        let best = null, bs1 = Infinity, bs2 = Infinity, rotated = false;

        for (const f of this.free) {
            if (pw <= f.w && ph <= f.h) {
                const [s1, s2] = this._bssf(f, pw, ph);
                if (s1 < bs1 || (s1 === bs1 && s2 < bs2)) {
                    bs1 = s1; bs2 = s2;
                    best = { x: f.x, y: f.y, w: pw, h: ph };
                    rotated = false;
                }
            }
            if (allowRotation && ph !== pw && ph <= f.w && pw <= f.h) {
                const [s1, s2] = this._bssf(f, ph, pw);
                if (s1 < bs1 || (s1 === bs1 && s2 < bs2)) {
                    bs1 = s1; bs2 = s2;
                    best = { x: f.x, y: f.y, w: ph, h: pw };
                    rotated = true;
                }
            }
        }

        if (!best) return null;
        this._place(best);
        this.used.push(best);
        return { ...best, rotated };
    }

    _bssf(f, w, h) {
        const lh = f.w - w, lv = f.h - h;
        return [Math.min(lh, lv), Math.max(lh, lv)];
    }

    _place(node) {
        const k = this.kerf;
        const nr = node.x + node.w + k;
        const nb = node.y + node.h + k;
        const next = [];

        for (const f of this.free) {
            if (!this._intersects(node.x, node.y, nr, nb, f)) {
                next.push(f);
                continue;
            }
            if (node.x > f.x)   next.push({ x: f.x, y: f.y, w: node.x - f.x,          h: f.h });
            if (nr < f.x + f.w) next.push({ x: nr,  y: f.y, w: f.x + f.w - nr,        h: f.h });
            if (node.y > f.y)   next.push({ x: f.x, y: f.y, w: f.w, h: node.y - f.y         });
            if (nb < f.y + f.h) next.push({ x: f.x, y: nb,  w: f.w, h: f.y + f.h - nb        });
        }

        this.free = this._prune(next.filter(r => r.w > 0 && r.h > 0));
    }

    _intersects(x, y, r, b, f) {
        return x < f.x + f.w && r > f.x && y < f.y + f.h && b > f.y;
    }

    _prune(rects) {
        return rects.filter((r, i) =>
            !rects.some((o, j) => i !== j &&
                o.x <= r.x && o.y <= r.y &&
                o.x + o.w >= r.x + r.w && o.y + o.h >= r.y + r.h)
        );
    }

    occupancy() {
        return this.used.reduce((s, r) => s + r.w * r.h, 0) / (this.W * this.H);
    }
}

// Palette for parts
const PART_COLORS = [
    '#ef5350','#ec407a','#ab47bc','#7e57c2','#5c6bc0',
    '#42a5f5','#26c6da','#26a69a','#66bb6a','#d4e157',
    '#ffa726','#ff7043','#8d6e63','#78909c','#29b6f6',
    '#f06292','#ba68c8','#9575cd','#64b5f6','#4dd0e1',
];

class CutlistOptimizer {
    optimize(sheets, parts, settings = {}) {
        const { kerf = 3, allowRotation = true } = settings;

        // Assign colors per unique part name
        const colorMap = new Map();
        let ci = 0;
        for (const p of parts) {
            if (!colorMap.has(p.name)) colorMap.set(p.name, PART_COLORS[ci++ % PART_COLORS.length]);
        }

        // Expand by quantity
        const expanded = [];
        for (const p of parts) {
            for (let i = 0; i < (p.qty || 1); i++) {
                expanded.push({ ...p, _color: colorMap.get(p.name), _seq: i });
            }
        }

        // Group by material
        const byMaterial = new Map();
        for (const p of expanded) {
            const mat = p.material || '__default__';
            if (!byMaterial.has(mat)) byMaterial.set(mat, []);
            byMaterial.get(mat).push(p);
        }

        const sheetResults = [];
        const unplaced = [];

        for (const [mat, matParts] of byMaterial) {
            const sheetDef = sheets.find(s => s.name === mat)
                          || sheets.find(s => mat === '__default__')
                          || sheets[0];
            if (!sheetDef) { unplaced.push(...matParts); continue; }

            // Sort largest area first – best results for MAXRECTS
            const sorted = [...matParts].sort((a, b) =>
                (b.width * b.height) - (a.width * a.height)
            );

            const instances = [];
            let remaining = sorted;
            const cap = (sheetDef.qty || 1) + 20;

            while (remaining.length > 0 && instances.length < cap) {
                const bin = new MaxRectsBin(sheetDef.width, sheetDef.height, kerf);
                const placements = [];
                const leftover = [];

                for (const part of remaining) {
                    const res = bin.insert(part.width, part.height, allowRotation);
                    if (res) {
                        placements.push({
                            id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            partId: part.id,
                            partName: part.name,
                            x: res.x, y: res.y,
                            width: res.w, height: res.h,
                            rotated: res.rotated,
                            color: part._color,
                        });
                    } else {
                        leftover.push(part);
                    }
                }

                if (placements.length === 0) {
                    unplaced.push(...remaining);
                    break;
                }

                const usedArea  = placements.reduce((s, p) => s + p.width * p.height, 0);
                const totalArea = sheetDef.width * sheetDef.height;
                instances.push({
                    index: instances.length,
                    sheetDef: { ...sheetDef },
                    placements,
                    efficiency: (usedArea / totalArea) * 100,
                    usedArea, totalArea,
                });
                remaining = leftover;
            }

            if (instances.length > 0) {
                sheetResults.push({ materialName: mat, sheetDef: { ...sheetDef }, instances });
            }
        }

        const allInstances = sheetResults.flatMap(r => r.instances);
        const totalUsed = allInstances.reduce((s, i) => s + i.usedArea, 0);
        const totalArea = allInstances.reduce((s, i) => s + i.totalArea, 0);

        return {
            sheetResults,
            unplaced,
            totalEfficiency: totalArea > 0 ? (totalUsed / totalArea) * 100 : 0,
            totalSheets: allInstances.length,
        };
    }
}

window.CutlistOptimizer = CutlistOptimizer;
