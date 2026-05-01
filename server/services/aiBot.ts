// AI Bot service for HelpAI - greets and assists customers until human help arrives
// CRITICAL: Client-pays-all model - All AI usage is tracked and billed via UsageMeteringService
import OpenAI from "openai";
import { createLogger } from '../lib/logger';
const log = createLogger('aiBot');

