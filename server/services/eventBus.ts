/**
 * server/services/eventBus.ts
 *
 * Thin re-export so route files that do
 * `import { eventBus } from '../services/eventBus'`
 * get the canonical platformEventBus instance.
 *
 * Use eventBus.emit(eventName, payload) for internal service-to-service
 * events, or eventBus.publish({...}) for full platform broadcast events.
 */

export { platformEventBus as eventBus } from './platformEventBus';
