/**
 * Checks if an API key looks valid (not empty, not a placeholder).
 * Used by all AI clients to decide mock vs real mode.
 */
export function isValidApiKey(key: string | undefined): boolean {
  if (!key) return false;

  const trimmed = key.trim();
  if (trimmed.length < 10) return false;

  // Common placeholder patterns
  const placeholders = [
    'mock', 'test', 'placeholder', 'your_', 'sk_test_placeholder',
    'xxx', 'CHANGE_ME', 'TODO', 'INSERT',
  ];

  const lower = trimmed.toLowerCase();
  for (const p of placeholders) {
    if (lower === p || lower.startsWith(p)) return false;
  }

  return true;
}
