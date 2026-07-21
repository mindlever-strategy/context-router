export type ProvenanceMeta = {
  agentRole?: string;
  executionId?: string;
  source?: string;
  confidence?: number;
};

export type ValueEnvelope = {
  value: unknown;
  provenance: ProvenanceMeta & { updatedAt: string };
};

export function isEnvelope(value: unknown): value is ValueEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'value' in value &&
    'provenance' in value
  );
}

export function unwrapValue(value: unknown): unknown {
  if (isEnvelope(value)) return value.value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const unwrapped: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      unwrapped[key] = unwrapValue(nested);
    }
    return unwrapped;
  }
  return value;
}

export function unwrapState(
  state: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, unwrapValue(value)]),
  );
}

export function wrapValue(value: unknown, meta: ProvenanceMeta): ValueEnvelope {
  return {
    value,
    provenance: {
      ...meta,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function wrapStateValue(
  value: Record<string, unknown>,
  meta: ProvenanceMeta,
  mode: 'per-field' | 'whole-object' = 'per-field',
): Record<string, unknown> {
  if (mode === 'whole-object') {
    return wrapValue(value, meta) as unknown as Record<string, unknown>;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      wrapValue(fieldValue, meta),
    ]),
  );
}

export function unwrapForHandoff(value: unknown): unknown {
  return unwrapValue(value);
}
