/**
 * Presence Monitor Service
 * Tracks officer location during shifts with anomaly detection
 */

import {
  LocationPing,
  PresenceAnomaly,
  Discrepancy,
  EnhancedTimeEntry,
  PresenceAnomalyType,
  DiscrepancyType
} from '@shared/types/fieldOperations';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { typedPoolExec } from '../../lib/typedSql';
import { db } from '../../db';
import { sql, eq, and } from 'drizzle-orm';
import { geofenceDepartureLog, cadUnits } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('presenceMonitorService');


interface IncomingPing {
  officerId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'foreground' | 'background' | 'pos_photo';
}

class PresenceMonitorService {
  private timeEntries: Map<string, EnhancedTimeEntry> = new Map();
  private pings: Map<string, LocationPing[]> = new Map();
  private anomalies: Map<string, PresenceAnomaly[]> = new Map();
  private activeMonitoring: Map<string, boolean> = new Map();
  
  async startMonitoring(timeEntryId: string, entry: EnhancedTimeEntry): Promise<void> {
    const config = fieldOpsConfigRegistry.getConfig(entry.orgId, entry.postId);
    
    if (!config.presenceMonitoring.enabled) {
      log.info(`[Presence] Monitoring disabled for org ${entry.orgId}`);
      return;
    }
    
    this.timeEntries.set(timeEntryId, entry);
    this.pings.set(timeEntryId, []);
    this.anomalies.set(timeEntryId, []);
    this.activeMonitoring.set(entry.officerId, true);
    
    log.info(`[Presence] Started monitoring for ${entry.officerId}, interval: ${config.presenceMonitoring.checkIntervalMinutes}min`);
  }
  
  async processLocationPing(ping: IncomingPing, postLat: number, postLng: number, postRadius: number): Promise<void> {
    const activeEntry = this.findActiveEntry(ping.officerId);
    if (!activeEntry) return;
    
    const distance = this.calculateDistance(
      ping.latitude, ping.longitude,
      postLat, postLng
    );
    const withinGeofence = distance <= postRadius;
    
    const locationPing: LocationPing = {
      timestamp: new Date(),
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracy: ping.accuracy,
      withinGeofence,
      distanceFromPost: distance,
      source: ping.source
    };
    
    const entryPings = this.pings.get(activeEntry.id) || [];
    entryPings.push(locationPing);
    this.pings.set(activeEntry.id, entryPings);
    
    await this.checkAnomalies(activeEntry, locationPing);
  }
  
  private async checkAnomalies(entry: EnhancedTimeEntry, ping: LocationPing): Promise<void> {
    const config = fieldOpsConfigRegistry.getConfig(entry.orgId, entry.postId);
    const entryPings = this.pings.get(entry.id) || [];
    const lastPing = entryPings.length > 1 ? entryPings[entryPings.length - 2] : null;
    
    if (lastPing?.withinGeofence && !ping.withinGeofence) {
      await this.createAnomaly(entry.id, {
        type: 'left_geofence',
        detectedAt: new Date(),
        details: {
          lastKnownLocation: { lat: lastPing.latitude, lng: lastPing.longitude },
          distance: ping.distanceFromPost
        }
      });
      
      log.info(`[Presence] Officer left geofence: ${entry.officerId}`);

      // CAD Geofence Departure Integration
      try {
        const { pool } = await import('../../db');
        const { broadcastToWorkspace } = await import('../../websocket');
        const { platformEventBus } = await import('../platformEventBus');
        const { randomUUID } = await import('crypto');

        const depId = randomUUID();
        // Converted to Drizzle ORM
        await db.insert(geofenceDepartureLog).values({
          id: depId,
          workspaceId: entry.orgId,
          employeeId: entry.officerId,
          siteId: entry.postId,
          departedAt: sql`now()`,
        });

        // Converted to Drizzle ORM
        await db.update(cadUnits).set({
          currentStatus: 'needs_check',
          updatedAt: sql`now()`,
        }).where(and(eq(cadUnits.employeeId, entry.officerId), eq(cadUnits.workspaceId, entry.orgId)));

        await broadcastToWorkspace(entry.orgId, {
          type: "cad:geofence_departure",
          data: {
            employeeId: entry.officerId,
            siteId: entry.postId,
            departedAt: new Date().toISOString()
          }
        });

        platformEventBus.publish({
          type: 'geofence_departure',
          category: 'ai_brain',
          title: 'Geofence Departure Detected',
          description: `Officer ${entry.officerId} has left the geofence at Site ${entry.postId}`,
          workspaceId: entry.orgId,
          metadata: {
            employeeId: entry.officerId,
            siteId: entry.postId,
            departureId: depId
          }
        }).catch((err) => log.warn('[presenceMonitorService] Fire-and-forget failed:', err));
      } catch (err: unknown) {
        log.error('[Presence] Failed to trigger CAD geofence departure:', (err instanceof Error ? err.message : String(err)));
      }
    }
    
    if (lastPing && !lastPing.withinGeofence && ping.withinGeofence) {
      const openAnomaly = this.findOpenAnomaly(entry.id, 'left_geofence');
      if (openAnomaly) {
        const duration = (Date.now() - openAnomaly.detectedAt.getTime()) / 60000;
        openAnomaly.resolved = true;
        openAnomaly.resolution = `Returned after ${Math.round(duration)} minutes`;
        openAnomaly.details.duration = duration;
        
        if (duration > config.presenceMonitoring.leftGeofenceGraceMinutes) {
          await this.createDiscrepancy(entry.id, {
            type: 'site_abandonment',
            details: `Left site for ${Math.round(duration)} minutes`,
            differenceMinutes: duration
          });
        }
        
        log.info(`[Presence] Officer returned to geofence: ${entry.officerId}`);
      }
    }
    
    if (lastPing && config.presenceMonitoring.detectRapidMovement) {
      const timeDiff = (ping.timestamp.getTime() - lastPing.timestamp.getTime()) / 1000;
      const distance = this.calculateDistance(
        lastPing.latitude, lastPing.longitude,
        ping.latitude, ping.longitude
      );
      const speed = distance / timeDiff;
      
      if (speed > config.presenceMonitoring.rapidMovementThresholdMps && timeDiff > 10) {
        await this.createAnomaly(entry.id, {
          type: 'rapid_movement',
          detectedAt: new Date(),
          details: {
            distance,
            duration: timeDiff / 60
          }
        });
        
        log.info(`[Presence] Rapid movement detected for ${entry.officerId}: ${Math.round(speed)}m/s`);
      }
    }
  }
  
