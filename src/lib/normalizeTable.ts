/**
 * Table Normalization Engine
 * 
 * Maps raw extracted table data into canonical financial schema rows
 * with period-aligned columns.
 */

import { CanonicalRow, getSchemaForType, StatementType } from './canonicalSchema';

export interface NormalizedStatement {
  type: StatementType;
  sheetName: string;
  periods: string[];
  rows: NormalizedRow[];
  unmatchedRows: { label: string; values: string[] }[];
}

export interface NormalizedRow {
  canonicalLabel: string;
  values: (number | null)[];
  isSubtotal: boolean;
  isBold: boolean;
  section: string;
  rawLabel?: string;
}

/**
 * Get normalized columns and rows from raw table data (same logic as TableExplorer)
 */
function getRawData(table: any): { columns: string[]; rows: string[][] } {
  let columns = table.columns || [];
  let rows = table.rows || [];

  if ((!columns.length || !rows.length) && table.cells?.length > 0) {
    const maxRow = Math.max(...table.cells.map((c: any) => c.rowIndex || 0));
    const maxCol = Math.max(...table.cells.map((c: any) => c.columnIndex || 0));
    const grid: string[][] = Array(maxRow + 1)
      .fill(null)
      .map(() => Array(maxCol + 1).fill(''));
    table.cells.forEach((cell: any) => {
      grid[cell.rowIndex || 0][cell.columnIndex || 0] = cell.content || '';
    });
    columns = grid[0] || [];
    rows = grid.slice(1);
  }

  return { columns, rows };
}

/**
 * Detect period columns from header row.
 * Filters out label columns and identifies date/period headers.
 */
function detectPeriods(columns: string[]): { periods: string[]; periodIndices: number[] } {
  const periods: string[] = [];
  const periodIndices: number[] = [];

  for (let i = 0; i < columns.length; i++) {
    const col = (columns[i] || '').trim();
    // Skip empty or label-like columns
    if (!col) continue;
    
    // Detect patterns: "2023", "FY2023", "Dec 31, 2023", "Q4 2023", "Year Ended...", 
    // "Three Months", "Twelve Months", "2024 vs 2023", month names with years
    const isDate = /\b(20\d{2}|19\d{2})\b/.test(col) ||
                   /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(col) ||
                   /\b(q[1-4]|fy\s*\d)/i.test(col) ||
                   /\b(year|month|quarter|period|ended|three|six|nine|twelve)\b/i.test(col);

    if (isDate) {
      periods.push(cleanPeriodLabel(col));
      periodIndices.push(i);
    }
  }

  // If no date columns detected, treat all numeric columns (index > 0) as periods
  if (periods.length === 0 && columns.length > 1) {
    for (let i = 1; i < columns.length; i++) {
      const col = (columns[i] || '').trim();
      if (col) {
        periods.push(col);
        periodIndices.push(i);
      }
    }
  }

  return { periods, periodIndices };
}

function cleanPeriodLabel(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[""'']/g, '')
    .trim();
}

function parseNumericValue(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;
  let cleaned = value.replace(/[$,\s\u00A0]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned === '–' || cleaned === 'N/A' || cleaned === 'n/a') return null;

  const isNegative = (cleaned.includes('(') && cleaned.includes(')'));
  cleaned = cleaned.replace(/[()]/g, '');

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : (isNegative ? -num : num);
}

/**
 * Match a raw row label against canonical schema keywords.
 * Returns the best match or null.
 */
function matchRow(rawLabel: string, schema: CanonicalRow[]): CanonicalRow | null {
  if (!rawLabel) return null;
  const lower = rawLabel.toLowerCase().trim();
  if (!lower) return null;

  let bestMatch: CanonicalRow | null = null;
  let bestLength = 0;

  for (const canonical of schema) {
    for (const keyword of canonical.keywords) {
      if (lower.includes(keyword) && keyword.length > bestLength) {
        bestMatch = canonical;
        bestLength = keyword.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Normalize a classified table into the canonical schema.
 */
/**
 * Normalize a classified table into the canonical schema.
 * @param unitMultiplier - If provided, scale all numeric values (e.g. 1000 for "in thousands")
 */
export function normalizeTable(table: any, type: StatementType, unitMultiplier: number = 1): NormalizedStatement {
  const schema = getSchemaForType(type);
  const { columns, rows } = getRawData(table);
  const { periods, periodIndices } = detectPeriods(columns);

  // Track which canonical rows we've matched
  const matchedRows = new Map<string, NormalizedRow>();
  const unmatchedRows: { label: string; values: string[] }[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const rawLabel = (row[0] || '').trim();
    if (!rawLabel) continue;

    // Skip section header rows (only first cell has content)
    const hasValues = row.slice(1).some(cell => {
      const v = (cell || '').trim();
      return v && v !== '-' && v !== '—';
    });

    const match = matchRow(rawLabel, schema);

    if (match) {
      // Extract values at period column indices, applying unit multiplier
      const values = periodIndices.map(idx => {
        const v = parseNumericValue(row[idx]);
        // Don't scale EPS or share count rows
        if (v !== null && unitMultiplier !== 1) {
          const isPerShare = match.section === 'Per Share Data';
          return isPerShare ? v : v * unitMultiplier;
        }
        return v;
      });

      // If we already have this canonical row, prefer the one with more non-null values
      const existing = matchedRows.get(match.canonicalLabel);
      if (existing) {
        const existingNonNull = existing.values.filter(v => v !== null).length;
        const newNonNull = values.filter(v => v !== null).length;
        if (newNonNull <= existingNonNull) continue;
      }

      matchedRows.set(match.canonicalLabel, {
        canonicalLabel: match.canonicalLabel,
        values,
        isSubtotal: match.isSubtotal || false,
        isBold: match.isBold || false,
        section: match.section || '',
        rawLabel,
      });
    } else if (hasValues) {
      const values = periodIndices.map(idx => row[idx] || '');
      unmatchedRows.push({ label: rawLabel, values });
    }
  }

  // Build final rows in schema order, only including matched rows
  const normalizedRows: NormalizedRow[] = [];
  for (const canonical of schema) {
    const matched = matchedRows.get(canonical.canonicalLabel);
    if (matched) {
      normalizedRows.push(matched);
    }
  }

  const sheetNameMap: Record<StatementType, string> = {
    income_statement: 'Income Statement',
    balance_sheet: 'Balance Sheet',
    cash_flow: 'Cash Flow Statement',
  };

  return {
    type,
    sheetName: sheetNameMap[type],
    periods,
    rows: normalizedRows,
    unmatchedRows,
  };
}
