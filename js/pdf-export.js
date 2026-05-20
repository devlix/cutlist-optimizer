'use strict';

class PDFExporter {
    export(results, settings = {}) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        const pageW = 297, pageH = 210;
        const margin = 12;
        const drawW = pageW - margin * 2;
        const drawH = pageH - margin * 2 - 22;

        let firstPage = true;

        for (const sheetResult of results.sheetResults) {
            for (const inst of sheetResult.instances) {
                if (!firstPage) doc.addPage('a4', 'landscape');
                firstPage = false;

                const { width: sw, height: sh } = inst.sheetDef;
                const scale = Math.min(drawW / sw, drawH / sh);
                const offsetX = margin + (drawW - sw * scale) / 2;
                const offsetY = margin + 18;

                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(25, 118, 210);
                doc.text('Cutlist Optimizer', margin, margin + 5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(80, 80, 80);
                doc.text(`${sheetResult.sheetDef.name}  –  Board ${inst.index + 1}  (${sw}×${sh} mm)`, margin, margin + 11);
                doc.text(`Efficiency: ${inst.efficiency.toFixed(1)}%   Parts: ${inst.placements.length}`, pageW - margin, margin + 11, { align: 'right' });

                doc.setDrawColor(200, 200, 200);
                doc.line(margin, margin + 13, pageW - margin, margin + 13);

                const c = this._hexToRgb(sheetResult.sheetDef.color || '#d4a76a');
                doc.setFillColor(c.r, c.g, c.b);
                doc.setDrawColor(120, 80, 60);
                doc.setLineWidth(0.4);
                doc.rect(offsetX, offsetY, sw * scale, sh * scale, 'FD');

                for (const p of inst.placements) {
                    const px = offsetX + p.x * scale;
                    const py = offsetY + p.y * scale;
                    const pw = p.width  * scale;
                    const ph = p.height * scale;
                    const pc = this._hexToRgb(p.color || '#90a4ae');
                    doc.setFillColor(pc.r, pc.g, pc.b);
                    doc.setDrawColor(Math.max(0,pc.r-60), Math.max(0,pc.g-60), Math.max(0,pc.b-60));
                    doc.setLineWidth(0.3);
                    doc.rect(px, py, pw, ph, 'FD');
                    if (pw > 10 && ph > 6) {
                        const light = (pc.r*299 + pc.g*587 + pc.b*114)/1000 > 145;
                        doc.setTextColor(light ? 20 : 240, light ? 20 : 240, light ? 20 : 240);
                        const fs = Math.max(4, Math.min(8, pw / 8));
                        doc.setFontSize(fs);
                        doc.setFont('helvetica', 'bold');
                        doc.text(p.rotated ? p.partName + ' ↻' : p.partName, px + pw/2, py + ph/2 - fs*0.15, { align: 'center' });
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(fs * 0.85);
                        if (ph > 9) doc.text(`${p.width}×${p.height}`, px + pw/2, py + ph/2 + fs*0.6, { align: 'center' });
                    }
                }

                doc.setFillColor(0,0,0,0);
                doc.setDrawColor(80, 50, 30);
                doc.setLineWidth(0.6);
                doc.rect(offsetX, offsetY, sw * scale, sh * scale);

                doc.setTextColor(60, 60, 60);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(`${sw} mm`, offsetX + sw*scale/2, offsetY - 2, { align: 'center' });
                doc.text(`${sh} mm`, offsetX - 2, offsetY + sh*scale/2, { angle: 90, align: 'center' });

                doc.setFontSize(7);
                doc.setTextColor(160, 160, 160);
                doc.text(`Kerf: ${settings.kerf ?? 3} mm  |  Rotation: ${settings.allowRotation ? 'Yes' : 'No'}`, margin, pageH - margin + 2);
                doc.text(new Date().toLocaleDateString(), pageW - margin, pageH - margin + 2, { align: 'right' });
            }
        }

        // Summary page
        doc.addPage('a4', 'portrait');
        const p = 15;
        let y = p + 8;
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(25, 118, 210);
        doc.text('Cutlist Summary', p, y); y += 8;
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(`Total boards used: ${results.totalSheets}`, p, y); y += 5;
        doc.text(`Overall efficiency: ${results.totalEfficiency.toFixed(1)}%`, p, y); y += 5;
        if (results.unplaced.length > 0) {
            doc.setTextColor(200, 50, 50);
            doc.text(`Unplaced parts: ${results.unplaced.length}`, p, y);
            doc.setTextColor(80, 80, 80);
        }
        y += 10;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
        doc.text('Part', p, y); doc.text('W', p+80, y, {align:'right'}); doc.text('H', p+100, y, {align:'right'});
        doc.text('Qty', p+120, y, {align:'right'}); doc.text('Material', p+130, y);
        y += 4; doc.line(p, y, 210-p, y); y += 4;
        const summary = new Map();
        for (const sr of results.sheetResults)
            for (const inst of sr.instances)
                for (const pl of inst.placements) {
                    if (!summary.has(pl.partName))
                        summary.set(pl.partName, { name: pl.partName, w: pl.rotated ? pl.height : pl.width, h: pl.rotated ? pl.width : pl.height, qty: 0, mat: sr.materialName });
                    summary.get(pl.partName).qty++;
                }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        for (const [, item] of summary) {
            if (y > 270) { doc.addPage(); y = p; }
            doc.text(item.name, p, y); doc.text(`${item.w}`, p+80, y, {align:'right'});
            doc.text(`${item.h}`, p+100, y, {align:'right'}); doc.text(`${item.qty}`, p+120, y, {align:'right'});
            doc.text(item.mat || '', p+130, y); y += 5;
        }
        doc.save('cutlist.pdf');
    }

    _hexToRgb(hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
    }
}

window.PDFExporter = PDFExporter;
