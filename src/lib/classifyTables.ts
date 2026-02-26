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
  'total revenues', 'gross margin', 'operating margin',
  // Banking-specific
  'net interest income', 'noninterest revenue', 'noninterest expense',
  'total net revenue', 'provision for credit losses', 'compensation expense',
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

// ═══════════════════════════════════════════════════════════════════
// PRIMARY STATEMENT SELECTION ENGINE v2
// ═══════════════════════════════════════════════════════════════════

// ─── Gate B: Statement-type signatures (must have ≥1) ───────────
const SIGNATURE_ANCHORS: Record<FinancialStatementType, string[]> = {
  income_statement: ['net income', 'net earnings', 'income from operations', 'operating income', 'operating profit', 'total net revenue', 'income before income tax'],
  balance_sheet: ['total assets', 'total liabilities', 'stockholders equity', 'shareholders equity', 'total equity'],
  cash_flow: ['net cash provided by operating', 'net cash from operating', 'cash flows from operating', 'net cash used in operating'],
  other: [],
};

// ─── Scoring anchors (broader set for coverage scoring) ─────────
const SCORING_ANCHORS: Record<FinancialStatementType, string[]> = {
  income_statement: ['revenue', 'net income', 'operating income', 'gross profit', 'cost of', 'earnings per share', 'income tax', 'total net revenue', 'net interest income', 'provision for credit losses', 'noninterest revenue'],
  balance_sheet: ['total assets', 'total liabilities', 'stockholders equity', 'shareholders equity', 'cash and cash equivalents', 'current assets', 'retained earnings', 'total equity'],
  cash_flow: ['net cash provided by operating', 'net cash from operating', 'capital expenditure', 'purchase of property', 'financing activities', 'investing activities', 'depreciation'],
  other: [],
};

// ─── False positive penalty keywords ────────────────────────────
const SEGMENT_KEYWORDS = ['north america', 'emea', 'asia', 'segment', 'product', 'region', 'geography', 'by country', 'by segment', 'by region', 'reportable segment'];
const QUARTERLY_KEYWORDS = ['three months ended', 'quarter ended', 'quarterly'];
const HISTORICAL_KEYWORDS = ['selected financial data', 'five-year', 'ten-year', 'five year', 'ten year', 'selected consolidated'];
const FOOTNOTE_KEYWORDS = ['thereof', '(1)', '(2)', '(3)', 'includes', 'parenthetical'];

// ─── Adaptive weights per statement type ────────────────────────
const WEIGHTS: Record<FinancialStatementType, { anchor: number; period: number; density: number; confidence: number }> = {
  income_statement: { anchor: 12, period: 8, density: 0.5, confidence: 6 },
  balance_sheet:    { anchor: 8,  period: 12, density: 1,   confidence: 6 },
  cash_flow:        { anchor: 15, period: 6,  density: 0.5, confidence: 5 },
  other:            { anchor: 0,  period: 0,  density: 0,   confidence: 0 },
};

// ─── Selection debug report ─────────────────────────────────────
export interface CandidateReport {
  originalIndex: number;
  type: FinancialStatementType;
  totalScore: number;
  anchorScore: number;
  periodScore: number;
  densityScore: number;
  confidenceScore: number;
  penaltyScore: number;
  matchedAnchors: string[];
  matchedSignatures: string[];
  detectedPeriods: string[];
  rejectionReason: string | null;
  isPrimary: boolean;
}

export interface SelectionReport {
  incomeStatement: CandidateReport[];
  balanceSheet: CandidateReport[];
  cashFlow: CandidateReport[];
}

function getColumns(table: any): string[] {
  if (table.columns?.length > 0) return table.columns;
  if (table.cells?.length > 0) {
    const maxCol = Math.max(...table.cells.map((c: any) => c.columnIndex || 0));
    const grid: string[] = Array(maxCol + 1).fill('');
    table.cells.filter((c: any) => (c.rowIndex || 0) === 0).forEach((c: any) => {
      grid[c.columnIndex || 0] = c.content || '';
    });
    return grid;
  }
  return [];
}

function detectPeriodStrings(table: any): string[] {
  const cols = getColumns(table);
  const matched = cols.filter(col => {
    const c = (col || '').trim();
    return /\b(20\d{2}|19\d{2})\b/.test(c) || /\b(q[1-4]|fy\s*\d)/i.test(c) ||
      /\b(year|month|ended|as of|december|january|february|march|april|may|june|july|august|september|october|november)\b/i.test(c);
  });

  // If no periods found in columns, check first data row and table title
  if (matched.length === 0) {
    const fallbackSources: string[] = [];
    if (table.title) fallbackSources.push(table.title);
    const rows: string[][] = table.rows || [];
    if (rows.length > 0 && rows[0]) {
      rows[0].forEach((cell: string) => { if (cell) fallbackSources.push(cell); });
    }
    // Also check columns for bare year numbers (e.g., "2023", "2024")  
    cols.forEach(col => {
      const c = (col || '').trim();
      if (/^\d{4}$/.test(c) && parseInt(c) >= 1990 && parseInt(c) <= 2030) {
        matched.push(c);
      }
    });
    // Check fallback sources
    for (const src of fallbackSources) {
      const yearMatches = src.match(/\b(20\d{2}|19\d{2})\b/g);
      if (yearMatches) {
        yearMatches.forEach(y => { if (!matched.includes(y)) matched.push(y); });
      }
    }
  }

  return matched;
}