  async finalizeMonitoring(timeEntryId: string): Promise<{
    timeOnSite: number;
    timeOffSite: number;
    percentOnSite: number;
  }> {
    const entry = this.timeEntries.get(timeEntryId);
    const entryPings = this.pings.get(timeEntryId) || [];
    
    if (!entry) {
      return { timeOnSite: 0, timeOffSite: 0, percentOnSite: 0 };
    }
    
    let onSiteCount = 0;
    let offSiteCount = 0;
    
    for (const ping of entryPings) {
      if (ping.withinGeofence) {
        onSiteCount++;
      } else {
        offSiteCount++;
      }
    }
    
    const total = onSiteCount + offSiteCount;
    const percentOnSite = total > 0 ? (onSiteCount / total) * 100 : 100;
    
    this.activeMonitoring.delete(entry.officerId);
    
    log.info(`[Presence] Finalized monitoring for ${entry.officerId}: ${percentOnSite.toFixed(1)}% on-site`);
    
    return {
      timeOnSite: onSiteCount,
      timeOffSite: offSiteCount,
      percentOnSite
    };
  }
  
  async getAnomalies(shiftId: string): Promise<PresenceAnomaly[]> {
    const entry = Array.from(this.timeEntries.values()).find(e => e.shiftId === shiftId);
    if (!entry) return [];
    return this.anomalies.get(entry.id) || [];
  }
  
  async getRecentPings(officerId: string, count: number): Promise<LocationPing[]> {
    const activeEntry = this.findActiveEntry(officerId);
    if (!activeEntry) return [];
    
    const entryPings = this.pings.get(activeEntry.id) || [];
    return entryPings.slice(-count);
  }
  
  private findActiveEntry(officerId: string): EnhancedTimeEntry | undefined {
    return Array.from(this.timeEntries.values()).find(
      e => e.officerId === officerId && e.status === 'active'
    );
  }
  
  private findOpenAnomaly(entryId: string, type: PresenceAnomalyType): PresenceAnomaly | undefined {
    const entryAnomalies = this.anomalies.get(entryId) || [];
    return entryAnomalies.find(a => a.type === type && !a.resolved);
  }
  
  private async createAnomaly(entryId: string, anomaly: Omit<PresenceAnomaly, 'id' | 'resolved'>): Promise<void> {
    const newAnomaly: PresenceAnomaly = {
      ...anomaly,
      id: `anomaly_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`,
      resolved: false
    };
    
    const entryAnomalies = this.anomalies.get(entryId) || [];
    entryAnomalies.push(newAnomaly);
    this.anomalies.set(entryId, entryAnomalies);
  }
  
  private async createDiscrepancy(entryId: string, params: {
    type: DiscrepancyType;
    details: string;
    differenceMinutes: number;
  }): Promise<void> {
    const entry = this.timeEntries.get(entryId);
    if (!entry) return;
    
    const discrepancy: Discrepancy = {
      id: `disc_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`,
      type: params.type,
      detectedAt: new Date(),
      details: params.details,
      expectedTime: new Date(),
      actualTime: new Date(),
      differenceMinutes: params.differenceMinutes,
      status: 'pending'
    };
    
    entry.discrepancies.push(discrepancy);
    this.timeEntries.set(entryId, entry);
    
    log.info(`[Presence] Discrepancy created: ${params.type} for entry ${entryId}`);
  }
  
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export const presenceMonitorService = new PresenceMonitorService();
