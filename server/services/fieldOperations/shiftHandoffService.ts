/**
 * Shift Handoff Service
 * Manages briefings between outgoing and incoming officers
 */

import {
  ShiftHandoff,
  HandoffBriefing,
  HandoffChecklistItem,
  HandoffAutoSummary,
  HandoffStatus,
  DEFAULT_HANDOFF_CHECKLIST,
  MessagePriority
} from '@shared/types/fieldOperations';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('shiftHandoffService');


interface ShiftInfo {
  id: string;
  orgId: string;
  postId: string;
  postName: string;
  officerId: string;
  officerName: string;
  startTime: Date;
  endTime: Date;
}

interface OutgoingHandoffData {
  notes: string;
  checklist: HandoffChecklistItem[];
  attachments?: {
    type: 'photo' | 'document' | 'report';
    url: string;
    description: string;
  }[];
}

interface KeywordScanResult {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  categories: string[];
  flaggedKeywords: string[];
  requiresEscalation: boolean;
}

const KEYWORD_SEVERITY_MAP: Record<string, { severity: 'critical' | 'high' | 'medium' | 'low'; category: string }> = {
  'weapon': { severity: 'critical', category: 'security_threat' },
  'armed': { severity: 'critical', category: 'security_threat' },
  'gun': { severity: 'critical', category: 'security_threat' },
  'knife': { severity: 'critical', category: 'security_threat' },
  'threat': { severity: 'critical', category: 'security_threat' },
  'assault': { severity: 'critical', category: 'security_threat' },
  'attack': { severity: 'critical', category: 'security_threat' },
  'bomb': { severity: 'critical', category: 'security_threat' },
  'explosive': { severity: 'critical', category: 'security_threat' },
  'hostage': { severity: 'critical', category: 'security_threat' },
  'fire': { severity: 'critical', category: 'safety' },
  'flood': { severity: 'critical', category: 'safety' },
  'evacuation': { severity: 'critical', category: 'safety' },
  'injury': { severity: 'high', category: 'safety' },
  'injured': { severity: 'high', category: 'safety' },
  'medical': { severity: 'high', category: 'safety' },
  'ambulance': { severity: 'high', category: 'safety' },
  'emergency': { severity: 'high', category: 'safety' },
  'police': { severity: 'high', category: 'law_enforcement' },
  'arrest': { severity: 'high', category: 'law_enforcement' },
  'trespass': { severity: 'high', category: 'security_incident' },
  'trespasser': { severity: 'high', category: 'security_incident' },
  'intruder': { severity: 'high', category: 'security_incident' },
  'break-in': { severity: 'high', category: 'security_incident' },
  'theft': { severity: 'high', category: 'security_incident' },
  'stolen': { severity: 'high', category: 'security_incident' },
  'vandalism': { severity: 'high', category: 'property_damage' },
  'damage': { severity: 'medium', category: 'property_damage' },
  'broken': { severity: 'medium', category: 'property_damage' },
  'malfunction': { severity: 'medium', category: 'equipment' },
  'alarm': { severity: 'medium', category: 'equipment' },
  'camera': { severity: 'medium', category: 'equipment' },
  'sensor': { severity: 'medium', category: 'equipment' },
  'outage': { severity: 'medium', category: 'equipment' },
  'power': { severity: 'medium', category: 'equipment' },
  'suspicious': { severity: 'medium', category: 'observation' },
  'unusual': { severity: 'medium', category: 'observation' },
  'concern': { severity: 'medium', category: 'observation' },
  'complaint': { severity: 'medium', category: 'client_relations' },
  'upset': { severity: 'medium', category: 'client_relations' },
  'late': { severity: 'low', category: 'operations' },
  'shortage': { severity: 'low', category: 'operations' },
  'coverage': { severity: 'low', category: 'operations' },
  'overtime': { severity: 'low', category: 'operations' },
  'maintenance': { severity: 'low', category: 'facilities' },
  'repair': { severity: 'low', category: 'facilities' },
  'cleaning': { severity: 'low', category: 'facilities' },
};

class ShiftHandoffService {
  private handoffs: Map<string, ShiftHandoff> = new Map();
  
  async initiateHandoff(endingShift: ShiftInfo, nextShift?: ShiftInfo): Promise<ShiftHandoff> {
    const config = fieldOpsConfigRegistry.getConfig(endingShift.orgId, endingShift.postId);
    
    if (!config.shiftHandoff.enabled) {
      throw new Error('Shift handoff is disabled for this organization');
    }
    
    if (!nextShift) {
      return this.createEndOfCoverageReport(endingShift);
    }
    
    const autoSummary = await this.generateAutoSummary(endingShift.id);
    
    const checklist: HandoffChecklistItem[] = [
      ...DEFAULT_HANDOFF_CHECKLIST,
      ...config.shiftHandoff.customChecklistItems
    ].map(item => ({
      ...item,
      id: this.generateId(),
      checked: false
    }));
    
    const handoff: ShiftHandoff = {
      id: this.generateId(),
      endingShiftId: endingShift.id,
      startingShiftId: nextShift.id,
      outgoingOfficer: {
        id: endingShift.officerId,
        name: endingShift.officerName
      },
      incomingOfficer: {
        id: nextShift.officerId,
        name: nextShift.officerName
      },
      postId: endingShift.postId,
      postName: endingShift.postName,
      briefing: {
        autoSummary,
        outgoingNotes: '',
        checklist,
        openIssues: await this.getOpenIssues(endingShift.id),
        attachments: []
      },
      status: 'pending',
      outgoingConfirmed: false,
      incomingConfirmed: false,
      scheduledAt: endingShift.endTime
    };
    
    this.handoffs.set(handoff.id, handoff);
    
    log.info(`[Handoff] Initiated: ${endingShift.officerName} -> ${nextShift.officerName} at ${endingShift.postName}`);
    
    return handoff;
  }
  
