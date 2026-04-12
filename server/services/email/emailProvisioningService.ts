import { pool, db } from '../../db';
import { createLogger } from '../../lib/logger';
import { subscriptionManager } from '../billing/subscriptionManager';

const log = createLogger('EmailProvisioning');

export const ROOT_DOMAIN = 'coaileague.com';

/**
 * Protected @coaileague.com platform addresses.
 * These can NEVER be claimed, created, or impersonated by tenants.
 * Only system bots or support agents with is_platform_support=true may use them.
 */
export const PLATFORM_PROTECTED_ADDRESSES: ReadonlyArray<{
  address: string;
  displayName: string;
  isOutboundOnly: boolean;
  trinityType?: string;
}> = [
  { address: 'root@coaileague.com',     displayName: 'CoAIleague Root',     isOutboundOnly: true },
  { address: 'noreply@coaileague.com',  displayName: 'CoAIleague No-Reply', isOutboundOnly: true },
  { address: 'trinity@coaileague.com',  displayName: 'Trinity AI',          isOutboundOnly: true  }, // Reserved for outbound marketing + reply classification via trinityMarketingReplyProcessor
  { address: 'support@coaileague.com',  displayName: 'CoAIleague Support',  isOutboundOnly: false, trinityType: 'support_ticket' },
  { address: 'info@coaileague.com',     displayName: 'CoAIleague Info',     isOutboundOnly: false, trinityType: 'support_ticket' },
  { address: 'billing@coaileague.com',  displayName: 'CoAIleague Billing',  isOutboundOnly: false, trinityType: 'billing_inquiry' },
  { address: 'hello@coaileague.com',    displayName: 'CoAIleague Hello',    isOutboundOnly: false },
];

/**
 * Workspace system address definitions.
 * Per-tenant. Created in subdomain format only:
 *   Primary (subdomain):  staffing@{slug}.coaileague.com   ← requires wildcard MX *.coaileague.com
 */
const WORKSPACE_SYSTEM_TYPES = [
  { fn: 'staffing',  displayName: 'Staffing',  trinityType: 'staffing_inquiry', autoProcess: true },
  { fn: 'calloffs',  displayName: 'Calloffs',  trinityType: 'calloff',          autoProcess: true },
  { fn: 'incidents', displayName: 'Incidents', trinityType: 'incident',         autoProcess: true },
  { fn: 'support',   displayName: 'Support',   trinityType: 'support_ticket',   autoProcess: true },
  { fn: 'docs',      displayName: 'Documents', trinityType: 'document_intake',  autoProcess: true },
  { fn: 'billing',   displayName: 'Billing',   trinityType: 'billing_inquiry',  autoProcess: true },
] as const;

/**
 * Guard: returns true if the given address is on the root @coaileague.com domain
 * and is NOT a workspace subdomain address.
 */
export function isRootDomainAddress(address: string): boolean {
  const lower = address.toLowerCase();
  return lower.endsWith('@coaileague.com');
}

/**
 * Guard: returns true if this address is in the protected platform list.
 * Used to block tenant API from claiming these addresses.
 */
export function isPlatformProtectedAddress(address: string): boolean {
  const lower = address.toLowerCase();
  return PLATFORM_PROTECTED_ADDRESSES.some(p => p.address === lower);
}

/**
 * Guard: block tenants from creating any @coaileague.com root domain address.
 * Tenants MUST use @{slug}.coaileague.com.
 * Returns error string or null if OK.
 */
export function validateTenantEmailAddress(address: string, workspaceEmailSlug: string): string | null {
  const lower = address.toLowerCase();

  if (isRootDomainAddress(lower)) {
    return `Tenant email addresses must use @${workspaceEmailSlug}.coaileague.com format. Root domain @coaileague.com addresses are reserved for the CoAIleague platform team.`;
  }

  const expectedDomain = `@${workspaceEmailSlug}.coaileague.com`;
  if (!lower.endsWith(expectedDomain)) {
    return `Email address must be in your workspace domain: @${workspaceEmailSlug}.coaileague.com`;
  }

  return null;
}

export class EmailProvisioningService {

  /**
   * Seed protected platform addresses into platform_email_addresses.
   * Idempotent — safe to run multiple times.
   */
  async seedPlatformProtectedAddresses(): Promise<void> {
    for (const addr of PLATFORM_PROTECTED_ADDRESSES) {
      await pool.query(`
        INSERT INTO platform_email_addresses (
          address, local_part, subdomain, display_name,
          address_type, is_active, is_protected, is_outbound_only,
          auto_trinity_process, trinity_calltype
        ) VALUES ($1, $2, $3, $4, 'platform_team', true, true, $5, $6, $7)
        ON CONFLICT (address) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          is_protected = true,
          is_outbound_only = EXCLUDED.is_outbound_only,
          trinity_calltype = EXCLUDED.trinity_calltype
      `, [
        addr.address,
        addr.address.split('@')[0],
        'coaileague.com',
        addr.displayName,
        addr.isOutboundOnly,
        !!addr.trinityType,
        addr.trinityType || null,
      ]);

      if (!addr.isOutboundOnly && addr.trinityType) {
        await pool.query(`
          INSERT INTO email_routing (address, route_type, auto_process, process_as, is_active)
          VALUES ($1, 'platform_inbox', true, $2, true)
          ON CONFLICT (address) DO NOTHING
        `, [addr.address, addr.trinityType]);
      }
    }
    log.info(`[EmailProvisioning] Seeded ${PLATFORM_PROTECTED_ADDRESSES.length} protected platform addresses`);
  }

