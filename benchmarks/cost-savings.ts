/**
 * Cost Savings Calculator
 *
 * Calculates the monetary savings from using Context Router
 * based on LLM API pricing.
 */

interface PricingModel {
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  currency: string;
}

interface CostSavingsResult {
  scenario: string;
  traditionalCost: number;
  contextRouterCost: number;
  monthlySavings: number;
  yearlySavings: number;
  roi: number;
  paybackPeriodDays: number;
}

interface WorkflowMetrics {
  avgContextTokens: number;
  avgHandoffTokens: number;
  workflowsPerMonth: number;
  avgAgentsPerWorkflow: number;
  apiCallsPerAgent: number;
}

// LLM Pricing Models (as of 2024)
const PRICING: Record<string, PricingModel> = {
  'gpt-4o': { inputCostPer1MTokens: 5.00, outputCostPer1MTokens: 15.00, currency: 'USD' },
  'gpt-4o-mini': { inputCostPer1MTokens: 0.15, outputCostPer1MTokens: 0.60, currency: 'USD' },
  'claude-sonnet': { inputCostPer1MTokens: 3.00, outputCostPer1MTokens: 15.00, currency: 'USD' },
  'claude-haiku': { inputCostPer1MTokens: 0.25, outputCostPer1MTokens: 1.25, currency: 'USD' },
  'gemini-1.5-pro': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 5.00, currency: 'USD' },
  'gemini-1.5-flash': { inputCostPer1MTokens: 0.075, outputCostPer1MTokens: 0.30, currency: 'USD' },
};

/**
 * Calculate cost for a given number of tokens
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: PricingModel
): number {
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1MTokens;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1MTokens;
  return inputCost + outputCost;
}

/**
 * Calculate cost savings for a workflow scenario
 */
function calculateSavings(
  scenario: string,
  metrics: WorkflowMetrics,
  model: keyof typeof PRICING = 'claude-sonnet',
  contextReduction: number = 0.70,
  contextRouterOverhead: number = 0.05
): CostSavingsResult {
  const pricing = PRICING[model];
  const outputTokensPerCall = 500; // Average output per API call

  // Traditional approach: full context passed every time
  const traditionalCostPerWorkflow =
    metrics.avgAgentsPerWorkflow *
    metrics.apiCallsPerAgent *
    calculateCost(metrics.avgContextTokens, outputTokensPerCall, pricing);

  // Context Router approach: reduced context + handoffs
  const reducedInputTokens = metrics.avgContextTokens * (1 - contextReduction);
  const handoffOverhead = metrics.avgHandoffTokens * metrics.avgAgentsPerWorkflow * 0.1;
  const contextRouterCostPerWorkflow =
    metrics.avgAgentsPerWorkflow *
    metrics.apiCallsPerAgent *
    calculateCost(reducedInputTokens + handoffOverhead, outputTokensPerCall, pricing);

  const perWorkflowSavings = traditionalCostPerWorkflow - contextRouterCostPerWorkflow;
  const monthlySavings = perWorkflowSavings * metrics.workflowsPerMonth;
  const yearlySavings = monthlySavings * 12;

  // Context Router infrastructure cost (self-hosted estimate)
  const contextRouterMonthlyCost = 50; // ~$50/month for a small VPS
  const netMonthlySavings = monthlySavings - contextRouterMonthlyCost;
  const netYearlySavings = netMonthlySavings * 12;

  // ROI calculation (assuming $5000 development cost)
  const developmentCost = 5000;
  const roi = (netYearlySavings / developmentCost) * 100;
  const paybackPeriodDays = (developmentCost / netMonthlySavings) * 30;

  return {
    scenario,
    traditionalCost: traditionalCostPerWorkflow,
    contextRouterCost: contextRouterCostPerWorkflow,
    monthlySavings: netMonthlySavings,
    yearlySavings: netYearlySavings,
    roi,
    paybackPeriodDays: Math.max(0, paybackPeriodDays),
  };
}

/**
 * Print cost comparison for a scenario
 */
function printCostComparison(result: CostSavingsResult): void {
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│ ${result.scenario.padEnd(76)} │
├─────────────────────────────────────────────────────────────────────────────┤
│   Traditional (full context):   $${result.traditionalCost.toFixed(4).padStart(10)} / workflow            │
│   Context Router (selective):   $${result.contextRouterCost.toFixed(4).padStart(10)} / workflow            │
│   Monthly Savings:              $${result.monthlySavings.toFixed(2).padStart(10)}                        │
│   Yearly Savings:               $${result.yearlySavings.toFixed(2).padStart(10)}                       │
│   ROI:                          ${result.roi.toFixed(0).padStart(10)}%                                │
│   Payback Period:               ${result.paybackPeriodDays.toFixed(0).padStart(10)} days                    │
└─────────────────────────────────────────────────────────────────────────────┘
`);
}

/**
 * Generate summary report
 */
function generateSummaryReport(results: CostSavingsResult[]): string {
  const totalMonthlySavings = results.reduce((sum, r) => sum + r.monthlySavings, 0);
  const totalYearlySavings = results.reduce((sum, r) => sum + r.yearlySavings, 0);
  const avgRoi = results.reduce((sum, r) => sum + r.roi, 0) / results.length;

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                         COST SAVINGS SUMMARY                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   Monthly Savings:     $${totalMonthlySavings.toFixed(2)}                                              ║
║   Yearly Savings:     $${totalYearlySavings.toFixed(2)}                                            ║
║   Average ROI:        ${avgRoi.toFixed(0).toString().padStart(5)}%                                                        ║
║                                                                              ║
║   Assumptions:                                                                ║
║   - Claude Sonnet 4 pricing (~$3/M input, ~$15/M output)                    ║
║   - 70% token reduction with selective handoffs                              ║
║   - Context Router self-hosted (~$50/month infrastructure)                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * Run cost savings benchmarks
 */
async function runCostSavingsBenchmarks(): Promise<CostSavingsResult[]> {
  console.log('\n💰 Cost Savings Calculator\n');
  console.log('='.repeat(90));

  // Scenario 1: Small Team
  const smallTeam = calculateSavings(
    'Small Team (3 agents, 50 workflows/month)',
    {
      avgContextTokens: 5000,
      avgHandoffTokens: 300,
      workflowsPerMonth: 50,
      avgAgentsPerWorkflow: 3,
      apiCallsPerAgent: 5,
    },
    'claude-sonnet'
  );

  // Scenario 2: Medium Team
  const mediumTeam = calculateSavings(
    'Medium Team (5 agents, 200 workflows/month)',
    {
      avgContextTokens: 8000,
      avgHandoffTokens: 500,
      workflowsPerMonth: 200,
      avgAgentsPerWorkflow: 5,
      apiCallsPerAgent: 8,
    },
    'claude-sonnet'
  );

  // Scenario 3: Large Team
  const largeTeam = calculateSavings(
    'Large Team (10 agents, 1000 workflows/month)',
    {
      avgContextTokens: 15000,
      avgHandoffTokens: 800,
      workflowsPerMonth: 1000,
      avgAgentsPerWorkflow: 10,
      apiCallsPerAgent: 10,
    },
    'claude-sonnet'
  );

  const results = [smallTeam, mediumTeam, largeTeam];

  for (const result of results) {
    printCostComparison(result);
  }

  console.log(generateSummaryReport(results));

  return results;
}

export {
  PRICING,
  calculateCost,
  calculateSavings,
  printCostComparison,
  generateSummaryReport,
  runCostSavingsBenchmarks,
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCostSavingsBenchmarks().catch(console.error);
}
