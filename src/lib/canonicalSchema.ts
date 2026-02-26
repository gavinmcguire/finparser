/**
 * Canonical Financial Schema
 * 
 * Defines the standardized row structure for 3-statement financial models.
 * Maps messy extracted labels to clean, analyst-ready canonical names.
 */

export interface CanonicalRow {
  canonicalLabel: string;
  keywords: string[];
  isSubtotal?: boolean;
  isBold?: boolean;
  section?: string;
}

// ─── Income Statement ───────────────────────────────────────────────
export const INCOME_STATEMENT_SCHEMA: CanonicalRow[] = [
  // Revenue
  { canonicalLabel: 'Revenue', keywords: ['total revenue', 'net revenue', 'revenues', 'total net revenue', 'net sales', 'total net sales', 'total sales', 'sales, net'], isBold: true, section: 'Revenue' },
  { canonicalLabel: 'Cost of Revenue', keywords: ['cost of revenue', 'cost of sales', 'cost of goods sold', 'cogs', 'cost of products sold', 'cost of net revenue'], section: 'Revenue' },
  { canonicalLabel: 'Gross Profit', keywords: ['gross profit', 'gross margin', 'gross income'], isSubtotal: true, isBold: true, section: 'Revenue' },

  // Operating Expenses
  { canonicalLabel: 'Research & Development', keywords: ['research and development', 'r&d', 'research & development', 'product development'], section: 'Operating Expenses' },
  { canonicalLabel: 'Selling, General & Administrative', keywords: ['selling, general and administrative', 'sg&a', 'selling, general & administrative', 'selling and administrative', 'general and administrative', 'selling general and admin'], section: 'Operating Expenses' },
  { canonicalLabel: 'Depreciation & Amortization', keywords: ['depreciation and amortization', 'depreciation & amortization', 'd&a', 'depreciation'], section: 'Operating Expenses' },
  { canonicalLabel: 'Other Operating Expenses', keywords: ['other operating expenses', 'other operating', 'restructuring', 'impairment'], section: 'Operating Expenses' },
  { canonicalLabel: 'Total Operating Expenses', keywords: ['total operating expenses', 'operating expenses, total'], isSubtotal: true, isBold: true, section: 'Operating Expenses' },

  // Operating Income
  { canonicalLabel: 'Operating Income (EBIT)', keywords: ['operating income', 'income from operations', 'operating profit', 'ebit', 'earnings before interest'], isSubtotal: true, isBold: true, section: 'Operating Income' },

  // Below the Line
  { canonicalLabel: 'Interest Expense', keywords: ['interest expense', 'interest and debt expense', 'interest cost'], section: 'Non-Operating' },
  { canonicalLabel: 'Interest Income', keywords: ['interest income', 'interest and investment income'], section: 'Non-Operating' },
  { canonicalLabel: 'Other Income / (Expense)', keywords: ['other income', 'other expense', 'other, net', 'non-operating income', 'other income (expense)'], section: 'Non-Operating' },
  { canonicalLabel: 'Pre-Tax Income', keywords: ['income before income tax', 'income before tax', 'earnings before tax', 'pre-tax income', 'income before provision'], isSubtotal: true, isBold: true, section: 'Non-Operating' },
  { canonicalLabel: 'Income Tax Expense', keywords: ['income tax expense', 'provision for income tax', 'income tax provision', 'tax expense', 'income taxes'], section: 'Non-Operating' },
  { canonicalLabel: 'Net Income', keywords: ['net income', 'net earnings', 'net profit', 'net income attributable', 'net income (loss)'], isSubtotal: true, isBold: true, section: 'Net Income' },

  // Per Share
  { canonicalLabel: 'Basic EPS', keywords: ['basic earnings per share', 'basic eps', 'basic net income per share', 'earnings per common share - basic'], section: 'Per Share Data' },
  { canonicalLabel: 'Diluted EPS', keywords: ['diluted earnings per share', 'diluted eps', 'diluted net income per share', 'earnings per common share - diluted'], section: 'Per Share Data' },
  { canonicalLabel: 'Shares Outstanding (Basic)', keywords: ['weighted average shares outstanding', 'basic shares outstanding', 'basic weighted', 'shares used in per share - basic'], section: 'Per Share Data' },
  { canonicalLabel: 'Shares Outstanding (Diluted)', keywords: ['diluted shares outstanding', 'diluted weighted', 'shares used in per share - diluted'], section: 'Per Share Data' },
];

