/**
 * SOP Indexing Service
 *
 * When a tenant uploads or updates an SOP/employee handbook:
 * 1. Records the document in workspace_sop_index so Trinity knows it exists
 * 2. Captures a description/summary snippet so Trinity can cite the right SOP
 *    when assessing disciplinary severity or answering policy questions.
 * 3. On SOP updates (version > 1), publishes an event so every active
 *    employee in the workspace is issued an acknowledgment request that
 *    must be signed before their next shift.
 *
 * Phase 4 note: full PDF text extraction requires pdf-parse (not currently
 * a dependency). This service runs in metadata-only mode when extraction
 * is unavailable — the description field plus file name is still enough
 * for Trinity to reason about which SOP is relevant to a given incident.
 */

import { db } from '../../db';
import { orgDocuments } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { platformEventBus } from '../platformEventBus';

const log = createLogger('SOPIndexing');

export interface IndexSOPParams {
  documentId: string;
  workspaceId: string;
  filePath: string;
  category: string;
  version: number;
  triggerAcknowledgment?: boolean;
}

export async function indexSOPForTrinity(params: IndexSOPParams): Promise<void> {
  const { documentId, workspaceId, filePath, category, version, triggerAcknowledgment } = params;

  // Pull the canonical row so we capture fileName + description for Trinity.
  let fileName = filePath;
  let description: string | null = null;
  try {
    const [doc] = await db
      .select({ fileName: orgDocuments.fileName, description: orgDocuments.description })
      .from(orgDocuments)
      .where(eq(orgDocuments.id, documentId))
      .limit(1);
    if (doc) {
      fileName = doc.fileName || fileName;
      description = doc.description || null;
    }
  } catch (err: unknown) {
    log.warn('[SOPIndex] Lookup failed (non-fatal):', err?.message);
  }

  // Compose the indexed text: description + filename are the reliable signal
  // we have without a PDF parser. Trinity scores SOP context by overlap with
  // the incident narrative, so even a short description is useful.
  const extractedText = [
    description ? `DESCRIPTION: ${description}` : '',
    `FILE: ${fileName}`,
    `CATEGORY: ${category}`,
    `VERSION: v${version}`,
  ].filter(Boolean).join('\n').slice(0, 50000);

  try {
    await pool.query(
      `INSERT INTO workspace_sop_index
         (id, workspace_id, document_id, category, version,
          extracted_text, indexed_at, is_current)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), TRUE)
       ON CONFLICT (workspace_id, document_id)
       DO UPDATE SET
         version = EXCLUDED.version,
         category = EXCLUDED.category,
         extracted_text = EXCLUDED.extracted_text,
         indexed_at = NOW(),
         is_current = TRUE`,
      [workspaceId, documentId, category, version, extractedText],
    );
  } catch (err: unknown) {
    log.warn('[SOPIndex] DB upsert failed:', err?.message);
    return;
  }

  if (triggerAcknowledgment || version > 1) {
    scheduleNonBlocking('sop.trigger-acknowledgment', async () => {
      try {
        await platformEventBus.publish({
          type: 'sop_updated_acknowledgment_required',
          category: 'compliance',
          title: 'SOP Updated — Employee Acknowledgment Required',
          description:
            'A company policy or SOP has been updated. All active employees must acknowledge before their next shift.',
          workspaceId,
          metadata: { documentId, category, version },
        });
      } catch (err: unknown) {
        log.warn('[SOPIndex] event publish failed:', err?.message);
      }
    });
  }

  log.info(`[SOPIndex] Indexed ${category} v${version} for workspace ${workspaceId}`);
}

/**
 * Fetch the indexed SOP corpus for a workspace, optionally narrowed to the
 * section most relevant to `topic`. Returned as a flat string that can be
 * inlined into Trinity's system prompt or the disciplinary-workflow AI call.
 */
export async function getSOPContextForTrinity(
  workspaceId: string,
  topic?: string,
): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT si.category, si.version, si.extracted_text, od.file_name
         FROM workspace_sop_index si
         JOIN org_documents od ON od.id = si.document_id
        WHERE si.workspace_id = $1
          AND si.is_current = TRUE
        ORDER BY si.category, si.version DESC`,
      [workspaceId],
    );
    if (!rows.length) return '';

    const sections = rows.map((r: any) => {
      const text = topic
        ? extractRelevantSection(r.extracted_text, topic, 500)
        : (r.extracted_text || '').slice(0, 300);
      const cat = (r.category || '').toUpperCase();
      return `[${cat} v${r.version} — ${r.file_name}]\n${text}`;
    });

    return sections.join('\n\n---\n\n');
  } catch (err: unknown) {
    log.warn('[SOPIndex] Context fetch failed:', err?.message);
    return '';
  }
}

function extractRelevantSection(text: string, topic: string, maxLength: number): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const topicLower = topic.toLowerCase();
  const idx = lower.indexOf(topicLower);
  if (idx < 0) return text.slice(0, maxLength);
  const start = Math.max(0, idx - 100);
  return text.slice(start, start + maxLength);
}
