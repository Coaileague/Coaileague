/**
 * TOPS Screenshot Verification Workflow
 *
 * Verifies a TOPS (Texas Online Private Security) screenshot uploaded by
 * an officer to prove their license status while waiting for physical card,
 * or to establish substantially complete application status.
 *
 * Uses Claude vision to authenticate the screenshot and extract license data.
 *
 * Legal basis:
 * - Tier 2 (pending card): Texas DPS bulletin — TOPS ACTIVE officers may work
 *   with screenshot as proof until physical card arrives.
 * - Tier 3 (substantially complete): Texas OC §1702.230 + TAC §35.3 — unarmed
 *   employment permitted after 48 hours with DPS/commercial background check,
 *   no adverse action on TOPS, 14-day window.
 */

import { db } from '../../../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { platformEventBus } from '../../platformEventBus';
import { createLogger } from '../../../lib/logger';

const log = createLogger('TOPSVerificationWorkflow');

interface TOPSVerificationInput {
  employeeId: string;
  workspaceId: string;
  imageBase64: string;
  imageMimeType: string;
  uploadedByUserId: string;
  isArmed: boolean;
}

interface TOPSVerificationResult {
  status: 'verified' | 'suspicious' | 'rejected';
  detectedStatus: string | null;
  detectedName: string | null;
  detectedLicenseNumber: string | null;
  detectedExpiry: string | null;
  tierAssigned: 'licensed_pending_card' | 'substantially_complete' | null;
  flags: string[];
  notes: string;
}

const CLAUDE_VISION_MODEL = 'claude-sonnet-4-6';