// ─── Gate A: Period validity ────────────────────────────────────
function passesGatePeriod(table: any, type: FinancialStatementType): boolean {
  const periods = detectPeriodStrings(table);
  if (periods.length < 2) return false;

  if (type === 'balance_sheet') {
    // BS periods should look point-in-time (year, "as of", month+year)
    const hasPointInTime = periods.some(p =>
      /\b(as of|december|january|february|march|april|may|june|july|august|september|october|november)\b/i.test(p) ||
      /\b(20\d{2}|19\d{2})\b/.test(p)
    );
    return hasPointInTime;
  }

  // IS/CF: periods should look like years or year-ended dates
  const hasYearLike = periods.some(p =>
    /\b(20\d{2}|19\d{2})\b/.test(p) || /\b(year|ended|twelve months|fiscal)\b/i.test(p)
  );
  return hasYearLike;
}

// ─── Gate B: Signature check ────────────────────────────────────
function passesGateSignature(table: any, type: FinancialStatementType): { passes: boolean; matched: string[] } {
  const text = getTableText(table).toLowerCase();
  const sigs = SIGNATURE_ANCHORS[type];
  const matched = sigs.filter(kw => text.includes(kw));
  return { passes: matched.length >= 1, matched };
}

// ─── Penalty scoring ────────────────────────────────────────────
function computePenalty(table: any): number {
  const text = getTableText(table).toLowerCase();
  let penalty = 0;

  const segmentHits = SEGMENT_KEYWORDS.filter(kw => text.includes(kw)).length;
  penalty += segmentHits * 8;

  const quarterlyHits = QUARTERLY_KEYWORDS.filter(kw => text.includes(kw)).length;
  penalty += quarterlyHits * 10;

  const historicalHits = HISTORICAL_KEYWORDS.filter(kw => text.includes(kw)).length;
  penalty += historicalHits * 12;

  const footnoteHits = FOOTNOTE_KEYWORDS.filter(kw => text.includes(kw)).length;
  penalty += footnoteHits * 5;

  return penalty;
}

// ─── Anchor distribution check (for runner-up validation) ───────
function anchorSpread(table: any, type: FinancialStatementType): number {
  const rows: string[][] = table.rows || [];
  if (rows.length === 0) return 0;
  const anchors = SCORING_ANCHORS[type];
  const anchorPositions: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const label = (rows[i]?.[0] || '').toLowerCase();
    if (anchors.some(kw => label.includes(kw))) {
      anchorPositions.push(i / rows.length); // Normalized position 0-1
    }
  }

  if (anchorPositions.length < 2) return 0;
  // Measure spread: std deviation of positions
  const mean = anchorPositions.reduce((a, b) => a + b, 0) / anchorPositions.length;
  const variance = anchorPositions.reduce((sum, p) => sum + (p - mean) ** 2, 0) / anchorPositions.length;
  return Math.sqrt(variance); // Higher = more spread = better
}

// ─── Row ordering check (loose) for runner-up ───────────────────
function hasExpectedOrdering(table: any, type: FinancialStatementType): boolean {
  const rows: string[][] = table.rows || [];
  if (rows.length < 5) return false;

  const findPosition = (keywords: string[]): number => {
    for (let i = 0; i < rows.length; i++) {
      const label = (rows[i]?.[0] || '').toLowerCase();
      if (keywords.some(kw => label.includes(kw))) return i;
    }
    return -1;
  };

  if (type === 'income_statement') {
    const revPos = findPosition(['revenue', 'net revenue', 'total revenue', 'total net revenue', 'net interest income']);
    const niPos = findPosition(['net income', 'net earnings']);
    return revPos >= 0 && niPos >= 0 && revPos < niPos;
  }
  if (type === 'balance_sheet') {
    const caPos = findPosition(['current assets', 'total current assets']);
    const taPos = findPosition(['total assets']);
    return taPos >= 0 && (caPos < 0 || caPos < taPos);
  }
  if (type === 'cash_flow') {
    const opPos = findPosition(['operating activities', 'cash flows from operating']);
    const invPos = findPosition(['investing activities', 'cash flows from investing']);
    return opPos >= 0 && invPos >= 0 && opPos < invPos;
  }
  return false;
}

function countAnchors(table: any, type: FinancialStatementType): { count: number; matched: string[] } {
  const text = getTableText(table).toLowerCase();
  const matched = SCORING_ANCHORS[type].filter(kw => text.includes(kw));
  return { count: matched.length, matched };
}

function countPeriodColumns(table: any): number {
  return detectPeriodStrings(table).length;
}

