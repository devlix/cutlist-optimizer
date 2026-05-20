'use strict';

class PDFExporter {
    export(results, settings = {}) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        const pageW = 297, pageH = 210;
        const margin = 12;
        const drawW = pageW - margin * 2;
        const drawH = pageH - margin * 2 - 22; // leave room for header/footer

        let firstPage = true;

        for (const sheetResult of results.sheetResults) {
            for (const inst of sheetResult.instances) {
                if (!firstPage) doc.addPage('a4', 'landscape');
                firstPage = false;

                const { length: sw, width: sh } = inst.sheetDef;
                const scale = Math.min(drawW / sw, drawH / sh);

                const offsetX = margin + (drawW - sw * scale) / 2;
                const offsetY = margin + 18; // below header

                // ── Header ──────────────────────────────────────────
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(25, 118, 210);
                doc.text('Cutlist Optimizer', margin, margin + 5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(80, 80, 80);
                const title = `${sheetResult.sheetDef.name}  –  Board ${inst.index + 1}  (${sw}×${sh} mm)`;
                doc.text(title, margin, margin + 11);

                const effText = `Efficiency: ${inst.efficiency.toFixed(1)}%   Parts: ${inst.placements.length}`;
                doc.text(effText, pageW - margin, margin + 11, { align: 'right' });

                // Header line
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, margin + 13, pageW - margin, margin + 13);

                // ── Sheet background ─────────────────────────────────
                const c = this._hexToRgb(sheetResult.sheetDef.color || '#d4a76a');
                doc.setFillColor(c.r, c.g, c.b);
                doc.setDrawColor(120, 80, 60);
                doc.setLineWidth(0.4);
                doc.rect(offsetX, offsetY, sw * scale, sh * scale, 'FD');

                // ── Placements ───────────────────────────────────────
                for (const p of inst.placements) {
                    const px = offsetX + p.x * scale;
                    const py = offsetY + p.y * scale;
                    const pw = p.length * scale;
                    const ph = p.width  * scale;

                    const pc = this._hexToRgb(p.color || '#90a4ae');
                    const lr = this._lighten(pc.r, 0.85);
                    const lg = this._lighten(pc.g, 0.85);
                    const lb = this._lighten(pc.b, 0.85);
                    doc.setFillColor(lr, lg, lb);
                    doc.setDrawColor(Math.max(0,lr-40), Math.max(0,lg-40), Math.max(0,lb-40));
                    doc.setLineWidth(0.3);
                    doc.rect(px, py, pw, ph, 'FD');

                    // Label if large enough
                    if (pw > 10 && ph > 6) {
                        doc.setTextColor(20, 20, 20);
                        const fs = Math.max(4, Math.min(8, pw / 8));
                        doc.setFontSize(fs);
                        doc.setFont('helvetica', 'bold');
                        const lbl = p.rotated ? p.partName + ' ↻' : p.partName;
                        doc.text(lbl,   px + pw/2, py + ph/2 - fs*0.15, { align: 'center' });
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(fs * 0.85);
                        if (ph > 9) {
                            doc.text(`${p.length}×${p.width}`, px + pw/2, py + ph/2 + fs*0.6, { align: 'center' });
                        }
                    }
                }

                // Sheet border on top
                doc.setFillColor(0,0,0,0);
                doc.setDrawColor(80, 50, 30);
                doc.setLineWidth(0.6);
                doc.rect(offsetX, offsetY, sw * scale, sh * scale);

                // Dimension annotations
                doc.setTextColor(60, 60, 60);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(`${sw} mm`, offsetX + sw*scale/2, offsetY - 2, { align: 'center' });
                doc.text(`${sh} mm`, offsetX - 2, offsetY + sh*scale/2, { angle: 90, align: 'center' });

                // ── Footer ───────────────────────────────────────────
                const footY = pageH - margin + 2;
                doc.setFontSize(7);
                doc.setTextColor(160, 160, 160);
                doc.text(`Kerf: ${settings.kerf ?? 3} mm  |  Rotation: ${settings.allowRotation ? 'Yes' : 'No'}`, margin, footY);
                doc.text(new Date().toLocaleDateString(), pageW - margin, footY, { align: 'right' });
            }
        }

        // ── Summary page ─────────────────────────────────────────────
        doc.addPage('a4', 'portrait');
        const p = 15;
        let y = p + 8;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(25, 118, 210);
        doc.text('Cutlist Summary', p, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Total boards used: ${results.totalSheets}`, p, y); y += 5;
        doc.text(`Overall efficiency: ${results.totalEfficiency.toFixed(1)}%`, p, y); y += 5;
        if (results.unplaced.length > 0) {
            doc.setTextColor(200, 50, 50);
            doc.text(`⚠ Unplaced parts: ${results.unplaced.length}`, p, y);
            doc.setTextColor(80, 80, 80);
        }
        y += 10;

        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);

        // Parts table
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        doc.text('Part', p, y);
        doc.text('L', p+80, y, { align:'right' });
        doc.text('B', p+100, y, { align:'right' });
        doc.text('Qty', p+120, y, { align:'right' });
        doc.text('Material', p+130, y);
        y += 4;
        doc.line(p, y, 210-p, y);
        y += 4;

        // Collect all placements grouped by part name
        const summary = new Map();
        for (const sr of results.sheetResults) {
            for (const inst of sr.instances) {
                for (const pl of inst.placements) {
                    if (!summary.has(pl.partName)) {
                        summary.set(pl.partName, { name: pl.partName, w: pl.rotated ? pl.width : pl.length, h: pl.rotated ? pl.length : pl.width, qty: 0, mat: sr.materialName });
                    }
                    summary.get(pl.partName).qty++;
                }
            }
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const [, item] of summary) {
            if (y > 270) { doc.addPage(); y = p; }
            doc.text(item.name, p, y);
            doc.text(`${item.w}`, p+80, y, { align:'right' });
            doc.text(`${item.h}`, p+100, y, { align:'right' });
            doc.text(`${item.qty}`, p+120, y, { align:'right' });
            doc.text(item.mat || '', p+130, y);
            y += 5;
        }

        doc.save('cutlist.pdf');
    }

    _lighten(v, ratio) {
        return Math.round(v + (255 - v) * ratio);
    }

    _hexToRgb(hex) {
        const h = hex.replace('#', '');
        return {
            r: parseInt(h.slice(0,2), 16),
            g: parseInt(h.slice(2,4), 16),
            b: parseInt(h.slice(4,6), 16),
        };
    }
}

window.PDFExporter = PDFExporter;
