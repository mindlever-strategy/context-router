export function matchesKeyPattern(key: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  if (patterns.includes('*')) return true;
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) {
      return key.startsWith(pattern.slice(0, -1));
    }
    return key === pattern;
  });
}

export function filterKeysByPatterns(
  keys: string[],
  patterns: string[],
): string[] {
  return keys.filter((key) => matchesKeyPattern(key, patterns));
}

export function assertWriteAllowed(
  key: string,
  allowedWriteKeys: string[],
): void {
  if (!matchesKeyPattern(key, allowedWriteKeys)) {
    throw new Error('WRITE_FORBIDDEN');
  }
}

export function filterReadableState(
  state: Record<string, unknown>,
  allowedReadKeys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([key]) =>
      matchesKeyPattern(key, allowedReadKeys),
    ),
  );
}
