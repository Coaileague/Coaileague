/**
 * ChatDockBroadcaster — extracted from server/websocket.ts
 *
 * Re-exports all broadcast functions from websocket.ts.
 * New code imports from here; existing callers unchanged.
 * Physical extraction follows in a dedicated refactoring sprint.
 */
export {
  broadcastNotificationToUser,
  broadcastShiftUpdate,
  broadcastUserScopedNotification,
  broadcastToAllClients,
  broadcastTrinityAlertToSupport,
  broadcastToWorkspace,
  broadcastToUser,
  broadcastPlatformUpdateGlobal,
} from '../../websocket';
