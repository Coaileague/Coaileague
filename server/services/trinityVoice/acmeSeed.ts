/**
 * ACME Sandbox Voice Seed — Phase 56 / 57
 * =========================================
 * Seeds the dev-acme-security-ws workspace with:
 * - A test phone number (+1-555-TRINITY = +15558746489)
 *
 * Safe to run multiple times — uses upsert/skip patterns.
 */

import { db } from '../../db';
import { workspacePhoneNumbers } from '../../../shared/schema/domains/voice';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('voiceSeed');

const ACME_WS = 'dev-acme-security-ws';
const TEST_PHONE = '+15558746489'; // 555-TRINITY
const TEST_PHONE_SID = 'PN_ACME_TEST_VOICE_001';

export async function seedAcmeVoiceData(): Promise<void> {
  // Production guard — dev seeds must NEVER run in production (TRINITY.md §A)
  const { isProduction } = await import('../../lib/isProduction');
  if (isProduction()) return;

  try {
    // Upsert phone number
    const [existingPhone] = await db.select()
      .from(workspacePhoneNumbers)
      .where(eq(workspacePhoneNumbers.phoneNumber, TEST_PHONE))
      .limit(1);

    if (!existingPhone) {
      await db.insert(workspacePhoneNumbers).values({
        workspaceId: ACME_WS,
        phoneNumber: TEST_PHONE,
        friendlyName: 'ACME Security Main Line (Test)',
        twilioSid: TEST_PHONE_SID,
        country: 'US',
        capabilities: { voice: true, sms: false },
        isActive: true,
        isPrimary: true,
        greetingScript: 'Thank you for calling ACME Security Services. Trinity is here to assist you.',
        greetingScriptEs: 'Gracias por llamar a ACME Security Services. Trinity está aquí para ayudarle.',
        extensionConfig: {
          sales: true, client_support: true, employment_verification: true,
          staff: true, emergency: true, careers: true,
        },
        monthlyRentCents: 100,
      });
      log.info('[VoiceSeed] ACME test phone number seeded:', TEST_PHONE);
    } else {
      log.info('[VoiceSeed] ACME test phone number already exists');
    }
  } catch (err: any) {
    log.warn('[VoiceSeed] ACME voice seed failed (non-fatal):', err.message);
  }
}
