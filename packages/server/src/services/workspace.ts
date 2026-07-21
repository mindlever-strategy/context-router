export function normalizeWorkspaceName(name: string): string {
  return name.trim().normalize('NFKC').toLowerCase();
}
