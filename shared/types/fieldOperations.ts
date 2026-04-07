/**
 * Field Operations Suite Types
 * Mission-critical communication, evidence, and compliance system
 * for security field operations with legally-defensible proof of service
 */

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE PRIORITY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export enum MessagePriority {
  ROUTINE = 0,
  IMPORTANT = 1,
  URGENT = 2,
  EMERGENCY = 3,
  PANIC = 4
}

export const PRIORITY_CONFIG = {
  [MessagePriority.ROUTINE]: {
    color: 'gray',
    icon: null,
    sound: null,
    vibrate: false,
    badge: false,
    persistent: false,
    fullScreen: false,
    autoDispatch: false
  },
  [MessagePriority.IMPORTANT]: {
    color: 'blue',
    icon: 'info',
    sound: 'notification',
    vibrate: true,
    badge: true,
    persistent: false,
    fullScreen: false,
    autoDispatch: false
  },
  [MessagePriority.URGENT]: {
    color: 'orange',
    icon: 'alert-triangle',
    sound: 'urgent',
    vibrate: [200, 100, 200],
    badge: true,
    persistent: true,
    fullScreen: false,
    autoDispatch: false
  },
  [MessagePriority.EMERGENCY]: {
    color: 'red',
    icon: 'alert-circle',
    sound: 'emergency',
    vibrate: [500, 200, 500, 200, 500],
    badge: true,
    persistent: true,
    fullScreen: true,
    autoDispatch: false
  },
  [MessagePriority.PANIC]: {
    color: 'red',
    icon: 'shield-alert',
    sound: 'alarm',
    vibrate: 'continuous',
    badge: true,
    persistent: true,
    fullScreen: true,
    autoDispatch: true
  }
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// PROOF OF SERVICE PHOTO SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
}

export interface DeviceInfo {
  platform: 'ios' | 'android' | 'web';
  deviceId: string;
  appVersion: string;
  osVersion: string;
  ipAddress: string;
  networkType: 'wifi' | 'cellular' | 'offline';
}

export interface GeofenceVerification {
  postLatitude: number;
  postLongitude: number;
  postRadius: number;
  distanceFromPost: number;
  withinGeofence: boolean;
  geofenceOverrideReason?: string;
}

export interface PhotoOverlay {
  enabled: boolean;
  position: 'bottom' | 'top';
  data: {
    officerName: string;
    postName: string;
    dateTime: string;
    coordinates: string;
    address: string;
    shiftInfo: string;
  };
}

export type ComplianceFlagType =
  | 'outside_geofence'
  | 'time_drift'
  | 'late_submission'
  | 'early_submission'
  | 'duplicate_location'
  | 'mock_location'
  | 'low_gps_accuracy'
  | 'photo_metadata_stripped'
  | 'device_mismatch';

export interface ComplianceFlag {
  type: ComplianceFlagType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  autoResolution?: string;
}

export type CustodyAction = 
  | 'captured' 
  | 'uploaded' 
  | 'processed' 
  | 'viewed' 
  | 'exported' 
  | 'edited' 
  | 'verified';

export type CustodyActorType = 
  | 'officer' 
  | 'system' 
  | 'supervisor' 
  | 'client' 
  | 'support';

export interface CustodyEvent {
  timestamp: Date;
  action: CustodyAction;
  actor: string;
  actorType: CustodyActorType;
  details?: string;
  ipAddress?: string;
  signature?: string;
}

export type POSComplianceStatus = 'valid' | 'flagged' | 'rejected' | 'manual_review';

export interface ProofOfServicePhoto {
  id: string;
  shiftId: string;
  officerId: string;
  orgId: string;
  postId: string;
  clientId: string;
  
  imageUrl: string;
  thumbnailUrl: string;
  originalHash: string;
  fileSize: number;
  
