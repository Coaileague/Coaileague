/**
 * Trinity Field Operations Integration
 * Registers AI Brain actions for field operations under Trinity orchestration
 */

import { proofOfServiceService } from './proofOfServiceService';
import { presenceMonitorService } from './presenceMonitorService';
import { priorityMessageService } from './priorityMessageService';
import { panicProtocolService } from './panicProtocolService';
import { shiftHandoffService } from './shiftHandoffService';
import { smsFailoverService } from './smsFailoverService';
import { clientReportService } from './clientReportService';
import { fieldOpsConfigRegistry, FieldOperationsConfig } from '@shared/config/fieldOperationsConfig';
import { MessagePriority } from '@shared/types/fieldOperations';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityFieldOpsIntegration');


interface ActionRequest {
  actionId: string;
  params: any;
  context: {
    orgId: string;
    userId: string;
    userName: string;
  };
}

interface ActionResult {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}

export function getFieldOpsActions() {
  return [
    {
      id: 'field_ops.pos.capture',
      category: 'field_operations',
      description: 'Capture proof of service photo with GPS verification',
      parameters: ['shiftId', 'officerId', 'imageData', 'gps', 'deviceMeta']
    },
    {
      id: 'field_ops.pos.get',
      category: 'field_operations', 
      description: 'Get proof of service photo by ID',
      parameters: ['photoId']
    },
    {
      id: 'field_ops.pos.get_by_shift',
      category: 'field_operations',
      description: 'Get all POS photos for a shift',
      parameters: ['shiftId']
    },
    {
      id: 'field_ops.pos.review',
      category: 'field_operations',
      description: 'Review and approve/reject a POS photo',
      parameters: ['photoId', 'approved', 'notes']
    },
    {
      id: 'field_ops.pos.verify_custody',
      category: 'field_operations',
      description: 'Verify chain of custody for a POS photo',
      parameters: ['photoId']
    },
    {
      id: 'field_ops.presence.start',
      category: 'field_operations',
      description: 'Start presence monitoring for a time entry',
      parameters: ['timeEntryId', 'entry']
    },
    {
      id: 'field_ops.presence.ping',
      category: 'field_operations',
      description: 'Process location ping from officer',
      parameters: ['officerId', 'latitude', 'longitude', 'accuracy', 'source']
    },
    {
      id: 'field_ops.presence.finalize',
      category: 'field_operations',
      description: 'Finalize presence monitoring and get summary',
      parameters: ['timeEntryId']
    },
    {
      id: 'field_ops.presence.get_anomalies',
      category: 'field_operations',
      description: 'Get presence anomalies for a shift',
      parameters: ['shiftId']
    },
    {
      id: 'field_ops.message.send_priority',
      category: 'field_operations',
      description: 'Send priority message with acknowledgment tracking',
      parameters: ['roomId', 'content', 'priority', 'requiresAck']
    },
    {
      id: 'field_ops.message.acknowledge',
      category: 'field_operations',
      description: 'Acknowledge a priority message',
      parameters: ['messageId', 'response']
    },
    {
      id: 'field_ops.message.get_unacknowledged',
      category: 'field_operations',
      description: 'Get unacknowledged priority messages',
      parameters: ['roomId']
    },
    {
      id: 'field_ops.panic.trigger',
      category: 'field_operations',
      description: 'Trigger panic/duress protocol',
      parameters: ['officerId', 'location', 'method']
    },
    {
      id: 'field_ops.panic.acknowledge',
      category: 'field_operations',
      description: 'Acknowledge panic alert',
      parameters: ['panicId']
    },
    {
      id: 'field_ops.panic.resolve',
      category: 'field_operations',
      description: 'Resolve panic alert',
      parameters: ['panicId', 'resolution', 'falseAlarm']
    },
    {
      id: 'field_ops.panic.get_active',
      category: 'field_operations',
      description: 'Get active panic alerts for org',
      parameters: []
    },
    {
      id: 'field_ops.handoff.initiate',
      category: 'field_operations',
      description: 'Initiate shift handoff',
      parameters: ['endingShift', 'nextShift']
    },
    {
      id: 'field_ops.handoff.complete_outgoing',
      category: 'field_operations',
      description: 'Complete outgoing handoff briefing',
      parameters: ['handoffId', 'notes', 'checklist', 'attachments']
    },
    {
      id: 'field_ops.handoff.acknowledge_incoming',
      category: 'field_operations',
      description: 'Acknowledge incoming handoff',
      parameters: ['handoffId']
    },
    {
      id: 'field_ops.handoff.get_pending',
      category: 'field_operations',
      description: 'Get pending handoffs for officer',
      parameters: ['officerId']
    },
    {
      id: 'field_ops.sms.send_failover',
      category: 'field_operations',
      description: 'Send message with SMS failover',
      parameters: ['userId', 'message', 'priority']
    },
    {
      id: 'field_ops.report.generate',
      category: 'field_operations',
      description: 'Generate client POS report',
      parameters: ['clientId', 'postId', 'periodStart', 'periodEnd']
    },
    {
      id: 'field_ops.report.get',
      category: 'field_operations',
      description: 'Get client report by ID',
      parameters: ['reportId']
    },
    {
      id: 'field_ops.report.list_for_client',
      category: 'field_operations',
      description: 'List reports for a client',
      parameters: ['clientId', 'limit']
    },
    {
      id: 'field_ops.config.get',
      category: 'field_operations',
      description: 'Get field ops configuration for org/post',
      parameters: ['postId']
    },
    {
      id: 'field_ops.config.update',
      category: 'field_operations',
      description: 'Update field ops configuration',
      parameters: ['postId', 'config']
    }
  ];
}

