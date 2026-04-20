/**
 * Proof of Service (POS) Photo Service
 * Captures, processes, and verifies proof of service photos
 * with GPS verification, overlay, compliance flags, and chain of custody
 *
 * Persistence: every photo is written to the `shift_proof_photos` table so it
 * survives server restarts and is queryable for the chronological shift
 * transparency PDF. The full ProofOfServicePhoto object is stored in
 * `device_meta.fullPayload` so reads return the exact same object shape
 * that was captured — preserving chain of custody integrity.
 */

import crypto from 'crypto';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import {
  ProofOfServicePhoto,
  GPSCoordinates,
  DeviceInfo,
  ComplianceFlag,
  CustodyEvent,
  POSComplianceStatus,
} from '@shared/types/fieldOperations';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { db } from '../../db';
import { shiftProofPhotos } from '@shared/schema/domains/scheduling';
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
const log = createLogger('proofOfServiceService');


interface CaptureParams {
  shiftId: string;
  workspaceId?: string;
  chatroomId?: string;
  messageId?: string;
  officerId: string;
  officerName: string;
  orgId: string;
  postId: string;
  clientId: string;
  postName: string;
  postLatitude: number;
  postLongitude: number;
  postRadius: number;
  postTimezone: string;
  shiftName: string;
  imageData: Buffer;
  deviceMeta: DeviceInfo & { deviceTimestamp: string };
  gps: GPSCoordinates;
  photoType?: string;
  notes?: string;
}

interface FlagParams {
  withinGeofence: boolean;
  distanceFromPost: number;
  timeDrift: number;
  gpsAccuracy: number;
  mockLocationDetected: boolean;
  deviceMeta: DeviceInfo;
  shiftStartTime: Date;
  shiftEndTime: Date;
  scheduledPOSTime?: Date;
}

