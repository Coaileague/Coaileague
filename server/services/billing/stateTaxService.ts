import { db } from '../../db';
import { clients } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('StateTaxService');

export interface StateTaxRate {
  stateCode: string;
  stateName: string;
  rate: number;
  hasLocalTax: boolean;
  notes: string;
}

const STATE_TAX_RATES: Record<string, StateTaxRate> = {
  AL: { stateCode: 'AL', stateName: 'Alabama', rate: 0.04, hasLocalTax: true, notes: 'Local taxes may apply up to ~5%' },
  AK: { stateCode: 'AK', stateName: 'Alaska', rate: 0.0, hasLocalTax: true, notes: 'No state tax; some localities impose tax' },
  AZ: { stateCode: 'AZ', stateName: 'Arizona', rate: 0.056, hasLocalTax: true, notes: 'Transaction privilege tax' },
  AR: { stateCode: 'AR', stateName: 'Arkansas', rate: 0.065, hasLocalTax: true, notes: '' },
  CA: { stateCode: 'CA', stateName: 'California', rate: 0.0725, hasLocalTax: true, notes: 'District taxes may apply' },
  CO: { stateCode: 'CO', stateName: 'Colorado', rate: 0.029, hasLocalTax: true, notes: '' },
  CT: { stateCode: 'CT', stateName: 'Connecticut', rate: 0.0635, hasLocalTax: false, notes: '' },
  DE: { stateCode: 'DE', stateName: 'Delaware', rate: 0.0, hasLocalTax: false, notes: 'No sales tax' },
  FL: { stateCode: 'FL', stateName: 'Florida', rate: 0.06, hasLocalTax: true, notes: 'Discretionary surtax may apply' },
  GA: { stateCode: 'GA', stateName: 'Georgia', rate: 0.04, hasLocalTax: true, notes: '' },
  HI: { stateCode: 'HI', stateName: 'Hawaii', rate: 0.04, hasLocalTax: true, notes: 'General excise tax' },
  ID: { stateCode: 'ID', stateName: 'Idaho', rate: 0.06, hasLocalTax: false, notes: '' },
  IL: { stateCode: 'IL', stateName: 'Illinois', rate: 0.0625, hasLocalTax: true, notes: '' },
  IN: { stateCode: 'IN', stateName: 'Indiana', rate: 0.07, hasLocalTax: false, notes: '' },
  IA: { stateCode: 'IA', stateName: 'Iowa', rate: 0.06, hasLocalTax: true, notes: '' },
  KS: { stateCode: 'KS', stateName: 'Kansas', rate: 0.065, hasLocalTax: true, notes: '' },
  KY: { stateCode: 'KY', stateName: 'Kentucky', rate: 0.06, hasLocalTax: false, notes: '' },
  LA: { stateCode: 'LA', stateName: 'Louisiana', rate: 0.0445, hasLocalTax: true, notes: '' },
  ME: { stateCode: 'ME', stateName: 'Maine', rate: 0.055, hasLocalTax: false, notes: '' },
  MD: { stateCode: 'MD', stateName: 'Maryland', rate: 0.06, hasLocalTax: false, notes: '' },
  MA: { stateCode: 'MA', stateName: 'Massachusetts', rate: 0.0625, hasLocalTax: false, notes: '' },
  MI: { stateCode: 'MI', stateName: 'Michigan', rate: 0.06, hasLocalTax: false, notes: '' },
  MN: { stateCode: 'MN', stateName: 'Minnesota', rate: 0.06875, hasLocalTax: true, notes: '' },
  MS: { stateCode: 'MS', stateName: 'Mississippi', rate: 0.07, hasLocalTax: false, notes: '' },
  MO: { stateCode: 'MO', stateName: 'Missouri', rate: 0.04225, hasLocalTax: true, notes: '' },
  MT: { stateCode: 'MT', stateName: 'Montana', rate: 0.0, hasLocalTax: false, notes: 'No sales tax' },
  NE: { stateCode: 'NE', stateName: 'Nebraska', rate: 0.055, hasLocalTax: true, notes: '' },
  NV: { stateCode: 'NV', stateName: 'Nevada', rate: 0.0685, hasLocalTax: true, notes: '' },
  NH: { stateCode: 'NH', stateName: 'New Hampshire', rate: 0.0, hasLocalTax: false, notes: 'No sales tax' },
  NJ: { stateCode: 'NJ', stateName: 'New Jersey', rate: 0.06625, hasLocalTax: false, notes: '' },
  NM: { stateCode: 'NM', stateName: 'New Mexico', rate: 0.05125, hasLocalTax: true, notes: 'Gross receipts tax' },
  NY: { stateCode: 'NY', stateName: 'New York', rate: 0.04, hasLocalTax: true, notes: 'NYC adds 4.5% + surcharge' },
  NC: { stateCode: 'NC', stateName: 'North Carolina', rate: 0.0475, hasLocalTax: true, notes: '' },
  ND: { stateCode: 'ND', stateName: 'North Dakota', rate: 0.05, hasLocalTax: true, notes: '' },
  OH: { stateCode: 'OH', stateName: 'Ohio', rate: 0.0575, hasLocalTax: true, notes: '' },
  OK: { stateCode: 'OK', stateName: 'Oklahoma', rate: 0.045, hasLocalTax: true, notes: '' },
  OR: { stateCode: 'OR', stateName: 'Oregon', rate: 0.0, hasLocalTax: false, notes: 'No sales tax' },
  PA: { stateCode: 'PA', stateName: 'Pennsylvania', rate: 0.06, hasLocalTax: true, notes: 'Allegheny 1%, Philadelphia 2%' },
  RI: { stateCode: 'RI', stateName: 'Rhode Island', rate: 0.07, hasLocalTax: false, notes: '' },
  SC: { stateCode: 'SC', stateName: 'South Carolina', rate: 0.06, hasLocalTax: true, notes: '' },
  SD: { stateCode: 'SD', stateName: 'South Dakota', rate: 0.042, hasLocalTax: true, notes: '' },
  TN: { stateCode: 'TN', stateName: 'Tennessee', rate: 0.07, hasLocalTax: true, notes: '' },
  TX: { stateCode: 'TX', stateName: 'Texas', rate: 0.0625, hasLocalTax: true, notes: '' },
  UT: { stateCode: 'UT', stateName: 'Utah', rate: 0.0485, hasLocalTax: true, notes: '' },
  VT: { stateCode: 'VT', stateName: 'Vermont', rate: 0.06, hasLocalTax: true, notes: '' },
  VA: { stateCode: 'VA', stateName: 'Virginia', rate: 0.043, hasLocalTax: true, notes: '' },
  WA: { stateCode: 'WA', stateName: 'Washington', rate: 0.065, hasLocalTax: true, notes: '' },
  WV: { stateCode: 'WV', stateName: 'West Virginia', rate: 0.06, hasLocalTax: false, notes: '' },
  WI: { stateCode: 'WI', stateName: 'Wisconsin', rate: 0.05, hasLocalTax: true, notes: '' },
  WY: { stateCode: 'WY', stateName: 'Wyoming', rate: 0.04, hasLocalTax: true, notes: '' },
  DC: { stateCode: 'DC', stateName: 'District of Columbia', rate: 0.06, hasLocalTax: false, notes: '' },
  PR: { stateCode: 'PR', stateName: 'Puerto Rico', rate: 0.105, hasLocalTax: true, notes: 'Sales and use tax (IVU)' },
  GU: { stateCode: 'GU', stateName: 'Guam', rate: 0.02, hasLocalTax: false, notes: 'Business privilege tax' },
  VI: { stateCode: 'VI', stateName: 'US Virgin Islands', rate: 0.05, hasLocalTax: false, notes: '' },
};

