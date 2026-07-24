/**
 * Token Reduction Benchmark
 *
 * Measures how much context Context Router saves compared to
 * traditional chat history passing.
 *
 * This benchmark simulates realistic multi-agent workflows and compares:
 * - Traditional: Full chat history passed to each agent
 * - Context Router: Only structured state + handoff summaries
 */

interface BenchmarkResult {
  scenario: string;
  chatHistoryTokens: number;
  contextRouterTokens: number;
  reductionPercent: number;
  savingsRatio: number;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Estimate token count (rough approximation)
 * Real implementation would use tiktoken or similar
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // ~4 chars per token average
}

function estimateTokensFromMessages(messages: ChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content) + 10, 0);
}

/**
 * Generate realistic research findings
 */
function generateResearchFindings(topic: string): string {
  return `
Based on extensive research on ${topic}:

1. Market Analysis
   - Industry growth rate: ${(Math.random() * 20 + 5).toFixed(1)}% annually
   - Total addressable market: $${(Math.random() * 100 + 10).toFixed(1)}B
   - Key players: Company A (32%), Company B (28%), Others (40%)

2. User Demographics
   - Primary age group: ${25 + Math.floor(Math.random() * 20)}-${45 + Math.floor(Math.random() * 15)}
   - Geographic distribution: North America (45%), Europe (30%), Asia (25%)
   - Income bracket: $${(Math.random() * 100 + 50).toFixed(0)}K average

3. Pain Points
   - Current solutions are fragmented and lack integration
   - Cost of implementation is prohibitive for SMBs
   - Training and onboarding time is excessive

4. Opportunities
   - Strong demand for unified solutions
   - Mobile-first approach is underserved
   - AI-powered features can provide differentiation
`.trim();
}

/**
 * Generate analysis results
 */
function generateAnalysis(topic: string): string {
  return `
Analysis of ${topic}:

STRENGTHS:
- Strong technical foundation with proven scalability
- Experienced team with domain expertise
- Early mover advantage in key segments

WEAKNESSES:
- Limited brand awareness outside core market
- Funding runway of ${Math.floor(Math.random() * 18 + 6)} months
- Technical debt in legacy systems

OPPORTUNITIES:
- Strategic partnerships can accelerate growth
- Enterprise market represents $${(Math.random() * 50 + 10).toFixed(0)}M opportunity
- International expansion potential

THREATS:
- Established competitors with larger budgets
- Regulatory changes in key markets
- Economic uncertainty affecting enterprise sales

RECOMMENDATION: Proceed with phased rollout focusing on mid-market segment first.
`.trim();
}

/**
 * Simulate a complex multi-agent workflow with chat history
 */
