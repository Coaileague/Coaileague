/**
 * QuickBooks Terminology Hook
 * 
 * Use this hook in React components to display QuickBooks-aligned terminology
 * throughout the CoAIleague UI, making the app feel native to QB users.
 */

import { QB_TERMINOLOGY } from '@shared/quickbooks-terminology';

type EntityKey = keyof typeof QB_TERMINOLOGY.entities;
type ActionKey = keyof typeof QB_TERMINOLOGY.actions;
type FieldKey = keyof typeof QB_TERMINOLOGY.fields;
type StatusKey = keyof typeof QB_TERMINOLOGY.statuses;
type NavKey = keyof typeof QB_TERMINOLOGY.navigation;
type ReportKey = keyof typeof QB_TERMINOLOGY.reports;

export function useQBTerminology() {
  /**
   * Get QuickBooks entity name (e.g., "client" → "Customer")
   */
  const entity = (key: EntityKey): string => {
    return QB_TERMINOLOGY.entities[key] || key;
  };

  /**
   * Get QuickBooks action label (e.g., "createClient" → "Create Customer")
   */
  const action = (key: ActionKey): string => {
    return QB_TERMINOLOGY.actions[key] || key;
  };

  /**
   * Get QuickBooks field label (e.g., "clientName" → "Customer Name")
   */
  const field = (key: FieldKey): string => {
    return QB_TERMINOLOGY.fields[key] || key;
  };

  /**
   * Get QuickBooks status label (e.g., "cancelled" → "Voided")
   */
  const status = (key: StatusKey): string => {
    return QB_TERMINOLOGY.statuses[key] || key;
  };

  /**
   * Get QuickBooks navigation label (e.g., "clients" → "Customers")
   */
  const nav = (key: NavKey): string => {
    return QB_TERMINOLOGY.navigation[key] || key;
  };

  /**
   * Get QuickBooks report name (e.g., "timesheet" → "Time Activities by Employee Detail")
   */
  const report = (key: ReportKey): string => {
    return QB_TERMINOLOGY.reports[key] || key;
  };

  /**
   * Format a label with QB terminology
   * e.g., t("Add new {entity}", { entity: "client" }) → "Add new Customer"
   */
  const t = (template: string, replacements: Record<string, EntityKey>): string => {
    let result = template;
    for (const [placeholder, key] of Object.entries(replacements)) {
      const qbTerm = QB_TERMINOLOGY.entities[key] || key;
      result = result.replace(`{${placeholder}}`, qbTerm);
    }
    return result;
  };

  return {
    entity,
    action,
    field,
    status,
    nav,
    report,
    t,
    // Direct access to all terminology
    terms: QB_TERMINOLOGY,
  };
}

/**
 * Standalone helper functions for non-React contexts
 */
export const qb = {
  entity: (key: EntityKey): string => QB_TERMINOLOGY.entities[key] || key,
  action: (key: ActionKey): string => QB_TERMINOLOGY.actions[key] || key,
  field: (key: FieldKey): string => QB_TERMINOLOGY.fields[key] || key,
  status: (key: StatusKey): string => QB_TERMINOLOGY.statuses[key] || key,
  nav: (key: NavKey): string => QB_TERMINOLOGY.navigation[key] || key,
  report: (key: ReportKey): string => QB_TERMINOLOGY.reports[key] || key,
};

export default useQBTerminology;
