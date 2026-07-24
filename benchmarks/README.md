# Context Router Benchmarks

This directory contains benchmarks to prove Context Router's efficiency and cost savings.

## Running Benchmarks

```bash
# Run all benchmarks
node benchmarks/run-all.ts

# Run individual benchmarks
node benchmarks/token-reduction.ts
node benchmarks/latency.ts
node benchmarks/memory-usage.ts
node benchmarks/cost-savings.ts
node benchmarks/failure-recovery.ts
```

## Benchmark Types

### 1. Token Reduction
Measures how much context size is reduced by using structured state vs. full chat history.

**Key Metrics:**
- Chat history tokens (traditional approach)
- Context Router tokens (structured state)
- Reduction percentage
- Savings ratio

### 2. Latency
Measures the overhead of Context Router operations.

**Operations Tested:**
- State write/read
- Checkpoint create/list/restore
- Handoff generate
- Workflow lifecycle

**Metrics:**
- Average latency
- P50, P95, P99 percentiles
- Comparison with in-memory baseline

### 3. Memory Usage
Compares memory consumption between approaches.

**Scenarios:**
- 3 agents × 10 messages
- 5 agents × 20 messages
- 10 agents × 50 messages

### 4. Cost Savings
Calculates monetary savings based on LLM API pricing.

**Supported Models:**
- GPT-4o, GPT-4o-mini
- Claude Sonnet, Claude Haiku
- Gemini 1.5 Pro, Gemini 1.5 Flash

**Outputs:**
- Per-workflow savings
- Monthly savings projection
- Yearly ROI
- Payback period

### 5. Failure Recovery
Compares recovery time after simulated failures.

**Scenarios:**
- Content generation pipeline
- Multi-agent research
- Data processing pipeline

**Metrics:**
- Traditional recovery time (restart from scratch)
- Checkpoint recovery time
- Speedup factor
- Work saved percentage

## Expected Results

Based on typical multi-agent workflows:

| Metric | Traditional | Context Router | Improvement |
|--------|-------------|----------------|-------------|
| Context Size | 100% | 15-30% | 70-85% reduction |
| Memory Usage | 100% | 20-40% | 60-80% reduction |
| API Costs | 100% | 30-50% | 50-70% savings |
| Recovery Time | 100% | 5-20% | 80-95% faster |

## Interpreting Results

### Token Reduction
Higher reduction = More efficient context management. Target: >70%

### Latency
Context Router overhead should be <5ms for state operations. Higher values may indicate I/O bottlenecks.

### Memory Usage
Context Router should use significantly less memory as workflows grow. Linear growth vs. exponential.

### Cost Savings
ROI should be positive even for small teams. Target: >200% yearly ROI.

### Failure Recovery
Checkpoints should save >80% of completed work. Speedup factor >5x is typical.
