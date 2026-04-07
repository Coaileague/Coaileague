/**
 * Pipeline Index - Exports all pipeline-related modules
 */

export * from './types';
export * from './documentPipeline';

import { createLogger } from '../lib/logger';
const log = createLogger('pipeline');
import { documentPipeline } from './documentPipeline';
import { DEFAULT_PIPELINE_CONFIGS } from './types';

log.info('[Pipeline] Pipeline system initialized with', Object.keys(DEFAULT_PIPELINE_CONFIGS).length, 'document type configurations');

export { documentPipeline, DEFAULT_PIPELINE_CONFIGS };