  async completeOutgoingHandoff(handoffId: string, data: OutgoingHandoffData): Promise<void> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) throw new Error(`Handoff not found: ${handoffId}`);
    
    handoff.briefing.outgoingNotes = data.notes;
    handoff.briefing.checklist = data.checklist;
    handoff.briefing.attachments = data.attachments || [];
    handoff.outgoingConfirmed = true;
    handoff.outgoingConfirmedAt = new Date();
    handoff.status = 'in_progress';
    
    const scanResult = this.scanKeywords(data.notes);
    (handoff as any).keywordScan = scanResult;
    
    if (scanResult.requiresEscalation) {
      log.info(`[Handoff] ESCALATION REQUIRED - Severity: ${scanResult.severity}, Keywords: ${scanResult.flaggedKeywords.join(', ')}, Categories: ${scanResult.categories.join(', ')}`);
    }
    
    this.handoffs.set(handoffId, handoff);
    
    log.info(`[Handoff] Outgoing confirmed: ${handoff.outgoingOfficer.name} | Severity: ${scanResult.severity} | Categories: ${scanResult.categories.join(', ')}`);
  }
  
  async acknowledgeIncomingHandoff(handoffId: string): Promise<void> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) throw new Error(`Handoff not found: ${handoffId}`);
    
    handoff.incomingConfirmed = true;
    handoff.incomingConfirmedAt = new Date();
    handoff.status = 'completed';
    handoff.completedAt = new Date();
    
    this.handoffs.set(handoffId, handoff);
    
    log.info(`[Handoff] Completed: ${handoff.incomingOfficer.name} acknowledged briefing`);
  }
  
  async markMissed(handoffId: string): Promise<void> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) return;
    
    handoff.status = 'missed';
    this.handoffs.set(handoffId, handoff);
    
    log.info(`[Handoff] Missed handoff: ${handoffId}`);
  }
  
  async get(handoffId: string): Promise<ShiftHandoff | undefined> {
    return this.handoffs.get(handoffId);
  }
  
  async getForShift(shiftId: string): Promise<ShiftHandoff | undefined> {
    return Array.from(this.handoffs.values()).find(
      h => h.endingShiftId === shiftId || h.startingShiftId === shiftId
    );
  }
  
  async getPendingForOfficer(officerId: string): Promise<ShiftHandoff[]> {
    return Array.from(this.handoffs.values()).filter(
      h => (h.outgoingOfficer.id === officerId && !h.outgoingConfirmed) ||
           (h.incomingOfficer.id === officerId && !h.incomingConfirmed && h.outgoingConfirmed)
    );
  }
  
  private async createEndOfCoverageReport(shift: ShiftInfo): Promise<ShiftHandoff> {
    const autoSummary = await this.generateAutoSummary(shift.id);
    
    const handoff: ShiftHandoff = {
      id: this.generateId(),
      endingShiftId: shift.id,
      startingShiftId: '',
      outgoingOfficer: {
        id: shift.officerId,
        name: shift.officerName
      },
      incomingOfficer: {
        id: '',
        name: 'End of Coverage'
      },
      postId: shift.postId,
      postName: shift.postName,
      briefing: {
        autoSummary,
        outgoingNotes: '',
        checklist: [],
        openIssues: [],
        attachments: []
      },
      status: 'pending',
      outgoingConfirmed: false,
      incomingConfirmed: false,
      scheduledAt: shift.endTime
    };
    
    this.handoffs.set(handoff.id, handoff);
    
    return handoff;
  }
  
  private async generateAutoSummary(shiftId: string): Promise<HandoffAutoSummary> {
    return {
      incidentsCount: 0,
      posPhotosSubmitted: 0,
      messagesExchanged: 0,
      anomaliesDetected: 0,
      highlightedMessages: []
    };
  }
  
  private async getOpenIssues(shiftId: string): Promise<{
    description: string;
    priority: MessagePriority;
    createdAt: Date;
  }[]> {
    return [];
  }
  
  scanKeywords(text: string): KeywordScanResult {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/[\s,.;:!?()[\]{}"']+/).filter(Boolean);
    
    const flaggedKeywords: string[] = [];
    const categoriesSet = new Set<string>();
    let highestSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
    
    const severityRank: Record<string, number> = {
      'critical': 4,
      'high': 3,
      'medium': 2,
      'low': 1,
      'info': 0,
    };
    
    for (const word of words) {
      const match = KEYWORD_SEVERITY_MAP[word];
      if (match) {
        flaggedKeywords.push(word);
        categoriesSet.add(match.category);
        if (severityRank[match.severity] > severityRank[highestSeverity]) {
          highestSeverity = match.severity;
        }
      }
    }
    
    for (const phrase of Object.keys(KEYWORD_SEVERITY_MAP)) {
      if (phrase.includes('-') && lowerText.includes(phrase) && !flaggedKeywords.includes(phrase)) {
        const match = KEYWORD_SEVERITY_MAP[phrase];
        flaggedKeywords.push(phrase);
        categoriesSet.add(match.category);
        if (severityRank[match.severity] > severityRank[highestSeverity]) {
          highestSeverity = match.severity;
        }
      }
    }
    
    return {
      severity: highestSeverity,
      categories: Array.from(categoriesSet),
      flaggedKeywords: [...new Set(flaggedKeywords)],
      requiresEscalation: highestSeverity === 'critical' || highestSeverity === 'high',
    };
  }
  
  private generateId(): string {
    return `handoff_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }
}

export const shiftHandoffService = new ShiftHandoffService();
