/**
 * OpenTelemetry Tracing Module
 * Stub implementation - extend with full OpenTelemetry when needed
 */

export function initTracing(): void {
  if (process.env.OTEL_ENABLED === 'true') {
    console.error(
      '[Tracing] OpenTelemetry tracing enabled (stub - extend for full implementation)',
    );
  }
}

export async function shutdownTracing(): Promise<void> {
  // Stub
}

// No-op span implementation
const noopSpan = {
  setAttribute: (_key: string, _value: unknown) => noopSpan,
  setAttributes: (_attributes: Record<string, unknown>) => noopSpan,
  setStatus: (_status: { code: number; message?: string }) => noopSpan,
  end: () => {},
  addEvent: (_name: string, _attributes?: Record<string, unknown>) => noopSpan,
  isRecording: () => false,
  recordException: (_exception: Error) => {},
  updateName: (_name: string) => noopSpan,
};

export const tracer = {
  startSpan: () => noopSpan,
  startActiveSpan: async <T>(
    _name: string,
    fn: (span: typeof noopSpan) => Promise<T>,
  ): Promise<T> => {
    return fn(noopSpan);
  },
};

export async function traceAsync<T>(
  _name: string,
  fn: (span: typeof noopSpan) => Promise<T>,
): Promise<T> {
  return fn(noopSpan);
}

export function traceSync<T>(
  _name: string,
  fn: (span: typeof noopSpan) => T,
): T {
  return fn(noopSpan);
}

export function createSpan(_name: string): typeof noopSpan {
  return noopSpan;
}