  /**
   * Provision workspace system email addresses.
   *
   * Creates ONE address per function (staffing, calloffs, incidents, etc.):
   *   subdomain format:  staffing@{slug}.coaileague.com  (requires wildcard *.coaileague.com MX)
   *
   * 6 addresses total per tenant. All deliver to the workspace Trinity processor.
   * DNS note: subdomain format requires MX record: *.coaileague.com → inbound.resend.com
   */
  async provisionWorkspaceAddresses(
    workspaceId: string,
    emailSlug: string
  ): Promise<void> {
    // 6 addresses total per tenant.
    const expectedCount = WORKSPACE_SYSTEM_TYPES.length;

    await pool.query(
      `UPDATE workspaces SET email_domain = $1, email_slug = $2 WHERE id = $3`,
      [ROOT_DOMAIN, emailSlug, workspaceId]
    );

    for (const def of WORKSPACE_SYSTEM_TYPES) {
      const address = `${def.fn}@${emailSlug}.coaileague.com`;

      await pool.query(`
        INSERT INTO platform_email_addresses (
          workspace_id, address, local_part, subdomain, display_name,
          address_type, is_active, is_protected, auto_trinity_process, trinity_calltype
        ) VALUES ($1, $2, $3, $4, $5, 'workspace_system', true, false, $6, $7)
        ON CONFLICT (address) DO NOTHING
      `, [workspaceId, address, def.fn, emailSlug, def.displayName, def.autoProcess, def.trinityType]);

      await pool.query(`
        INSERT INTO email_routing (
          address, route_type, target_workspace_id, auto_process, process_as, is_active
        ) VALUES ($1, 'trinity_process', $2, $3, $4, true)
        ON CONFLICT (address) DO UPDATE SET
          target_workspace_id = EXCLUDED.target_workspace_id,
          auto_process = EXCLUDED.auto_process,
          process_as = EXCLUDED.process_as,
          is_active = true
      `, [address, workspaceId, def.autoProcess, def.trinityType]);
    }

    log.info(`[EmailProvisioning] Provisioned ${WORKSPACE_SYSTEM_TYPES.length} system addresses for workspace ${workspaceId} (slug: ${emailSlug})`);

    // OMEGA L1:850 — Initialize exactly 8 system email folders in DB for EmailHub
    const SYSTEM_FOLDERS = [
      { name: 'Staffing',   folderType: 'staffing',   sortOrder: 0 },
      { name: 'Call-Offs',  folderType: 'calloffs',   sortOrder: 1 },
      { name: 'Incidents',  folderType: 'incidents',  sortOrder: 2 },
      { name: 'Support',    folderType: 'support',    sortOrder: 3 },
      { name: 'Billing',    folderType: 'billing',    sortOrder: 4 },
      { name: 'Documents',  folderType: 'docs',       sortOrder: 5 },
      { name: 'Unread',     folderType: 'inbox',      sortOrder: 6 },
      { name: 'Archive',    folderType: 'archive',    sortOrder: 7 },
    ];
    for (const folder of SYSTEM_FOLDERS) {
      await pool.query(`
        INSERT INTO internal_email_folders (workspace_id, mailbox_id, name, folder_type, sort_order, is_system)
        SELECT $1::text, $1::text, $2::text, $3::text, $4, true
        WHERE NOT EXISTS (
          SELECT 1 FROM internal_email_folders
          WHERE workspace_id = $1::text AND folder_type = $3::text
        )
      `, [workspaceId, folder.name, folder.folderType, folder.sortOrder]);
    }
    log.info(`[EmailProvisioning] Initialized 8 system email folders for workspace ${workspaceId}`);
  }

