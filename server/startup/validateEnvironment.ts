// TRINITY.md §A: always use canonical production helper, never check NODE_ENV directly
import { isProduction } from '../lib/isProduction';
import { createLogger } from '../lib/logger';
const log = createLogger('validateEnvironment');

