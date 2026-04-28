/**
 * SECURITY TEST STUBS — Plaid Employee Ownership
 * Domain: integrations / Plaid
 * Stub: Claude wires to test runner.
 *
 * Risk: The Plaid bank-link flow must only allow an employee to link a bank
 * account to their own record. A manager must only be able to initiate a
 * link for an employee within their own workspace. Cross-workspace and
 * self-vs-manager access must be enforced.
 *
 * What each test must assert:
 *  - Employee can initiate Plaid link token for themselves → 200
 *  - Employee CANNOT initiate Plaid link token for a different employee → 403
 *  - Manager can initiate Plaid link for employee in same workspace → 200
 *  - Manager CANNOT initiate Plaid link for employee in a different workspace → 403
 *  - On Plaid exchange, the access token is stored against the requesting employee only
 *  - Listing Plaid accounts for an employee only returns that employee's accounts
 *
 * Files under test:
 *  server/routes/plaidRoutes.ts or server/routes/integrations/plaid*.ts
 *  (exact path to be confirmed by Claude during wiring)
 */

import { describe, it, expect } from 'vitest';

describe('Plaid employee ownership guard', () => {
  it.todo('employee can link their own bank account');
  it.todo('employee cannot link bank account for another employee (403)');
  it.todo('manager can initiate Plaid link for employee in same workspace');
  it.todo('manager cannot link employee in a different workspace (403)');
  it.todo('Plaid access token stored only against the requesting employee');
  it.todo('listing Plaid accounts returns only the calling employee\'s accounts');
});
