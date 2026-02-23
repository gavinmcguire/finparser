export type FinancialStatementType = 'income_statement' | 'balance_sheet' | 'cash_flow' | 'other';

export interface ClassifiedTable {
  table: any;
  originalIndex: number;
  type: FinancialStatementType;
  confidence: number;
}

const INCOME_STATEMENT_KEYWORDS = [
  'revenue', 'revenues', 'net income', 'gross profit', 'operating income',
  'earnings per share', 'cost of sales', 'cost of goods', 'operating expenses',
  'income from operations', 'net earnings', 'diluted eps', 'basic eps',
  'selling, general', 'interest expense', 'income tax', 'ebit', 'ebitda',
  'total revenues', 'gross margin', 'operating margin'
];

const BALANCE_SHEET_KEYWORDS = [
  'total assets', 'total liabilities', 'stockholders equity', 'shareholders equity',
  'current assets', 'current liabilities', 'long-term debt', 'retained earnings',
  'accounts receivable', 'accounts payable', 'inventory', 'inventories',
  'property, plant', 'goodwill', 'intangible assets', 'cash and cash equivalents',
  'total equity', 'common stock', 'treasury stock', 'accumulated deficit',
  'prepaid expenses', 'accrued liabilities', 'deferred revenue'
];

const CASH_FLOW_KEYWORDS = [
  'cash flows from operating', 'cash flows from investing', 'cash flows from financing',
  'net cash provided', 'net cash used', 'operating activities', 'investing activities',
  'financing activities', 'capital expenditures', 'depreciation and amortization',
  'changes in operating', 'purchase of property', 'proceeds from', 'repurchase of',
  'dividends paid', 'issuance of', 'repayment of', 'free cash flow',
  'net increase in cash', 'net decrease in cash', 'cash at beginning', 'cash at end'
];

function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.filter(keyword => lowerText.includes(keyword)).length;
}

function getTableText(table: any): string {
  const parts: string[] = [];
  
  // Add title if exists
  if (table.title) parts.push(table.title);
  
  // Add columns
  if (table.columns && Array.isArray(table.columns)) {
    parts.push(table.columns.join(' '));
  }
  
  // Add row labels (first column of each row)
  if (table.rows && Array.isArray(table.rows)) {
    table.rows.forEach((row: string[]) => {
      if (row && row[0]) parts.push(row[0]);
    });
  }
  
  // If cells format, extract content
  if (table.cells && Array.isArray(table.cells)) {
    table.cells.forEach((cell: any) => {
      if (cell.content) parts.push(cell.content);
    });
  }
  
  return parts.join(' ');
}

export function classifyTable(table: any): { type: FinancialStatementType; confidence: number } {
  const tableText = getTableText(table);
  
  const incomeScore = countKeywordMatches(tableText, INCOME_STATEMENT_KEYWORDS);
  const balanceScore = countKeywordMatches(tableText, BALANCE_SHEET_KEYWORDS);
  const cashFlowScore = countKeywordMatches(tableText, CASH_FLOW_KEYWORDS);
  
  const maxScore = Math.max(incomeScore, balanceScore, cashFlowScore);
  const totalKeywords = INCOME_STATEMENT_KEYWORDS.length + BALANCE_SHEET_KEYWORDS.length + CASH_FLOW_KEYWORDS.length;
  
  // Require at least 3 keyword matches to classify
  if (maxScore < 3) {
    return { type: 'other', confidence: 0 };
  }
  
  const confidence = Math.min(maxScore / 10, 1); // Normalize to 0-1
  
  if (incomeScore === maxScore && incomeScore > balanceScore && incomeScore > cashFlowScore) {
    return { type: 'income_statement', confidence };
  }
  if (balanceScore === maxScore && balanceScore > incomeScore && balanceScore > cashFlowScore) {
    return { type: 'balance_sheet', confidence };
  }
  if (cashFlowScore === maxScore && cashFlowScore > incomeScore && cashFlowScore > balanceScore) {
    return { type: 'cash_flow', confidence };
  }
  
  return { type: 'other', confidence: 0 };
}

