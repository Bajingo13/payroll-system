function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function rowsToDelimited(headers, rows, delimiter) {
  return [headers, ...rows]
    .map((row) => row.map((cell) => delimiter === ',' ? csvCell(cell) : String(cell ?? '')).join(delimiter))
    .join('\n');
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function makePdf(title, headers, rows) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 28;
  const tableWidth = pageWidth - margin * 2;
  const headerHeight = 22;
  const rowLineHeight = 9;
  const cellPadding = 4;
  const bodyFontSize = 7;
  const maxCellLines = 4;
  const generatedAt = new Date().toLocaleString('en-PH');

  function textWidth(text, fontSize = bodyFontSize) {
    return String(text ?? '').length * fontSize * 0.52;
  }

  function columnWeight(header) {
    const text = String(header || '').toLowerCase();
    if (text.includes('reason')) return 2.4;
    if (text.includes('employee name')) return 1.7;
    if (text.includes('submitted') || text.includes('updated')) return 1.45;
    if (text.includes('leave type')) return 1.25;
    if (text.includes('start') || text.includes('end') || text === 'date') return 1.05;
    if (text.includes('status') || text.includes('hours') || text.includes('days') || text.includes('id')) return 0.8;
    return 1;
  }

  function columnWidths() {
    const weights = headers.map(columnWeight);
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map((value) => (value / total) * tableWidth);
  }

  function wrapCell(value, width) {
    const maxChars = Math.max(6, Math.floor((width - cellPadding * 2) / (bodyFontSize * 0.52)));
    const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];

    if (!words.length) return [''];

    const queue = [...words];
    while (queue.length) {
      const word = queue.shift();
      const last = lines[lines.length - 1] || '';
      const chunk = word.length > maxChars ? word.slice(0, maxChars) : word;

      if (word.length > maxChars) {
        queue.unshift(word.slice(maxChars));
      }

      if (!last) {
        lines.push(chunk);
        continue;
      }

      if (`${last} ${chunk}`.length <= maxChars) {
        lines[lines.length - 1] = `${last} ${chunk}`;
      } else {
        lines.push(chunk);
      }
    }

    if (lines.length > maxCellLines) {
      const kept = lines.slice(0, maxCellLines);
      kept[maxCellLines - 1] = `${kept[maxCellLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
      return kept;
    }

    return lines;
  }

  function drawText(text, x, y, { font = 'F1', size = bodyFontSize } = {}) {
    return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`;
  }

  function drawCellText(lines, x, topY, width, height, options = {}) {
    const font = options.bold ? 'F2' : 'F1';
    const size = options.size || bodyFontSize;
    const startY = topY - cellPadding - size;
    return lines.map((line, index) => {
      let display = String(line ?? '');
      const maxWidth = width - cellPadding * 2;
      while (textWidth(display, size) > maxWidth && display.length > 3) {
        display = `${display.slice(0, -4)}...`;
      }
      return drawText(display, x + cellPadding, startY - index * rowLineHeight, { font, size });
    }).join('\n');
  }

  const widths = columnWidths();
  const pages = [];
  let commands = [];
  let currentPage = 0;
  let y = pageHeight - margin;

  function startPage() {
    currentPage += 1;
    commands = [];
    y = pageHeight - margin;

    commands.push('0.08 0.15 0.28 rg');
    commands.push(drawText(title || 'Report', margin, y - 3, { font: 'F2', size: 16 }));
    commands.push('0.38 0.44 0.53 rg');
    commands.push(drawText(`Generated: ${generatedAt}`, margin, y - 20, { size: 8 }));
    commands.push(drawText(`Rows: ${rows.length}`, pageWidth - margin - 72, y - 20, { size: 8 }));
    y -= 42;

    commands.push('0.91 0.95 1.00 rg');
    commands.push(`${margin} ${(y - headerHeight).toFixed(2)} ${tableWidth.toFixed(2)} ${headerHeight} re f`);
    commands.push('0.62 0.68 0.76 RG');
    commands.push(`${margin} ${(y - headerHeight).toFixed(2)} ${tableWidth.toFixed(2)} ${headerHeight} re S`);

    let x = margin;
    headers.forEach((header, index) => {
      commands.push('0.08 0.15 0.28 rg');
      commands.push(drawCellText(wrapCell(header, widths[index]), x, y, widths[index], headerHeight, { bold: true, size: 7 }));
      if (index > 0) {
        commands.push('0.78 0.82 0.88 RG');
        commands.push(`${x.toFixed(2)} ${(y - headerHeight).toFixed(2)} m ${x.toFixed(2)} ${y.toFixed(2)} l S`);
      }
      x += widths[index];
    });
    y -= headerHeight;
  }

  function finishPage() {
    commands.push('0.45 0.50 0.58 rg');
    commands.push(drawText(`Page ${currentPage}`, pageWidth - margin - 34, margin - 8, { size: 8 }));
    pages.push(commands.join('\n'));
  }

  startPage();

  rows.forEach((row, rowIndex) => {
    const wrappedCells = headers.map((_, index) => wrapCell(row[index], widths[index]));
    const rowHeight = Math.max(20, Math.max(...wrappedCells.map((cell) => cell.length)) * rowLineHeight + cellPadding * 2 + 2);

    if (y - rowHeight < margin + 12) {
      finishPage();
      startPage();
    }

    if (rowIndex % 2 === 0) {
      commands.push('0.98 0.99 1.00 rg');
      commands.push(`${margin} ${(y - rowHeight).toFixed(2)} ${tableWidth.toFixed(2)} ${rowHeight.toFixed(2)} re f`);
    }

    commands.push('0.86 0.89 0.94 RG');
    commands.push(`${margin} ${(y - rowHeight).toFixed(2)} ${tableWidth.toFixed(2)} ${rowHeight.toFixed(2)} re S`);

    let x = margin;
    wrappedCells.forEach((cell, index) => {
      commands.push('0.10 0.14 0.20 rg');
      commands.push(drawCellText(cell, x, y, widths[index], rowHeight));
      if (index > 0) {
        commands.push('0.90 0.92 0.95 RG');
        commands.push(`${x.toFixed(2)} ${(y - rowHeight).toFixed(2)} m ${x.toFixed(2)} ${y.toFixed(2)} l S`);
      }
      x += widths[index];
    });

    y -= rowHeight;
  });

  if (!rows.length) {
    commands.push('0.35 0.40 0.48 rg');
    commands.push(drawText('No rows available for this report.', margin, y - 20, { size: 10 }));
  }

  finishPage();

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds = [];
  const contentIds = [];

  pages.forEach((stream) => {
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
  });

  const pagesId = objects.length + pages.length + 1;
  contentIds.forEach((contentId) => {
    pageIds.push(addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });

  const actualPagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

export function exportReport(format, filenameBase, title, headers, rows) {
  const normalized = String(format || 'csv').toLowerCase();
  const safeBase = filenameBase || 'report';

  if (normalized === 'txt') {
    const text = rowsToDelimited(headers, rows, '\t');
    downloadBlob(`${safeBase}.txt`, new Blob([text], { type: 'text/plain;charset=utf-8;' }));
    return;
  }

  if (normalized === 'pdf') {
    const pdf = makePdf(title, headers, rows);
    downloadBlob(`${safeBase}.pdf`, new Blob([pdf], { type: 'application/pdf' }));
    return;
  }

  const csv = rowsToDelimited(headers, rows, ',');
  downloadBlob(`${safeBase}.csv`, new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }));
}
