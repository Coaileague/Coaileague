/**
 * TRINITY HEALTH CONTEXT
 * ======================
 * Health-to-Conversation Bridge for Trinity AI.
 * Subscribes to TrinitySentinel health alerts and provides
 * conversational health summaries that Trinity can proactively
 * mention during user conversations.
 * 
 * Part of Phase 1A: Platform Consciousness Roadmap
 */

import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityHealthContext');

