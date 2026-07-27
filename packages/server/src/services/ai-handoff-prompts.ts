/**
 * AI Handoff Prompts
 *
 * System prompts and user prompt builder for AI-powered handoff summaries.
 */

export const SYSTEM_PROMPT = `You are an expert handoff specialist for multi-agent workflows.

Your job is to create clear, actionable handoffs that help the next agent understand:
1. What was accomplished
2. Why key decisions were made
3. What to watch out for
4. What needs immediate attention

Guidelines:
- Lead with the most important information
- Use bullet points for clarity
- Be specific (include names, numbers, dates)
- Surface implicit context (relationships, patterns)
- Flag any uncertainties or pending items
- Keep summaries under {maxTokens} tokens
- Use natural, conversational language
- Avoid generic phrases like "Based on the provided information"

Never include:
- Speculation beyond the data
- Information not in the state
- Generic filler phrases`;

export type HandoffStyle = 'concise' | 'detailed' | 'technical';

export interface BuildHandoffPromptOptions {
  style: HandoffStyle;
  includeOpenQuestions: boolean;
  includeReasoning: boolean;
  maxTokens: number;
  workflowDescription?: string;
  agentRole?: string;
}

/**
 * Build the user prompt for handoff generation
 */
export function buildHandoffPrompt(
  state: Record<string, unknown>,
  options: BuildHandoffPromptOptions
): string {
  const stateJson = JSON.stringify(state, null, 2);

  let prompt = `# Workflow Context

${options.workflowDescription ? `**Workflow:** ${options.workflowDescription}\n` : ''}${options.agentRole ? `**Role:** ${options.agentRole}\n` : ''}
## State to Summarize

\`\`\`json
${stateJson}
\`\`\`

## Instructions

Based on the state data above, create a handoff summary that helps the next agent quickly understand the current situation.

### Style: ${options.style.charAt(0).toUpperCase() + options.style.slice(1)}
`;

  if (options.style === 'concise') {
    prompt += `
- Lead with the most critical facts only
- Maximum clarity, minimum words
- Action-oriented language
- 1-3 sentences preferred`;
  } else if (options.style === 'detailed') {
    prompt += `
- Include relevant context and reasoning
- Explain relationships between data points
- Surface implicit knowledge
- 5-10 sentences preferred`;
  } else if (options.style === 'technical') {
    prompt += `
- Use precise technical language
- Include data types and structures
- Be explicit about constraints and requirements
- 3-5 sentences preferred`;
  }

  prompt += `
${options.includeOpenQuestions ? `
## Open Questions to Surface
Based on the state, identify:
1. Unresolved decisions
2. Missing information
3. Pending approvals or confirmations
4. Risks or concerns to monitor
` : ''}${options.includeReasoning ? `
## Reasoning to Explain
For any significant decisions in the state:
1. What led to this decision
2. What alternatives were considered
3. What assumptions were made
` : ''}
### Format

Provide your response in this structure:

**Summary:** [Your natural language summary here]

**Key Facts:**
- [Fact 1 with specific values]
- [Fact 2 with specific values]

${options.includeReasoning ? `**Decisions:**\n- [Decision with why]\n` : ''}${options.includeOpenQuestions ? `**Open Questions:**\n- [Question 1]\n` : ''}**Next Steps:**
- [Suggested immediate action]`;

  return prompt;
}

/**
 * Build a minimal prompt for quick handoffs
 */
export function buildMinimalHandoffPrompt(
  state: Record<string, unknown>,
  maxTokens: number = 200
): string {
  const stateJson = JSON.stringify(state, null, 2);

  return `# Handoff Summary

State:
\`\`\`json
${stateJson}
\`\`\`

Provide a concise 1-2 sentence summary highlighting the most important state for the next agent.`;
}