// ─── Balance Sheet ──────────────────────────────────────────────────
export const BALANCE_SHEET_SCHEMA: CanonicalRow[] = [
  // Current Assets
  { canonicalLabel: 'Cash & Cash Equivalents', keywords: ['cash and cash equivalents', 'cash and equivalents', 'cash, cash equivalents'], section: 'Current Assets' },
  { canonicalLabel: 'Short-Term Investments', keywords: ['short-term investments', 'marketable securities', 'short term investments', 'current investments'], section: 'Current Assets' },
  { canonicalLabel: 'Accounts Receivable', keywords: ['accounts receivable', 'trade receivables', 'receivables, net', 'trade accounts receivable'], section: 'Current Assets' },
  { canonicalLabel: 'Inventories', keywords: ['inventories', 'inventory', 'merchandise inventories'], section: 'Current Assets' },
  { canonicalLabel: 'Prepaid Expenses', keywords: ['prepaid expenses', 'prepaid', 'prepaid and other current'], section: 'Current Assets' },
  { canonicalLabel: 'Other Current Assets', keywords: ['other current assets', 'other assets, current'], section: 'Current Assets' },
  { canonicalLabel: 'Total Current Assets', keywords: ['total current assets', 'current assets, total'], isSubtotal: true, isBold: true, section: 'Current Assets' },

  // Non-Current Assets
  { canonicalLabel: 'Property, Plant & Equipment', keywords: ['property, plant and equipment', 'property, plant & equipment', 'pp&e', 'property and equipment', 'net property'], section: 'Non-Current Assets' },
  { canonicalLabel: 'Goodwill', keywords: ['goodwill'], section: 'Non-Current Assets' },
  { canonicalLabel: 'Intangible Assets', keywords: ['intangible assets', 'other intangible', 'identifiable intangible'], section: 'Non-Current Assets' },
  { canonicalLabel: 'Long-Term Investments', keywords: ['long-term investments', 'non-current investments', 'long term investments'], section: 'Non-Current Assets' },
  { canonicalLabel: 'Other Non-Current Assets', keywords: ['other non-current assets', 'other assets', 'other long-term assets'], section: 'Non-Current Assets' },
  { canonicalLabel: 'Total Assets', keywords: ['total assets'], isSubtotal: true, isBold: true, section: 'Total Assets' },

  // Current Liabilities
  { canonicalLabel: 'Accounts Payable', keywords: ['accounts payable', 'trade payables'], section: 'Current Liabilities' },
  { canonicalLabel: 'Short-Term Debt', keywords: ['short-term debt', 'short-term borrowings', 'current portion of long-term debt', 'notes payable, current', 'current maturities', 'commercial paper'], section: 'Current Liabilities' },
  { canonicalLabel: 'Accrued Liabilities', keywords: ['accrued liabilities', 'accrued expenses', 'accrued and other'], section: 'Current Liabilities' },
  { canonicalLabel: 'Deferred Revenue (Current)', keywords: ['deferred revenue', 'unearned revenue', 'contract liabilities, current'], section: 'Current Liabilities' },
  { canonicalLabel: 'Other Current Liabilities', keywords: ['other current liabilities'], section: 'Current Liabilities' },
  { canonicalLabel: 'Total Current Liabilities', keywords: ['total current liabilities', 'current liabilities, total'], isSubtotal: true, isBold: true, section: 'Current Liabilities' },

  // Non-Current Liabilities
  { canonicalLabel: 'Long-Term Debt', keywords: ['long-term debt', 'long term debt', 'notes payable', 'long-term borrowings', 'term debt'], section: 'Non-Current Liabilities' },
  { canonicalLabel: 'Deferred Tax Liabilities', keywords: ['deferred tax liabilities', 'deferred income tax', 'deferred taxes'], section: 'Non-Current Liabilities' },
  { canonicalLabel: 'Other Non-Current Liabilities', keywords: ['other non-current liabilities', 'other long-term liabilities', 'other liabilities'], section: 'Non-Current Liabilities' },
  { canonicalLabel: 'Total Liabilities', keywords: ['total liabilities'], isSubtotal: true, isBold: true, section: 'Total Liabilities' },

  // Equity
  { canonicalLabel: 'Common Stock', keywords: ['common stock', 'common shares'], section: 'Stockholders\' Equity' },
  { canonicalLabel: 'Additional Paid-In Capital', keywords: ['additional paid-in capital', 'paid-in capital', 'capital in excess'], section: 'Stockholders\' Equity' },
  { canonicalLabel: 'Retained Earnings', keywords: ['retained earnings', 'accumulated earnings', 'accumulated deficit'], section: 'Stockholders\' Equity' },
  { canonicalLabel: 'Treasury Stock', keywords: ['treasury stock', 'treasury shares'], section: 'Stockholders\' Equity' },
  { canonicalLabel: 'Accumulated Other Comprehensive Income', keywords: ['accumulated other comprehensive', 'aoci', 'other comprehensive income'], section: 'Stockholders\' Equity' },
  { canonicalLabel: 'Total Stockholders\' Equity', keywords: ['total stockholders equity', 'total shareholders equity', 'total equity', "stockholders' equity"], isSubtotal: true, isBold: true, section: 'Stockholders\' Equity' },
  { canonicalLabel: 'Total Liabilities & Equity', keywords: ['total liabilities and stockholders', 'total liabilities and shareholders', 'total liabilities and equity', 'total liabilities & equity'], isSubtotal: true, isBold: true, section: 'Total' },
];

