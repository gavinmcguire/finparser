/**
 * Excel Export Engine — Investment Banking Style
 * 
 * Generates analyst-ready .xlsx files with:
 * - IB-style visual hierarchy (indentation, bold subtotals, section headers)
 * - Borders above/below subtotals, grey fills on headers
 * - Summary metrics block at top of each sheet
 * - Separate "Supplemental / Unmapped Items" worksheet
 * - Frozen panes, auto-sized columns, accounting number format
 */

import * as XLSX from 'xlsx';
import { ClassifiedTable, selectPrimaryStatements } from './classifyTables';
import { normalizeTable, NormalizedStatement, NormalizedRow } from './normalizeTable';
import { StatementType } from './canonicalSchema';

interface ExportOptions {
  companyName: string;
  fileName: string;
  classifiedTables: ClassifiedTable[];
  unitMultiplier?: number;
  overrides?: {
    incomeStatement?: ClassifiedTable | null;
    balanceSheet?: ClassifiedTable | null;
    cashFlow?: ClassifiedTable | null;
  };
}

// ─── Style constants ────────────────────────────────────────────────

const GREY_FILL = { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } };
const SUMMARY_HEADER_FILL = { patternType: 'solid', fgColor: { rgb: 'DAE3F3' } };
const SUMMARY_FILL = { patternType: 'solid', fgColor: { rgb: 'EDF2FA' } };

const BORDER_THIN = { style: 'thin', color: { rgb: 'B0B0B0' } };
const BORDER_MEDIUM = { style: 'medium', color: { rgb: '000000' } };
const BORDER_BOTTOM_MEDIUM = { bottom: BORDER_MEDIUM };
const BORDER_TOP_MEDIUM = { top: BORDER_MEDIUM };
const BORDER_TOP_BOTTOM_MEDIUM = { top: BORDER_MEDIUM, bottom: BORDER_MEDIUM };
const BORDER_BOX_THIN = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

const ACCT_FMT = '#,##0;(#,##0);"-"';
const BOLD_FONT = { bold: true };
const BOLD_FONT_LARGE = { bold: true, sz: 13 };
const SECTION_FONT = { bold: true, sz: 11 };
const HEADER_FONT = { bold: true, sz: 10, color: { rgb: '333333' } };

// ─── Summary metric definitions per statement type ──────────────────

interface SummaryMetric {
  label: string;
  canonicalLabel: string;
}

const SUMMARY_METRICS: Record<StatementType, SummaryMetric[]> = {
  income_statement: [
    { label: 'Revenue', canonicalLabel: 'Revenue' },
    { label: 'Gross Profit', canonicalLabel: 'Gross Profit' },
    { label: 'Operating Income', canonicalLabel: 'Operating Income (EBIT)' },
    { label: 'Net Income', canonicalLabel: 'Net Income' },
  ],
  cash_flow: [
    { label: 'Operating Cash Flow', canonicalLabel: 'Net Cash from Operating Activities' },
    { label: 'CapEx', canonicalLabel: 'Capital Expenditures' },
    { label: 'Free Cash Flow', canonicalLabel: '' }, // derived
  ],
  balance_sheet: [
    { label: 'Total Assets', canonicalLabel: 'Total Assets' },
    { label: 'Total Debt', canonicalLabel: 'Long-Term Debt' },
    { label: 'Cash & Equivalents', canonicalLabel: 'Cash & Cash Equivalents' },
  ],
};

// ─── Indentation level assignment ───────────────────────────────────

function getIndentLevel(row: NormalizedRow): number {
  if (row.isSubtotal || row.isBold) return 0;
  // Sub-items in cash flow already have leading spaces
  if (row.canonicalLabel.startsWith('  ')) return 2;
  return 1;
}

function indentLabel(label: string, level: number): string {
  const clean = label.trimStart();
  const prefix = level === 1 ? '    ' : level === 2 ? '        ' : '';
  return prefix + clean;
}

// ─── Summary block builder ──────────────────────────────────────────

function buildSummaryBlock(
  statement: NormalizedStatement,
  companyName: string
): { data: any[][]; rowCount: number } {
  const metrics = SUMMARY_METRICS[statement.type];
  if (!metrics || metrics.length === 0) return { data: [], rowCount: 0 };

  const data: any[][] = [];
  const periodCount = statement.periods.length;

  // Summary header
  data.push(['KEY METRICS', ...statement.periods.map(() => '')]);

  for (const metric of metrics) {
    let values: (number | null)[] = new Array(periodCount).fill(null);

    if (metric.canonicalLabel) {
      const matchedRow = statement.rows.find(r => r.canonicalLabel === metric.canonicalLabel);
      if (matchedRow) values = matchedRow.values;
    } else if (metric.label === 'Free Cash Flow') {
      // Derive FCF = Operating CF - |CapEx|
      const opCF = statement.rows.find(r => r.canonicalLabel === 'Net Cash from Operating Activities');
      const capex = statement.rows.find(r => r.canonicalLabel === 'Capital Expenditures');
      if (opCF && capex) {
        values = opCF.values.map((v, i) => {
          if (v === null) return null;
          const cx = capex.values[i];
          if (cx === null) return v;
          return v - Math.abs(cx);
        });
      }
    }

    data.push([metric.label, ...values.map(v => v ?? '')]);
  }

  // Blank row after summary
  data.push([]);

  return { data, rowCount: data.length };
}

