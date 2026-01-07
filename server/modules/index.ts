/**
 * Server Modules - Domain-based architecture for CoAIleague
 * 
 * This directory provides organized entry points for major platform domains:
 * 
 * @module schedule - Shift scheduling, templates, AI optimization
 * @module finance - Billing, invoicing, payroll, QuickBooks integration
 * @module trinity - AI Brain, automation, platform orchestration
 * @module support - Help desk, ticketing, chat, platform support hierarchy
 * 
 * Each module exports constants documenting available services, routes, and types.
 * Use these for cleaner imports and IDE navigation.
 * 
 * Example usage:
 * ```typescript
 * import { TRINITY_MODULE } from './modules';
 * // Navigate to: TRINITY_MODULE.services.platformActionHub
 * ```
 */

export { SCHEDULE_MODULE } from './schedule';
export { FINANCE_MODULE } from './finance';
export { TRINITY_MODULE } from './trinity';
export { SUPPORT_MODULE } from './support';

// Convenience re-exports for commonly used services
export * from './trinity';  // Platform event bus commonly needed
export * from './finance';  // Billing services commonly needed
