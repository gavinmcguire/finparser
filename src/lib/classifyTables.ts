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
