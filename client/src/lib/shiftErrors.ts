/**
 * Shared shift / scheduling API error parser.
 *
 * The shift endpoints surface structured 4xx bodies like:
 *   { message, reasons|eligibilityFailures, code: 'COMPLIANCE_BLOCK', canOverride }
 *
 * Without parsing, callers ended up dumping the entire JSON string into a
 * destructive toast, which produced screen-filling errors users could not act on.
 */

export interface ParsedShiftError {
  /** Short headline suitable for the toast title. */
  title: string;
  /** Plain-text body (already line-broken) suitable for the toast description. */
  description: string;
  /** Distinguishing server code, when present. */
  code?: string;
  /** When true the server says the caller MAY retry with `?override=true`. */
  canOverride?: boolean;
  /** Raw missing-document reasons, if the server returned them. */
  reasons?: string[];
}

interface RawApiError {
  message?: string;
  reasons?: string[];
  eligibilityFailures?: Array<{ name?: string; reason?: string }>;
  code?: string;
  canOverride?: boolean;
}

function tryParseBody(raw: string): RawApiError | null {
  // ApiError formats messages as "<status>: <body>" — strip the prefix first.
  const body = raw.replace(/^\d{3}:\s*/, '');
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      return parsed as RawApiError;
    }
  } catch {
    // Not JSON.
  }
  return null;
}

/** Friendly cleanup for the long "Missing required document: …" reason strings. */
function cleanReason(reason: string): string {
  return reason
    .replace(/^Missing required document:\s*/i, '')
    .replace(/^Missing document:\s*/i, '')
    .trim();
}

export function parseShiftError(error: unknown): ParsedShiftError {
  if (!error) {
    return { title: 'Something went wrong', description: 'Please try again.' };
  }

  const raw =
    (error as { message?: string })?.message ?? (typeof error === 'string' ? error : String(error));
  const parsed = tryParseBody(raw);

  if (!parsed) {
    return { title: 'Action failed', description: raw.replace(/^\d{3}:\s*/, '') };
  }

  if (parsed.code === 'COMPLIANCE_BLOCK') {
    const docs = (parsed.reasons || []).map(cleanReason).filter(Boolean);
    const description = docs.length
      ? `Missing paperwork:\n• ${docs.slice(0, 6).join('\n• ')}${
          docs.length > 6 ? `\n• …and ${docs.length - 6} more` : ''
        }`
      : parsed.message || 'Compliance documents incomplete.';
    return {
      title: 'Paperwork required',
      description,
      code: parsed.code,
      canOverride: parsed.canOverride,
      reasons: parsed.reasons,
    };
  }

  if (parsed.code === 'SHIFT_ALREADY_CLAIMED') {
    return {
      title: 'Shift already taken',
      description: parsed.message || 'Another officer claimed this shift first.',
      code: parsed.code,
    };
  }

  if (parsed.eligibilityFailures && parsed.eligibilityFailures.length) {
    const names = parsed.eligibilityFailures
      .map(f => f.name)
      .filter(Boolean)
      .slice(0, 5);
    return {
      title: 'Cannot assign shift',
      description: names.length
        ? `Not eligible: ${names.join(', ')}. Check the Compliance tab to resolve.`
        : parsed.message || 'Eligibility check failed.',
      code: parsed.code,
    };
  }

  return {
    title: 'Action failed',
    description: parsed.message || raw.replace(/^\d{3}:\s*/, ''),
    code: parsed.code,
  };
}