const clientOverrides = new Map<string, { rate: number; note: string }>();

export class StateTaxService {
  getAllStateTaxRates(): StateTaxRate[] {
    return Object.values(STATE_TAX_RATES).sort((a, b) => a.stateName.localeCompare(b.stateName));
  }

  getStateTaxRate(stateCode: string): StateTaxRate | null {
    const code = stateCode.toUpperCase().trim();
    return STATE_TAX_RATES[code] || null;
  }

  setClientTaxOverride(clientId: string, rate: number, note: string): void {
    clientOverrides.set(clientId, { rate, note });
    log.info('Client tax override set', { clientId, rate, note });
  }

  removeClientTaxOverride(clientId: string): boolean {
    const removed = clientOverrides.delete(clientId);
    if (removed) {
      log.info('Client tax override removed', { clientId });
    }
    return removed;
  }

  getClientTaxOverride(clientId: string): { rate: number; note: string } | null {
    return clientOverrides.get(clientId) || null;
  }

  getAllClientOverrides(): Array<{ clientId: string; rate: number; note: string }> {
    const result: Array<{ clientId: string; rate: number; note: string }> = [];
    clientOverrides.forEach((value, clientId) => {
      result.push({ clientId, ...value });
    });
    return result;
  }

  async resolveEffectiveTaxRate(
    clientId: string,
    workspaceId: string,
    fallbackRate?: number
  ): Promise<{
    rate: number;
    source: 'client_override' | 'client_state' | 'workspace_default' | 'fallback';
    stateCode?: string;
    stateName?: string;
    details: string;
  }> {
    const override = clientOverrides.get(clientId);
    if (override) {
      return {
        rate: override.rate,
        source: 'client_override',
        details: `Per-client override: ${override.note}`,
      };
    }

    try {
      const [client] = await db
        .select({ state: clients.state })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
        .limit(1);

      if (client?.state) {
        const stateRate = this.getStateTaxRate(client.state);
        if (stateRate) {
          return {
            rate: stateRate.rate,
            source: 'client_state',
            stateCode: stateRate.stateCode,
            stateName: stateRate.stateName,
            details: `Auto-applied from client site state: ${stateRate.stateName} (${(stateRate.rate * 100).toFixed(2)}%)`,
          };
        }
      }
    } catch (err: unknown) {
      log.warn('Failed to look up client state for tax', { clientId, error: (err instanceof Error ? err.message : String(err)) });
    }

    const defaultRate = fallbackRate ?? 0.08875;
    if (fallbackRate !== undefined) {
      return {
        rate: defaultRate,
        source: 'workspace_default',
        details: `Workspace default tax rate: ${(defaultRate * 100).toFixed(3)}%`,
      };
    }

    return {
      rate: defaultRate,
      source: 'fallback',
      details: `System fallback rate: ${(defaultRate * 100).toFixed(3)}%`,
    };
  }
}

export const stateTaxService = new StateTaxService();
