/**
 * Incident Routing Service
 * ========================
 * Auto-severity calculation and smart routing for security incidents.
 * Ensures critical incidents reach managers immediately via SMS.
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { db } from "../db";
import { securityIncidents, employees, clients, notifications, shifts, managerAssignments } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { platformEventBus } from "./platformEventBus";
import { smsService } from "./smsService";
import { universalNotificationEngine } from "./universalNotificationEngine";
import { createLogger } from '../lib/logger';
const log = createLogger('incidentRoutingService');


export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType = 'safety_hazard' | 'property_damage' | 'theft' | 'injury' | 'harassment' | 'unauthorized_access' | 'equipment_failure' | 'other';

interface IncidentCreateData {
  workspaceId: string;
  employeeId: string;
  type: IncidentType;
  description: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  shiftId?: string;
  photos?: string[];
  manualSeverity?: IncidentSeverity;
}

interface RoutingResult {
  incidentId: string;
  severity: IncidentSeverity;
  supervisorNotified: boolean;
  managerNotified: boolean;
  clientNotified: boolean;
  routingDetails: string[];
}

const SEVERITY_KEYWORDS: Record<IncidentSeverity, string[]> = {
  critical: ['injury', 'injured', 'ambulance', 'hospital', 'blood', 'unconscious', 'fire', 'explosion', 'weapon', 'attack', 'assault', 'death', 'fatality', 'emergency', '911'],
  high: ['theft', 'stolen', 'break-in', 'intrusion', 'harassment', 'threat', 'damage', 'vandalism', 'flood', 'gas leak', 'electrical', 'safety hazard'],
  medium: ['equipment', 'malfunction', 'broken', 'spill', 'slip', 'fall', 'minor', 'complaint', 'dispute', 'unauthorized'],
  low: ['maintenance', 'cleaning', 'noise', 'lighting', 'temperature', 'routine', 'observation', 'note']
};

const TYPE_SEVERITY_DEFAULTS: Record<IncidentType, IncidentSeverity> = {
  injury: 'critical',
  harassment: 'high',
  theft: 'high',
  unauthorized_access: 'high',
  property_damage: 'medium',
  safety_hazard: 'medium',
  equipment_failure: 'medium',
  other: 'low'
};

export class IncidentRoutingService {
  /**
   * Normalize text for keyword matching - handles obfuscation attempts
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[0-9]/g, c => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' }[c] || c))
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate severity based on incident type and description keywords
   * Uses normalized text to prevent obfuscation bypass
   */
  calculateSeverity(type: IncidentType, description: string): IncidentSeverity {
    const normalizedDesc = this.normalizeText(description);
    
    for (const severity of ['critical', 'high', 'medium', 'low'] as IncidentSeverity[]) {
      const keywords = SEVERITY_KEYWORDS[severity];
      if (keywords.some(keyword => normalizedDesc.includes(keyword))) {
        log.info(`[IncidentRouting] Severity ${severity} detected via keyword match in: "${description.substring(0, 50)}..."`);
        return severity;
      }
    }
    
    const defaultSeverity = TYPE_SEVERITY_DEFAULTS[type] || 'medium';
    log.info(`[IncidentRouting] Using type-based default severity: ${defaultSeverity} for type: ${type}`);
    return defaultSeverity;
  }

  /**
   * Get the assigned supervisor for an employee via manager_assignments table.
   * Previously queried employee.managerId which does not exist on the schema.
   */
  async getSupervisor(employeeId: string, workspaceId: string) {
    const [assignment] = await db
      .select()
      .from(managerAssignments)
      .where(
        and(
          eq(managerAssignments.employeeId, employeeId),
          eq(managerAssignments.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!assignment?.managerId) return null;

    return db.query.employees.findFirst({
      where: eq(employees.id, assignment.managerId),
    });
  }

  /**
   * Get all managers in the workspace
   */
  async getManagers(workspaceId: string) {
    return db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.workspaceRole, 'department_manager')
      ),
    });
  }

  /**
   * Get client contact for enterprise notification
   */
  async getClientContact(shiftId: string) {
    if (!shiftId) return null;

    const shift = await db.query.shifts.findFirst({
      where: eq(shifts.id, shiftId),
    });

    if (!shift?.clientId) return null;

    return db.query.clients.findFirst({
      where: eq(clients.id, shift.clientId),
    });
  }

  /**
   * Create incident with auto-routing
   * Ensures fallback notifications even when org chart is incomplete
   */
  async createAndRouteIncident(data: IncidentCreateData): Promise<RoutingResult> {
    const routingDetails: string[] = [];
    const escalationFailures: string[] = [];
    
    const severity = data.manualSeverity || this.calculateSeverity(data.type, data.description);
    routingDetails.push(`Severity calculated: ${severity}`);

    const [incident] = await db.insert(securityIncidents).values({
      workspaceId: data.workspaceId,
      employeeId: data.employeeId,
      type: data.type,
      severity,
      description: data.description,
      location: data.location,
      latitude: data.latitude?.toString(),
      longitude: data.longitude?.toString(),
      shiftId: data.shiftId,
      status: 'open',
    }).returning();

    routingDetails.push(`Incident created: ${incident.id}`);

    let supervisorNotified = false;
    let managerNotified = false;
    let clientNotified = false;

    const supervisor = await this.getSupervisor(data.employeeId, data.workspaceId);
    if (supervisor) {
      try {
        // Route through Trinity AI for contextual enrichment
        await universalNotificationEngine.sendNotification({
          workspaceId: data.workspaceId,
          userId: supervisor.userId || supervisor.id,
          type: 'issue_detected',
          title: `Security Incident Reported - ${severity.toUpperCase()} Priority`,
          message: `A ${data.type.replace(/_/g, ' ')} incident has been reported: ${data.description.substring(0, 150)}. Immediate supervisor review required.`,
          severity: severity === 'critical' ? 'critical' : 'warning',
          metadata: { 
            incidentId: incident.id, 
            severity, 
            incidentType: data.type,
            source: 'incident_routing_service',
          },
        });
        supervisorNotified = true;
        routingDetails.push(`Supervisor notified: ${supervisor.firstName} ${supervisor.lastName}`);
      } catch (error) {
        escalationFailures.push(`Supervisor notification failed: ${error}`);
      }
    } else {
      escalationFailures.push('No supervisor assigned - escalation skipped');
      log.warn(`[IncidentRouting] No supervisor for employee ${data.employeeId} - incident ${incident.id} needs manual review`);
    }

    if (severity === 'critical' || severity === 'high') {
      const managers = await this.getManagers(data.workspaceId);
      
      if (managers.length === 0) {
        escalationFailures.push(`No managers found in workspace - ${severity} incident requires manual escalation`);
        log.error(`[IncidentRouting] CRITICAL: No managers in workspace ${data.workspaceId} for ${severity} incident ${incident.id}`);
        
        const owners = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, data.workspaceId),
            eq(employees.workspaceRole, 'org_owner')
          ),
        });
        
        for (const owner of owners) {
          try {
            // Route through Trinity AI for contextual enrichment
            await universalNotificationEngine.sendNotification({
              workspaceId: data.workspaceId,
              userId: owner.userId || owner.id,
              type: 'issue_detected',
              title: `URGENT: ${severity.toUpperCase()} Security Incident - Escalated to Owner`,
              message: `A ${data.type.replace(/_/g, ' ')} incident requires your immediate attention: ${data.description.substring(0, 150)}. This was escalated directly because no managers are configured in your organization.`,
              severity: 'critical',
              metadata: { 
                incidentId: incident.id, 
                severity, 
                escalationGap: true,
                incidentType: data.type,
                source: 'incident_routing_service',
              },
            });
            managerNotified = true;
            routingDetails.push(`Org owner notified (fallback): ${owner.firstName} ${owner.lastName}`);
          } catch (error) {
            escalationFailures.push(`Owner notification failed: ${error}`);
          }
        }
      }
      
      for (const manager of managers) {
        try {
          // Route through Trinity AI for contextual enrichment
          await universalNotificationEngine.sendNotification({
            workspaceId: data.workspaceId,
            userId: manager.userId || manager.id,
            type: 'issue_detected',
            title: `${severity.toUpperCase()} Security Incident - Manager Action Required`,
            message: `A ${data.type.replace(/_/g, ' ')} incident has been reported and requires manager review: ${data.description.substring(0, 200)}`,
            severity: severity === 'critical' ? 'critical' : 'warning',
            metadata: { 
              incidentId: incident.id, 
              severity,
              incidentType: data.type,
              source: 'incident_routing_service',
            },
          });

          if (severity === 'critical' && manager.phone) {
            try {
              await NotificationDeliveryService.send({ type: 'incident_alert', workspaceId: data.workspaceId || 'system', recipientUserId: manager.id || manager.phone, channel: 'sms', body: { to: manager.phone, body: `CRITICAL INCIDENT: ${data.type} reported. ${data.description.substring(0, 100)}. Login to CoAIleague for details.` } });
              routingDetails.push(`SMS sent to manager: ${manager.firstName} ${manager.lastName}`);
            } catch (smsError) {
              escalationFailures.push(`SMS failed for ${manager.firstName} ${manager.lastName}: ${smsError}`);
            }
          }
        } catch (error) {
          escalationFailures.push(`Manager notification failed for ${manager.firstName}: ${error}`);
        }
      }
      managerNotified = managers.length > 0 || managerNotified;
      routingDetails.push(`${managers.length} managers notified`);
    }

    if (data.shiftId && (severity === 'critical' || severity === 'high')) {
      const client = await this.getClientContact(data.shiftId);
      if (client && (client as any).isEnterprise) {
        const contactEmail = (client as any).contactEmail || (client as any).email;
        if (contactEmail) {
          try {
            await platformEventBus.publish({
              type: 'client_incident_notification',
              workspaceId: data.workspaceId,
              metadata: {
                clientId: client.id,
                incidentId: incident.id,
                severity,
                description: data.description,
              },
            });
            clientNotified = true;
            routingDetails.push(`Enterprise client notified: ${client.companyName || `${client.firstName} ${client.lastName}`}`);
          } catch (error) {
            escalationFailures.push(`Client notification failed: ${error}`);
          }
        }
      }
    }

    if (escalationFailures.length > 0) {
      log.error(`[IncidentRouting] Escalation failures for incident ${incident.id}:`, escalationFailures);
      routingDetails.push(`Escalation gaps detected: ${escalationFailures.length} issues`);
    }

    await platformEventBus.publish({
      type: 'incident_created',
      category: 'security',
      title: `${severity.toUpperCase()} Incident`,
      description: data.description,
      workspaceId: data.workspaceId,
      metadata: { 
        incidentId: incident.id, 
        severity, 
        type: data.type,
        escalationGaps: escalationFailures.length > 0 ? escalationFailures : undefined,
      },
    });

    return {
      incidentId: incident.id,
      severity,
      supervisorNotified,
      managerNotified,
      clientNotified,
      routingDetails,
    };
  }

  /**
   * Update incident status and notify relevant parties
   */
  async updateIncidentStatus(
    incidentId: string,
    workspaceId: string,
    status: 'open' | 'investigating' | 'resolved' | 'closed',
    resolvedBy?: string,
    resolutionNotes?: string
  ) {
    const updateData: any = { status, updatedAt: new Date() };
    
    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy;
      updateData.resolutionNotes = resolutionNotes;
    }

    const [updated] = await db
      .update(securityIncidents)
      .set(updateData)
      .where(and(
        eq(securityIncidents.id, incidentId),
        eq(securityIncidents.workspaceId, workspaceId)
      ))
      .returning();

    return updated;
  }

  /**
   * Get incidents with filtering
   */
  async getIncidents(
    workspaceId: string,
    filters?: {
      severity?: IncidentSeverity;
      status?: string;
      employeeId?: string;
      limit?: number;
    }
  ) {
    let query = db.query.securityIncidents.findMany({
      where: eq(securityIncidents.workspaceId, workspaceId),
      orderBy: [desc(securityIncidents.reportedAt)],
      limit: filters?.limit || 50,
    });

    return query;
  }
}

export const incidentRoutingService = new IncidentRoutingService();