  capture: {
    serverTimestamp: Date;
    deviceTimestamp: Date;
    timeDrift: number;
    timeDriftFlag: boolean;
    gps: GPSCoordinates;
    geofence: GeofenceVerification;
    device: DeviceInfo;
  };
  
  overlay: PhotoOverlay;
  
  compliance: {
    status: POSComplianceStatus;
    flags: ComplianceFlag[];
    reviewedBy?: string;
    reviewedAt?: Date;
    reviewNotes?: string;
  };
  
  chainOfCustody: CustodyEvent[];
  
  capturedAt: Date;
  uploadedAt: Date;
  processedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// POS SCHEDULE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface POSScheduleConfig {
  postId: string;
  clientId: string;
  frequency: 'hourly' | 'custom';
  customIntervalMinutes?: number;
  startOffset: number;
  gracePeriodMinutes: number;
  requirements: {
    gpsRequired: boolean;
    geofenceEnforced: boolean;
    overlayRequired: boolean;
    minimumPhotosPerShift: number;
  };
  reminders: {
    beforeDue: number;
    onMissed: boolean;
    escalateAfterMisses: number;
  };
}

export const DEFAULT_POS_CONFIG: Partial<POSScheduleConfig> = {
  frequency: 'hourly',
  startOffset: 15,
  gracePeriodMinutes: 15,
  requirements: {
    gpsRequired: true,
    geofenceEnforced: true,
    overlayRequired: true,
    minimumPhotosPerShift: 0
  },
  reminders: {
    beforeDue: 5,
    onMissed: true,
    escalateAfterMisses: 2
  }
};

export type POSRequirementStatus = 'pending' | 'completed' | 'missed' | 'excused';

export interface POSRequirement {
  id: string;
  shiftId: string;
  scheduledTime: Date;
  sequence: number;
  status: POSRequirementStatus;
  gracePeriodEnd: Date;
  completedAt?: Date;
  completedPhotoId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED TIME ENTRY & PRESENCE MONITORING
// ═══════════════════════════════════════════════════════════════════════════

export type ClockMethod = 'gps' | 'manual' | 'clockbot' | 'supervisor_override';

export interface ClockEvent {
  timestamp: Date;
  type: 'in' | 'out';
  gps: GPSCoordinates;
  withinGeofence: boolean;
  distanceFromPost: number;
  method: ClockMethod;
  verifiedBy?: string;
  photoId?: string;
  deviceId: string;
  ipAddress: string;
}

export type LocationSource = 'foreground' | 'background' | 'pos_photo';

export interface LocationPing {
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracy: number;
  withinGeofence: boolean;
  distanceFromPost: number;
  source: LocationSource;
}

export type PresenceAnomalyType =
  | 'left_geofence'
  | 'entered_geofence'
  | 'extended_absence'
  | 'no_location_data'
  | 'rapid_movement'
  | 'device_changed';

export interface PresenceAnomaly {
  id: string;
  type: PresenceAnomalyType;
  detectedAt: Date;
  details: {
    lastKnownLocation?: { lat: number; lng: number };
    duration?: number;
    distance?: number;
  };
  resolved: boolean;
  resolvedBy?: string;
  resolution?: string;
}

export type DiscrepancyType =
  | 'early_departure'
  | 'late_arrival'
  | 'extended_break'
  | 'site_abandonment'
  | 'clock_without_presence'
  | 'manual_clock';

export type DiscrepancyStatus = 'pending' | 'approved' | 'rejected' | 'disputed';

export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  detectedAt: Date;
  details: string;
  expectedTime: Date;
  actualTime: Date;
  differenceMinutes: number;
  status: DiscrepancyStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export type TimeEntryStatus = 'active' | 'completed' | 'flagged' | 'disputed';

export interface EnhancedTimeEntry {
  id: string;
  shiftId: string;
  officerId: string;
  orgId: string;
  postId: string;
  clockIn: ClockEvent;
  clockOut?: ClockEvent;
  presence: {
    monitoringEnabled: boolean;
    checkIntervalMinutes: number;
    locationHistory: LocationPing[];
    anomalies: PresenceAnomaly[];
    timeOnSite: number;
    timeOffSite: number;
    percentOnSite: number;
  };
  discrepancies: Discrepancy[];
  status: TimeEntryStatus;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY MESSAGE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface MessageEscalation {
  enabled: boolean;
  chain: string[];
  currentLevel: number;
  escalatedAt?: Date;
}

export interface MessageAck {
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  response?: string;
}

export interface PriorityMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  priority: MessagePriority;
  requiresAck: boolean;
  ackDeadlineMinutes?: number;
  escalation?: MessageEscalation;
  ack?: MessageAck;
}

// ═══════════════════════════════════════════════════════════════════════════
// PANIC / DURESS SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export type PanicTriggerMethod = 'button' | 'voice' | 'shake' | 'keyword' | 'inactivity';
export type PanicStatus = 'active' | 'responding' | 'resolved' | 'false_alarm';

export interface PanicLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  address: string;
  postName: string;
}

