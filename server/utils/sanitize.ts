export function trimStrings<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as any)[key] = (result[key] as string).trim();
    }
  }
  return result;
}

export function sanitizeHtml(input: string): string {
  // Remove null bytes and control characters
  return input.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