export async function executeFieldOpsAction(request: ActionRequest): Promise<ActionResult> {
  const { actionId, params, context } = request;
  const { orgId, userId, userName } = context;
  
  try {
    switch (actionId) {
      case 'field_ops.pos.capture':
        const pos = await proofOfServiceService.capturePhoto({
          ...params,
          orgId
        });
        return { success: true, data: pos };
        
      case 'field_ops.pos.get':
        const photo = await proofOfServiceService.get(params.photoId);
        return { success: true, data: photo };
        
      case 'field_ops.pos.get_by_shift':
        const photos = await proofOfServiceService.getByShift(params.shiftId);
        return { success: true, data: photos };
        
      case 'field_ops.pos.review':
        await proofOfServiceService.reviewPhoto(
          params.photoId, userId, userName, params.approved, params.notes
        );
        return { success: true, message: `Photo ${params.approved ? 'approved' : 'rejected'}` };
        
      case 'field_ops.pos.verify_custody':
        const custody = await proofOfServiceService.verifyCustodyChain(params.photoId);
        return { success: true, data: custody };
        
      case 'field_ops.presence.start':
        await presenceMonitorService.startMonitoring(params.timeEntryId, params.entry);
        return { success: true, message: 'Presence monitoring started' };
        
      case 'field_ops.presence.ping':
        await presenceMonitorService.processLocationPing(
          { 
            officerId: params.officerId, 
            latitude: params.latitude, 
            longitude: params.longitude,
            accuracy: params.accuracy,
            source: params.source 
          },
          params.postLatitude,
          params.postLongitude,
          params.postRadius
        );
        return { success: true, message: 'Location ping processed' };
        
      case 'field_ops.presence.finalize':
        const summary = await presenceMonitorService.finalizeMonitoring(params.timeEntryId);
        return { success: true, data: summary };
        
      case 'field_ops.presence.get_anomalies':
        const anomalies = await presenceMonitorService.getAnomalies(params.shiftId);
        return { success: true, data: anomalies };
        
      case 'field_ops.message.send_priority':
        const msg = await priorityMessageService.sendPriorityMessage({
          roomId: params.roomId,
          senderId: userId,
          senderName: userName,
          content: params.content,
          priority: params.priority,
          requiresAck: params.requiresAck
        }, orgId);
        return { success: true, data: msg };
        
      case 'field_ops.message.acknowledge':
        await priorityMessageService.acknowledgeMessage(
          params.messageId, userId, userName, params.response
        );
        return { success: true, message: 'Message acknowledged' };
        
      case 'field_ops.message.get_unacknowledged':
        const unacked = await priorityMessageService.getUnacknowledged(params.roomId);
        return { success: true, data: unacked };
        
      case 'field_ops.panic.trigger':
        const panic = await panicProtocolService.triggerPanic({
          officerId: params.officerId || userId,
          officerName: params.officerName || userName,
          orgId,
          location: params.location,
          method: params.method
        });
        return { success: true, data: panic };
        
      case 'field_ops.panic.acknowledge':
        await panicProtocolService.acknowledgePanic(params.panicId, userName);
        return { success: true, message: 'Panic acknowledged' };
        
      case 'field_ops.panic.resolve':
        await panicProtocolService.resolvePanic(
          params.panicId, params.resolution, params.falseAlarm
        );
        return { success: true, message: 'Panic resolved' };
        
      case 'field_ops.panic.get_active':
        const active = await panicProtocolService.getActiveForOrg(orgId);
        return { success: true, data: active };
        
      case 'field_ops.handoff.initiate':
        const handoff = await shiftHandoffService.initiateHandoff(
          params.endingShift, params.nextShift
        );
        return { success: true, data: handoff };
        
      case 'field_ops.handoff.complete_outgoing':
        await shiftHandoffService.completeOutgoingHandoff(params.handoffId, {
          notes: params.notes,
          checklist: params.checklist,
          attachments: params.attachments
        });
        return { success: true, message: 'Outgoing handoff completed' };
        
      case 'field_ops.handoff.acknowledge_incoming':
        await shiftHandoffService.acknowledgeIncomingHandoff(params.handoffId);
        return { success: true, message: 'Handoff acknowledged' };
        
      case 'field_ops.handoff.get_pending':
        const pending = await shiftHandoffService.getPendingForOfficer(params.officerId || userId);
        return { success: true, data: pending };
        
      case 'field_ops.sms.send_failover':
        const sent = await smsFailoverService.sendWithFailover({
          userId: params.userId,
          userName: params.userName || 'User',
          phone: params.phone,
          message: params.message,
          priority: params.priority,
          orgId
        });
        return { success: sent, message: sent ? 'Message sent' : 'Delivery pending' };
        
      case 'field_ops.report.generate':
        const report = await clientReportService.generateReport({
          clientId: params.clientId,
          clientName: params.clientName,
          postId: params.postId,
          postName: params.postName,
          orgId,
          periodStart: new Date(params.periodStart),
          periodEnd: new Date(params.periodEnd)
        });
        return { success: true, data: report };
        
      case 'field_ops.report.get':
        const rpt = await clientReportService.get(params.reportId);
        return { success: true, data: rpt };
        
      case 'field_ops.report.list_for_client':
        const reports = await clientReportService.getForClient(params.clientId, params.limit);
        return { success: true, data: reports };
        
      case 'field_ops.config.get':
        const config = fieldOpsConfigRegistry.getConfig(orgId, params.postId);
        return { success: true, data: config };
        
      case 'field_ops.config.update':
        const updated = fieldOpsConfigRegistry.updateConfig(orgId, params.postId, params.config);
        return { success: true, data: updated };
        
      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  } catch (error: any) {
    log.error(`[FieldOps] Action ${actionId} failed:`, error);
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

export async function initializeFieldOpsIntegration(registerAction: Function): Promise<void> {
  const actions = getFieldOpsActions();
  
  for (const action of actions) {
    registerAction({
      ...action,
      handler: async (params: any, context: any) => {
        return executeFieldOpsAction({
          actionId: action.id,
          params,
          context
        });
      }
    });
  }
  
  log.info(`[FieldOps] Registered ${actions.length} Trinity AI Brain actions`);
}
