/**
 * Field Operations Suite - Index
 * Complete enhancement for security field operations
 * Under Trinity orchestration with configuration registry
 */

export { proofOfServiceService } from './proofOfServiceService';
export { presenceMonitorService } from './presenceMonitorService';
export { priorityMessageService } from './priorityMessageService';
export { panicProtocolService } from './panicProtocolService';
export { shiftHandoffService } from './shiftHandoffService';
export { smsFailoverService } from './smsFailoverService';
export { clientReportService } from './clientReportService';

export * from '@shared/types/fieldOperations';
export * from '@shared/config/fieldOperationsConfig';

import { proofOfServiceService } from './proofOfServiceService';
import { presenceMonitorService } from './presenceMonitorService';
import { priorityMessageService } from './priorityMessageService';
import { panicProtocolService } from './panicProtocolService';
import { shiftHandoffService } from './shiftHandoffService';
import { smsFailoverService } from './smsFailoverService';
import { clientReportService } from './clientReportService';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('index');


export const fieldOperationsSuite = {
  pos: proofOfServiceService,
  presence: presenceMonitorService,
  priorityMessages: priorityMessageService,
  panic: panicProtocolService,
  handoff: shiftHandoffService,
  smsFailover: smsFailoverService,
  clientReports: clientReportService,
  config: fieldOpsConfigRegistry
};

log.info('[FieldOps] Field Operations Suite module loaded');