// ─── Cash Flow Statement ────────────────────────────────────────────
export const CASH_FLOW_SCHEMA: CanonicalRow[] = [
  // Operating Activities
  { canonicalLabel: 'Net Income', keywords: ['net income', 'net earnings', 'net profit'], isBold: true, section: 'Operating Activities' },
  { canonicalLabel: 'Depreciation & Amortization', keywords: ['depreciation and amortization', 'depreciation & amortization', 'd&a', 'depreciation'], section: 'Operating Activities' },
  { canonicalLabel: 'Stock-Based Compensation', keywords: ['stock-based compensation', 'share-based compensation', 'stock compensation'], section: 'Operating Activities' },
  { canonicalLabel: 'Deferred Income Taxes', keywords: ['deferred income taxes', 'deferred tax'], section: 'Operating Activities' },
  { canonicalLabel: 'Changes in Working Capital', keywords: ['changes in operating assets', 'changes in working capital', 'changes in assets and liabilities'], section: 'Operating Activities' },
  { canonicalLabel: '  Accounts Receivable', keywords: ['accounts receivable', 'receivables', 'decrease (increase) in accounts receivable'], section: 'Operating Activities' },
  { canonicalLabel: '  Inventories', keywords: ['inventories', 'inventory', 'decrease (increase) in inventories'], section: 'Operating Activities' },
  { canonicalLabel: '  Accounts Payable', keywords: ['accounts payable', 'increase (decrease) in accounts payable'], section: 'Operating Activities' },
  { canonicalLabel: '  Other Working Capital', keywords: ['other working capital', 'other operating', 'other assets and liabilities'], section: 'Operating Activities' },
  { canonicalLabel: 'Net Cash from Operating Activities', keywords: ['net cash provided by operating', 'net cash from operating', 'cash flows from operating activities', 'total operating activities'], isSubtotal: true, isBold: true, section: 'Operating Activities' },

  // Investing Activities
  { canonicalLabel: 'Capital Expenditures', keywords: ['capital expenditures', 'purchase of property', 'purchases of property', 'additions to property'], section: 'Investing Activities' },
  { canonicalLabel: 'Acquisitions', keywords: ['acquisitions', 'acquisition of business', 'business combinations'], section: 'Investing Activities' },
  { canonicalLabel: 'Purchases of Investments', keywords: ['purchases of investments', 'purchase of investments', 'purchases of marketable'], section: 'Investing Activities' },
  { canonicalLabel: 'Sales of Investments', keywords: ['sales of investments', 'proceeds from sale', 'maturities of investments', 'proceeds from maturities'], section: 'Investing Activities' },
  { canonicalLabel: 'Other Investing Activities', keywords: ['other investing activities', 'other investing'], section: 'Investing Activities' },
  { canonicalLabel: 'Net Cash from Investing Activities', keywords: ['net cash used in investing', 'net cash from investing', 'cash flows from investing activities', 'total investing activities'], isSubtotal: true, isBold: true, section: 'Investing Activities' },

  // Financing Activities
  { canonicalLabel: 'Debt Issuance / (Repayment)', keywords: ['proceeds from issuance of debt', 'repayment of debt', 'proceeds from borrowings', 'repayments of long-term debt', 'net borrowings'], section: 'Financing Activities' },
  { canonicalLabel: 'Share Repurchases', keywords: ['repurchase of common stock', 'share repurchases', 'treasury stock', 'repurchases of common stock'], section: 'Financing Activities' },
  { canonicalLabel: 'Dividends Paid', keywords: ['dividends paid', 'dividend payments', 'payment of dividends'], section: 'Financing Activities' },
  { canonicalLabel: 'Other Financing Activities', keywords: ['other financing activities', 'other financing'], section: 'Financing Activities' },
  { canonicalLabel: 'Net Cash from Financing Activities', keywords: ['net cash used in financing', 'net cash from financing', 'cash flows from financing activities', 'total financing activities'], isSubtotal: true, isBold: true, section: 'Financing Activities' },

  // Summary
  { canonicalLabel: 'Net Change in Cash', keywords: ['net increase in cash', 'net decrease in cash', 'net change in cash', 'effect of exchange rate', 'increase (decrease) in cash'], isSubtotal: true, isBold: true, section: 'Summary' },
  { canonicalLabel: 'Cash at Beginning of Period', keywords: ['cash at beginning', 'beginning of period', 'cash and cash equivalents, beginning'], section: 'Summary' },
  { canonicalLabel: 'Cash at End of Period', keywords: ['cash at end', 'end of period', 'cash and cash equivalents, end'], isSubtotal: true, isBold: true, section: 'Summary' },
];

export type StatementType = 'income_statement' | 'balance_sheet' | 'cash_flow';

export function getSchemaForType(type: StatementType): CanonicalRow[] {
  switch (type) {
    case 'income_statement': return INCOME_STATEMENT_SCHEMA;
    case 'balance_sheet': return BALANCE_SHEET_SCHEMA;
    case 'cash_flow': return CASH_FLOW_SCHEMA;
  }
}

export function getSheetName(type: StatementType): string {
  switch (type) {
    case 'income_statement': return 'Income Statement';
    case 'balance_sheet': return 'Balance Sheet';
    case 'cash_flow': return 'Cash Flow Statement';
  }
}