// ─── Main sheet data builder ────────────────────────────────────────

function buildSheetData(
  statement: NormalizedStatement,
  companyName: string
): {
  data: any[][];
  summaryRowCount: number;
  sectionHeaderRows: number[];
  subtotalRows: number[];
  boldRows: number[];
  headerRow: number;
} {
  const allData: any[][] = [];
  const sectionHeaderRows: number[] = [];
  const subtotalRows: number[] = [];
  const boldRows: number[] = [];

  // Title row
  allData.push([`${companyName} — ${statement.sheetName}`]);
  allData.push([]); // blank

  // Summary block
  const summary = buildSummaryBlock(statement, companyName);
  const summaryStart = allData.length;
  const summaryRowCount = summary.rowCount;
  for (const row of summary.data) {
    allData.push(row);
  }

  // Header row
  const headerRow = allData.length;
  allData.push(['(USD in millions, unless noted)', ...statement.periods]);
  allData.push([]); // blank separator

  // Data rows
  let currentSection = '';

  for (const row of statement.rows) {
    // Section header with blank row before it
    if (row.section && row.section !== currentSection) {
      if (currentSection !== '') {
        allData.push([]); // blank between sections
      }
      currentSection = row.section;
      sectionHeaderRows.push(allData.length);
      allData.push([currentSection.toUpperCase()]);
    }

    const indent = getIndentLevel(row);
    const label = indentLabel(row.canonicalLabel, indent);
    const values = row.values.map(v => (v === null ? '' : v));

    if (row.isSubtotal) {
      subtotalRows.push(allData.length);
    }
    if (row.isBold) {
      boldRows.push(allData.length);
    }

    allData.push([label, ...values]);
  }

  return {
    data: allData,
    summaryRowCount,
    sectionHeaderRows,
    subtotalRows,
    boldRows,
    headerRow,
  };
}

// ─── Style application ──────────────────────────────────────────────

function applyStyles(
  ws: XLSX.WorkSheet,
  meta: {
    data: any[][];
    summaryRowCount: number;
    sectionHeaderRows: number[];
    subtotalRows: number[];
    boldRows: number[];
    headerRow: number;
    periodCount: number;
  }
) {
  const { data, summaryRowCount, sectionHeaderRows, subtotalRows, boldRows, headerRow, periodCount } = meta;
  const totalCols = 1 + periodCount;

  // Column widths
  const colWidths = [{ wch: 44 }]; // label column
  for (let i = 0; i < periodCount; i++) {
    colWidths.push({ wch: 18 });
  }
  ws['!cols'] = colWidths;

  // Freeze panes: freeze header row and first column
  ws['!freeze'] = { xSplit: 1, ySplit: headerRow + 1 };

  // Merges: title row
  if (totalCols > 1) {
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    ];
  }

  // Apply cell-level styles
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < totalCols; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!ws[cellRef]) continue;
      const cell = ws[cellRef];

      // Initialize style
      if (!cell.s) cell.s = {};

      // Title row
      if (r === 0) {
        cell.s = { font: BOLD_FONT_LARGE };
      }

      // Summary block styling (starts at row 2, summaryRowCount lines)
      const summaryStart = 2;
      const summaryEnd = summaryStart + summaryRowCount;
      if (r >= summaryStart && r < summaryEnd) {
        if (r === summaryStart) {
          // Summary header row
          cell.s = { font: SECTION_FONT, fill: SUMMARY_HEADER_FILL, border: BORDER_BOX_THIN };
        } else if (r < summaryEnd - 1) {
          // Summary data rows
          cell.s = { fill: SUMMARY_FILL, border: BORDER_BOX_THIN };
          if (c > 0 && typeof cell.v === 'number') {
            cell.z = ACCT_FMT;
            cell.s = { ...cell.s, alignment: { horizontal: 'right' } };
          }
          if (c === 0) {
            cell.s = { ...cell.s, font: { bold: true, sz: 10 } };
          }
        }
        continue;
      }

      // Header row
      if (r === headerRow) {
        cell.s = { font: HEADER_FONT, border: { bottom: BORDER_MEDIUM }, alignment: c > 0 ? { horizontal: 'center' } : {} };
        continue;
      }

      // Section headers (grey fill, bold, all caps)
      if (sectionHeaderRows.includes(r)) {
        cell.s = { font: SECTION_FONT, fill: GREY_FILL, border: { bottom: BORDER_THIN } };
        continue;
      }

      // Subtotal rows: top border, bold
      if (subtotalRows.includes(r)) {
        const borderStyle = { top: BORDER_MEDIUM, bottom: { style: 'thin', color: { rgb: '000000' } } };
        if (c === 0) {
          cell.s = { font: BOLD_FONT, border: borderStyle };
        } else {
          cell.s = { font: BOLD_FONT, border: borderStyle, alignment: { horizontal: 'right' } };
          if (typeof cell.v === 'number') cell.z = ACCT_FMT;
        }
        continue;
      }

      // Bold rows (non-subtotal)
      if (boldRows.includes(r)) {
        if (c === 0) {
          cell.s = { font: BOLD_FONT };
        } else {
          cell.s = { font: BOLD_FONT, alignment: { horizontal: 'right' } };
          if (typeof cell.v === 'number') cell.z = ACCT_FMT;
        }
        continue;
      }

      // Regular data rows: number formatting
      if (c > 0 && typeof cell.v === 'number') {
        cell.z = ACCT_FMT;
        cell.s = { ...cell.s, alignment: { horizontal: 'right' } };
      }
    }
  }
}

