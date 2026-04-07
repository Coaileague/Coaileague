import crypto from 'crypto';

/**
 * Generate unique Work ID for users
 * Format: Firstname-CountryCode-StateCode-Dept-Last4
 * Example: Jane-01-100-01-1234
 * 
 * Where:
 * - Firstname: User's first name
 * - CountryCode: 2 digits (01=USA, 02=Canada, etc.)
 * - StateCode: 3 digits (even=USA states, odd=foreign regions)
 * - Dept: 2 digits (01=support staff, 02=org users, etc.)
 * - Last4: Last 4 random digits for uniqueness
 */

export function generateWorkId(
  firstName: string,
  countryCode: number = 1, // Default to USA
  stateCode: number = 100, // Default to general US
  departmentCode: number = 2, // Default to org user
): string {
  // Sanitize first name - only alphanumeric
  const sanitizedName = firstName.replace(/[^a-zA-Z]/g, '');
  
  // Generate random last 4 digits for uniqueness
  const last4 = 1000 + crypto.randomInt(9000);
  
  // Format: Name-CC-SSS-DD-LLLL
  return `${sanitizedName}-${String(countryCode).padStart(2, '0')}-${String(stateCode).padStart(3, '0')}-${String(departmentCode).padStart(2, '0')}-${last4}`;
}

/**
 * Determine department code based on platform role and workspace role
 */
export function getDepartmentCode(
  platformRole?: string | null,
  workspaceRole?: string | null
): number {
  // Platform staff codes (01-09)
  if (platformRole === 'root_admin') return 1;
  if (platformRole === 'deputy_admin') return 2;
  if (platformRole === 'support_manager') return 3;
  if (platformRole === 'sysop') return 4;
  
  // Organization leadership codes (10-19)
  if (workspaceRole === 'org_owner') return 10;
  if (workspaceRole === 'department_manager') return 11;
  
  // Regular organization users (20+)
  if (workspaceRole === 'staff') return 20;
  
  // Default fallback
  return 99;
}

/**
 * Check if Work ID already exists in database
 */
export async function isWorkIdUnique(workId: string, db: any): Promise<boolean> {
  const existing = await db.query.users.findFirst({
    where: (users: any, { eq }: any) => eq(users.workId, workId),
  });
  return !existing;
}

/**
 * Generate unique Work ID with retry logic
 */
export async function generateUniqueWorkId(
  db: any,
  firstName: string,
  countryCode: number = 1,
  stateCode: number = 100,
  platformRole?: string | null,
  workspaceRole?: string | null,
  maxRetries: number = 10
): Promise<string> {
  const deptCode = getDepartmentCode(platformRole, workspaceRole);
  
  for (let i = 0; i < maxRetries; i++) {
    const workId = generateWorkId(firstName, countryCode, stateCode, deptCode);
    const unique = await isWorkIdUnique(workId, db);
    
    if (unique) {
      return workId;
    }
  }
  
  // Fallback: add timestamp if all retries failed
  const timestamp = Date.now().toString().slice(-4);
  return `${firstName}-${String(countryCode).padStart(2, '0')}-${String(stateCode).padStart(3, '0')}-${String(deptCode).padStart(2, '0')}-${timestamp}`;
}
