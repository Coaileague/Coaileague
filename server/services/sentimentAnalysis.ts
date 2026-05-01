/**
 * AI Sentiment Analysis Service
 * Implements PredictionOS integration for review scoring, dispute flagging, and ticket urgency detection
 * Now with full persistence to sentiment_history table for trend analysis
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { createLogger } from '../lib/logger';
const log = createLogger('sentimentAnalysis');

