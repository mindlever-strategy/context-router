type HandoffOptions = {
  maxTokens?: number;
};

export class HandoffGenerator {
  generate(
    state: Record<string, unknown>,
    options: HandoffOptions = {},
  ): string {
    const parts: string[] = [];
    const maxTokens = options.maxTokens ?? 200;

    for (const [key, value] of Object.entries(state)) {
      if (value === undefined || value === null) continue;

      const formattedKey = this.formatKey(key);
      const formattedValue = this.formatValue(value, key);

      if (formattedKey && formattedValue) {
        parts.push(`${formattedKey}: ${formattedValue}`);
      }
    }

    let summary = parts.join(', ');

    // Rough token estimate (1 token ≈ 4 chars)
    const maxChars = maxTokens * 4;
    if (summary.length > maxChars) {
      summary = summary.substring(0, maxChars - 3) + '...';
    }

    return summary;
  }

  formatKey(key: string): string {
    // Convert snake_case or camelCase to Title Case (only first letter capitalized)
    const words = key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 0);

    // Capitalize only the first letter of the first word
    if (words.length === 0) return '';
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);

    return words.join(' ');
  }

  formatValue(value: unknown, key?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return this.truncate(value);
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'yes' : 'no';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return 'empty';
      if (value.every((item) => typeof item === 'string')) {
        return value.slice(0, 3).join(', ') + (value.length > 3 ? '...' : '');
      }
      return `[${value.length} items]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      const formatted = entries
        .slice(0, 2)
        .map(([k, v]) => {
          return `${this.formatKey(k)}: ${this.formatValue(v)}`;
        })
        .join(', ');
      return `{${formatted}${entries.length > 2 ? '...' : ''}}`;
    }

    return String(value);
  }

  private truncate(str: string, maxLength: number = 50): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}