function simulateTraditionalWorkflow(
  topic: string,
  numRounds: number
): { messages: ChatMessage[]; totalTokens: number } {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a team of AI agents analyzing: ${topic}. Each agent specializes in different aspects: Research, Analysis, Review, and Synthesis.`
    }
  ];

  const researchFindings: string[] = [];
  const analysisResults: string[] = [];

  for (let round = 1; round <= numRounds; round++) {
    // Researcher agent task
    messages.push({
      role: 'user',
      content: `[Research Agent - Round ${round}] Analyze ${topic} and provide findings. Context from previous rounds: ${researchFindings.length > 0 ? `Previous findings: ${researchFindings.length} items analyzed.` : 'No previous context.'}`
    });

    const research = generateResearchFindings(topic);
    researchFindings.push(research);
    messages.push({ role: 'assistant', content: research });

    // Analyst agent task
    messages.push({
      role: 'user',
      content: `[Analysis Agent - Round ${round}] Analyze the research findings. Previous analysis: ${analysisResults.length > 0 ? `${analysisResults.length} analyses completed.` : 'None yet.'}`
    });

    const analysis = generateAnalysis(topic);
    analysisResults.push(analysis);
    messages.push({ role: 'assistant', content: analysis });

    // Synthesizer adds previous context
    messages.push({
      role: 'user',
      content: `[Synthesizer - Round ${round}] Create a synthesis. Full history: ${messages.length} messages so far.`
    });

    messages.push({
      role: 'assistant',
      content: `Synthesis ${round}: Combined ${researchFindings.length} research items and ${analysisResults.length} analyses. Key themes: Market opportunity, competitive landscape, implementation strategy.`
    });
  }

  return {
    messages,
    totalTokens: estimateTokensFromMessages(messages),
  };
}

/**
 * Simulate Context Router approach (structured state + handoffs)
 */
function simulateContextRouterWorkflow(
  topic: string,
  numRounds: number
): { totalTokens: number; stateKeys: number } {
  let stateTokens = 0;
  let handoffTokens = 0;

  for (let round = 1; round <= numRounds; round++) {
    // Research state (key facts only, ~150 tokens vs full research)
    const researchState = {
      topic,
      round,
      keyFindings: [
        `Finding 1: Market growth rate ${(Math.random() * 20 + 5).toFixed(1)}%`,
        `Finding 2: TAM of $${(Math.random() * 100 + 10).toFixed(1)}B`,
        `Finding 3: Primary audience: ${25 + Math.floor(Math.random() * 20)}-60 age group`,
      ],
      confidence: 0.85 + Math.random() * 0.1,
    };
    stateTokens += estimateTokens(JSON.stringify(researchState));

    // Handoff summary (concise, ~80 tokens vs full conversation)
    const handoff = `[Round ${round}] Research complete. Key points: Market opportunity identified, target demographic defined. Ready for analysis.`;
    handoffTokens += estimateTokens(handoff);

    // Analysis state
    const analysisState = {
      strengths: ['Technical foundation', 'Domain expertise'],
      weaknesses: ['Brand awareness', 'Technical debt'],
      opportunities: ['Strategic partnerships', 'Enterprise market'],
      threats: ['Established competitors', 'Regulatory changes'],
    };
    stateTokens += estimateTokens(JSON.stringify(analysisState));
  }

  // Final synthesis
  const synthesisState = {
    summary: `Completed ${numRounds} rounds. Key insights: Strong market opportunity, phased approach recommended.`,
    recommendations: ['Focus on mid-market', 'Build partnerships', 'Address technical debt'],
  };
  stateTokens += estimateTokens(JSON.stringify(synthesisState));

  return {
    totalTokens: stateTokens + handoffTokens,
    stateKeys: numRounds * 2 + 1,
  };
}

/**
 * Run token reduction benchmark
 */
async function runTokenReductionBenchmark(): Promise<BenchmarkResult[]> {
  console.log('\n📊 Token Reduction Benchmark\n');
  console.log('='.repeat(70));

  const results: BenchmarkResult[] = [];

  const scenarios = [
    { name: 'Simple (3 rounds)', rounds: 3 },
    { name: 'Medium (5 rounds)', rounds: 5 },
    { name: 'Complex (10 rounds)', rounds: 10 },
    { name: 'Enterprise (20 rounds)', rounds: 20 },
  ];

  for (const { name, rounds } of scenarios) {
    console.log(`\n🔄 Scenario: ${name}`);

    // Traditional approach
    const traditional = simulateTraditionalWorkflow('AI-powered productivity tools', rounds);
    console.log(`   Traditional: ${traditional.totalTokens.toLocaleString()} tokens`);

    // Context Router approach
    const contextRouter = simulateContextRouterWorkflow('AI-powered productivity tools', rounds);
    console.log(`   Context Router: ${contextRouter.totalTokens.toLocaleString()} tokens`);

    const reduction = ((traditional.totalTokens - contextRouter.totalTokens) / traditional.totalTokens) * 100;
    console.log(`   Reduction: ${reduction.toFixed(1)}%`);

    results.push({
      scenario: name,
      chatHistoryTokens: traditional.totalTokens,
      contextRouterTokens: contextRouter.totalTokens,
      reductionPercent: reduction,
      savingsRatio: traditional.totalTokens / contextRouter.totalTokens,
    });
  }

  // Print summary table
  console.log('\n\n📈 Summary: Token Reduction by Scenario');
  console.log('─'.repeat(70));
  console.log('| Scenario          | Traditional | Context Router | Reduction |');
  console.log('|-------------------|-------------|----------------|-----------|');

  for (const r of results) {
    console.log(
      `| ${r.scenario.padEnd(17)} | ${r.chatHistoryTokens.toLocaleString().padStart(11)} | ${r.contextRouterTokens.toLocaleString().padStart(14)} | ${r.reductionPercent.toFixed(1).padStart(9)}% |`
    );
  }

  console.log('\n✅ Average reduction: ' +
    (results.reduce((a, b) => a + b.reductionPercent, 0) / results.length).toFixed(1) + '%'
  );

  return results;
}

// Run if called directly
runTokenReductionBenchmark().catch(console.error);

export { runTokenReductionBenchmark, type BenchmarkResult };