class ProofOfServiceService {
  async capturePhoto(params: CaptureParams): Promise<ProofOfServicePhoto> {
    const {
      shiftId, workspaceId, chatroomId, messageId, officerId, officerName,
      orgId, postId, clientId,
      postName, postLatitude, postLongitude, postRadius, postTimezone,
      shiftName, imageData, deviceMeta, gps, photoType, notes,
    } = params;

    const config = fieldOpsConfigRegistry.getConfig(orgId, postId);
    const serverTimestamp = new Date();
    const deviceTimestamp = new Date(deviceMeta.deviceTimestamp);
    const timeDrift = Math.abs(serverTimestamp.getTime() - deviceTimestamp.getTime()) / 1000;

    const distanceFromPost = this.calculateDistance(
      gps.latitude, gps.longitude,
      postLatitude, postLongitude
    );
    const withinGeofence = distanceFromPost <= postRadius;

    const originalHash = this.hashImage(imageData);
    const mockLocationDetected = this.detectMockLocation(deviceMeta);

    const dateTime = this.formatDateTime(serverTimestamp, postTimezone);
    const coordinates = `${gps.latitude.toFixed(6)}°, ${gps.longitude.toFixed(6)}°`;
    const address = await this.reverseGeocode(gps.latitude, gps.longitude);

    const imageUrl = `pos/${orgId}/${clientId}/${shiftId}/${Date.now()}.jpg`;
    const thumbnailUrl = `pos/${orgId}/${clientId}/${shiftId}/${Date.now()}_thumb.jpg`;

    const flags = this.generateComplianceFlags({
      withinGeofence,
      distanceFromPost,
      timeDrift,
      gpsAccuracy: gps.accuracy,
      mockLocationDetected,
      deviceMeta,
      shiftStartTime: new Date(),
      shiftEndTime: new Date(),
    });

    const status: POSComplianceStatus = flags.some(f => f.severity === 'critical') ? 'flagged' : 'valid';

    const id = this.generateId();
    const genesisSignature = this.generateCustodySignature(null, originalHash);

    const pos: ProofOfServicePhoto = {
      id,
      shiftId,
      officerId,
      orgId,
      postId,
      clientId,

      imageUrl,
      thumbnailUrl,
      originalHash,
      fileSize: imageData.length,

      capture: {
        serverTimestamp,
        deviceTimestamp,
        timeDrift,
        timeDriftFlag: timeDrift > 60,
        gps: {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          altitude: gps.altitude,
          heading: gps.heading,
          speed: gps.speed,
        },
        geofence: {
          postLatitude,
          postLongitude,
          postRadius,
          distanceFromPost,
          withinGeofence,
        },
        device: {
          platform: deviceMeta.platform,
          deviceId: deviceMeta.deviceId,
          appVersion: deviceMeta.appVersion,
          osVersion: deviceMeta.osVersion,
          ipAddress: deviceMeta.ipAddress,
          networkType: deviceMeta.networkType,
        },
      },

      overlay: {
        enabled: config.pos.overlayEnabled,
        position: config.pos.overlayPosition,
        data: {
          officerName,
          postName,
          dateTime,
          coordinates,
          address,
          shiftInfo: shiftName,
        },
      },

      compliance: { status, flags },

      chainOfCustody: [
        {
          timestamp: serverTimestamp,
          action: 'captured',
          actor: officerName,
          actorType: 'officer',
          details: `Photo captured via ${deviceMeta.platform} app`,
          ipAddress: deviceMeta.ipAddress,
          signature: genesisSignature,
        },
      ],

      capturedAt: serverTimestamp,
      uploadedAt: serverTimestamp,
      processedAt: new Date(),
    };

    try {
      await db.insert(shiftProofPhotos).values({
        id,
        workspaceId: workspaceId ?? orgId,
        shiftId,
        chatroomId: chatroomId ?? null,
        employeeId: officerId,
        messageId: messageId ?? null,
        photoUrl: imageUrl,
        thumbnailUrl,
        gpsLat: String(gps.latitude),
        gpsLng: String(gps.longitude),
        gpsAddress: address ?? null,
        gpsAccuracy: gps.accuracy !== undefined ? String(gps.accuracy) : null,
        capturedAt: serverTimestamp,
        photoType: photoType ?? 'hourly_proof',
        notes: notes ?? null,
        deviceMeta: { fullPayload: pos, device: deviceMeta },
        isAuditProtected: true,
        chainOfCustodyHash: genesisSignature,
      });
    } catch (err: any) {
      log.error(`[POS] Failed to persist photo ${id}:`, err?.message);
      throw err;
    }

    log.info(`[POS] Photo captured: ${pos.id} for shift ${shiftId}, status: ${status}`);

    if (status === 'flagged') {
      await this.notifyFlaggedPOS(pos);
    }

    return pos;
  }

  async get(id: string): Promise<ProofOfServicePhoto | undefined> {
    const [row] = await db.select()
      .from(shiftProofPhotos)
      .where(eq(shiftProofPhotos.id, id))
      .limit(1);
    return row ? this.rowToPos(row) : undefined;
  }

  async getByShift(shiftId: string): Promise<ProofOfServicePhoto[]> {
    const rows = await db.select()
      .from(shiftProofPhotos)
      .where(eq(shiftProofPhotos.shiftId, shiftId))
      .orderBy(asc(shiftProofPhotos.capturedAt));
    return rows.map(r => this.rowToPos(r)).filter((p): p is ProofOfServicePhoto => !!p);
  }

  async getByPost(postId: string, startDate: Date, endDate: Date): Promise<ProofOfServicePhoto[]> {
    // postId is embedded in the stored fullPayload; we filter after fetch.
    const rows = await db.select()
      .from(shiftProofPhotos)
      .where(and(
        gte(shiftProofPhotos.capturedAt, startDate),
        lte(shiftProofPhotos.capturedAt, endDate),
      ));
    return rows
      .map(r => this.rowToPos(r))
      .filter((p): p is ProofOfServicePhoto => !!p && p.postId === postId);
  }

  async countForShift(shiftId: string): Promise<number> {
    const rows = await db.select({ id: shiftProofPhotos.id })
      .from(shiftProofPhotos)
      .where(eq(shiftProofPhotos.shiftId, shiftId));
    return rows.length;
  }

