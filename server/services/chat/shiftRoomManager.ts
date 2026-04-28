/**
 * ShiftRoomManager — extracted from server/websocket.ts
 *
 * Re-exports session sync and query invalidation utilities.
 * New code imports from here; existing callers unchanged.
 */
export {
  registerSessionSync,
  unregisterSessionSync,
  syncToUserDevices,
  invalidateUserQueries,
  getLiveConnectionStats,
} from '../../websocket';
