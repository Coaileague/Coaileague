/**
 * SLO Configuration — Readiness Section 22
 * ==========================================
 * Codifies the SLO targets from docs/OBSERVABILITY.md §1 so they can be
 * served via the /api/health/slo endpoint, and later compared against
 * live metrics by a monitor job.
 *
 * Source of truth: this file. If you change an SLO, update
 * docs/OBSERVABILITY.md in the same commit.
 */

export interface SloTarget {
  id: string;
  name: string;
  category: 'api' | 'trinity' | 'voice' | 'sms' | 'mobile' | 'audit';
  window: '7d' | '30d';
  target: number;
  unit: 'pct' | 'ms';
  description: string;
}

export const SLO_TARGETS: readonly SloTarget[] = [
  // Core API
  {
    id: 'api.availability',
    name: 'API availability (non-5xx on /api/*)',
    category: 'api',
    window: '30d',
    target: 99.5,
    unit: 'pct',
    description: 'Error budget 3h 36m / month.',
  },
  {
    id: 'api.p95_latency_read',
    name: 'p95 latency — read endpoints',
    category: 'api',
    window: '30d',
    target: 500,
    unit: 'ms',
    description: 'GET /api/* (non-mutation).',
  },
  {
    id: 'api.p99_latency_read',
    name: 'p99 latency — read endpoints',
    category: 'api',
    window: '30d',
    target: 1500,
    unit: 'ms',
    description: 'Tail latency cap.',
  },
  {
    id: 'api.p95_latency_mutation',
    name: 'p95 latency — mutation endpoints',
    category: 'api',
    window: '30d',
    target: 1500,
    unit: 'ms',
    description: 'POST/PUT/PATCH/DELETE often chain to Trinity / 3rd-party.',
  },
  // Trinity actions
  {
    id: 'trinity.success_rate',
    name: 'Trinity action success rate',
    category: 'trinity',
    window: '30d',
    target: 98,
    unit: 'pct',
    description: 'Non-error action completion.',
  },
  {
    id: 'trinity.class1_p95',
    name: 'Trinity CLASS 1 p95 latency',
    category: 'trinity',
    window: '7d',
    target: 3000,
    unit: 'ms',
    description: 'Read-only informational actions.',
  },
  {
    id: 'trinity.class2_p95',
    name: 'Trinity CLASS 2 p95 latency',
    category: 'trinity',
    window: '7d',
    target: 10000,
    unit: 'ms',
    description: 'Reversible mutations.',
  },
  {
    id: 'trinity.class3_p95',
    name: 'Trinity CLASS 3 p95 latency',
    category: 'trinity',
    window: '7d',
    target: 30000,
    unit: 'ms',
    description: 'Financial / compliance-sensitive mutations.',
  },
  {
    id: 'audit.write_success',
    name: 'Audit-log write success rate',
    category: 'audit',
    window: '30d',
    target: 99.9,
    unit: 'pct',
    description: 'Per CLAUDE §L — every mutation must audit.',
  },
  // Voice + SMS
  {
    id: 'voice.answer_rate',
    name: 'Inbound voice call answer rate',
    category: 'voice',
    window: '30d',
    target: 99.5,
    unit: 'pct',
    description: 'IVR answers within Twilio SLA.',
  },
  {
    id: 'sms.delivery_rate',
    name: 'SMS delivery rate (non-carrier-filtered)',
    category: 'sms',
    window: '30d',
    target: 97,
    unit: 'pct',
    description: 'Twilio status=delivered / sent.',
  },
  {
    id: 'voice.signature_success',
    name: 'Twilio signature validation success',
    category: 'voice',
    window: '30d',
    target: 99.9,
    unit: 'pct',
    description: 'Remove VOICE_DEBUG_BYPASS before production.',
  },
  // Mobile
  {
    id: 'mobile.clock_in_success',
    name: 'Clock-in success rate (geofenced)',
    category: 'mobile',
    window: '30d',
    target: 99,
    unit: 'pct',
    description: 'Includes geofence-override submissions.',
  },
  {
    id: 'mobile.offline_queue_delivery',
    name: 'Offline-queued event delivery',
    category: 'mobile',
    window: '30d',
    target: 99.9,
    unit: 'pct',
    description: 'IndexedDB + service-worker replay.',
  },
  {
    id: 'mobile.push_delivery',
    name: 'Push notification delivery',
    category: 'mobile',
    window: '7d',
    target: 98,
    unit: 'pct',
    description: 'VAPID / webpush delivered.',
  },
];