  async addCustodyEvent(posId: string, event: Omit<CustodyEvent, 'signature'>): Promise<void> {
    const [row] = await db.select()
      .from(shiftProofPhotos)
      .where(eq(shiftProofPhotos.id, posId))
      .limit(1);
    if (!row) throw new Error(`POS photo not found: ${posId}`);

    const pos = this.rowToPos(row);
    if (!pos) throw new Error(`POS photo payload corrupt: ${posId}`);

    const lastEvent = pos.chainOfCustody[pos.chainOfCustody.length - 1];
    const newEvent: CustodyEvent = {
      ...event,
      signature: this.generateCustodySignature(lastEvent.signature || null, JSON.stringify(event)),
    };
    pos.chainOfCustody.push(newEvent);

    const deviceMeta = (row.deviceMeta ?? {}) as Record<string, any>;
    await db.update(shiftProofPhotos)
      .set({
        deviceMeta: { ...deviceMeta, fullPayload: pos },
        chainOfCustodyHash: newEvent.signature ?? row.chainOfCustodyHash,
      })
      .where(eq(shiftProofPhotos.id, posId));

    log.info(`[POS] Custody event added: ${event.action} by ${event.actor}`);
  }

  async verifyCustodyChain(posId: string): Promise<{ valid: boolean; brokenAt?: number }> {
    const [row] = await db.select()
      .from(shiftProofPhotos)
      .where(eq(shiftProofPhotos.id, posId))
      .limit(1);
    if (!row) throw new Error(`POS photo not found: ${posId}`);

    const pos = this.rowToPos(row);
    if (!pos) throw new Error(`POS photo payload corrupt: ${posId}`);

    for (let i = 1; i < pos.chainOfCustody.length; i++) {
      const prev = pos.chainOfCustody[i - 1];
      const curr = pos.chainOfCustody[i];
      const currWithoutSig: any = { ...curr };
      delete currWithoutSig.signature;
      const expectedSig = this.generateCustodySignature(
        prev.signature || null,
        JSON.stringify(currWithoutSig)
      );
      if (curr.signature !== expectedSig) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  }

  async reviewPhoto(posId: string, reviewerId: string, reviewerName: string, approved: boolean, reviewNotes?: string): Promise<void> {
    const [row] = await db.select()
      .from(shiftProofPhotos)
      .where(eq(shiftProofPhotos.id, posId))
      .limit(1);
    if (!row) throw new Error(`POS photo not found: ${posId}`);

    const pos = this.rowToPos(row);
    if (!pos) throw new Error(`POS photo payload corrupt: ${posId}`);

    pos.compliance.status = approved ? 'valid' : 'rejected';
    pos.compliance.reviewedBy = reviewerName;
    pos.compliance.reviewedAt = new Date();
    pos.compliance.reviewNotes = reviewNotes;

    const lastEvent = pos.chainOfCustody[pos.chainOfCustody.length - 1];
    const reviewEvent: CustodyEvent = {
      timestamp: new Date(),
      action: 'verified',
      actor: reviewerName,
      actorType: 'supervisor',
      details: `Photo ${approved ? 'approved' : 'rejected'}${reviewNotes ? `: ${reviewNotes}` : ''}`,
    };
    reviewEvent.signature = this.generateCustodySignature(
      lastEvent.signature || null,
      JSON.stringify(reviewEvent)
    );
    pos.chainOfCustody.push(reviewEvent);

    const deviceMeta = (row.deviceMeta ?? {}) as Record<string, any>;
    await db.update(shiftProofPhotos)
      .set({
        deviceMeta: { ...deviceMeta, fullPayload: pos },
        chainOfCustodyHash: reviewEvent.signature ?? row.chainOfCustodyHash,
      })
      .where(eq(shiftProofPhotos.id, posId));
  }

  /**
   * Rehydrate a ProofOfServicePhoto from its DB row. If the stored fullPayload
   * is missing, reconstruct a minimal object from the denormalized columns
   * so callers still get a usable object.
   */
  private rowToPos(row: typeof shiftProofPhotos.$inferSelect): ProofOfServicePhoto | undefined {
    const deviceMeta = row.deviceMeta as any;
    const full = deviceMeta?.fullPayload;
    if (full) {
      // Dates arrive as ISO strings from jsonb — revive them.
      return this.revivePosDates(full);
    }
    // Minimal fallback (used only for partial/legacy rows):
    const lat = Number(row.gpsLat);
    const lng = Number(row.gpsLng);
    return {
      id: row.id,
      shiftId: row.shiftId,
      officerId: row.employeeId,
      orgId: row.workspaceId,
      postId: '',
      clientId: '',
      imageUrl: row.photoUrl,
      thumbnailUrl: row.thumbnailUrl ?? '',
      originalHash: row.chainOfCustodyHash ?? '',
      fileSize: 0,
      capture: {
        serverTimestamp: row.serverReceivedAt ?? row.capturedAt,
        deviceTimestamp: row.capturedAt,
        timeDrift: 0,
        timeDriftFlag: false,
        gps: { latitude: lat, longitude: lng, accuracy: Number(row.gpsAccuracy ?? 0) },
        geofence: {
          postLatitude: 0, postLongitude: 0, postRadius: 0,
          distanceFromPost: 0, withinGeofence: true,
        },
        device: deviceMeta?.device ?? {
          platform: 'web', deviceId: 'unknown', appVersion: '0',
          osVersion: '0', ipAddress: '', networkType: 'wifi',
        },
      },
      overlay: { enabled: false, position: 'bottom', data: {
        officerName: '', postName: '', dateTime: '',
        coordinates: `${lat}, ${lng}`, address: row.gpsAddress ?? '', shiftInfo: '',
      }},
      compliance: { status: 'valid', flags: [] },
      chainOfCustody: [],
      capturedAt: row.capturedAt,
      uploadedAt: row.serverReceivedAt ?? row.capturedAt,
      processedAt: row.serverReceivedAt ?? row.capturedAt,
    };
  }

  private revivePosDates(payload: any): ProofOfServicePhoto {
    const toDate = (v: any) => (v ? new Date(v) : v);
    return {
      ...payload,
      capture: {
        ...payload.capture,
        serverTimestamp: toDate(payload.capture?.serverTimestamp),
        deviceTimestamp: toDate(payload.capture?.deviceTimestamp),
      },
      compliance: {
        ...payload.compliance,
        reviewedAt: payload.compliance?.reviewedAt ? toDate(payload.compliance.reviewedAt) : undefined,
      },
      chainOfCustody: (payload.chainOfCustody || []).map((e: any) => ({
        ...e, timestamp: toDate(e.timestamp),
      })),
      capturedAt: toDate(payload.capturedAt),
      uploadedAt: toDate(payload.uploadedAt),
      processedAt: toDate(payload.processedAt),
    };
  }

  private generateComplianceFlags(params: FlagParams): ComplianceFlag[] {
    const flags: ComplianceFlag[] = [];

    if (!params.withinGeofence) {
      flags.push({
        type: 'outside_geofence',
        severity: 'critical',
        message: `Photo taken ${Math.round(params.distanceFromPost)}m from post`,
      });
    }

    if (params.timeDrift > 60) {
      flags.push({
        type: 'time_drift',
        severity: 'warning',
        message: `Device clock differs from server by ${Math.round(params.timeDrift)} seconds`,
      });
    }

    if (params.mockLocationDetected) {
      flags.push({
        type: 'mock_location',
        severity: 'critical',
        message: 'GPS spoofing or mock location app detected',
      });
    }

    if (params.gpsAccuracy > 100) {
      flags.push({
        type: 'low_gps_accuracy',
        severity: 'warning',
        message: `GPS accuracy is ${Math.round(params.gpsAccuracy)}m (recommended: <50m)`,
      });
    }

    if (params.scheduledPOSTime) {
      const diffMinutes = (Date.now() - params.scheduledPOSTime.getTime()) / 60000;
      if (diffMinutes > 15) {
        flags.push({
          type: 'late_submission',
          severity: 'warning',
          message: `Photo submitted ${Math.round(diffMinutes)} minutes after scheduled time`,
        });
      } else if (diffMinutes < -15) {
        flags.push({
          type: 'early_submission',
          severity: 'info',
          message: `Photo submitted ${Math.abs(Math.round(diffMinutes))} minutes early`,
        });
      }
    }

    return flags;
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

  private toRad(deg: number): number { return deg * (Math.PI / 180); }

  private hashImage(imageData: Buffer): string {
    return crypto.createHash('sha256').update(imageData).digest('hex');
  }

  private detectMockLocation(deviceMeta: DeviceInfo): boolean {
    const suspiciousSignals: string[] = [];

    if ((deviceMeta as any).isMockProvider === true) suspiciousSignals.push('explicit_mock_provider');
    if ((deviceMeta as any).isFromMockProvider === true) suspiciousSignals.push('is_from_mock_provider');
    if ((deviceMeta as any).locationProvider === 'mock') suspiciousSignals.push('location_provider_mock');
    if ((deviceMeta as any).mockLocationsEnabled === true) suspiciousSignals.push('mock_locations_enabled');

    const model = ((deviceMeta as any).model || '').toLowerCase();
    const manufacturer = ((deviceMeta as any).manufacturer || '').toLowerCase();
    const EMULATOR_PATTERNS = ['sdk_gphone', 'android sdk', 'emulator', 'genymotion', 'bluestacks', 'nox', 'memu', 'ldplayer', 'youwave'];
    if (EMULATOR_PATTERNS.some(p => model.includes(p) || manufacturer.includes(p))) {
      suspiciousSignals.push('known_emulator_device');
    }

    const accuracy = (deviceMeta as any).accuracy;
    if (accuracy !== undefined) {
      if (accuracy === 0) suspiciousSignals.push('perfect_zero_accuracy');
      if (accuracy > 200 && (deviceMeta as any).locationProvider === 'gps') {
        suspiciousSignals.push('gps_provider_unrealistic_accuracy');
      }
    }

    const speed = (deviceMeta as any).speed;
    if (speed !== undefined && speed > 111) {
      suspiciousSignals.push('impossible_velocity');
    }

    const installedApps: string[] = (deviceMeta as any).installedApps || [];
    const GPS_SPOOF_PACKAGES = ['com.lexa.fakegps', 'com.incorporateapps.fakegps', 'com.blogspot.newapphorizons.fakegps',
      'com.incorporateapps.fakegpslocation', 'com.rosteam.gpsemulator', 'com.theappninjas.gpsspooferpro'];
    if (installedApps.some(pkg => GPS_SPOOF_PACKAGES.includes(pkg))) {
      suspiciousSignals.push('gps_spoofing_app_detected');
    }

    if ((deviceMeta as any).developerMode === true && (deviceMeta as any).allowMockLocations === true) {
      suspiciousSignals.push('developer_mock_locations_active');
    }

    const definitiveSignals = ['explicit_mock_provider', 'is_from_mock_provider', 'gps_spoofing_app_detected', 'location_provider_mock'];
    const hasDefinitive = suspiciousSignals.some(s => definitiveSignals.includes(s));
    return hasDefinitive || suspiciousSignals.length >= 2;
  }

  private formatDateTime(date: Date, timezone: string): string {
    try {
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return date.toISOString();
    }
  }

  private async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        {
          headers: { 'User-Agent': `${PLATFORM.name.replace(/ /g, "-")}-Platform/1.0 (field-operations)` },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json() as any;
        if (data?.display_name) {
          const a = data.address || {};
          const parts = [
            a.house_number && a.road ? `${a.house_number} ${a.road}` : (a.road || a.pedestrian || a.footway),
            a.city || a.town || a.village || a.county,
            a.state_code || a.state,
            a.postcode,
          ].filter(Boolean);
          return parts.length >= 2 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',').trim();
        }
      }
    } catch {
      // Network error or timeout — fall through to coordinate fallback
    }
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
  }

  private generateCustodySignature(previousSignature: string | null, data: string): string {
    const content = `${previousSignature || 'GENESIS'}:${data}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private async notifyFlaggedPOS(pos: ProofOfServicePhoto): Promise<void> {
    log.info(`[POS] Flagged photo notification: ${pos.id}, flags: ${pos.compliance.flags.map(f => f.type).join(', ')}`);
  }
}

export const proofOfServiceService = new ProofOfServiceService();
