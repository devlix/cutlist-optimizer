'use strict';

// Supported CSV formats:
//
// Format A – parts only:
//   Name,Width,Height,Qty,Material
//   Side Panel,800,600,2,Plywood 18mm
//
// Format B – sheets + parts (column 1 = "Type"):
//   Type,Name,Width,Height,Qty,Material
//   Sheet,Plywood 18mm,2440,1220,2,
//   Part,Side Panel,800,600,2,Plywood 18mm
//
// Separator: comma or semicolon (auto-detected)
// Decimal: period or comma (auto-detected per field)
// Lines starting with # are comments

class CSVParser {
    parse(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
        if (lines.length < 2) throw new Error('CSV er for kort – mangler header og data.');

        const sep = this._detectSep(lines[0]);
        const headers = this._split(lines[0], sep).map(h => h.trim().toLowerCase());

        // Determine format
        const typeCol   = headers.indexOf('type');
        const nameCol   = this._col(headers, 'name', 'part', 'del', 'label');
        const widthCol  = this._col(headers, 'width', 'bredde', 'w', 'length', 'lengde', 'l');
        const heightCol = this._col(headers, 'height', 'høyde', 'h', 'depth', 'dybde', 'd');
        const qtyCol    = this._col(headers, 'qty', 'quantity', 'antall', 'count', 'stk', 'q');
        const matCol    = this._col(headers, 'material', 'sheet', 'plate', 'materiale', 'board');

        if (nameCol === -1 || widthCol === -1 || heightCol === -1) {
            throw new Error('CSV-header mangler påkrevde kolonner: Name, Width, Height.\nHeaders funnet: ' + headers.join(', '));
        }

        const sheets = [];
        const parts  = [];
        let idSeq = 0;

        for (let i = 1; i < lines.length; i++) {
            const row = this._split(lines[i], sep).map(c => c.trim());
            if (row.every(c => !c)) continue;

            const type = typeCol >= 0 ? (row[typeCol] || '').toLowerCase() : 'part';

            const name   = row[nameCol]   || `Item ${i}`;
            const width  = this._num(row[widthCol]);
            const height = this._num(row[heightCol]);
            const qty    = qtyCol >= 0 ? Math.max(1, Math.round(this._num(row[qtyCol]) || 1)) : 1;
            const mat    = matCol >= 0 ? (row[matCol] || '').trim() : '';

            if (!width || !height) continue; // skip empty / invalid rows

            if (type === 'sheet' || type === 'plate') {
                sheets.push({ id: `s_${++idSeq}`, name, width, height, qty, color: null });
            } else {
                parts.push({ id: `p_${++idSeq}`, name, width, height, qty, material: mat });
            }
        }

        return { sheets, parts };
    }

    _detectSep(headerLine) {
        const commas    = (headerLine.match(/,/g)   || []).length;
        const semis     = (headerLine.match(/;/g)   || []).length;
        const tabs      = (headerLine.match(/\t/g)  || []).length;
        if (tabs > commas && tabs > semis) return '\t';
        if (semis > commas)                return ';';
        return ',';
    }

    // Split line by sep but respect quoted fields
    _split(line, sep) {
        const out = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (!inQ && ch === sep) { out.push(cur); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur);
        return out;
    }

    _col(headers, ...candidates) {
        for (const c of candidates) {
            const idx = headers.indexOf(c);
            if (idx !== -1) return idx;
        }
        // Partial match
        for (const c of candidates) {
            const idx = headers.findIndex(h => h.includes(c));
            if (idx !== -1) return idx;
        }
        return -1;
    }

    _num(str) {
        if (!str) return 0;
        // Handle both "1,234.56" and "1.234,56" formats
        const s = str.replace(/\s/g, '');
        const lastDot   = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        let norm = s;
        if (lastComma > lastDot) {
            norm = s.replace(/\./g, '').replace(',', '.');
        } else {
            norm = s.replace(/,/g, '');
        }
        return parseFloat(norm) || 0;
    }
}

window.CSVParser = CSVParser;