export async function verifyTOPSScreenshot(
  input: TOPSVerificationInput,
): Promise<TOPSVerificationResult> {
  const {
    employeeId,
    workspaceId,
    imageBase64,
    imageMimeType,
    isArmed,
  } = input;

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
    .limit(1);

  if (!employee) {
    return {
      status: 'rejected',
      detectedStatus: null,
      detectedName: null,
      detectedLicenseNumber: null,
      detectedExpiry: null,
      tierAssigned: null,
      flags: ['employee_not_found'],
      notes: 'Employee record not found — cannot verify.',
    };
  }

  const systemPrompt = `You are a Texas DPS Private Security license verification specialist.
Your job is to authenticate TOPS (Texas Online Private Security) portal screenshots
uploaded by security officers as proof of their license status.

You must analyze the image and return a JSON object with these exact fields:
{
  "isAuthenticTOPS": boolean,
  "detectedStatus": string | null,
  "detectedName": string | null,
  "detectedLicenseNumber": string | null,
  "detectedExpiry": string | null,
  "isFakeOrEdited": boolean,
  "suspicionFlags": string[],
  "notes": string
}

Authenticity markers to check:
- URL bar showing tops.portal.texas.gov (if visible)
- Official Texas DPS branding and color scheme
- Standard TOPS portal UI layout and typography
- Status text matches DPS official terminology

Forgery indicators to check:
- AI-generated image artifacts (unnatural noise, blurry text edges, inconsistent fonts)
- Text that doesn't match DPS portal formatting
- Missing or partial UI elements that should be present
- Pixel-level inconsistencies around text or data fields
- Name/license number that looks pasted or altered

Return ONLY the JSON object, no other text.`;

  const userPrompt = `Please analyze this TOPS screenshot. The officer's name on file is: "${employee.firstName} ${employee.lastName}". Their guard card number on file is: "${employee.guardCardNumber || 'not on file'}". Verify authenticity and extract visible data.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.warn('[TOPSVerification] ANTHROPIC_API_KEY not configured — cannot verify.');
    return {
      status: 'suspicious',
      detectedStatus: null,
      detectedName: null,
      detectedLicenseNumber: null,
      detectedExpiry: null,
      tierAssigned: null,
      flags: ['vision_api_unavailable'],
      notes: 'Vision analysis not configured — manual review required.',
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_VISION_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageMimeType,
                  data: imageBase64,
                },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic vision API error: ${response.status}`);
    }

    const data: any = await response.json();
    const rawText = data.content?.[0]?.text || '';
    const clean = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const flags: string[] = [...(parsed.suspicionFlags || [])];

    const officerFullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
    if (parsed.detectedName) {
      const firstToken = parsed.detectedName.toLowerCase().split(' ')[0];
      if (!officerFullName.includes(firstToken)) {
        flags.push('name_mismatch');
      }
    }

    if (
      employee.guardCardNumber &&
      parsed.detectedLicenseNumber &&
      !String(parsed.detectedLicenseNumber).includes(employee.guardCardNumber)
    ) {
      flags.push('license_number_mismatch');
    }

    let tierAssigned: 'licensed_pending_card' | 'substantially_complete' | null = null;
    if (parsed.detectedStatus?.toUpperCase().includes('ACTIVE')) {
      tierAssigned = 'licensed_pending_card';
    } else if (parsed.detectedStatus?.toLowerCase().includes('substantially complete')) {
      tierAssigned = 'substantially_complete';
    }

    if (isArmed && tierAssigned === 'substantially_complete') {
      flags.push('armed_officer_requires_active_status');
      tierAssigned = null;
    }

    let status: 'verified' | 'suspicious' | 'rejected';
    if (!parsed.isAuthenticTOPS || parsed.isFakeOrEdited) {
      status = 'rejected';
    } else if (flags.length > 0 || isArmed) {
      status = 'suspicious';
    } else if (tierAssigned) {
      status = 'verified';
    } else {
      status = 'rejected';
    }

    const result: TOPSVerificationResult = {
      status,
      detectedStatus: parsed.detectedStatus,
      detectedName: parsed.detectedName,
      detectedLicenseNumber: parsed.detectedLicenseNumber,
      detectedExpiry: parsed.detectedExpiry,
      tierAssigned: status === 'verified' ? tierAssigned : null,
      flags,
      notes: parsed.notes || '',
    };

    if (status === 'verified' && tierAssigned) {
      const windowExpires =
        tierAssigned === 'substantially_complete'
          ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          : null;

      await db
        .update(employees)
        .set({
          guardCardStatus: tierAssigned,
          topsVerificationStatus: 'verified',
          topsVerificationDate: new Date(),
          topsVerificationNotes: result.notes,
          ...(windowExpires ? { workAuthorizationWindowExpires: windowExpires } : {}),
        })
        .where(eq(employees.id, employeeId));
    } else {
      await db
        .update(employees)
        .set({
          topsVerificationStatus: status,
          topsVerificationDate: new Date(),
          topsVerificationNotes: `${result.notes} | Flags: ${flags.join(', ')}`,
        })
        .where(eq(employees.id, employeeId));
    }

    if (status !== 'verified' || isArmed) {
      platformEventBus
        .publish({
          type: 'tops_verification_needs_review',
          category: 'compliance',
          title: `TOPS Verification: ${employee.firstName} ${employee.lastName}`,
          description:
            status === 'rejected'
              ? `Screenshot rejected — ${flags.join(', ')}. Officer cannot work until resolved.`
              : `Screenshot requires manager review${isArmed ? ' (armed officer — manual review required)' : ''}.`,
          workspaceId,
          metadata: { employeeId, status, flags, tierAssigned },
        })
        .catch(() => {});
    }

    return result;
  } catch (err: any) {
    log.error('[TOPSVerification] Vision analysis failed:', err?.message);
    return {
      status: 'suspicious',
      detectedStatus: null,
      detectedName: null,
      detectedLicenseNumber: null,
      detectedExpiry: null,
      tierAssigned: null,
      flags: ['analysis_failed'],
      notes: 'Trinity vision analysis failed — manual review required.',
    };
  }
}
