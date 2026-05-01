/**
 * GitHub Client — integrates with GitHub for platform scan snapshots
 * Uses platform_scan_snapshots table for tracking code health
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('GitHubClient');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const REPO = process.env.GITHUB_REPO ?? 'Coaileague/Coaileague';

export const githubClient = {
  async request<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T | null> {
    if (!GITHUB_TOKEN) { log.warn('[GitHub] GITHUB_TOKEN not configured'); return null; }
    try {
      const resp = await fetch(`https://api.github.com/${path}`, {
        method,
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!resp.ok) { log.warn(`[GitHub] ${method} /${path} → ${resp.status}`); return null; }
      return resp.json() as T;
    } catch (err: unknown) { log.warn(`[GitHub] Request failed: ${err?.message}`); return null; }
  },

  async getLatestCommit(): Promise<{ sha: string; message: string; author: string } | null> {
    const data: any = await this.request(`repos/${REPO}/commits/HEAD`);
    if (!data) return null;
    return { sha: data.sha, message: data.commit?.message?.split('\n')[0], author: data.commit?.author?.name };
  },

  async recordScan(findings: unknown[], scanType = 'platform') {
    try {
      const commit = await this.getLatestCommit();
      await pool.query(`
        INSERT INTO platform_scan_snapshots
          (id, scan_type, findings, commit_sha, finding_count, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
      `, [scanType, JSON.stringify(findings), commit?.sha, findings.length]);
      log.info(`[GitHub] Recorded scan: ${findings.length} findings at ${commit?.sha?.slice(0,7)}`);
    } catch (err: unknown) { log.warn(`[GitHub] Record scan failed: ${err?.message}`); }
  },
};
