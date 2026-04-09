import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  TransferType,
  TransferNetwork,
  ACHClass,
} from 'plaid';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
const log = createLogger('plaidService');


const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox') as keyof typeof PlaidEnvironments;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const ENCRYPTION_KEY_HEX = process.env.PLAID_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY || '';

function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY_HEX && ENCRYPTION_KEY_HEX.length >= 64) {
    return Buffer.from(ENCRYPTION_KEY_HEX.slice(0, 64), 'hex');
  }
  const fallback = 'coaileague-plaid-fallback-key-dev-only-32b!';
  return Buffer.from(fallback.padEnd(32, '0').slice(0, 32));
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function buildClient(): PlaidApi {
  const config = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      timeout: 30000,  // FIX-9: 30 second timeout for Plaid API calls
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

export function isPlaidConfigured(): boolean {
  return !!(PLAID_CLIENT_ID && PLAID_SECRET);
}

export { encryptToken as plaidEncrypt, decryptToken as plaidDecrypt };

export interface PlaidLinkTokenResult {
  linkToken: string;
  expiration: string;
}

export interface PlaidExchangeResult {
  accessToken: string;
  itemId: string;
  accountId: string;
  accountName: string;
  mask: string;
  institutionName: string;
  accountType: string;
}

export interface PlaidTransferResult {
  transferId: string;
  status: string;
  amount: string;
  accountId: string;
}

export async function createLinkToken(opts: {
  userId: string;
  workspaceId: string;
  purpose: 'employee_dd' | 'org_funding';
  redirectUri?: string;
}): Promise<PlaidLinkTokenResult> {
  const client = buildClient();
  const user = { client_user_id: `${opts.workspaceId}:${opts.userId}` };

  const products: Products[] = opts.purpose === 'org_funding'
    ? [Products.Transfer, Products.Auth]
    : [Products.Auth, Products.Transfer];

  const response = await client.linkTokenCreate({
    user,
    client_name: PLATFORM.name + " Payroll",
    products,
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    redirect_uri: opts.redirectUri || undefined,
  });

  return {
    linkToken: response.data.link_token,
    expiration: response.data.expiration,
  };
}

export async function exchangePublicToken(publicToken: string): Promise<{
  accessToken: string;
  itemId: string;
}> {
  const client = buildClient();
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

export async function getAccountDetails(accessToken: string): Promise<{
  accountId: string;
  accountName: string;
  mask: string;
  institutionName: string;
  accountType: string;
}> {
  const client = buildClient();
  const authResp = await client.authGet({ access_token: accessToken });
  const accounts = authResp.data.accounts;
  if (!accounts || accounts.length === 0) throw new Error('No accounts found for this Plaid item');

  const account = accounts[0];

  let institutionName = 'Unknown Bank';
  try {
    const itemResp = await client.itemGet({ access_token: accessToken });
    const instId = itemResp.data.item.institution_id;
    if (instId) {
      const instResp = await client.institutionsGetById({
        institution_id: instId,
        country_codes: [CountryCode.Us],
      });
      institutionName = instResp.data.institution.name;
    }
  } catch (_plaidErr) { log.warn('[PlaidService] Failed to fetch institution name — using default:', _plaidErr instanceof Error ? _plaidErr.message : String(_plaidErr)); }

  return {
    accountId: account.account_id,
    accountName: account.name,
    mask: account.mask || '',
    institutionName,
    accountType: account.subtype || account.type || 'checking',
  };
}

export async function initiateTransfer(opts: {
  accessToken: string;
  accountId: string;
  amount: string;
  description: string;
  legalName: string;
  type?: 'credit' | 'debit';
  /** GAP-36 FIX: Idempotency key prevents double ACH transfers when two concurrent payroll
   *  requests race to initiate the same pay stub transfer. Derive from the pay stub ID or
   *  payroll entry ID so Plaid can deduplicate at the API level. */
  idempotencyKey?: string;
}): Promise<PlaidTransferResult> {
  const client = buildClient();
  const type = (opts.type || 'credit') as TransferType;

  const authResponse = await client.transferAuthorizationCreate({
    access_token: opts.accessToken,
    account_id: opts.accountId,
    type,
    network: TransferNetwork.Ach,
    amount: opts.amount,
    ach_class: ACHClass.Ppd,
    user: { legal_name: opts.legalName },
  });

  const authorization = authResponse.data.authorization;
  if (authorization.decision !== 'approved') {
    const rationale = authorization.decision_rationale as any;
    throw new Error(`Transfer authorization declined: ${rationale?.description || authorization.decision}`);
  }

  const transferCreateBody: any = {
    access_token: opts.accessToken,
    account_id: opts.accountId,
    authorization_id: authorization.id,
    description: opts.description.slice(0, 15),
    amount: opts.amount,
  };
  if (opts.idempotencyKey) {
    transferCreateBody.idempotency_key = opts.idempotencyKey;
  }

  // GAP-41 FIX: Retry transferCreate on Plaid 429 rate-limit with exponential backoff.
  // Payroll batches (20–200 employees) all call initiateTransfer concurrently; Plaid's
  // production rate limit is ~100 req/min per access-token. Without retry, any employee
  // beyond the rate cap gets a thrown error, falls through to manual-payment fallback, and
  // is never disbursed automatically. The idempotency_key (GAP-36) makes retries safe —
  // Plaid deduplicates at the API level so even if the first call succeeded but timed out,
  // the retry returns the same transfer rather than creating a second one.
  const MAX_PLAID_RETRIES = 3;
  const PLAID_RETRY_BASE_MS = 1_000;
  let transferResponse: Awaited<ReturnType<typeof client.transferCreate>>;
  for (let attempt = 1; attempt <= MAX_PLAID_RETRIES; attempt++) {
    try {
      transferResponse = await client.transferCreate(transferCreateBody);
      break; // success
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      const isRateLimit = status === 429 || err?.error_code === 'RATE_LIMIT_EXCEEDED';
      if (isRateLimit && attempt < MAX_PLAID_RETRIES) {
        const backoff = PLAID_RETRY_BASE_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        log.warn(`[PlaidService] transferCreate 429 on attempt ${attempt} — retrying in ${backoff}ms (key: ${opts.idempotencyKey ?? 'none'})`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw err; // non-retryable or exhausted retries
    }
  }

  const transfer = transferResponse!.data.transfer;
  return {
    transferId: transfer.id,
    status: transfer.status,
    amount: transfer.amount,
    accountId: opts.accountId,
  };
}

export async function getTransferStatus(transferId: string): Promise<{
  status: string;
  failureReason?: string;
}> {
  const client = buildClient();
  const response = await client.transferGet({ transfer_id: transferId });
  const transfer = response.data.transfer;
  return {
    status: transfer.status,
    failureReason: (transfer as any).failure_reason?.description || undefined,
  };
}

export async function verifyBankAccount(accessToken: string): Promise<{ valid: boolean; status: string }> {
  const client = buildClient();
  try {
    const authResp = await client.authGet({ access_token: accessToken });
    const accounts = authResp.data.accounts;
    if (!accounts || accounts.length === 0) {
      return { valid: false, status: 'no_accounts' };
    }
    const account = accounts[0];
    const isActive = account.verification_status !== 'verification_failed';
    return {
      valid: isActive,
      status: account.verification_status || 'active',
    };
  } catch (err: any) {
    return { valid: false, status: err?.message || 'verification_error' };
  }
}

export async function cancelTransfer(transferId: string): Promise<boolean> {
  const client = buildClient();
  try {
    await client.transferCancel({ transfer_id: transferId });
    return true;
  } catch {
    return false;
  }
}

/**
 * GAP-35 FIX: Plaid Webhook JWT Signature Verification
 *
 * Plaid signs webhooks with RSA-signed JWTs (not HMAC). The verification process:
 * 1. Decode the JWT header (without verifying) to extract the key ID (`kid`)
 * 2. Fetch the corresponding JWK from the Plaid API (cached for 5 minutes)
 * 3. Verify the JWT signature using the JWK via the `jose` library
 *
 * Without this check, any server on the internet can POST to /api/plaid/webhook
 * with a forged transfer_id and fabricate a "settled" event, causing CoAIleague
 * to write spurious payroll_disbursed ledger entries and fire employee SMS notifications.
 *
 * Returns true if valid (or if Plaid credentials are not configured — dev-only bypass).
 * Returns false if the signature is invalid or verification fails.
 */

// In-memory JWK cache to avoid a Plaid API round-trip on every webhook delivery.
// TTL: 5 minutes. Plaid rotates keys infrequently but the cache avoids DOS potential.
const _jwkCache = new Map<string, { key: any; expiresAt: number }>();

export async function verifyPlaidWebhookJwt(token: string | undefined): Promise<boolean> {
  if (!token) {
    log.warn('[PlaidWebhook] Missing Plaid-Verification header — signature not verified. This is acceptable in development but must be fixed in production.');
    return !process.env.PLAID_CLIENT_ID; // allow unsigned in dev-only (no creds configured)
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    // Plaid not fully configured — skip verification (development environment)
    log.warn('[PlaidWebhook] Plaid credentials not set — webhook signature verification skipped.');
    return true;
  }

  try {
    const { importJWK, jwtVerify } = await import('jose');

    // Step 1: Decode JWT header to extract key ID without verifying signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      log.error('[PlaidWebhook] JWT is malformed — expected 3 parts');
      return false;
    }
    let header: { kid?: string; alg?: string };
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
      log.error('[PlaidWebhook] JWT header is not valid base64-encoded JSON');
      return false;
    }

    const kid = header.kid;
    if (!kid) {
      log.error('[PlaidWebhook] JWT header missing required kid claim');
      return false;
    }

    // Step 2: Fetch JWK from Plaid API (with 5-minute cache to avoid rate-limiting)
    let cached = _jwkCache.get(kid);
    if (!cached || cached.expiresAt < Date.now()) {
      const client = buildClient();
      const keyResponse = await client.webhookVerificationKeyGet({ key_id: kid });
      const jwk = keyResponse.data.key as any;
      const key = await importJWK(jwk, header.alg || 'RS256');
      cached = { key, expiresAt: Date.now() + 5 * 60 * 1000 };
      _jwkCache.set(kid, cached);
    }

    // Step 3: Verify JWT signature — throws if invalid
    await jwtVerify(token, cached.key);

    return true;
  } catch (err: any) {
    log.error('[PlaidWebhook] JWT signature verification failed:', (err instanceof Error ? err.message : String(err)));
    return false;
  }
}