export interface PanicEvidence {
  audioRecordingUrl?: string;
  photoUrls: string[];
  locationHistory: LocationPing[];
  chatHistory: any[];
}

export interface PanicResponse {
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  dispatchedAt?: Date;
  resolvedAt?: Date;
  resolution?: string;
  falseAlarm?: boolean;
}

export interface PanicEvent {
  id: string;
  officerId: string;
  officerName: string;
  orgId: string;
  location: PanicLocation;
  triggeredAt: Date;
  triggerMethod: PanicTriggerMethod;
  response: PanicResponse;
  evidence: PanicEvidence;
  status: PanicStatus;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHIFT HANDOFF SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface HandoffChecklistItem {
  id: string;
  label: string;
  required: boolean;
  checked: boolean;
  checkedAt?: Date;
  notes?: string;
}

export const DEFAULT_HANDOFF_CHECKLIST: Omit<HandoffChecklistItem, 'id' | 'checked'>[] = [
  { label: 'All keys accounted for', required: true },
  { label: 'Equipment functional', required: true },
  { label: 'Patrol areas clear', required: true },
  { label: 'Incident reports complete', required: true },
  { label: 'Access logs reviewed', required: false },
  { label: 'Client instructions communicated', required: false }
];

export interface HandoffAutoSummary {
  incidentsCount: number;
  posPhotosSubmitted: number;
  messagesExchanged: number;
  anomaliesDetected: number;
  highlightedMessages: any[];
}

export interface HandoffBriefing {
  autoSummary: HandoffAutoSummary;
  outgoingNotes: string;
  checklist: HandoffChecklistItem[];
  openIssues: {
    description: string;
    priority: MessagePriority;
    createdAt: Date;
  }[];
  attachments: {
    type: 'photo' | 'document' | 'report';
    url: string;
    description: string;
  }[];
}

export type HandoffStatus = 'pending' | 'in_progress' | 'completed' | 'missed';

export interface ShiftHandoff {
  id: string;
  endingShiftId: string;
  startingShiftId: string;
  outgoingOfficer: { id: string; name: string };
  incomingOfficer: { id: string; name: string };
  postId: string;
  postName: string;
  briefing: HandoffBriefing;
  status: HandoffStatus;
  outgoingConfirmed: boolean;
  outgoingConfirmedAt?: Date;
  incomingConfirmed: boolean;
  incomingConfirmedAt?: Date;
  scheduledAt: Date;
  completedAt?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  size?: 'normal' | 'large';
  message: string | null;
  priority: MessagePriority;
  action?: string;
  followUp?: boolean;
  startsReport?: boolean;
  includeLocation?: boolean;
  requiresHold?: boolean;
  hapticFeedback?: boolean;
}

export const FIELD_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'all_clear',
    label: 'All Clear',
    icon: 'CheckCircle',
    color: 'green',
    message: 'All clear - routine patrol complete',
    priority: MessagePriority.ROUTINE
  },
  {
    id: 'on_break',
    label: 'On Break',
    icon: 'Coffee',
    color: 'yellow',
    message: 'Starting break',
    priority: MessagePriority.ROUTINE,
    action: 'start_break'
  },
  {
    id: 'back_from_break',
    label: 'Back',
    icon: 'ArrowLeft',
    color: 'green',
    message: 'Back from break',
    priority: MessagePriority.ROUTINE,
    action: 'end_break'
  },
  {
    id: 'suspicious_activity',
    label: 'Suspicious Activity',
    icon: 'Eye',
    color: 'orange',
    message: 'Suspicious activity observed - details to follow',
    priority: MessagePriority.IMPORTANT,
    followUp: true
  },
  {
    id: 'incident',
    label: 'Incident',
    icon: 'AlertTriangle',
    color: 'red',
    message: 'Incident occurring - details to follow',
    priority: MessagePriority.URGENT,
    followUp: true,
    startsReport: true
  },
  {
    id: 'request_backup',
    label: 'Request Backup',
    icon: 'Users',
    color: 'orange',
    message: 'Requesting backup at my location',
    priority: MessagePriority.URGENT,
    includeLocation: true
  },
  {
    id: 'request_supervisor',
    label: 'Need Supervisor',
    icon: 'Phone',
    color: 'blue',
    message: 'Requesting supervisor contact',
    priority: MessagePriority.IMPORTANT
  },
  {
    id: 'medical',
    label: 'Medical Emergency',
    icon: 'Heart',
    color: 'red',
    message: 'Medical emergency at my location',
    priority: MessagePriority.EMERGENCY,
    includeLocation: true,
    startsReport: true
  },
  {
    id: 'fire',
    label: 'Fire',
    icon: 'Flame',
    color: 'red',
    message: 'Fire reported at location',
    priority: MessagePriority.EMERGENCY,
    includeLocation: true
  },
  {
    id: 'panic',
    label: 'PANIC',
    icon: 'ShieldAlert',
    color: 'red',
    size: 'large',
    message: null,
    priority: MessagePriority.PANIC,
    action: 'panic',
    requiresHold: true,
    hapticFeedback: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT POS REPORT
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientPOSReportSummary {
  totalShifts: number;
  totalHours: number;
  totalOfficers: number;
  posPhotosSubmitted: number;
  posPhotosRequired: number;
  complianceRate: number;
  incidentsReported: number;
  averageResponseTime: number;
}

export interface ClientPOSReportShift {
  date: Date;
  officerName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date;
  actualEnd: Date;
  hoursWorked: number;
  onSitePercentage: number;
  posPhotos: {
    time: Date;
    thumbnailUrl: string;
    verified: boolean;
  }[];
  incidents: number;
  notes?: string;
}

export interface ClientPOSReportIssue {
  date: Date;
  type: string;
  description: string;
  resolution?: string;
}

export interface ClientPOSReport {
  id: string;
  clientId: string;
  clientName: string;
  postId: string;
  postName: string;
  periodStart: Date;
  periodEnd: Date;
  summary: ClientPOSReportSummary;
  shifts: ClientPOSReportShift[];
  issues: ClientPOSReportIssue[];
  pdfUrl: string;
  generatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// OFFLINE QUEUE
// ═══════════════════════════════════════════════════════════════════════════

export type QueuedMessageStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface QueuedAttachment {
  id: string;
  type: 'image' | 'audio' | 'document';
  localPath: string;
  uploaded: boolean;
  uploadedUrl?: string;
}

export interface QueuedMessage {
  id: string;
  roomId: string;
  content: string;
  priority: MessagePriority;
  attachments?: QueuedAttachment[];
  queuedAt: Date;
  retryCount: number;
  lastRetryAt?: Date;
  status: QueuedMessageStatus;
  error?: string;
}
