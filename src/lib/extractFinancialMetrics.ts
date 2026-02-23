import { ClassifiedTable, selectPrimaryStatements } from './classifyTables';

export interface FinancialMetrics {
  companyName: string;
  period: string;
  revenue: number | null;
  revenueYoY: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  netIncome: number | null;
  netMargin: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  fcfMargin: number | null;
  cashAndEquivalents: number | null;
  totalDebt: number | null;
  netCash: number | null;
}

function parseNumericValue(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;
  
  let cleaned = value.replace(/[$,\s]/g, '').trim();
  const isNegative = cleaned.includes('(') && cleaned.includes(')');
  cleaned = cleaned.replace(/[()]/g, '');
  
  // Handle millions notation
  if (cleaned.toLowerCase().includes('m')) {
    cleaned = cleaned.replace(/[mM]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : (isNegative ? -num : num) * 1000000;
  }
  
  // Handle billions notation
  if (cleaned.toLowerCase().includes('b')) {
    cleaned = cleaned.replace(/[bB]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : (isNegative ? -num : num) * 1000000000;
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : (isNegative ? -num : num);
}

function findRowValue(rows: string[][], keywords: string[], columnIndex: number = 1): number | null {
  for (const row of rows) {
    if (!row || !row[0]) continue;
    const label = row[0].toLowerCase();
    if (keywords.some(kw => label.includes(kw.toLowerCase()))) {
      // Try the specified column first, then scan for a numeric value
      if (row[columnIndex]) {
        const val = parseNumericValue(row[columnIndex]);
        if (val !== null) return val;
      }
      // Scan all columns for a numeric value
      for (let i = 1; i < row.length; i++) {
        const val = parseNumericValue(row[i]);
        if (val !== null) return val;
      }
    }
  }
  return null;
}

function findRowValues(rows: string[][], keywords: string[]): number[] {
  const values: number[] = [];
  for (const row of rows) {
    if (!row || !row[0]) continue;
    const label = row[0].toLowerCase();
    if (keywords.some(kw => label.includes(kw.toLowerCase()))) {
      for (let i = 1; i < row.length; i++) {
        const val = parseNumericValue(row[i]);
        if (val !== null) values.push(val);
      }
    }
  }
  return values;
}

function extractFromIncomeStatement(table: any): Partial<FinancialMetrics> {
  const rows = table.rows || [];
  
  const revenue = findRowValue(rows, ['total revenue', 'net revenue', 'revenues', 'total net revenue']);
  const revenueValues = findRowValues(rows, ['total revenue', 'net revenue', 'revenues', 'total net revenue']);
  
  let revenueYoY: number | null = null;
  if (revenueValues.length >= 2) {
    const current = revenueValues[0];
    const prior = revenueValues[1];
    if (current && prior && prior !== 0) {
      revenueYoY = ((current - prior) / Math.abs(prior)) * 100;
    }
  }
  
  const grossProfit = findRowValue(rows, ['gross profit', 'gross margin']);
  const operatingIncome = findRowValue(rows, ['operating income', 'income from operations', 'operating profit']);
  const netIncome = findRowValue(rows, ['net income', 'net earnings', 'net profit']);
  
  let grossMargin: number | null = null;
  let operatingMargin: number | null = null;
  let netMargin: number | null = null;
  
  if (revenue && revenue !== 0) {
    if (grossProfit !== null) grossMargin = (grossProfit / revenue) * 100;
    if (operatingIncome !== null) operatingMargin = (operatingIncome / revenue) * 100;
    if (netIncome !== null) netMargin = (netIncome / revenue) * 100;
  }
  
  return {
    revenue,
    revenueYoY,
    grossProfit,
    grossMargin,
    operatingIncome,
    operatingMargin,
    netIncome,
    netMargin,
  };
}

function extractFromCashFlow(table: any, revenue: number | null): Partial<FinancialMetrics> {
  const rows = table.rows || [];
  
  const operatingCashFlow = findRowValue(rows, [
    'net cash provided by operating',
    'cash flows from operating',
    'net cash from operating',
    'operating activities'
  ]);
  
  const capex = findRowValue(rows, [
    'capital expenditure',
    'purchase of property',
    'additions to property',
    'purchases of property'
  ]);
  
  let freeCashFlow: number | null = null;
  let fcfMargin: number | null = null;
  
  if (operatingCashFlow !== null && capex !== null) {
    freeCashFlow = operatingCashFlow - Math.abs(capex);
    if (revenue && revenue !== 0) {
      fcfMargin = (freeCashFlow / revenue) * 100;
    }
  }
  
  return {
    operatingCashFlow,
    capex: capex ? Math.abs(capex) : null,
    freeCashFlow,
    fcfMargin,
  };
}

function extractFromBalanceSheet(table: any): Partial<FinancialMetrics> {
  const rows = table.rows || [];
  
  const cashAndEquivalents = findRowValue(rows, [
    'cash and cash equivalents',
    'cash and equivalents',
    'cash, cash equivalents'
  ]);
  
  const shortTermDebt = findRowValue(rows, [
    'short-term debt',
    'current portion of long-term debt',
    'notes payable'
  ]) || 0;
  
  const longTermDebt = findRowValue(rows, [
    'long-term debt',
    'total debt',
    'notes payable'
  ]) || 0;
  
  const totalDebt = shortTermDebt + longTermDebt;
  
  let netCash: number | null = null;
  if (cashAndEquivalents !== null) {
    netCash = cashAndEquivalents - totalDebt;
  }
  
  return {
    cashAndEquivalents,
    totalDebt: totalDebt > 0 ? totalDebt : null,
    netCash,
  };
}

function extractCompanyAndPeriod(fileName: string, tables: any[]): { companyName: string; period: string } {
  // Try to extract from file name
  const fileNameClean = fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  
  // Look for common patterns
  const yearMatch = fileNameClean.match(/(?:FY|fy|20)\s*(\d{2,4})/);
  const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : new Date().getFullYear().toString();
  
  // Try to find company name from file or default
  let companyName = fileNameClean.split(/\d/)[0].trim() || 'Company';
  companyName = companyName.replace(/10-?k/i, '').trim();
  
  // Capitalize first letter of each word
  companyName = companyName.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  
  return {
    companyName: companyName || 'Company',
    period: `FY ${year} 10-K`,
  };
}

export function extractFinancialMetrics(
  classifiedTables: ClassifiedTable[],
  fileName: string
): FinancialMetrics {
  const { companyName, period } = extractCompanyAndPeriod(fileName, classifiedTables.map(t => t.table));
  
  const metrics: FinancialMetrics = {
    companyName,
    period,
    revenue: null,
    revenueYoY: null,
    grossProfit: null,
    grossMargin: null,
    operatingIncome: null,
    operatingMargin: null,
    netIncome: null,
    netMargin: null,
    operatingCashFlow: null,
    capex: null,
    freeCashFlow: null,
    fcfMargin: null,
    cashAndEquivalents: null,
    totalDebt: null,
    netCash: null,
  };
  
  // Select best table for each statement type
  const { incomeStatement, cashFlow: cashFlowStatement, balanceSheet } = selectPrimaryStatements(classifiedTables);
  
  // Extract from income statement
  if (incomeStatement) {
    Object.assign(metrics, extractFromIncomeStatement(incomeStatement.table));
  }
  
  // Extract from cash flow statement
  if (cashFlowStatement) {
    Object.assign(metrics, extractFromCashFlow(cashFlowStatement.table, metrics.revenue));
  }
  
  // Extract from balance sheet
  if (balanceSheet) {
    Object.assign(metrics, extractFromBalanceSheet(balanceSheet.table));
  }
  
  return metrics;
}

export function hasMinimumMetrics(metrics: FinancialMetrics): boolean {
  // Require at least revenue or some key metric to show the snapshot
  return metrics.revenue !== null || 
         metrics.netIncome !== null || 
         metrics.freeCashFlow !== null ||
         metrics.cashAndEquivalents !== null;
}
