import crypto from "crypto";

// Base32 alphabet (excluding easily confused characters like 0, O, 1, I, L)
const base32 = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const base36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generate random string from character set
 */
function randomAlphaNumeric(charset: string, length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Convert organization name to safe 4-character code
 * Examples:
 *   "Acme Corp" -> "ACME"
 *   "ABC" -> "ABCX" (padded)
 *   "123" -> "XXXX" (fallback to random)
 */
export function safeOrgCode(name: string): string {
  const sanitized = (name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  
  const core = sanitized.slice(0, 4) || randomAlphaNumeric(base32, 4);
  return core.padEnd(4, "X");
}

/**
 * Generate organization external ID
 * Format: ORG-ABCD
 */
export function genOrgExternalId(orgCode: string): string {
  return `ORG-${orgCode}`;
}

/**
 * Generate employee external ID with auto-increment
 * Format: EMP-ABCD-00001
 */
export function genEmployeeExternalId(orgCode: string, sequenceNumber: number): string {
  const paddedNumber = String(sequenceNumber).padStart(5, "0");
  return `EMP-${orgCode}-${paddedNumber}`;
}

/**
 * Generate support agent code
 * Format: SUP-AB12
 */
export function genSupportCode(): string {
  const part1 = randomAlphaNumeric(base32, 2);
  const part2 = randomAlphaNumeric(base36, 2);
  return `SUP-${part1}${part2}`;
}

/**
 * Generate client external ID with auto-increment
 * Format: CLI-ABCD-00001
 */
export function genClientExternalId(orgCode: string, sequenceNumber: number): string {
  const paddedNumber = String(sequenceNumber).padStart(5, "0");
  return `CLI-${orgCode}-${paddedNumber}`;
}

/**
 * Check if a string matches an external ID pattern
 */
export function isExternalIdFormat(value: string): boolean {
  return /^(ORG|EMP|SUP|CLI)-/.test(value.toUpperCase());
}

/**
 * Check if a string looks like a UUID
 */
export function isUuidFormat(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Parse external ID to extract type and components
 */
export function parseExternalId(externalId: string): {
  type: 'org' | 'employee' | 'support' | 'client' | null;
  orgCode?: string;
  sequenceNumber?: number;
} | null {
  const upper = externalId.toUpperCase();
  
  if (upper.startsWith('ORG-')) {
    const orgCode = upper.substring(4);
    return { type: 'org', orgCode };
  }
  
  if (upper.startsWith('EMP-')) {
    const parts = upper.substring(4).split('-');
    if (parts.length === 2) {
      return {
        type: 'employee',
        orgCode: parts[0],
        sequenceNumber: parseInt(parts[1], 10),
      };
    }
  }
  
  if (upper.startsWith('SUP-')) {
    return { type: 'support' };
  }
  
  if (upper.startsWith('CLI-')) {
    const parts = upper.substring(4).split('-');
    if (parts.length === 2) {
      return {
        type: 'client',
        orgCode: parts[0],
        sequenceNumber: parseInt(parts[1], 10),
      };
    }
  }
  
  return null;
}
