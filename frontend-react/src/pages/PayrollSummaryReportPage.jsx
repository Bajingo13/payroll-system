import React, { useMemo, useEffect, useState, useRef } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { exportReport, getReportMetadata } from '../utils/reportExport.js';

const ORDER_OPTIONS = [
  ['department_surname',            'Department + Surname'],
  ['department_employeeid',         'Department + Employee ID'],
  ['division_surname',              'Division + Surname'],
  ['division_employeeid',           'Division + Employee ID'],
  ['branch_department_surname',     'Branch + Department + Surname'],
  ['branch_department_employeeid',  'Branch + Department + Employee ID'],
  ['project_salary-type_surname',   'Project + Salary Type + Surname'],
  ['project_salary-type_employeeid','Project + Salary Type + Employee ID'],
  ['surname',    'Surname'],
  ['employeeid', 'Employee ID'],
];

const OT_TYPES = [
  { key:'rg',   label:'RG'   },
  { key:'rd',   label:'RD'   },
  { key:'sd',   label:'SD'   },
  { key:'sdrd', label:'SDRD' },
  { key:'hd',   label:'HD'   },
  { key:'hdrd', label:'HDRD' },
];

const JOURNAL_EXPORT_COLUMNS = [
  { label:'CTR', text:true, value:row => row.__ctgr || '' },
  { label:'EMPLOYEE NO.', text:true, value:row => row.__label ? '' : (row.emp_code || row.employee_id || '') },
  { label:'EMPLOYEE NAME', text:true, value:row => row.__label || `${row.last_name || ''}, ${row.first_name || ''}`.replace(/^,\s*/, '').trim() || row.emp_code || '' },
  { label:'TAX STATUS', text:true, value:row => row.__label ? '' : (row.tax_exemption_code || '-') },
  { label:'AMOUNT RATE', value:row => money(row.main_computation || row.basic_salary) },
  { label:'BASIC PAY', group:'ATTENDANCE', key:'basic_salary' },
  { label:'ABSENCES', group:'ATTENDANCE', key:'absence_deduction' },
  { label:'LATE', group:'ATTENDANCE', key:'late_deduction' },
  { label:'UNDERTIME', group:'ATTENDANCE', key:'undertime_deduction' },
  { label:'TOTAL LOST HOURS', group:'ATTENDANCE', value:row => money(num(row.absence_deduction) + num(row.late_deduction) + num(row.undertime_deduction)) },
  { label:'TOTAL ATTENDANCE', value:row => money(num(row.basic_salary) - num(row.absence_deduction) - num(row.late_deduction) - num(row.undertime_deduction)) },
  { label:'DAYS PRESENT', group:'ATTENDANCE ADJUSTMENTS', key:'basic_salary_adj' },
  { label:'ABSENCE', group:'ATTENDANCE ADJUSTMENTS', key:'absence_deduction_adj' },
  { label:'LATE', group:'ATTENDANCE ADJUSTMENTS', key:'late_deduction_adj' },
  { label:'UNDERTIME', group:'ATTENDANCE ADJUSTMENTS', key:'undertime_deduction_adj' },
  { label:'TOTAL ATTENDANCE ADJ.', value:row => money(num(row.basic_salary_adj) - num(row.absence_deduction_adj) - num(row.late_deduction_adj) - num(row.undertime_deduction_adj)) },
  { label:'BASIC NET OF LOST HOURS', value:row => money(num(row.basic_salary) - num(row.absence_deduction) - num(row.late_deduction) - num(row.undertime_deduction) + num(row.basic_salary_adj) - num(row.absence_deduction_adj) - num(row.late_deduction_adj) - num(row.undertime_deduction_adj)) },
  ...OT_TYPES.flatMap(({ key, label }) => [
    { label:`${label} RATE`, group:'OVERTIME', key:`${key}_rate` },
    { label:`${label} OT`, group:'OVERTIME', key:`${key}_ot` },
  ]),
  { label:'TOTAL O.T.', value:row => sumMoney(row, OT_TYPES.flatMap(({ key }) => [`${key}_rate`, `${key}_ot`])) },
  ...OT_TYPES.flatMap(({ key, label }) => [
    { label:`${label} RATE`, group:'OVERTIME ADJUSTMENTS', key:`ot_adj_${key}_rate` },
    { label:`${label} OT`, group:'OVERTIME ADJUSTMENTS', key:`ot_adj_${key}_ot` },
  ]),
  { label:'TOTAL O.T. ADJ.', value:row => sumMoney(row, OT_TYPES.flatMap(({ key }) => [`ot_adj_${key}_rate`, `ot_adj_${key}_ot`])) },
  { label:'NET TOTAL O.T.', value:row => sumMoney(row, [
    ...OT_TYPES.flatMap(({ key }) => [`${key}_rate`, `${key}_ot`]),
    ...OT_TYPES.flatMap(({ key }) => [`ot_adj_${key}_rate`, `ot_adj_${key}_ot`])
  ]) },
  ...OT_TYPES.flatMap(({ key, label }) => [
    { label:`${label} ND`, group:'NIGHT DIFFERENTIAL', key:`${key}_rate_nd` },
    { label:`${label} OTND`, group:'NIGHT DIFFERENTIAL', key:`${key}_ot_nd` },
  ]),
  { label:'TOTAL NIGHT DIFF.', value:row => sumMoney(row, OT_TYPES.flatMap(({ key }) => [`${key}_rate_nd`, `${key}_ot_nd`])) },
  ...OT_TYPES.flatMap(({ key, label }) => [
    { label:`${label} ND`, group:'NIGHT DIFFERENTIAL ADJUSTMENTS', key:`nd_adj_${key}_rate` },
    { label:`${label} OTND`, group:'NIGHT DIFFERENTIAL ADJUSTMENTS', key:`nd_adj_${key}_ot` },
  ]),
  { label:'TOTAL N.D. ADJ.', value:row => sumMoney(row, OT_TYPES.flatMap(({ key }) => [`nd_adj_${key}_rate`, `nd_adj_${key}_ot`])) },
  { label:'NET TOTAL N.D.', value:row => sumMoney(row, [
    ...OT_TYPES.flatMap(({ key }) => [`${key}_rate_nd`, `${key}_ot_nd`]),
    ...OT_TYPES.flatMap(({ key }) => [`nd_adj_${key}_rate`, `nd_adj_${key}_ot`])
  ]) },
  { label:'OTHER ADJ. TAXABLE', key:'adj_comp' },
  { label:'OTHER ADJ. NON-TAXABLE', key:'adj_non_comp' },
  { label:'ALLOWANCE TAXABLE', key:'taxable_allowances' },
  { label:'ALLOWANCE NON-TAXABLE', key:'non_taxable_allowances' },
  { label:'GROSS INCOME', key:'gross_pay' },
  { label:'GROSS TAXABLE', key:'gross_taxable' },
  { label:'SSS', group:'GOVERNMENT CONTRIBUTION', key:'sss_employee' },
  { label:'PHILHEALTH', group:'GOVERNMENT CONTRIBUTION', key:'philhealth_employee' },
  { label:'PAG-IBIG', group:'GOVERNMENT CONTRIBUTION', key:'pagibig_employee' },
  { label:'TAX WITHHELD', group:'GOVERNMENT CONTRIBUTION', key:'tax_withheld' },
  { label:'SSS', group:'GOVERNMENT CONTRIBUTION ADJ.', key:'sss_emp_adj' },
  { label:'PHILHEALTH', group:'GOVERNMENT CONTRIBUTION ADJ.', key:'philhealth_emp_adj' },
  { label:'PAG-IBIG', group:'GOVERNMENT CONTRIBUTION ADJ.', key:'pagibig_emp_adj' },
  { label:'TAX WITHHELD', group:'GOVERNMENT CONTRIBUTION ADJ.', key:'tax_withheld_adj' },
  { label:'DEDUCTION', key:'deductions' },
  { label:'LOAN DEDUCTION', key:'loans' },
  { label:'OTHER DEDUCTION', key:'other_deductions' },
  { label:'TOTAL DEDUCTIONS', key:'total_deductions' },
  { label:'NET PAY', key:'net_pay' },
  { label:'SSS', group:'PREMIUMS ER SHARE', key:'sss_employer' },
  { label:'SSS ECC', group:'PREMIUMS ER SHARE', key:'sss_ecc' },
  { label:'PHILHEALTH', group:'PREMIUMS ER SHARE', key:'philhealth_employer' },
  { label:'PAG-IBIG', group:'PREMIUMS ER SHARE', key:'pagibig_employer' },
];