export function classifyAllTables(tables: any[]): ClassifiedTable[] {
  return tables.map((table, index) => {
    const { type, confidence } = classifyTable(table);
    return {
      table,
      originalIndex: index,
      type,
      confidence
    };
  });
}

/**
 * Primary Statement Selection
 * 
 * When multiple tables are classified as the same type (e.g., two income statements),
 * this picks the best one based on:
 * 1. Anchor coverage — does it contain critical rows (Revenue, Net Income, Total Assets, etc.)?
 * 2. Period structure — does it have recognizable date/year columns?
 * 3. Data density — how many rows have actual numeric values?
 * 4. Keyword confidence — original classification score
 */

const ANCHOR_KEYWORDS: Record<FinancialStatementType, string[]> = {
  income_statement: ['revenue', 'net income', 'operating income', 'gross profit', 'cost of'],
  balance_sheet: ['total assets', 'total liabilities', 'stockholders equity', 'shareholders equity', 'cash and cash equivalents'],
  cash_flow: ['net cash provided by operating', 'net cash from operating', 'capital expenditure', 'purchase of property', 'financing activities'],
  other: [],
};

function countAnchors(table: any, type: FinancialStatementType): number {
  const text = getTableText(table).toLowerCase();
  return ANCHOR_KEYWORDS[type].filter(kw => text.includes(kw)).length;
}

function countPeriodColumns(table: any): number {
  const columns: string[] = table.columns || [];
  if (columns.length === 0 && table.cells?.length > 0) {
    const maxCol = Math.max(...table.cells.map((c: any) => c.columnIndex || 0));
    const grid: string[] = Array(maxCol + 1).fill('');
    table.cells.filter((c: any) => (c.rowIndex || 0) === 0).forEach((c: any) => {
      grid[c.columnIndex || 0] = c.content || '';
    });
    return grid.filter(col => /\b(20\d{2}|19\d{2})\b/.test(col) || /\b(q[1-4]|fy\s*\d)/i.test(col)).length;
  }
  return columns.filter(col => /\b(20\d{2}|19\d{2})\b/.test(col) || /\b(q[1-4]|fy\s*\d)/i.test(col)).length;
}

function countDataRows(table: any): number {
  const rows: string[][] = table.rows || [];
  return rows.filter(row => row && row.length > 1 && row.slice(1).some(cell => {
    const cleaned = (cell || '').replace(/[$,\s()%-]/g, '');
    return cleaned.length > 0 && !isNaN(parseFloat(cleaned));
  })).length;
}

function scorePrimaryStatement(classified: ClassifiedTable): number {
  const anchorScore = countAnchors(classified.table, classified.type) * 10;
  const periodScore = countPeriodColumns(classified.table) * 5;
  const densityScore = countDataRows(classified.table);
  const confidenceScore = classified.confidence * 8;
  return anchorScore + periodScore + densityScore + confidenceScore;
}

/**
 * Given all classified tables, select the single best table for each statement type.
 * Returns a filtered list with at most one IS, one BS, one CF.
 */
export function selectPrimaryStatements(classifiedTables: ClassifiedTable[]): {
  incomeStatement: ClassifiedTable | null;
  balanceSheet: ClassifiedTable | null;
  cashFlow: ClassifiedTable | null;
} {
  const pick = (type: FinancialStatementType): ClassifiedTable | null => {
    const candidates = classifiedTables.filter(t => t.type === type);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    // Score and pick the best
    return candidates.reduce((best, curr) =>
      scorePrimaryStatement(curr) > scorePrimaryStatement(best) ? curr : best
    );
  };

  return {
    incomeStatement: pick('income_statement'),
    balanceSheet: pick('balance_sheet'),
    cashFlow: pick('cash_flow'),
  };
}

export function getStatementLabel(type: FinancialStatementType): string {
  switch (type) {
    case 'income_statement': return 'Income Statement';
    case 'balance_sheet': return 'Balance Sheet';
    case 'cash_flow': return 'Cash Flow Statement';
    default: return 'Other Table';
  }
}

export function getStatementIcon(type: FinancialStatementType): string {
  switch (type) {
    case 'income_statement': return '📊';
    case 'balance_sheet': return '📋';
    case 'cash_flow': return '💰';
    default: return '📄';
  }
}