// ─── Unmapped items sheet ───────────────────────────────────────────

function buildUnmappedSheet(
  allUnmapped: { source: string; label: string; values: string[] }[],
  periods: string[]
): XLSX.WorkSheet | null {
  if (allUnmapped.length === 0) return null;

  const data: any[][] = [];
  data.push(['Supplemental / Unmapped Items']);
  data.push([]);
  data.push(['Source Statement', 'Line Item', ...periods]);

  for (const item of allUnmapped) {
    data.push([item.source, item.label, ...item.values]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = [
    { wch: 24 },
    { wch: 40 },
    ...periods.map(() => ({ wch: 18 })),
  ];

  // Style header
  const headerRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[headerRef]) {
    ws[headerRef].s = { font: BOLD_FONT_LARGE };
  }
  // Column headers bold
  for (let c = 0; c < 2 + periods.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 2, c });
    if (ws[ref]) {
      ws[ref].s = { font: HEADER_FONT, border: { bottom: BORDER_MEDIUM } };
    }
  }

  return ws;
}

// ─── Main export function ───────────────────────────────────────────

export function generateExcelExport({ companyName, fileName, classifiedTables, overrides, unitMultiplier = 1 }: ExportOptions): boolean {
  const wb = XLSX.utils.book_new();
  let sheetsAdded = 0;

  const primary = selectPrimaryStatements(classifiedTables);

  const statementEntries: { type: StatementType; table: ClassifiedTable | null }[] = [
    { type: 'income_statement', table: overrides?.incomeStatement !== undefined ? overrides.incomeStatement : primary.incomeStatement },
    { type: 'balance_sheet', table: overrides?.balanceSheet !== undefined ? overrides.balanceSheet : primary.balanceSheet },
    { type: 'cash_flow', table: overrides?.cashFlow !== undefined ? overrides.cashFlow : primary.cashFlow },
  ];

  const allUnmapped: { source: string; label: string; values: string[] }[] = [];
  let longestPeriods: string[] = [];

  for (const { type, table: classified } of statementEntries) {
    if (!classified) continue;

    const normalized = normalizeTable(classified.table, type, unitMultiplier);
    if (normalized.rows.length === 0) continue;

    // Collect unmapped rows for separate sheet
    for (const um of normalized.unmatchedRows) {
      allUnmapped.push({ source: normalized.sheetName, label: um.label, values: um.values });
    }
    if (normalized.periods.length > longestPeriods.length) {
      longestPeriods = normalized.periods;
    }

    // Build sheet WITHOUT unmapped rows inline
    const sheetMeta = buildSheetData(normalized, companyName);
    const ws = XLSX.utils.aoa_to_sheet(sheetMeta.data);

    applyStyles(ws, {
      ...sheetMeta,
      periodCount: normalized.periods.length,
    });

    XLSX.utils.book_append_sheet(wb, ws, normalized.sheetName);
    sheetsAdded++;
  }

  // Unmapped items → separate sheet
  if (allUnmapped.length > 0) {
    const unmappedWs = buildUnmappedSheet(allUnmapped, longestPeriods);
    if (unmappedWs) {
      XLSX.utils.book_append_sheet(wb, unmappedWs, 'Supplemental');
    }
  }

  if (sheetsAdded === 0) return false;

  const cleanName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  const outputName = `${cleanName}_3Statement_Model.xlsx`;
  XLSX.writeFile(wb, outputName);

  return true;
}