const JOURNAL_EXPORT_HEADERS = JOURNAL_EXPORT_COLUMNS.map(col => col.group ? `${col.group} - ${col.label}` : (col.sub ? `${col.label} / ${col.sub}` : col.label));

function money(v) {
  const n = Number(v||0);
  return isFinite(n) ? n.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}) : '0.00';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function xmlEscape(value) {
  return escapeHtml(value).replace(/\r?\n/g, '&#10;');
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function moneyPair(primary, secondary) {
  return `${money(primary)}\n${money(secondary)}`;
}

function sumMoney(row, keys) {
  return money(keys.reduce((total, key) => total + num(row[key]), 0));
}

function downloadBlobFile(filename, blob) {
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

function getJournalColumnValue(row, col) {
  if (col.value) return col.value(row);
  if (col.text) return row[col.key] ?? '';
  return money(row[col.key]);
}

function getJournalExportRows(rows) {
  const total = emptyTotals();
  rows.forEach(row => accum(total, row));
  return [...rows, { ...total, __label:'GRAND TOTAL' }].map(row => (
    JOURNAL_EXPORT_COLUMNS.map(col => getJournalColumnValue(row, col))
  ));
}

function delimitedCell(value, delimiter) {
  const text = String(value ?? '');
  if (delimiter !== ',') return text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportJournalDelimited(format, filenameBase, rows, meta, payrollRangeDisplay, orderBy) {
  const delimiter = format === 'txt' ? '\t' : ',';
  const workbookRows = buildJournalWorkbookRows(rows, meta, payrollRangeDisplay, orderBy);
  const lines = workbookRows.map(row => {
    const padded = row.length === 1
      ? [row[0], ...Array(JOURNAL_EXPORT_COLUMNS.length - 1).fill('')]
      : JOURNAL_EXPORT_COLUMNS.map((_, index) => row[index] ?? '');
    return padded.map(value => delimitedCell(value, delimiter)).join(delimiter);
  }).join('\r\n');
  const extension = format === 'txt' ? 'txt' : 'csv';
  const type = format === 'txt' ? 'text/plain;charset=utf-8;' : 'text/csv;charset=utf-8;';
  downloadBlobFile(`${filenameBase}.${extension}`, new Blob([format === 'csv' ? `\ufeff${lines}` : lines], { type }));
}

function makeWorkbookRow(values, type = 'normal') {
  const row = values.slice();
  row.__type = type;
  return row;
}

function buildJournalWorkbookRows(rows, meta, payrollRangeDisplay, orderBy = 'department_surname') {
  const groupHeader = JOURNAL_EXPORT_COLUMNS.map(col => col.group || col.label);
  const subHeader = JOURNAL_EXPORT_COLUMNS.map(col => col.group ? col.label : (col.sub || ''));
  const now = new Date();
  const runDate = now.toLocaleDateString('en-CA', { timeZone:'Asia/Manila' }).replace(/-/g, '.');
  const runTime = now.toLocaleTimeString('en-GB', { timeZone:'Asia/Manila', hour12:false });
  const workbookRows = [
    makeWorkbookRow([`RUNDATE: ${runDate}`], 'meta'),
    makeWorkbookRow([`RUNTIME: ${runTime}`], 'meta'),
    makeWorkbookRow([], 'blank'),
    makeWorkbookRow([meta.title], 'metaTitle'),
    makeWorkbookRow([`For the Period [ ${payrollRangeDisplay || ''} ]`], 'metaTitle'),
    makeWorkbookRow([], 'blank'),
    makeWorkbookRow(groupHeader, 'header'),
    makeWorkbookRow(subHeader, 'header'),
  ];

  const groupedRows = buildGroups(rows, orderBy);
  const groupLabel = groupTypeLabel(orderBy) || 'GROUP';
  let rowNumber = 1;
  Object.keys(groupedRows).forEach((company, companyIndex) => {
    if (companyIndex > 0) workbookRows.push(makeWorkbookRow([], 'blank'));
    workbookRows.push(makeWorkbookRow([company], 'company'));

    const companyTotal = emptyTotals();
    let companyCount = 0;
    Object.keys(groupedRows[company]).forEach(groupName => {
      const groupRows = groupedRows[company][groupName];
      const groupTotal = emptyTotals();
      workbookRows.push(makeWorkbookRow([groupName || groupLabel], 'group'));

      groupRows.forEach(row => {
        accum(groupTotal, row);
        accum(companyTotal, row);
        companyCount += 1;
        workbookRows.push(makeWorkbookRow(
          JOURNAL_EXPORT_COLUMNS.map(col => getJournalColumnValue({ ...row, __ctgr: rowNumber }, col)),
          'employee'
        ));
        rowNumber += 1;
      });

      workbookRows.push(makeWorkbookRow(
        JOURNAL_EXPORT_COLUMNS.map(col => getJournalColumnValue({ ...groupTotal, __label:`Sub Total Per ${groupLabel}: ${groupName || groupLabel} (${groupRows.length} record${groupRows.length === 1 ? '' : 's'})` }, col)),
        'subtotal'
      ));
    });

    workbookRows.push(makeWorkbookRow(
      JOURNAL_EXPORT_COLUMNS.map(col => getJournalColumnValue({ ...companyTotal, __label:`Sub Total Per Company: ${company} (${companyCount} record${companyCount === 1 ? '' : 's'})` }, col)),
      'companyTotal'
    ));
  });

  const grandTotal = emptyTotals();
  rows.forEach(row => accum(grandTotal, row));
  workbookRows.push(makeWorkbookRow(
    JOURNAL_EXPORT_COLUMNS.map(col => getJournalColumnValue({ ...grandTotal, __label:`GRAND TOTAL (${rows.length} record${rows.length === 1 ? '' : 's'})` }, col)),
    'grandTotal'
  ));

  return workbookRows;
}

function getJournalHeaderMerges(headerStartRow = 6) {
  const merges = [];
  let col = 0;
  while (col < JOURNAL_EXPORT_COLUMNS.length) {
    const column = JOURNAL_EXPORT_COLUMNS[col];
    if (column.group) {
      let end = col;
      while (end + 1 < JOURNAL_EXPORT_COLUMNS.length && JOURNAL_EXPORT_COLUMNS[end + 1].group === column.group) {
        end += 1;
      }
      if (end > col) merges.push([headerStartRow, col, headerStartRow, end]);
      col = end + 1;
      continue;
    }
    if (!column.sub) merges.push([headerStartRow, col, headerStartRow + 1, col]);
    col += 1;
  }
  return merges;
}

function buildJournalXlsHeaderRows() {
  const topCells = [];
  const bottomCells = [];
  let col = 0;
  while (col < JOURNAL_EXPORT_COLUMNS.length) {
    const column = JOURNAL_EXPORT_COLUMNS[col];
    if (column.group) {
      let end = col;
      while (end + 1 < JOURNAL_EXPORT_COLUMNS.length && JOURNAL_EXPORT_COLUMNS[end + 1].group === column.group) {
        end += 1;
      }
      topCells.push(`<th colspan="${end - col + 1}" style="font-weight:bold;background:#d9e8f6;border:2px solid #111;text-align:center;vertical-align:middle;">${escapeHtml(column.group)}</th>`);
      for (let i = col; i <= end; i += 1) {
        bottomCells.push(`<th style="font-weight:bold;background:#d9e8f6;border:2px solid #111;text-align:center;vertical-align:middle;">${escapeHtml(JOURNAL_EXPORT_COLUMNS[i].label)}</th>`);
      }
      col = end + 1;
      continue;
    }

    if (column.sub) {
      topCells.push(`<th style="font-weight:bold;background:#d9e8f6;border:2px solid #111;text-align:center;vertical-align:middle;">${escapeHtml(column.label)}</th>`);
      bottomCells.push(`<th style="font-weight:bold;background:#d9e8f6;border:2px solid #111;text-align:center;vertical-align:middle;">${escapeHtml(column.sub)}</th>`);
    } else {
      topCells.push(`<th rowspan="2" style="font-weight:bold;background:#d9e8f6;border:2px solid #111;text-align:center;vertical-align:middle;">${escapeHtml(column.label)}</th>`);
    }
    col += 1;
  }
  return `<tr style="height:24px;">${topCells.join('')}</tr><tr style="height:24px;">${bottomCells.join('')}</tr>`;
}

function exportJournalXls(filenameBase, rows, meta, payrollRangeDisplay, orderBy) {
  const workbookRows = buildJournalWorkbookRows(rows, meta, payrollRangeDisplay, orderBy);
  const htmlRows = [
    ...workbookRows.slice(0, 6).map((row, index) => {
      if (!row.length) return `<tr><td colspan="${JOURNAL_EXPORT_COLUMNS.length}" style="height:12px;"></td></tr>`;
      return `<tr><td colspan="${JOURNAL_EXPORT_COLUMNS.length}" style="font-weight:${index < 2 ? 'bold' : 'normal'};border:1px solid #999;">${escapeHtml(row[0])}</td></tr>`;
    }),
    buildJournalXlsHeaderRows(),
    ...workbookRows.slice(8).map((row) => {
      if (!row.length) return `<tr><td colspan="${JOURNAL_EXPORT_COLUMNS.length}" style="height:18px;border:0;"></td></tr>`;
      if (row.length === 1) {
        const sectionStyle = row.__type === 'company'
          ? 'font-weight:bold;background:#d9e8f6;border-top:3px solid #111;border-bottom:3px solid #111;text-align:left;'
          : 'font-weight:bold;background:#f3f3f3;border-top:2px solid #111;border-bottom:2px solid #111;text-align:left;';
        return `<tr><td colspan="${JOURNAL_EXPORT_COLUMNS.length}" style="${sectionStyle}">${escapeHtml(row[0])}</td></tr>`;
      }
      const isTotal = ['subtotal', 'companyTotal', 'grandTotal'].includes(row.__type);
      const style = isTotal
        ? 'font-weight:bold;background:#cfe6ff;border:2px solid #111;mso-number-format:"\\@";white-space:pre-wrap;text-align:right;'
        : 'border:1px solid #111;mso-number-format:"\\@";white-space:pre-wrap;text-align:right;';
      return `<tr>${JOURNAL_EXPORT_COLUMNS.map((_, colIndex) => `<td style="${colIndex === 0 ? style.replace('text-align:right;', 'text-align:left;') : style}">${escapeHtml(row[colIndex] ?? '').replace(/\r?\n/g, '<br>')}</td>`).join('')}</tr>`;
    })
  ].join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${htmlRows}</table></body></html>`;
  downloadBlobFile(`${filenameBase}.xls`, new Blob([`\ufeff${html}`], { type:'application/vnd.ms-excel;charset=utf-8;' }));
}

function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = Array.from({ length:256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    crc32.table = table;
  }
  let crc = 0xffffffff;
  bytes.forEach(byte => { crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFiles(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (target, size, writer) => {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    writer(view, bytes);
    target.push(bytes);
    return bytes.length;
  };
  const u16 = (view, at, value) => view.setUint16(at, value, true);
  const u32 = (view, at, value) => view.setUint32(at, value, true);

  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);
    const start = offset;
    offset += push(chunks, 30 + nameBytes.length, (view, bytes) => {
      u32(view, 0, 0x04034b50); u16(view, 4, 20); u16(view, 6, 0); u16(view, 8, 0);
      u16(view, 10, 0); u16(view, 12, 0); u32(view, 14, crc);
      u32(view, 18, dataBytes.length); u32(view, 22, dataBytes.length);
      u16(view, 26, nameBytes.length); u16(view, 28, 0); bytes.set(nameBytes, 30);
    });
    chunks.push(dataBytes);
    offset += dataBytes.length;
    central.push({ nameBytes, dataBytes, crc, start });
  });

  const centralStart = offset;
  central.forEach(entry => {
    offset += push(chunks, 46 + entry.nameBytes.length, (view, bytes) => {
      u32(view, 0, 0x02014b50); u16(view, 4, 20); u16(view, 6, 20); u16(view, 8, 0); u16(view, 10, 0);
      u16(view, 12, 0); u16(view, 14, 0); u32(view, 16, entry.crc);
      u32(view, 20, entry.dataBytes.length); u32(view, 24, entry.dataBytes.length);
      u16(view, 28, entry.nameBytes.length); u16(view, 30, 0); u16(view, 32, 0);
      u16(view, 34, 0); u16(view, 36, 0); u32(view, 38, 0); u32(view, 42, entry.start);
      bytes.set(entry.nameBytes, 46);
    });
  });
  const centralSize = offset - centralStart;
  push(chunks, 22, (view) => {
    u32(view, 0, 0x06054b50); u16(view, 4, 0); u16(view, 6, 0);
    u16(view, 8, central.length); u16(view, 10, central.length);
    u32(view, 12, centralSize); u32(view, 16, centralStart); u16(view, 20, 0);
  });
  return new Blob(chunks, { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function cellRef(rowIndex, colIndex) {
  let n = colIndex + 1;
  let letters = '';
  while (n) {
    const mod = (n - 1) % 26;
    letters = String.fromCharCode(65 + mod) + letters;
    n = Math.floor((n - mod) / 26);
  }
  return `${letters}${rowIndex + 1}`;
}

function exportJournalXlsx(filenameBase, rows, meta, payrollRangeDisplay, orderBy) {
  const workbookRows = buildJournalWorkbookRows(rows, meta, payrollRangeDisplay, orderBy);
  const sheetRows = workbookRows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      const isHeader = rowIndex >= 6 && rowIndex <= 7;
      const isTotal = ['subtotal', 'companyTotal', 'grandTotal'].includes(row.__type);
      const isSection = ['company', 'group'].includes(row.__type);
      const isLeftText = colIndex <= 3 || isSection || row.__type?.startsWith('meta');
      const styleId = isHeader ? 1 : (isTotal ? 2 : (isSection || isLeftText ? 4 : 3));
      const style = ` s="${styleId}"`;
      return `<c r="${cellRef(rowIndex, colIndex)}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
    }).join('');
    const height = rowIndex >= 6 && rowIndex <= 7 ? ' ht="26" customHeight="1"' : (row.__type === 'blank' ? ' ht="16" customHeight="1"' : '');
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join('');
  const lastCol = cellRef(0, JOURNAL_EXPORT_COLUMNS.length - 1).replace('1', '');
  const mergeRefs = [
    ...workbookRows
      .map((row, index) => row.length === 1 ? `A${index + 1}:${lastCol}${index + 1}` : '')
      .filter(Boolean),
    ...getJournalHeaderMerges(6).map(([startRow, startCol, endRow, endCol]) => `${cellRef(startRow, startCol)}:${cellRef(endRow, endCol)}`)
  ];
  const merges = mergeRefs.map(ref => `<mergeCell ref="${ref}"/>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${JOURNAL_EXPORT_COLUMNS.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 6 : (i === 1 ? 12 : (i === 2 ? 45 : 13))}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><mergeCells count="${mergeRefs.length}">${merges}</mergeCells></worksheet>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Payroll Journal" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/></font><font><b/><sz val="10"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E8F6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F3F3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border/><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom></border><border><left style="medium"><color auto="1"/></left><right style="medium"><color auto="1"/></right><top style="medium"><color auto="1"/></top><bottom style="medium"><color auto="1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  downloadBlobFile(`${filenameBase}.xlsx`, zipFiles(files));
}

function emptyTotals() {
  const b = {
    basic_salary:0, absence_deduction:0, late_deduction:0, undertime_deduction:0,
    overtime:0, taxable_allowances:0, non_taxable_allowances:0,
    adj_comp:0, adj_non_comp:0, gross_pay:0, gross_taxable:0,
    gsis_employee:0, sss_employee:0, pagibig_employee:0, philhealth_employee:0,
    tax_withheld:0, total_deductions:0, deductions:0, loans:0, other_deductions:0,
    grand_total_deductions:0, net_pay:0,
    sss_emp_adj:0, philhealth_emp_adj:0, pagibig_emp_adj:0, tax_withheld_adj:0,
    sss_employer:0, sss_ecc:0, philhealth_employer:0, pagibig_employer:0,
    sss_employer_adj:0, sss_ecc_adj:0, philhealth_employer_adj:0, pagibig_employer_adj:0,
  };
  OT_TYPES.forEach(({key}) => {
    b[`${key}_rate`]=0; b[`${key}_ot`]=0; b[`${key}_rate_nd`]=0; b[`${key}_ot_nd`]=0;
    b[`nd_adj_${key}_rate`]=0; b[`nd_adj_${key}_ot`]=0;
  });
  return b;
}

function accum(acc, row) {
  Object.keys(acc).forEach(k => { acc[k] = (Number(acc[k])||0) + (Number(row[k])||0); });
  return acc;
}

function groupKey(row, orderBy) {
  if (orderBy.startsWith('department')) return row.department || '(No Department)';
  if (orderBy.startsWith('division'))   return row.division   || '(No Division)';
  if (orderBy.startsWith('branch'))     return `${row.branch||''} / ${row.department||''}`;
  if (orderBy.startsWith('project'))    return row.projects   || row.project || '(No Project)';
  return '';
}

function groupTypeLabel(orderBy) {
  if (orderBy.startsWith('department')) return 'DEPARTMENT';
  if (orderBy.startsWith('division'))   return 'DIVISION';
  if (orderBy.startsWith('branch'))     return 'BRANCH / DEPARTMENT';
  if (orderBy.startsWith('project'))    return 'PROJECT';
  return '';
}

function buildGroups(rows, orderBy) {
  const result = {};
  rows.forEach(row => {
    const co  = row.company || '(No Company)';
    const grp = groupKey(row, orderBy);
    if (!result[co]) result[co] = {};
    if (!result[co][grp]) result[co][grp] = [];
    result[co][grp].push(row);
  });
  return result;
}

function YearPicker({ value, payrollYears, onChange }) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const selected = payrollYears.find(y => String(y.year_id) === String(value));
    setText(selected ? String(selected.year_value) : (/^\d{4}$/.test(String(value)) ? String(value) : ''));
  }, [value, payrollYears]);

  useEffect(() => {
    if (!show) return;
    const handle = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [show]);

  return (
    <div className="year-picker-wrap" ref={ref}>
      <input
        type="text"
        className="year-input"
        value={text}
        placeholder="e.g. 2026"
        onChange={e => {
          const val = e.target.value;
          setText(val);
          const match = payrollYears.find(y => String(y.year_value) === val);
          onChange(match ? match.year_id : val);
        }}
      />
      <button type="button" className="year-calendar-btn" onClick={() => setShow(p => !p)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </button>
      {show && (
        <div className="year-picker-dropdown">
          {Array.from({ length: 21 }, (_, i) => 2015 + i).map(yr => {
            const found = payrollYears.find(y => String(y.year_value) === String(yr));
            const isSelected = found ? String(found.year_id) === String(value) : String(value) === String(yr);
            return (
              <div
                key={yr}
                className={`year-picker-option${isSelected ? ' selected' : ''}`}
                onClick={() => { onChange(found ? found.year_id : String(yr)); setShow(false); }}
              >
                {yr}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FILTER_CATS = ['company','location','branch','division','department','class','position','emp_type','salary_type'];

export default function PayrollSummaryReportPage() {
  const [step, setStep] = useState('setup');
  const [mode, setMode] = useState('period');
  const [meta, setMeta] = useState({ payrollGroups:[], payrollPeriods:[], payrollMonths:[], payrollYears:[] });
  const [filters, setFilters] = useState({
    payroll_group:'', payroll_period:'', month:'', year:'',
    start_period:'', start_month:'', start_year:'',
    end_period:'', end_month:'', end_year:'',
    status:'active', orderBy:'department_surname',
    company:'', location:'', branch:'', division:'', department:'',
    empClass:'', position:'', empType:'', salaryType:'',
    employeeInput:'', employeeId:'',
  });

  const [filterOpts, setFilterOpts] = useState({
    companies:[], locations:[], branches:[], divisions:[], departments:[],
    classes:[], positions:[], empTypes:[], salaryTypes:[], employees:[],
  });

  const [runIds,   setRunIds]   = useState([]);
  const [rows,     setRows]     = useState([]);
  const [runInfo,  setRunInfo]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const [showPrint,setShowPrint]= useState(false);
  const [printOpts,setPrintOpts]= useState({ output:'printer', paperSize:'legal', copies:1, printAll:true, from:1, to:1 });
  const [toast,    setToast]    = useState('');

  function upFilter(k, v) { setFilters(f => ({...f, [k]:v})); }

  function clearFilters() {
    setFilters(f => ({...f,
      company:'', location:'', branch:'', division:'', department:'',
      empClass:'', position:'', empType:'', salaryType:'',
      employeeInput:'', employeeId:'', status:'active',
    }));
  }

  useEffect(() => {
    Promise.all([
      api.get('/payroll_periods').catch(() => ({ data: { data: {} } })),
      ...FILTER_CATS.map(c => api.get(`/system_lists/${c}`).catch(() => ({ data: [] }))),
      api.get('/employees').catch(() => ({ data: { employees: [] } })),
    ]).then(([periodsRes, coR, locR, brR, divR, deptR, classR, posR, etR, stR, empRes]) => {
      const p = periodsRes.data.data || {};
      setMeta({
        payrollGroups:  p.payrollGroups  || [],
        payrollPeriods: p.payrollPeriods || [],
        payrollMonths:  p.payrollMonths  || [],
        payrollYears:   p.payrollYears   || [],
      });
      const nowYear = String(new Date().getFullYear());
      const foundYear = (p.payrollYears || []).find(y => String(y.year_value) === nowYear);
      setFilters(f => ({ ...f, year: foundYear ? foundYear.year_id : nowYear }));
      const toVals = r => (Array.isArray(r.data) ? r.data.map(x => x.value || x) : []);
      setFilterOpts({
        companies:   toVals(coR),
        locations:   toVals(locR),
        branches:    toVals(brR),
        divisions:   toVals(divR),
        departments: toVals(deptR),
        classes:     toVals(classR),
        positions:   toVals(posR),
        empTypes:    toVals(etR),
        salaryTypes: toVals(stR),
        employees:   empRes.data.employees || [],
      });
    }).catch(err => setMsg(getApiMessage(err, 'Failed to load setup data.')));
  }, []);

  const payrollRangeDisplay = useMemo(() => {
    if (!runInfo.length) return '';
    if (runInfo.length === 1) return runInfo[0].payroll_range || '';
    return `${runInfo[0]?.payroll_range||''} to ${runInfo[runInfo.length-1]?.payroll_range||''}`;
  }, [runInfo]);

  async function generateReport() {
    const { payroll_group, payroll_period, month, year } = filters;
    if (mode === 'period' && (!payroll_group || !payroll_period || !month || !year)) {
      setMsg('Please fill in Payroll Group, Period, Month and Year.'); return;
    }
    if (mode === 'range' && (
      !payroll_group ||
      !filters.start_period || !filters.start_month || !filters.start_year ||
      !filters.end_period || !filters.end_month || !filters.end_year
    )) {
      setMsg('Please fill in all range fields.'); return;
    }
    setLoading(true); setMsg(''); setRows([]); setRunIds([]);
    try {
      let ids = [];
      if (mode === 'period') {
        const { data } = await api.get('/get_run_id_payroll_journal', {
          params: { payroll_group, payroll_period, month, year }
        });
        if (!data.success || !data.run_id) throw new Error(data.message || 'No payroll run found.');
        ids = [data.run_id];
      } else {
        const { data } = await api.get('/get_run_ids_range', {
          params: {
            payroll_group,
            from_period: filters.start_period,
            from_month: filters.start_month,
            from_year: filters.start_year,
            to_period: filters.end_period,
            to_month: filters.end_month,
            to_year: filters.end_year
          }
        });
        if (!data.success || !data.run_ids?.length) throw new Error(data.message || 'No runs found for date range.');
        ids = data.run_ids;
      }
      setRunIds(ids);

      const fp = { run_ids:ids.join(','), status:filters.status, orderBy:filters.orderBy };
      if (filters.company)    fp.company    = filters.company;
      if (filters.location)   fp.location   = filters.location;
      if (filters.branch)     fp.branch     = filters.branch;
      if (filters.division)   fp.division   = filters.division;
      if (filters.department) fp.department = filters.department;
      if (filters.empClass)   fp.class      = filters.empClass;
      if (filters.position)   fp.position   = filters.position;
      if (filters.empType)    fp.empType    = filters.empType;
      if (filters.salaryType) fp.salaryType = filters.salaryType;
      if (filters.employeeId) fp.employeeId = filters.employeeId;

      const { data:empData } = await api.get('/payroll_journal_employees', { params:fp });
      if (!empData.success) throw new Error(empData.message || 'Failed to load journal data.');
      const empRows = empData.employees || [];
      setRows(empRows);

      if (ids.length) {
        const { data:ri } = await api.get('/payroll_runs_by_ids', { params:{ run_ids:ids.join(',') } });
        setRunInfo(ri.runs || []);
      }
      if (!empRows.length) { setMsg('No records found.'); return; }
      setStep('journal');
    } catch(err) {
      setMsg(getApiMessage(err, 'Failed to generate report.'));
    } finally {
      setLoading(false);
    }
  }

  const grandTotal = useMemo(() => { const acc = emptyTotals(); rows.forEach(r => accum(acc, r)); return acc; }, [rows]);
  const grouped    = useMemo(() => buildGroups(rows, filters.orderBy), [rows, filters.orderBy]);
  const rowNumbers = useMemo(() => { const m = new WeakMap(); rows.forEach((r, i) => m.set(r, i + 1)); return m; }, [rows]);

  async function doPrint() {
    try {
      if (!rows.length) {
        throw new Error('Generate the payroll journal before exporting.');
      }

      if (['txt', 'csv', 'excel', 'xlsx'].includes(printOpts.output)) {
        const date = new Date().toISOString().slice(0, 10);
        const rangeSlug = (payrollRangeDisplay || runIds.join('-') || 'journal')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const filenameBase = `payroll-journal-${rangeSlug}-${date}`;
        const meta = getReportMetadata('Payroll Journal Details');

        if (printOpts.output === 'excel') {
          exportJournalXls(filenameBase, rows, meta, payrollRangeDisplay, filters.orderBy);
          setShowPrint(false);
          return;
        }

        if (printOpts.output === 'xlsx') {
          exportJournalXlsx(filenameBase, rows, meta, payrollRangeDisplay, filters.orderBy);
          setShowPrint(false);
          return;
        }

        exportJournalDelimited(printOpts.output, filenameBase, rows, meta, payrollRangeDisplay, filters.orderBy);
        setShowPrint(false);
        return;
      }

      const headerNode = document.getElementById('journalHeader');
      const tableNode = document.getElementById('journalTable');

      if (!headerNode || !tableNode) {
        throw new Error('Payroll journal table is not ready to print.');
      }

      const meta = getReportMetadata('Payroll Journal Details');
      const headerHtml = `
        <div class="report-export-header" style="text-align:center;">
          <h2>${escapeHtml(meta.companyName)}</h2>
          <p><strong>Report:</strong> ${escapeHtml(meta.title)}</p>
          <p><strong>Generated:</strong> ${escapeHtml(meta.generatedAt)}</p>
          <p><strong>Generated By:</strong> ${escapeHtml(meta.generatedBy)}</p>
        </div>
        ${headerNode.outerHTML}
      `;
      const tableHtml = `
        ${tableNode.outerHTML}
        <div class="report-signatories" style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:34px;font-size:12px;">
          ${meta.signatories.map((label) => `<div><strong>${escapeHtml(label)}</strong><div style="border-bottom:1px solid #333;height:30px;"></div></div>`).join('')}
        </div>
      `;

      const { data } = await api.post('/payroll_journal/pdf', {
        headerHtml,
        tableHtml,
        paperSize: printOpts.paperSize,
        landscape: true
      }, {
        responseType: 'blob'
      });

      const pdfUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      if (printOpts.output === 'pdf') {
        const date = new Date().toISOString().slice(0, 10);
        const rangeSlug = (payrollRangeDisplay || runIds.join('-') || 'journal')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `payroll-journal-${rangeSlug}-${date}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        window.open(pdfUrl, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch(err) {
      setToast(getApiMessage(err, 'Failed to generate PDF.')); setTimeout(() => setToast(''), 3000);
    }
    setShowPrint(false);
  }

  // ============================================================
  // STEP 1: Setup
  // ============================================================
  if (step === 'setup') {
    const { employees } = filterOpts;
    return (
      <div className="section">
        <header className="header">
          <h2>Payroll Summary Report</h2>
          <p>View a summarized breakdown of payroll entries for the selected period or range.</p>
        </header>

        <section>
          <h3>Step 1: Setup Payroll Journal</h3>
          <form className="filter-form">
            <div className="setup-container">

              {/* Payroll Period Panel */}
              <div className="payroll-period-panel">
                <h4>Covered Date</h4>
                <div className="covered-date-options">
                  <label><input type="radio" name="mode" value="period" checked={mode==='period'} onChange={()=>setMode('period')} /> Period</label>
                  <label><input type="radio" name="mode" value="range"  checked={mode==='range'}  onChange={()=>setMode('range')}  /> Range</label>
                </div>

                {mode === 'period' && (
                  <div className="form-grid">
                    <div className="payroll-period-row">
                      <label>Payroll Group:</label>
                      <select value={filters.payroll_group} onChange={e=>upFilter('payroll_group',e.target.value)}>
                        <option value="">-- Select Group --</option>
                        {meta.payrollGroups.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label>Period:</label>
                      <select value={filters.payroll_period} onChange={e=>upFilter('payroll_period',e.target.value)}>
                        <option value="">-- Select Period --</option>
                        {meta.payrollPeriods.map(p=><option key={p.period_id} value={p.period_id}>{p.period_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label>Month:</label>
                      <select value={filters.month} onChange={e=>upFilter('month',e.target.value)}>
                        <option value="">-- Select Month --</option>
                        {meta.payrollMonths.map(m=><option key={m.month_id} value={m.month_id}>{m.month_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label>Year:</label>
                      <YearPicker value={filters.year} payrollYears={meta.payrollYears} onChange={v=>upFilter('year',v)} />
                    </div>
                    <div className="payroll-period-row">
                      <label>Generated Payroll Range:</label>
                      <input type="text" readOnly value="" />
                    </div>
                  </div>
                )}

                {mode === 'range' && (
                  <div className="form-grid">
                    <div className="payroll-period-row">
                      <label>Payroll Group:</label>
                      <select value={filters.payroll_group} onChange={e=>upFilter('payroll_group',e.target.value)}>
                        <option value="">-- Select Group --</option>
                        {meta.payrollGroups.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label>From:</label>
                      <select value={filters.start_period} onChange={e=>upFilter('start_period',e.target.value)}>
                        <option value="">-- Select Period --</option>
                        {meta.payrollPeriods.map(p=><option key={p.period_id} value={p.period_id}>{p.period_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label></label>
                      <select value={filters.start_month} onChange={e=>upFilter('start_month',e.target.value)}>
                        <option value="">-- Select Month --</option>
                        {meta.payrollMonths.map(m=><option key={m.month_id} value={m.month_id}>{m.month_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label></label>
                      <YearPicker value={filters.start_year} payrollYears={meta.payrollYears} onChange={v=>upFilter('start_year',v)} />
                    </div>
                    <div className="payroll-period-row">
                      <label>To:</label>
                      <select value={filters.end_period} onChange={e=>upFilter('end_period',e.target.value)}>
                        <option value="">-- Select Period --</option>
                        {meta.payrollPeriods.map(p=><option key={p.period_id} value={p.period_id}>{p.period_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label></label>
                      <select value={filters.end_month} onChange={e=>upFilter('end_month',e.target.value)}>
                        <option value="">-- Select Month --</option>
                        {meta.payrollMonths.map(m=><option key={m.month_id} value={m.month_id}>{m.month_name}</option>)}
                      </select>
                    </div>
                    <div className="payroll-period-row">
                      <label></label>
                      <YearPicker value={filters.end_year} payrollYears={meta.payrollYears} onChange={v=>upFilter('end_year',v)} />
                    </div>
                    <div className="payroll-period-row">
                      <label>Generated Payroll Range:</label>
                      <input type="text" readOnly value="" />
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Panel */}
              <div className="filter-panel">
                <h4>Filter</h4>
                <div className="form-grid" id="summaryCategorySelector">
                  <div className="filter-row">
                    <label>Company:</label>
                    <select value={filters.company} onChange={e=>upFilter('company',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.companies.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Location:</label>
                    <select value={filters.location} onChange={e=>upFilter('location',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.locations.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Branch:</label>
                    <select value={filters.branch} onChange={e=>upFilter('branch',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.branches.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Division:</label>
                    <select value={filters.division} onChange={e=>upFilter('division',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.divisions.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Department:</label>
                    <select value={filters.department} onChange={e=>upFilter('department',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.departments.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Class:</label>
                    <select value={filters.empClass} onChange={e=>upFilter('empClass',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.classes.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Position:</label>
                    <select value={filters.position} onChange={e=>upFilter('position',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.positions.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Employee Type:</label>
                    <select value={filters.empType} onChange={e=>upFilter('empType',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.empTypes.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Salary Type:</label>
                    <select value={filters.salaryType} onChange={e=>upFilter('salaryType',e.target.value)}>
                      <option value=""></option>
                      {filterOpts.salaryTypes.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="filter-row">
                    <label>Employee:</label>
                    <input
                      type="text"
                      list="summaryEmployeeOptions"
                      placeholder="Type employee code or name"
                      autoComplete="off"
                      value={filters.employeeInput}
                      onChange={e => {
                        const val = e.target.value;
                        upFilter('employeeInput', val);
                        const matched = employees.find(emp =>
                          emp.emp_code === val ||
                          `${emp.emp_code} - ${emp.last_name}, ${emp.first_name}` === val
                        );
                        upFilter('employeeId', matched ? matched.employee_id : '');
                      }}
                    />
                    <datalist id="summaryEmployeeOptions">
                      {employees.map(emp => (
                        <option key={emp.employee_id} value={`${emp.emp_code} - ${emp.last_name}, ${emp.first_name}`} />
                      ))}
                    </datalist>
                  </div>
                  {filters.employeeId && (() => {
                    const emp = employees.find(e => e.employee_id === filters.employeeId);
                    return emp ? (
                      <div className="filter-row">
                        <label></label>
                        <input type="text" readOnly value={`${emp.last_name}, ${emp.first_name}`} style={{textAlign:'center'}} />
                      </div>
                    ) : null;
                  })()}
                </div>
                <div style={{marginTop:15}}>
                  <button type="button" className="btn" style={{float:'right'}} onClick={clearFilters}>Clear Filters</button>
                  <label>Option:</label><br/>
                  <label><input type="radio" name="summaryOption" value="all"    checked={filters.status==='all'}    onChange={()=>upFilter('status','all')}    /> All</label>{' '}
                  <label><input type="radio" name="summaryOption" value="active" checked={filters.status==='active'} onChange={()=>upFilter('status','active')} /> Active</label>{' '}
                  <label><input type="radio" name="summaryOption" value="hold"   checked={filters.status==='hold'}   onChange={()=>upFilter('status','hold')}   /> Hold</label>
                </div>
              </div>
            </div>

            {msg && <p style={{color:'#dc2626',marginTop:10}}>{msg}</p>}

            <div style={{marginTop:25,textAlign:'right'}}>
              <button type="button" className="btn" disabled={loading} onClick={generateReport}>
                {loading ? 'Generating...' : 'Generate Payroll Journal'}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  // ============================================================
  // STEP 2: Journal
  // ============================================================
  const companies = Object.keys(grouped);
  const grpLabel  = groupTypeLabel(filters.orderBy);

  return (
    <div className="section">
      <header className="header">
        <h2>Payroll Summary Report</h2>
        <p>View a summarized breakdown of payroll entries for the selected period or range.</p>
      </header>

      <section className="table-section section-content">
        <div id="journalHeader" className="journal-header">
          <div className="journal-header-center">
            <h3>Payroll Journal Details</h3>
            <p>For the Period <strong>{payrollRangeDisplay || '[ Date Covered ]'}</strong></p>
          </div>
        </div>

        <div className="table-header" id="orderBy">
          <div>
            <label htmlFor="journalOrderBy"><strong>Order by:</strong></label>
            <select id="journalOrderBy" value={filters.orderBy} onChange={e=>upFilter('orderBy',e.target.value)}>
              {ORDER_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div id="journalTable" className="journal-table-wrapper">
          <table className="journal-table">
            <thead>
              <tr>
                <th rowSpan="2">Employee Name</th>
                <th rowSpan="2">Basic Pay</th>
                <th rowSpan="2">Absences</th>
                <th colSpan="1">Late</th>
                <th rowSpan="2">Total OT</th>
                {OT_TYPES.map(({key,label}) => (
                  <React.Fragment key={key}>
                    <th colSpan="1">{label} RATE</th>
                    <th colSpan="1">{label} OT</th>
                  </React.Fragment>
                ))}
                <th rowSpan="2">Tax Adj</th>
                <th rowSpan="2">Taxable<br/>Allowance</th>
                <th rowSpan="2">Gross Taxable</th>
                <th rowSpan="2">Non-Tax Adj</th>
                <th rowSpan="2">Non-Taxable<br/>Allowance</th>
                <th>SSS</th>
                <th>PhilHealth</th>
                <th>Pag-IBIG</th>
                <th>Tax Withheld</th>
                <th rowSpan="2">Total<br/>Deductions</th>
                <th rowSpan="2">Total Loans</th>
                <th rowSpan="2">Total Other<br/>Deductions</th>
                <th rowSpan="2">Net Pay</th>
              </tr>
              <tr>
                <th>Undertime</th>
                {OT_TYPES.map(({key,label}) => (
                  <React.Fragment key={key}>
                    <th>{label} ND</th>
                    <th>{label} OTND</th>
                  </React.Fragment>
                ))}
                <th colSpan="4">Adjustments</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(co => {
                const coGroups = grouped[co];
                const gKeys    = Object.keys(coGroups);
                const coTot    = emptyTotals();
                gKeys.forEach(gk => coGroups[gk].forEach(r => accum(coTot, r)));
                const coCount  = rows.filter(r => (r.company || '(No Company)') === co).length;

                return (
                  <React.Fragment key={`co-${co}`}>
                    <tr className="company-row">
                      <td colSpan="999"><strong>{co}</strong></td>
                    </tr>

                    {gKeys.map(gk => {
                      const grpRows = coGroups[gk];
                      const grpTot  = emptyTotals();
                      grpRows.forEach(r => accum(grpTot, r));

                      return (
                        <React.Fragment key={`grp-${co}-${gk}`}>
                          {gk && (
                            <tr className="group-row">
                              <td colSpan="999" style={{paddingLeft:30}}>{gk}</td>
                            </tr>
                          )}

                          {grpRows.map(row => (
                            <tr key={`${row.employee_id}-${rowNumbers.get(row)}`}>
                              <td>
                                <span style={{display:'inline-block',width:90}}>{rowNumbers.get(row)}. {row.emp_code}</span>
                                <span>{money(row.basic_salary)}</span><br/>
                                {row.last_name}, {row.first_name}
                              </td>
                              <td>{money(row.basic_salary)}</td>
                              <td>{money(row.absence_deduction)}</td>
                              <td>{money(row.late_deduction)}<br/>{money(row.undertime_deduction)}</td>
                              <td>{money(row.overtime)}</td>
                              {OT_TYPES.map(({key}) => (
                                <React.Fragment key={key}>
                                  <td>{money(row[`${key}_rate`])}<br/>{money(row[`${key}_rate_nd`])}</td>
                                  <td>{money(row[`${key}_ot`])}<br/>{money(row[`${key}_ot_nd`])}</td>
                                </React.Fragment>
                              ))}
                              <td>{money(row.adj_comp)}</td>
                              <td>{money(row.taxable_allowances)}</td>
                              <td>{money(row.gross_pay)}</td>
                              <td>{money(row.adj_non_comp)}</td>
                              <td>{money(row.non_taxable_allowances)}</td>
                              <td>{money(row.sss_employee)}</td>
                              <td>{money(row.philhealth_employee)}</td>
                              <td>{money(row.pagibig_employee)}</td>
                              <td>{money(row.tax_withheld)}</td>
                              <td>{money(row.total_deductions)}</td>
                              <td>{money(row.loans)}</td>
                              <td>{money(row.other_deductions)}</td>
                              <td>{money(row.net_pay)}</td>
                            </tr>
                          ))}

                          {gk && (
                            <tr className="subtotal-row">
                              <td>
                                <strong>Sub Total Per {grpLabel} - {gk} {grpRows.length} record(s)</strong>
                              </td>
                              <JournalTotCells t={grpTot} />
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    <tr className="subtotal-company-row">
                      <td>
                        <strong>Sub Total Per Company</strong><br/>
                        <span style={{display:'inline-block',width:90}}></span>
                        <span>{coCount} record(s)</span>
                      </td>
                      <JournalTotCells t={coTot} />
                    </tr>
                  </React.Fragment>
                );
              })}

              <tr className="grand-total-row">
                <td>
                  <strong>GRAND TOTAL</strong><br/>
                  <span style={{display:'inline-block',width:90}}></span>
                  <span>{rows.length} record(s)</span>
                </td>
                <JournalTotCells t={grandTotal} />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="payroll-buttons">
          <button type="button" className="btn" onClick={()=>setStep('setup')}>&#8592; Back to Filters</button>
          <div className="right-buttons">
            <button type="button" className="btn" onClick={()=>setShowPrint(true)}>&#128438; Print Payroll</button>
          </div>
        </div>
      </section>

      {showPrint && (
        <div className="payroll-modal">
          <div className="modal-content" style={{maxWidth:480}}>
            <h3>Print Payroll Journal</h3>
            <form>
              <div className="form-row">
                <label>Output</label>
                <select value={printOpts.output} onChange={e=>setPrintOpts(o=>({...o,output:e.target.value}))}>
                  <option value="printer">Printer</option>
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                  <option value="xlsx">XLSX</option>
                  <option value="txt">Text</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              {printOpts.output === 'printer' && (
                <>
                  <div className="form-row">
                    <label>Paper Size</label>
                    <select value={printOpts.paperSize} onChange={e=>setPrintOpts(o=>({...o,paperSize:e.target.value}))}>
                      <option value="legal">Legal</option>
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>No. of Copies</label>
                    <input type="number" min="1" value={printOpts.copies} onChange={e=>setPrintOpts(o=>({...o,copies:Number(e.target.value)}))} />
                  </div>
                  <div className="form-row">
                    <label>Print Range</label><br/>
                    <label><input type="radio" name="prange" value="all" checked={printOpts.printAll} onChange={()=>setPrintOpts(o=>({...o,printAll:true}))} /> All Pages</label>
                    <label style={{marginLeft:15}}><input type="radio" name="prange" value="range" checked={!printOpts.printAll} onChange={()=>setPrintOpts(o=>({...o,printAll:false}))} /> Pages</label>
                  </div>
                  {!printOpts.printAll && (
                    <div className="form-row">
                      <input type="number" min="1" value={printOpts.from} onChange={e=>setPrintOpts(o=>({...o,from:Number(e.target.value)}))} placeholder="From" style={{width:80}} />
                      <span style={{margin:'0 6px'}}>to</span>
                      <input type="number" min="1" value={printOpts.to} onChange={e=>setPrintOpts(o=>({...o,to:Number(e.target.value)}))} placeholder="To" style={{width:80}} />
                    </div>
                  )}
                </>
              )}
              <div className="modal-buttons" style={{marginTop:20}}>
                <button type="button" className="btn" onClick={doPrint}>{printOpts.output === 'printer' ? 'Print' : 'Export'}</button>
                <button type="button" className="btn continue-without-adding" onClick={()=>setShowPrint(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toastWarning">{toast}</div>}
    </div>
  );
}

function JournalTotCells({ t }) {
  return (
    <>
      <td>{money(t.basic_salary)}</td>
      <td>{money(t.absence_deduction)}</td>
      <td>{money(t.late_deduction)}<br/>{money(t.undertime_deduction)}</td>
      <td>{money(t.overtime)}</td>
      {OT_TYPES.map(({key}) => (
        <React.Fragment key={key}>
          <td>{money(t[`${key}_rate`])}<br/>{money(t[`${key}_rate_nd`])}</td>
          <td>{money(t[`${key}_ot`])}<br/>{money(t[`${key}_ot_nd`])}</td>
        </React.Fragment>
      ))}
      <td>{money(t.adj_comp)}</td>
      <td>{money(t.taxable_allowances)}</td>
      <td>{money(t.gross_pay)}</td>
      <td>{money(t.adj_non_comp)}</td>
      <td>{money(t.non_taxable_allowances)}</td>
      <td>{money(t.sss_employee)}</td>
      <td>{money(t.philhealth_employee)}</td>
      <td>{money(t.pagibig_employee)}</td>
      <td>{money(t.tax_withheld)}</td>
      <td>{money(t.total_deductions)}</td>
      <td>{money(t.loans)}</td>
      <td>{money(t.other_deductions)}</td>
      <td><strong>{money(t.net_pay)}</strong></td>
    </>
  );
}
