/**
 * WebSocket Connection Counter Service
 * Tracks real-time active WebSocket connections for system health monitoring
 * Replaces hardcoded placeholder values with actual live connection counts
 */

import type { WebSocket } from 'ws';

interface ActiveConnection {
  id: string;
  userId?: string;
  workspaceId?: string;
  roomId?: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
}

class WebSocketConnectionCounter {
  private connections: Map<string, ActiveConnection> = new Map();
  private connectionTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Register a new WebSocket connection
   */
  registerConnection(ws: WebSocket, connectionId: string, metadata?: {
    userId?: string;
    workspaceId?: string;
    roomId?: string;
  }): void {
    const connection: ActiveConnection = {
      id: connectionId,
      userId: metadata?.userId,
      workspaceId: metadata?.workspaceId,
      roomId: metadata?.roomId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    };

    this.connections.set(connectionId, connection);
    console.log(`[WS Counter] Connection registered: ${connectionId} (Total: ${this.connections.size})`);

    // Set up automatic cleanup after 5 minutes of inactivity
    this.setInactivityTimer(connectionId);
  }

  /**
   * Record a message on an active connection
   */
  recordMessage(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
      connection.messageCount++;
      
      // Reset inactivity timer on each message
      if (this.connectionTimers.has(connectionId)) {
        clearTimeout(this.connectionTimers.get(connectionId)!);
      }
      this.setInactivityTimer(connectionId);
    }
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      console.log(
        `[WS Counter] Connection closed: ${connectionId} (Duration: ${
          Date.now() - connection.connectedAt.getTime()
        }ms, Messages: ${connection.messageCount})`
      );
    }
    
    this.connections.delete(connectionId);
    
    if (this.connectionTimers.has(connectionId)) {
      clearTimeout(this.connectionTimers.get(connectionId)!);
      this.connectionTimers.delete(connectionId);
    }

    console.log(`[WS Counter] Active connections: ${this.connections.size}`);
  }

  /**
   * Get current active connection count
   */
  getActiveConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connections grouped by workspace
   */
  getConnectionsByWorkspace(workspaceId: string): number {
    return Array.from(this.connections.values()).filter(
      c => c.workspaceId === workspaceId
    ).length;
  }

  /**
   * Get connections grouped by user
   */
  getConnectionsByUser(userId: string): number {
    return Array.from(this.connections.values()).filter(
      c => c.userId === userId
    ).length;
  }

  /**
   * Get detailed statistics
   */
  getStatistics(): {
    totalConnections: number;
    averageMessageCount: number;
    oldestConnection: Date | null;
    newestConnection: Date | null;
    averageConnectionDuration: number;
  } {
    const connections = Array.from(this.connections.values());
    if (connections.length === 0) {
      return {
        totalConnections: 0,
        averageMessageCount: 0,
        oldestConnection: null,
        newestConnection: null,
        averageConnectionDuration: 0,
      };
    }

    const totalMessages = connections.reduce((sum, c) => sum + c.messageCount, 0);
    const durations = connections.map(c => Date.now() - c.connectedAt.getTime());

    return {
      totalConnections: connections.length,
      averageMessageCount: Math.round(totalMessages / connections.length),
      oldestConnection: connections.length > 0 
        ? new Date(Math.min(...connections.map(c => c.connectedAt.getTime())))
        : null,
      newestConnection: connections.length > 0
        ? new Date(Math.max(...connections.map(c => c.connectedAt.getTime())))
        : null,
      averageConnectionDuration: Math.round(
        durations.reduce((sum, d) => sum + d, 0) / connections.length
      ),
    };
  }

  /**
   * Set inactivity timer for a connection
   */
  private setInactivityTimer(connectionId: string): void {
    const timeout = setTimeout(() => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        const inactivityTime = Date.now() - connection.lastActivity.getTime();
        if (inactivityTime > 5 * 60 * 1000) { // 5 minutes
          console.log(`[WS Counter] Cleaning up stale connection: ${connectionId} (Inactive: ${inactivityTime}ms)`);
          this.unregisterConnection(connectionId);
        }
      }
    }, 5 * 60 * 1000); // Check after 5 minutes

    this.connectionTimers.set(connectionId, timeout);
  }

  /**
   * Force cleanup all connections (for testing/shutdown)
   */
  cleanup(): void {
    this.connections.clear();
    this.connectionTimers.forEach(timeout => clearTimeout(timeout));
    this.connectionTimers.clear();
    console.log(`[WS Counter] All connections cleaned up`);
  }
}

// Export singleton instance
export const wsCounter = new WebSocketConnectionCounter();

/**
 * Helper function for health checks (replaces hardcoded placeholder)
 */
export function getActiveConnectionCount(): number {
  return wsCounter.getActiveConnectionCount();
}

/**
 * Get connection statistics
 */
export function getConnectionStats() {
  return wsCounter.getStatistics();
}