function countDataRows(table: any): number {
  const rows: string[][] = table.rows || [];
  return rows.filter(row => row && row.length > 1 && row.slice(1).some(cell => {
    const cleaned = (cell || '').replace(/[$,\s()%-]/g, '');
    return cleaned.length > 0 && !isNaN(parseFloat(cleaned));
  })).length;
}

function scoreCandidate(classified: ClassifiedTable): {
  total: number; anchorScore: number; periodScore: number;
  densityScore: number; confidenceScore: number; penaltyScore: number;
  matchedAnchors: string[];
} {
  const w = WEIGHTS[classified.type];
  const { count: anchorCount, matched: matchedAnchors } = countAnchors(classified.table, classified.type);
  const anchorScore = anchorCount * w.anchor;
  const periodScore = countPeriodColumns(classified.table) * w.period;
  const densityScore = countDataRows(classified.table) * w.density;
  const confidenceScore = classified.confidence * w.confidence;
  const penaltyScore = computePenalty(classified.table);

  const total = anchorScore + periodScore + densityScore + confidenceScore - penaltyScore;
  return { total, anchorScore, periodScore, densityScore, confidenceScore, penaltyScore, matchedAnchors };
}

/**
 * Select primary financial statements with hard gates, adaptive scoring,
 * penalty system, runner-up validation, and debug reporting.
 */
export function selectPrimaryStatements(classifiedTables: ClassifiedTable[]): {
  incomeStatement: ClassifiedTable | null;
  balanceSheet: ClassifiedTable | null;
  cashFlow: ClassifiedTable | null;
  report: SelectionReport;
} {
  const report: SelectionReport = {
    incomeStatement: [],
    balanceSheet: [],
    cashFlow: [],
  };

  const reportKey: Record<string, keyof SelectionReport> = {
    income_statement: 'incomeStatement',
    balance_sheet: 'balanceSheet',
    cash_flow: 'cashFlow',
  };

  const pick = (type: FinancialStatementType): ClassifiedTable | null => {
    const candidates = classifiedTables.filter(t => t.type === type);
    const key = reportKey[type];
    if (!key) return null;

    const eligible: { classified: ClassifiedTable; candidateReport: CandidateReport }[] = [];

    for (const candidate of candidates) {
      const { passes: passesSig, matched: matchedSigs } = passesGateSignature(candidate.table, type);
      const passesPeriod = passesGatePeriod(candidate.table, type);
      const detectedPeriods = detectPeriodStrings(candidate.table);
      const scores = scoreCandidate(candidate);

      // Gate A failure is now a soft penalty (−15) instead of hard rejection
      if (!passesPeriod) {
        scores.total -= 15;
        scores.penaltyScore += 15;
      }

      let rejectionReason: string | null = null;
      // Only Gate B (signature) is a hard gate
      if (!passesSig) rejectionReason = `Failed Gate B: No signature anchors (need ≥1 of: ${SIGNATURE_ANCHORS[type].slice(0, 3).join(', ')}...)`;

      const cr: CandidateReport = {
        originalIndex: candidate.originalIndex,
        type,
        totalScore: scores.total,
        anchorScore: scores.anchorScore,
        periodScore: scores.periodScore,
        densityScore: scores.densityScore,
        confidenceScore: scores.confidenceScore,
        penaltyScore: scores.penaltyScore,
        matchedAnchors: scores.matchedAnchors,
        matchedSignatures: matchedSigs,
        detectedPeriods,
        rejectionReason: rejectionReason || (!passesPeriod ? `Soft penalty: period structure weak (${detectedPeriods.length} periods detected)` : null),
        isPrimary: false,
      };

      report[key].push(cr);

      // Only hard-reject on Gate B failure
      if (!rejectionReason) {
        eligible.push({ classified: candidate, candidateReport: cr });
      }
    }

    if (eligible.length === 0) return null;
    if (eligible.length === 1) {
      eligible[0].candidateReport.isPrimary = true;
      return eligible[0].classified;
    }

    // Sort by total score descending
    eligible.sort((a, b) => b.candidateReport.totalScore - a.candidateReport.totalScore);

    const best = eligible[0];
    const runnerUp = eligible[1];

    // Runner-up check: if within 15%, validate with structural checks
    const scoreDiff = best.candidateReport.totalScore - runnerUp.candidateReport.totalScore;
    const threshold = best.candidateReport.totalScore * 0.15;

    if (scoreDiff <= threshold && scoreDiff >= 0) {
      const bestSpread = anchorSpread(best.classified.table, type);
      const runnerSpread = anchorSpread(runnerUp.classified.table, type);
      const bestOrdering = hasExpectedOrdering(best.classified.table, type);
      const runnerOrdering = hasExpectedOrdering(runnerUp.classified.table, type);

      // If runner-up has better structural properties, swap
      if (!bestOrdering && runnerOrdering && runnerSpread >= bestSpread) {
        runnerUp.candidateReport.isPrimary = true;
        return runnerUp.classified;
      }
    }

    best.candidateReport.isPrimary = true;
    return best.classified;
  };

  return {
    incomeStatement: pick('income_statement'),
    balanceSheet: pick('balance_sheet'),
    cashFlow: pick('cash_flow'),
    report,
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