  /**
   * Reserve a personal email address for an officer/user.
   * Address is inactive (not billed) until org owner activates it.
   * Format: firstname.lastname@{slug}.coaileague.com
   */
  async reserveUserEmailAddress(
    workspaceId: string,
    userId: string,
    firstName: string,
    lastName: string,
    emailSlug: string
  ): Promise<string> {
    const localPart = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`
      .replace(/[^a-z0-9.]/g, '');
    const address = `${localPart}@${emailSlug}.coaileague.com`;

    await pool.query(`
      INSERT INTO platform_email_addresses (
        workspace_id, user_id, address, local_part, subdomain,
        display_name, address_type, is_active, is_protected
      ) VALUES ($1, $2, $3, $4, $5, $6, 'user_personal', false, false)
      ON CONFLICT (address) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        display_name = EXCLUDED.display_name
    `, [workspaceId, userId, address, localPart, emailSlug, `${firstName} ${lastName}`]);

    await pool.query(
      `UPDATE users SET platform_email = $1 WHERE id = $2`,
      [address, userId]
    );

    return address;
  }

  /**
   * Reserve an email address for a client portal.
   * Address is inactive (not billed) until org owner activates it.
   * Format: clientname@{slug}.coaileague.com
   */
  async reserveClientEmailAddress(
    workspaceId: string,
    clientId: string,
    clientName: string,
    emailSlug: string
  ): Promise<string> {
    const localPart = clientName.toLowerCase()
      .replace(/[^a-z0-9]/g, '').slice(0, 20);
    const address = `${localPart}@${emailSlug}.coaileague.com`;

    await pool.query(`
      INSERT INTO platform_email_addresses (
        workspace_id, client_id, address, local_part, subdomain,
        display_name, address_type, is_active, is_protected
      ) VALUES ($1, $2, $3, $4, $5, $6, 'user_client', false, false)
      ON CONFLICT (address) DO NOTHING
    `, [workspaceId, clientId, address, localPart, emailSlug, clientName]);

    await pool.query(
      `UPDATE clients SET platform_email = $1 WHERE id = $2`,
      [address, clientId]
    );

    return address;
  }

  /**
   * Activate an email address seat.
   * Sets is_active=true, records activatedBy and billing_seat_id, creates routing record.
   * Org owner role required — enforced at route level.
   */
  async activateEmailAddress(
    emailAddressId: string,
    activatedByUserId: string,
    stripeSubscriptionItemId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE platform_email_addresses SET
          is_active = true,
          activated_at = NOW(),
          activated_by = $1,
          billing_seat_id = $2
        WHERE id = $3 AND is_protected = false
        RETURNING address, user_id, workspace_id, address_type
      `, [activatedByUserId, stripeSubscriptionItemId, emailAddressId]);

      if (!result.rows[0]) throw new Error('Email address not found or is protected');
      const addr = result.rows[0];

      await client.query(`
        INSERT INTO email_routing (
          address, email_address_id, route_type,
          target_workspace_id, target_user_id, is_active
        ) VALUES ($1, $2, 'user_inbox', $3, $4, true)
        ON CONFLICT (address) DO UPDATE SET
          is_active = true,
          target_user_id = EXCLUDED.target_user_id
      `, [addr.address, emailAddressId, addr.workspace_id, addr.user_id]);

      await client.query(`
        INSERT INTO universal_audit_log (
          workspace_id, entity_type, entity_id,
          action_type, actor_id, new_value
        ) VALUES ($1, 'email_address', $2, 'email_activated', $3, $4)
      `, [addr.workspace_id, emailAddressId, activatedByUserId, JSON.stringify({ address: addr.address })]);

      await client.query('COMMIT');
      log.info(`[EmailProvisioning] Activated address ${addr.address} for workspace ${addr.workspace_id}`);

      // Sync Stripe metered seats after activation
      this.syncStripeMeteredSeats(addr.workspace_id).catch(err => 
        log.error(`[EmailProvisioning] Failed to sync Stripe seats for ${addr.workspace_id}:`, err)
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deactivateEmailAddress(
    emailAddressId: string,
    deactivatedByUserId: string
  ): Promise<void> {
    const result = await pool.query(`
      UPDATE platform_email_addresses SET
        is_active = false, deactivated_at = NOW()
      WHERE id = $1 AND is_protected = false
      RETURNING workspace_id
    `, [emailAddressId]);

    await pool.query(
      `UPDATE email_routing SET is_active = false WHERE email_address_id = $1`,
      [emailAddressId]
    );

    log.info(`[EmailProvisioning] Deactivated address id=${emailAddressId} by user ${deactivatedByUserId}`);

    if (result.rows[0]) {
      this.syncStripeMeteredSeats(result.rows[0].workspace_id).catch(err => 
        log.error(`[EmailProvisioning] Failed to sync Stripe seats for ${result.rows[0].workspace_id}:`, err)
      );
    }
  }

  /**
   * Sync the number of active paid email seats with Stripe.
   */
  private async syncStripeMeteredSeats(workspaceId: string): Promise<void> {
    try {
      const activeSeatsResult = await pool.query(
        `SELECT COUNT(*) AS value FROM platform_email_addresses
         WHERE workspace_id = $1 AND is_active = true
           AND address_type IN ('user_personal', 'user_client')`,
        [workspaceId]
      );

      const activeSeatsCount = Number(activeSeatsResult.rows[0]?.value || 0);
      await subscriptionManager.updateMeteredSeats(workspaceId, activeSeatsCount);
    } catch (err) {
      log.error(`[EmailProvisioning] syncStripeMeteredSeats failed for ${workspaceId}:`, err);
    }
  }

  async backfillWorkspaceAddresses(workspaceId: string): Promise<void> {
    const ws = await pool.query(
      `SELECT email_slug FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const emailSlug = ws.rows[0]?.email_slug;
    if (!emailSlug) {
      log.warn(`[EmailProvisioning] No email_slug for workspace ${workspaceId}, skipping backfill`);
      return;
    }
    await this.provisionWorkspaceAddresses(workspaceId, emailSlug);
  }
}

export const emailProvisioningService = new EmailProvisioningService();
