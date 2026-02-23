/**
 * Excel Export Engine
 * 
 * Generates analyst-ready .xlsx files with:
 * - Clean 3-statement model layout
 * - Proper formatting (bold subtotals, number formats, section headers)
 * - Multi-sheet workbook (IS, BS, CF)
 */

import * as XLSX from 'xlsx';
import { ClassifiedTable, selectPrimaryStatements } from './classifyTables';
import { normalizeTable, NormalizedStatement } from './normalizeTable';
import { StatementType } from './canonicalSchema';

interface ExportOptions {
  companyName: string;
  fileName: string;
  classifiedTables: ClassifiedTable[];
}

function buildSheetData(statement: NormalizedStatement, companyName: string): any[][] {
  const data: any[][] = [];

  // Title row
  data.push([`${companyName} — ${statement.sheetName}`]);
  data.push([]); // blank

  // Header row: Label + periods
  data.push(['(in millions, unless noted)', ...statement.periods]);

  // Blank separator
  data.push([]);

  let currentSection = '';

  for (const row of statement.rows) {
    // Section header
    if (row.section && row.section !== currentSection) {
      currentSection = row.section;
      data.push([currentSection.toUpperCase()]);
    }

    // Data row
    const values = row.values.map(v => {
      if (v === null) return '';
      return v;
    });
    data.push([row.canonicalLabel, ...values]);
  }

  // Unmatched rows section
  if (statement.unmatchedRows.length > 0) {
    data.push([]);
    data.push(['OTHER LINE ITEMS (Not Mapped)']);
    for (const row of statement.unmatchedRows) {
      data.push([row.label, ...row.values]);
    }
  }

  return data;
}

function applyStyles(ws: XLSX.WorkSheet, data: any[][], statement: NormalizedStatement) {
  // Set column widths
  const colWidths = [{ wch: 40 }]; // label column
  for (let i = 0; i < statement.periods.length; i++) {
    colWidths.push({ wch: 18 });
  }
  ws['!cols'] = colWidths;

  // Merge title row across all columns
  const totalCols = 1 + statement.periods.length;
  if (totalCols > 1) {
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    ];
  }

  // Apply number format to data cells
  for (let r = 0; r < data.length; r++) {
    for (let c = 1; c < data[r].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell && typeof cell.v === 'number') {
        cell.z = '#,##0.0;(#,##0.0);"-"';
      }
    }
  }
}

export function generateExcelExport({ companyName, fileName, classifiedTables }: ExportOptions): boolean {
  const wb = XLSX.utils.book_new();
  let sheetsAdded = 0;

  const primary = selectPrimaryStatements(classifiedTables);

  const statementEntries: { type: StatementType; table: ClassifiedTable | null }[] = [
    { type: 'income_statement', table: primary.incomeStatement },
    { type: 'balance_sheet', table: primary.balanceSheet },
    { type: 'cash_flow', table: primary.cashFlow },
  ];

  for (const { type, table: classified } of statementEntries) {
    if (!classified) continue;

    const normalized = normalizeTable(classified.table, type);

    if (normalized.rows.length === 0) continue;

    const sheetData = buildSheetData(normalized, companyName);
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    applyStyles(ws, sheetData, normalized);
    XLSX.utils.book_append_sheet(wb, ws, normalized.sheetName);
    sheetsAdded++;
  }

  if (sheetsAdded === 0) return false;

  // Generate filename
  const cleanName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  const outputName = `${cleanName}_3Statement_Model.xlsx`;
  XLSX.writeFile(wb, outputName);

  return true;
}
