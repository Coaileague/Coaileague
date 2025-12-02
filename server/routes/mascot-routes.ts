/**
 * Mascot Intelligence Routes
 * 
 * Backend API endpoints for the CoAI Twin mascot's AI-powered features:
 * - Live FAQ data pulling
 * - Business insights and advice
 * - Task suggestions for account setup and growth
 * - AI-driven contextual responses
 * 
 * AI Brain Authority Chain:
 * - All mascot actions orchestrated by Gemini/HelpAI/Bot systems
 * - Root authority prevents blocking - only missing/broken actions stopped
 * - Errors auto-reported to support staff and AI Brain for fix workflow
 * 
 * Leverages Gemini AI and existing platform services for intelligence.
 */

import { Router } from 'express';
import { db } from '../db';
import { helposFaqs, workspaces, employees, shifts, notifications } from '@shared/schema';
import { eq, desc, and, gte, count, sql } from 'drizzle-orm';
import { geminiClient } from '../services/ai-brain/providers/geminiClient';
import { requireAuth } from '../auth';
import { broadcastToAllClients } from '../websocket';

// ============================================================================
// AI BRAIN AUTHORITY CHAIN
// Mascot actions have root authority - only block if broken/missing
// ============================================================================

interface MascotActionResult {
  success: boolean;
  action: string;
  data?: any;
  error?: string;
  reportedToSupport?: boolean;
}

// AI Brain authorities that cannot be blocked
const AI_BRAIN_AUTHORITIES = ['gemini', 'helpai', 'mascot', 'bot', 'root_admin'];

// Report mascot action errors to support staff and AI Brain for automated fixing
async function reportMascotError(
  action: string, 
  error: string, 
  context?: Record<string, any>
): Promise<void> {
  const errorId = `mascot-error-${Date.now()}`;
  
  try {
    // Log to console for immediate visibility
    console.error(`[Mascot AI Brain] Action failed: ${action}`, { error, context, errorId });
    
    // Create support notification for human review
    await db.insert(notifications).values({
      userId: '0', // System notification (string ID)
      type: 'system_alert',
      title: `Mascot Action Failed: ${action}`,
      message: `Error: ${error}\n\nContext: ${JSON.stringify(context || {}, null, 2)}`,
      priority: 'high',
      metadata: {
        errorId,
        action,
        error,
        context,
        source: 'ai_brain_mascot',
        requiresWorkflowApproval: true,
        suggestedFix: 'Review mascot orchestration code and console commands',
      },
      isRead: false,
      createdAt: new Date(),
    });
    
    // Broadcast to support staff via WebSocket for real-time alert
    broadcastToAllClients({
      type: 'mascot_error',
      payload: {
        errorId,
        action,
        error,
        timestamp: new Date().toISOString(),
        severity: 'high',
        requiresReview: true,
      },
    });
  } catch (reportError) {
    console.error('[Mascot AI Brain] Failed to report error:', reportError);
  }
}

// Execute mascot action with AI Brain authority - only block if truly broken
async function executeMascotAction<T>(
  action: string,
  executor: () => Promise<T>,
  context?: Record<string, any>
): Promise<MascotActionResult> {
  try {
    const result = await executor();
    return {
      success: true,
      action,
      data: result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Report error to support for workflow approval to fix
    await reportMascotError(action, errorMessage, context);
    
    return {
      success: false,
      action,
      error: errorMessage,
      reportedToSupport: true,
    };
  }
}
import { 
  generateSeasonalProfile, 
  getCurrentSeasonId, 
  shouldForceDarkMode,
  runSeasonalHealthCheck,
  executeSeasonalCommand,
  getSupportOverrides,
  generateAIHealthReport,
  registerSeasonalManager,
  unregisterSeasonalManager,
  getActiveManagers,
  getModifiedOrnamentDirective,
  type SeasonalCommand,
  type OrnamentDirective
} from '../services/ai-brain/skills/seasonalOrchestrator';

const router = Router();

interface MascotInsight {
  id: string;
  type: 'tip' | 'advice' | 'task' | 'alert' | 'celebration';
  title: string;
  message: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: string;
}

interface MascotTask {
  id: string;
  title: string;
  description: string;
  category: string;
  points: number;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  actionUrl?: string;
}

/**
 * GET /api/mascot/insights
 * Get AI-generated insights for the current user/workspace
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.get('/insights', requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  const workspaceId = (req as any).session?.activeWorkspaceId;
  
  const result = await executeMascotAction('mascot.get_insights', async () => {
    const insights: MascotInsight[] = [];
    
    // Get workspace stats for contextual insights
    if (workspaceId) {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      
      if (workspace) {
        // Check if business category is set
        if (!workspace.industry) {
          insights.push({
            id: 'set-industry',
            type: 'task',
            title: 'Set Your Industry Type',
            message: 'Help me give you better advice by setting your industry type in settings!',
            category: 'setup',
            priority: 'high',
            actionUrl: '/settings',
            actionLabel: 'Go to Settings'
          });
        }
        
        // Check employee count
        const employeeCount = await db.select({ count: count() })
          .from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        if (employeeCount[0]?.count === 0 || employeeCount[0]?.count === 1) {
          insights.push({
            id: 'add-team',
            type: 'tip',
            title: 'Build Your Team',
            message: 'Add team members to unlock collaborative scheduling features!',
            category: 'team',
            priority: 'medium',
            actionUrl: '/employees',
            actionLabel: 'Add Employee'
          });
        }
        
        // Check for upcoming shifts
        const now = new Date();
        const upcomingShifts = await db.select({ count: count() })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.startTime, now)
          ));
        
        if (upcomingShifts[0]?.count === 0) {
          insights.push({
            id: 'create-schedule',
            type: 'advice',
            title: 'Time to Schedule!',
            message: 'You dont have any upcoming shifts scheduled. Want me to help you create a schedule?',
            category: 'scheduling',
            priority: 'medium',
            actionUrl: '/schedule',
            actionLabel: 'Open Scheduler'
          });
        }
      }
    }
    
    // Add a motivational insight
    const motivationalMessages = [
      { title: 'You\'re Doing Great!', message: 'Every step forward counts. Keep up the momentum!' },
      { title: 'Pro Tip', message: 'Regular schedule reviews can boost team satisfaction by up to 30%!' },
      { title: 'Did You Know?', message: 'Automated scheduling saves businesses an average of 5 hours per week.' },
      { title: 'Growth Opportunity', message: 'Consider setting up automated reminders for your team!' }
    ];
    
    const randomMotivation = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
    insights.push({
      id: 'motivation-' + Date.now(),
      type: 'tip',
      title: randomMotivation.title,
      message: randomMotivation.message,
      category: 'motivation',
      priority: 'low'
    });
    
    return { insights };
  }, { userId, workspaceId });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * GET /api/mascot/faqs
 * Get relevant FAQ data for the mascot to reference
 * Wrapped with AI Brain authority chain
 */
router.get('/faqs', async (req, res) => {
  const { category, limit = 10 } = req.query;
  
  const result = await executeMascotAction('mascot.get_faqs', async () => {
    let query = db.select({
      id: helposFaqs.id,
      question: helposFaqs.question,
      answer: helposFaqs.answer,
      category: helposFaqs.category,
      helpfulCount: helposFaqs.helpfulCount,
    })
    .from(helposFaqs)
    .where(eq(helposFaqs.isPublished, true))
    .orderBy(desc(helposFaqs.helpfulCount))
    .limit(Number(limit));
    
    const faqs = await query;
    return { faqs };
  }, { category, limit });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * GET /api/mascot/tasks
 * Get suggested tasks for the user based on their progress
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.get('/tasks', requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  const workspaceId = (req as any).session?.activeWorkspaceId;
  
  const result = await executeMascotAction('mascot.get_tasks', async () => {
    const tasks: MascotTask[] = [];
    
    // Suggest account setup tasks
    tasks.push({
      id: 'complete-profile',
      title: 'Complete Your Profile',
      description: 'Add your business details to unlock personalized insights',
      category: 'setup',
      points: 50,
      priority: 'high',
      completed: false,
      actionUrl: '/profile'
    });
    
    tasks.push({
      id: 'explore-features',
      title: 'Explore Key Features',
      description: 'Take a tour of the scheduling, time tracking, and analytics features',
      category: 'discovery',
      points: 30,
      priority: 'medium',
      completed: false,
      actionUrl: '/features-overview'
    });
    
    tasks.push({
      id: 'set-availability',
      title: 'Set Team Availability',
      description: 'Configure availability settings for smarter scheduling',
      category: 'scheduling',
      points: 40,
      priority: 'medium',
      completed: false,
      actionUrl: '/availability'
    });
    
    tasks.push({
      id: 'connect-payroll',
      title: 'Set Up Payroll',
      description: 'Connect your payment processing for seamless operations',
      category: 'integration',
      points: 60,
      priority: 'high',
      completed: false,
      actionUrl: '/payroll-setup'
    });
    
    // Return all incomplete tasks
    return { tasks: tasks.filter(t => !t.completed) };
  }, { userId, workspaceId });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * POST /api/mascot/advice
 * Get AI-generated business advice based on context
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.post('/advice', requireAuth, async (req, res) => {
  const { context, businessCategory, question } = req.body;
  const userId = (req as any).user?.id;
  const workspaceId = (req as any).session?.activeWorkspaceId;
  
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }
  
  const result = await executeMascotAction('mascot.generate_advice', async () => {
    // Use Gemini to generate contextual advice
    const systemPrompt = `You are CoAI, a friendly and helpful AI assistant mascot for CoAIleague, a workforce management platform. 
You help business owners grow their businesses with practical advice.
${businessCategory ? `The user's business is in the ${businessCategory} industry.` : ''}
${context ? `Additional context: ${context}` : ''}

Keep your responses:
- Short and actionable (2-3 sentences max)
- Friendly and encouraging
- Focused on practical business growth tips
- Related to workforce management when relevant`;

    const response = await geminiClient.generate({
      workspaceId,
      userId,
      featureKey: 'mascot_advice',
      systemPrompt,
      userMessage: question,
      temperature: 0.7,
      maxTokens: 200
    });
    
    return { 
      advice: response.text,
      category: businessCategory || 'general'
    };
  }, { userId, workspaceId, question, businessCategory });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * GET /api/mascot/holiday
 * Get current holiday information for holiday-aware thoughts
 * Wrapped with AI Brain authority chain
 */
router.get('/holiday', async (_req, res) => {
  const result = await executeMascotAction('mascot.get_holiday', async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    const holidays = [
      { key: 'new_year', name: 'New Year', startMonth: 12, startDay: 31, endMonth: 1, endDay: 2 },
      { key: 'valentines', name: 'Valentines Day', startMonth: 2, startDay: 13, endMonth: 2, endDay: 15 },
      { key: 'spring', name: 'Spring', startMonth: 3, startDay: 20, endMonth: 4, endDay: 20 },
      { key: 'easter', name: 'Easter', startMonth: 3, startDay: 28, endMonth: 4, endDay: 17 },
      { key: 'summer', name: 'Summer', startMonth: 6, startDay: 21, endMonth: 8, endDay: 31 },
      { key: 'halloween', name: 'Halloween', startMonth: 10, startDay: 25, endMonth: 11, endDay: 1 },
      { key: 'thanksgiving', name: 'Thanksgiving', startMonth: 11, startDay: 20, endMonth: 11, endDay: 28 },
      { key: 'christmas', name: 'Christmas', startMonth: 12, startDay: 20, endMonth: 12, endDay: 26 },
    ];
    
    for (const holiday of holidays) {
      const { startMonth, startDay, endMonth, endDay } = holiday;
      
      if (startMonth <= endMonth) {
        if ((month > startMonth || (month === startMonth && day >= startDay)) &&
            (month < endMonth || (month === endMonth && day <= endDay))) {
          return { holiday, isHoliday: true };
        }
      } else {
        if ((month > startMonth || (month === startMonth && day >= startDay)) ||
            (month < endMonth || (month === endMonth && day <= endDay))) {
          return { holiday, isHoliday: true };
        }
      }
    }
    
    return { holiday: null, isHoliday: false };
  }, {});
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * POST /api/mascot/ask
 * Alias for /advice endpoint - used by frontend hooks
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.post('/ask', requireAuth, async (req, res) => {
  const { question, context, businessCategory } = req.body;
  const userId = (req as any).user?.id;
  const workspaceId = (req as any).session?.activeWorkspaceId;
  
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }
  
  const result = await executeMascotAction('mascot.ask', async () => {
    const systemPrompt = `You are CoAI, a friendly and helpful AI assistant mascot for CoAIleague, a workforce management platform. 
You help business owners grow their businesses with practical advice.
${businessCategory ? `The user's business is in the ${businessCategory} industry.` : ''}
${context ? `Additional context: ${context}` : ''}

Keep your responses:
- Short and actionable (2-3 sentences max)
- Friendly and encouraging
- Focused on practical business growth tips
- Related to workforce management when relevant`;

    const response = await geminiClient.generate({
      workspaceId,
      userId,
      featureKey: 'mascot_ask',
      systemPrompt,
      userMessage: question,
      temperature: 0.7,
      maxTokens: 200
    });
    
    return { 
      advice: response.text,
      category: businessCategory || 'general'
    };
  }, { userId, workspaceId, question, businessCategory });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * POST /api/mascot/business-advisor
 * Get comprehensive AI-powered business success advisory
 * Returns insights, thought bubbles, action items, and emote suggestions
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.post('/business-advisor', requireAuth, async (req, res) => {
  const { 
    businessType, 
    currentChallenges, 
    goals, 
    metrics,
    requestType = 'insights' // 'insights' | 'thought' | 'actions' | 'full'
  } = req.body;
  const userId = (req as any).user?.id;
  const workspaceId = (req as any).session?.activeWorkspaceId;
  
  const result = await executeMascotAction('mascot.business_advisor', async () => {
    // Build context from workspace data
    let businessContext = '';
    
    if (workspaceId) {
      try {
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (workspace) {
          businessContext = `Business: ${workspace.name || 'Unnamed'}\nIndustry: ${workspace.industry || 'General'}`;
        }
        
        // Get recent metrics
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const employeeCount = await db.select({ count: count() })
          .from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        const shiftCount = await db.select({ count: count() })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.startTime, thirtyDaysAgo)
          ));
        
        businessContext += `\nTeam Size: ${employeeCount[0]?.count || 0} employees`;
        businessContext += `\nRecent Activity: ${shiftCount[0]?.count || 0} shifts in 30 days`;
      } catch (e) {
        console.log('[BusinessAdvisor] Context gathering error:', e);
      }
    }
    
    const systemPrompt = `You are CoAI, an expert AI Business Success Advisor for CoAIleague workforce management platform.
Your role is to provide actionable, personalized business growth insights.

${businessContext}
${businessType ? `Business Type: ${businessType}` : ''}
${currentChallenges ? `Current Challenges: ${currentChallenges}` : ''}
${goals ? `Business Goals: ${goals}` : ''}
${metrics ? `Key Metrics: ${JSON.stringify(metrics)}` : ''}

Based on the request type, provide:
- insights: Strategic business insights (2-3 key points)
- thought: A single encouraging thought bubble message (15 words max)
- actions: 3 specific action items with priority levels
- full: All of the above

Format your response as JSON with these fields:
{
  "insights": ["insight1", "insight2", "insight3"],
  "thought": "encouraging message",
  "actions": [
    {"title": "Action title", "description": "Brief description", "priority": "high|medium|low", "category": "category"},
  ],
  "emote": "suggested_emote",
  "mode": "suggested_mascot_mode"
}

Emote options: sparkle, stars, hearts, confetti, question, exclaim
Mode options: ADVISING, THINKING, CELEBRATING, IDLE`;

    const userMessage = requestType === 'thought' 
      ? 'Generate an encouraging thought bubble for the user right now.'
      : requestType === 'actions'
      ? 'What are the top 3 actions this business should take?'
      : requestType === 'insights'
      ? 'Provide strategic business insights based on the context.'
      : 'Provide a full business advisory package with insights, thoughts, and actions.';

    const response = await geminiClient.generate({
      workspaceId,
      userId,
      featureKey: 'mascot_business_advisor',
      systemPrompt,
      userMessage,
      temperature: 0.7,
      maxTokens: 500
    });
    
    // Parse JSON response
    let parsedResponse;
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = {
          insights: [response.text],
          thought: "Let's grow your business together!",
          actions: [],
          emote: 'sparkle',
          mode: 'ADVISING'
        };
      }
    } catch (e) {
      parsedResponse = {
        insights: [response.text],
        thought: "Let's grow your business together!",
        actions: [],
        emote: 'sparkle',
        mode: 'ADVISING'
      };
    }
    
    return {
      ...parsedResponse,
      requestType,
      timestamp: new Date().toISOString()
    };
  }, { userId, workspaceId, businessType, requestType });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * GET /api/mascot/emote-cycles
 * Get emote animation cycle configurations for the mascot
 * Returns full animation sequences with effects, transitions, and timing
 */
router.get('/emote-cycles', async (_req, res) => {
  const result = await executeMascotAction('mascot.get_emote_cycles', async () => {
    return {
      cycles: {
        idle: {
          sequence: ['float', 'bob', 'sparkle_small'],
          duration: 3000,
          loop: true,
          effects: { particles: 'occasional_sparkle', glow: 0.4 }
        },
        thinking: {
          sequence: ['spin_slow', 'pulse', 'question_mark'],
          duration: 2000,
          loop: true,
          effects: { particles: 'thought_bubbles', glow: 0.6, orbit: true }
        },
        celebrating: {
          sequence: ['bounce', 'sparkle_burst', 'confetti_shower'],
          duration: 4000,
          loop: false,
          effects: { particles: 'confetti', glow: 1.0, shake: 'happy' }
        },
        advising: {
          sequence: ['float_steady', 'glow_pulse', 'wisdom_sparkle'],
          duration: 3500,
          loop: true,
          effects: { particles: 'star_trail', glow: 0.8, halo: true }
        },
        error: {
          sequence: ['shake', 'red_flash', 'concerned'],
          duration: 1500,
          loop: false,
          effects: { particles: 'error_sparks', glow: 0.3, shake: 'urgent' }
        },
        success: {
          sequence: ['expand', 'star_spiral', 'celebration_burst'],
          duration: 2500,
          loop: false,
          effects: { particles: 'success_confetti', glow: 1.2, shockwave: true }
        },
        searching: {
          sequence: ['radar_sweep', 'ping', 'scan_line'],
          duration: 2000,
          loop: true,
          effects: { particles: 'search_dots', glow: 0.5, radar: true }
        },
        listening: {
          sequence: ['wave_react', 'pulse_audio', 'attentive'],
          duration: 1500,
          loop: true,
          effects: { particles: 'sound_waves', glow: 0.6, waveform: true }
        },
        holiday: {
          sequence: ['festive_bounce', 'seasonal_sparkle', 'joy_burst'],
          duration: 4000,
          loop: true,
          effects: { particles: 'seasonal', glow: 0.9, decorations: true }
        }
      },
      transitions: {
        default: { duration: 300, easing: 'ease-out' },
        dramatic: { duration: 600, easing: 'ease-in-out', shockwave: true },
        instant: { duration: 50, easing: 'linear' }
      },
      starBehaviors: {
        cyan: { label: 'Co', baseGlow: '#38bdf8', role: 'leader' },
        purple: { label: 'AI', baseGlow: '#a855f7', role: 'processor' },
        gold: { label: 'L', baseGlow: '#f4c15d', role: 'wisdom' }
      }
    };
  }, {});
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * POST /api/mascot/complete-task
 * Mark a mascot-suggested task as complete
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.post('/complete-task', requireAuth, async (req, res) => {
  const { taskId } = req.body;
  const userId = (req as any).user?.id;
  
  if (!taskId || !userId) {
    return res.status(400).json({ error: 'Task ID and user ID required' });
  }
  
  const result = await executeMascotAction('mascot.complete_task', async () => {
    // For now, just acknowledge the completion
    // Future: integrate with gamification system
    console.log(`[Mascot] Task ${taskId} completed by user ${userId}`);
    
    return { success: true, message: 'Task completed!' };
  }, { userId, taskId });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

// ============================================================================
// USER MASCOT PREFERENCES ENDPOINTS
// ============================================================================

/**
 * GET /api/mascot/preferences
 * Get user's mascot preferences
 * Protected - requires authentication
 * Wrapped with AI Brain authority chain
 */
router.get('/preferences', requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }
  
  const result = await executeMascotAction('mascot.get_preferences', async () => {
    const dbResult = await db.execute(sql`
      SELECT * FROM user_mascot_preferences WHERE user_id = ${userId}
    `);
    
    const prefs = dbResult.rows?.[0];
    
    if (!prefs) {
      // Return default preferences
      return {
        preferences: {
          userId,
          positionX: 0,
          positionY: 0,
          isEnabled: true,
          isMinimized: false,
          preferredSize: 'default',
          roamingEnabled: true,
          reactToActions: true,
          showThoughts: true,
          soundEnabled: false,
          nickname: null,
          favoriteEmotes: [],
          dislikedEmotes: [],
          totalInteractions: 0,
          totalDrags: 0,
          totalTaps: 0,
          customThoughts: []
        }
      };
    }
    
    return { preferences: prefs };
  }, { userId });
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error, reportedToSupport: result.reportedToSupport });
  }
});

/**
 * PUT /api/mascot/preferences
 * Update user's mascot preferences
 * Protected - requires authentication
 */
router.put('/preferences', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const updates = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    // Validate and extract allowed fields with strict whitelist
    const positionX = typeof updates.positionX === 'number' ? Math.round(updates.positionX) : null;
    const positionY = typeof updates.positionY === 'number' ? Math.round(updates.positionY) : null;
    const isEnabled = typeof updates.isEnabled === 'boolean' ? updates.isEnabled : null;
    const isMinimized = typeof updates.isMinimized === 'boolean' ? updates.isMinimized : null;
    const preferredSize = ['small', 'default', 'large'].includes(updates.preferredSize) ? updates.preferredSize : null;
    const roamingEnabled = typeof updates.roamingEnabled === 'boolean' ? updates.roamingEnabled : null;
    const reactToActions = typeof updates.reactToActions === 'boolean' ? updates.reactToActions : null;
    const showThoughts = typeof updates.showThoughts === 'boolean' ? updates.showThoughts : null;
    const soundEnabled = typeof updates.soundEnabled === 'boolean' ? updates.soundEnabled : null;
    const nickname = typeof updates.nickname === 'string' && updates.nickname.length <= 50 ? updates.nickname : null;
    
    // Upsert with parameterized values - each field explicitly handled
    await db.execute(sql`
      INSERT INTO user_mascot_preferences (user_id, updated_at)
      VALUES (${userId}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        position_x = COALESCE(${positionX}, user_mascot_preferences.position_x),
        position_y = COALESCE(${positionY}, user_mascot_preferences.position_y),
        is_enabled = COALESCE(${isEnabled}, user_mascot_preferences.is_enabled),
        is_minimized = COALESCE(${isMinimized}, user_mascot_preferences.is_minimized),
        preferred_size = COALESCE(${preferredSize}, user_mascot_preferences.preferred_size),
        roaming_enabled = COALESCE(${roamingEnabled}, user_mascot_preferences.roaming_enabled),
        react_to_actions = COALESCE(${reactToActions}, user_mascot_preferences.react_to_actions),
        show_thoughts = COALESCE(${showThoughts}, user_mascot_preferences.show_thoughts),
        sound_enabled = COALESCE(${soundEnabled}, user_mascot_preferences.sound_enabled),
        nickname = COALESCE(${nickname}, user_mascot_preferences.nickname),
        updated_at = NOW()
    `);
    
    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    console.error('[Mascot] Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/mascot/preferences/position
 * Update mascot position (separate endpoint for frequent updates)
 * Protected - requires authentication
 */
router.post('/preferences/position', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { x, y } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ error: 'Position x and y must be numbers' });
    }
    
    await db.execute(sql`
      INSERT INTO user_mascot_preferences (user_id, position_x, position_y, updated_at)
      VALUES (${userId}, ${Math.round(x)}, ${Math.round(y)}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        position_x = ${Math.round(x)},
        position_y = ${Math.round(y)},
        total_drags = user_mascot_preferences.total_drags + 1,
        last_interaction_at = NOW(),
        updated_at = NOW()
    `);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Mascot] Error updating position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

/**
 * POST /api/mascot/preferences/interaction
 * Record a mascot interaction (tap, hover, etc.)
 * Protected - requires authentication
 */
router.post('/preferences/interaction', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { type } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    // Validate type with strict whitelist - no dynamic SQL field names
    const validTypes = ['tap', 'drag', 'general'] as const;
    const interactionType = validTypes.includes(type) ? type : 'general';
    
    // Use separate parameterized queries for each interaction type
    if (interactionType === 'tap') {
      await db.execute(sql`
        INSERT INTO user_mascot_preferences (user_id, total_taps, total_interactions, last_interaction_at, updated_at)
        VALUES (${userId}, 1, 1, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          total_taps = user_mascot_preferences.total_taps + 1,
          total_interactions = user_mascot_preferences.total_interactions + 1,
          last_interaction_at = NOW(),
          updated_at = NOW()
      `);
    } else if (interactionType === 'drag') {
      await db.execute(sql`
        INSERT INTO user_mascot_preferences (user_id, total_drags, total_interactions, last_interaction_at, updated_at)
        VALUES (${userId}, 1, 1, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          total_drags = user_mascot_preferences.total_drags + 1,
          total_interactions = user_mascot_preferences.total_interactions + 1,
          last_interaction_at = NOW(),
          updated_at = NOW()
      `);
    } else {
      await db.execute(sql`
        INSERT INTO user_mascot_preferences (user_id, total_interactions, last_interaction_at, updated_at)
        VALUES (${userId}, 1, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          total_interactions = user_mascot_preferences.total_interactions + 1,
          last_interaction_at = NOW(),
          updated_at = NOW()
      `);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Mascot] Error recording interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

/**
 * DELETE /api/mascot/preferences
 * Delete user's mascot preferences (called on user termination)
 * Protected - requires authentication
 */
router.delete('/preferences', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    await db.execute(sql`
      DELETE FROM user_mascot_preferences WHERE user_id = ${userId}
    `);
    
    res.json({ success: true, message: 'Preferences deleted' });
  } catch (error) {
    console.error('[Mascot] Error deleting preferences:', error);
    res.status(500).json({ error: 'Failed to delete preferences' });
  }
});

/**
 * GET /api/mascot/seasonal/state
 * Get current seasonal profile with theme, effects, and mascot hints
 * Public endpoint - no auth required for theme detection
 */
router.get('/seasonal/state', async (req, res) => {
  try {
    const workspaceId = (req as any).session?.activeWorkspaceId;
    const profile = await generateSeasonalProfile(workspaceId);
    
    res.json({
      success: true,
      profile,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Seasonal] Error generating profile:', error);
    res.status(500).json({ 
      error: 'Failed to generate seasonal profile',
      fallback: {
        seasonId: 'default',
        forceDarkMode: false,
      }
    });
  }
});

/**
 * GET /api/mascot/seasonal/quick
 * Quick check for current season (lightweight, cached)
 * Public endpoint
 */
router.get('/seasonal/quick', (req, res) => {
  try {
    res.json({
      seasonId: getCurrentSeasonId(),
      forceDarkMode: shouldForceDarkMode(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      seasonId: 'default',
      forceDarkMode: false,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/mascot/seasonal/health
 * Run AI Brain health check on seasonal effects
 * Support staff endpoint - requires auth
 */
router.get('/seasonal/health', requireAuth, async (req, res) => {
  try {
    const healthCheck = await runSeasonalHealthCheck();
    res.json({
      success: true,
      ...healthCheck,
    });
  } catch (error) {
    console.error('[Seasonal] Health check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Health check failed',
      status: 'unknown'
    });
  }
});

/**
 * GET /api/mascot/seasonal/health/report
 * Generate AI-powered health report
 * Support staff endpoint - requires auth
 */
router.get('/seasonal/health/report', requireAuth, async (req, res) => {
  try {
    const report = await generateAIHealthReport();
    res.json({
      success: true,
      report,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Seasonal] Health report error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Report generation failed'
    });
  }
});

/**
 * POST /api/mascot/seasonal/command
 * Execute seasonal command from support console
 * Support staff endpoint - requires auth
 */
router.post('/seasonal/command', requireAuth, async (req, res) => {
  try {
    const command = req.body as SeasonalCommand;
    
    if (!command.action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action required' 
      });
    }
    
    const result = await executeSeasonalCommand(command);
    res.json({
      success: result.success,
      message: result.message,
      newState: result.newState,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Seasonal] Command error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Command execution failed'
    });
  }
});

/**
 * GET /api/mascot/seasonal/overrides
 * Get current support overrides for seasonal effects
 * Support staff endpoint - requires auth
 */
router.get('/seasonal/overrides', requireAuth, (req, res) => {
  try {
    const overrides = getSupportOverrides();
    res.json({
      success: true,
      overrides,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Seasonal] Get overrides error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get overrides'
    });
  }
});

/**
 * POST /api/mascot/seasonal/managers/register
 * Register a seasonal effect manager (called by frontend components)
 * Public endpoint - called by frontend on component mount
 */
router.post('/seasonal/managers/register', (req, res) => {
  try {
    const { managerId } = req.body;
    
    if (!managerId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Manager ID required' 
      });
    }
    
    registerSeasonalManager(managerId);
    res.json({
      success: true,
      message: `Manager ${managerId} registered`,
      activeManagers: getActiveManagers(),
    });
  } catch (error) {
    console.error('[Seasonal] Register manager error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to register manager'
    });
  }
});

/**
 * POST /api/mascot/seasonal/managers/unregister
 * Unregister a seasonal effect manager (called by frontend components)
 * Public endpoint - called by frontend on component unmount
 */
router.post('/seasonal/managers/unregister', (req, res) => {
  try {
    const { managerId } = req.body;
    
    if (!managerId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Manager ID required' 
      });
    }
    
    unregisterSeasonalManager(managerId);
    res.json({
      success: true,
      message: `Manager ${managerId} unregistered`,
      activeManagers: getActiveManagers(),
    });
  } catch (error) {
    console.error('[Seasonal] Unregister manager error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to unregister manager'
    });
  }
});

/**
 * GET /api/mascot/seasonal/managers
 * Get list of active seasonal managers
 * Support staff endpoint - requires auth
 */
router.get('/seasonal/managers', requireAuth, (req, res) => {
  try {
    res.json({
      success: true,
      managers: getActiveManagers(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Seasonal] Get managers error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get managers'
    });
  }
});

/**
 * GET /api/mascot/seasonal/ornaments
 * Get AI Brain orchestrated ornament directives for current season
 * Public endpoint - used by frontend ornament scenes
 */
router.get('/seasonal/ornaments', (req, res) => {
  try {
    const seasonId = getCurrentSeasonId();
    const directive = getModifiedOrnamentDirective(seasonId);
    
    res.json({
      success: true,
      seasonId,
      directive,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Seasonal] Get ornaments error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get ornament directives',
      directive: {
        profiles: [],
        placements: [],
        spawnRate: 0,
        decayRate: 0,
        syncWithSantaFlyover: false,
        globalIntensity: 0,
      }
    });
  }
});

// ============================================================================
// HOLIDAY MASCOT DIRECTIVES - AI BRAIN ORCHESTRATED MOTION & DECORATIONS
// ============================================================================

import { storage } from '../storage';

/**
 * GET /api/mascot/holiday/directives
 * Get current active holiday directive (motion pattern + decorations)
 * Public endpoint - used by frontend mascot component
 */
router.get('/holiday/directives', async (req, res) => {
  try {
    const seasonId = getCurrentSeasonId();
    
    // Get holiday decor for current season from DB
    let holidayDecor = await storage.getHolidayMascotDecorByKey(seasonId);
    
    // Get latest active directive
    const latestDirective = await storage.getLatestHolidayDirective();
    
    // Get motion profile if linked
    let motionProfile = null;
    if (holidayDecor?.motionProfileId) {
      motionProfile = await storage.getMascotMotionProfile(holidayDecor.motionProfileId);
    }
    
    // If no DB record exists, provide sensible defaults for the current season
    if (!holidayDecor && (seasonId === 'christmas' || seasonId === 'winter' || seasonId === 'newYear')) {
      holidayDecor = {
        id: 'default-christmas',
        holidayKey: seasonId,
        holidayName: seasonId === 'christmas' ? 'Christmas' : seasonId === 'newYear' ? 'New Year' : 'Winter',
        motionProfileId: null,
        starDecorations: {
          co: { attachments: ['led_wrap'], glowPalette: ['#ff0000', '#ffffff', '#00ff00'], ledCount: 6, ledSpeed: 0.4 },
          ai: { attachments: ['led_wrap'], glowPalette: ['#ff00ff', '#00ffff', '#ffff00'], ledCount: 6, ledSpeed: 0.5 },
          nx: { attachments: ['led_wrap'], glowPalette: ['#ffcc00', '#ff6600', '#ffffff'], ledCount: 6, ledSpeed: 0.6 },
        },
        globalGlowIntensity: 1.0,
        particleEffects: null,
        ambientColors: ['#ff0000', '#00ff00', '#ffffff'],
        priority: 50,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        startMonth: null,
        startDay: null,
        endMonth: null,
        endDay: null,
      } as any;
    }
    
    // Ensure starDecorations has required fields for frontend
    if (holidayDecor?.starDecorations) {
      const starDecor = holidayDecor.starDecorations as Record<string, any>;
      for (const key of ['co', 'ai', 'nx']) {
        if (!starDecor[key]) {
          starDecor[key] = { attachments: ['led_wrap'], glowPalette: ['#ff0000', '#00ff00', '#ffffff'], ledCount: 6, ledSpeed: 0.5 };
        } else if (!starDecor[key].glowPalette) {
          starDecor[key].glowPalette = ['#ff0000', '#00ff00', '#ffffff'];
        }
      }
    }
    
    res.json({
      success: true,
      seasonId,
      holidayDecor,
      motionProfile,
      latestDirective,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Holiday Directives] Get directives error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get holiday directives'
    });
  }
});

/**
 * GET /api/mascot/holiday/profiles
 * Get all motion profiles available for AI Brain selection
 * Support staff endpoint - requires auth
 */
router.get('/holiday/profiles', requireAuth, async (req, res) => {
  try {
    const profiles = await storage.getAllMascotMotionProfiles();
    const decorations = await storage.getAllHolidayMascotDecor();
    
    res.json({
      success: true,
      profiles,
      decorations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Holiday Profiles] Get profiles error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get profiles'
    });
  }
});

/**
 * POST /api/mascot/holiday/directives/apply
 * Apply a new holiday directive (AI Brain or manual)
 * Support staff endpoint - requires auth
 */
router.post('/holiday/directives/apply', requireAuth, async (req, res) => {
  try {
    const { holidayDecorId, motionProfileId, triggeredBy = 'manual' } = req.body;
    
    // Get the holiday decor
    const holidayDecor = holidayDecorId 
      ? await storage.getHolidayMascotDecor(holidayDecorId)
      : null;
    
    // Get the motion profile
    const motionProfile = motionProfileId
      ? await storage.getMascotMotionProfile(motionProfileId)
      : null;
    
    // Create history record
    const historyEntry = await storage.createHolidayMascotHistory({
      holidayDecorId: holidayDecorId || null,
      motionProfileId: motionProfileId || null,
      action: 'activate',
      triggeredBy,
      directiveSnapshot: {
        motionPattern: motionProfile?.patternType || 'TRIAD_SYNCHRONIZED',
        starMotion: motionProfile?.starMotion || {},
        decorations: holidayDecor?.starDecorations || {},
        timestamp: new Date().toISOString(),
      },
    });
    
    // Broadcast the new directive to all connected clients
    broadcastToAllClients({
      type: 'mascot.directive.updated',
      payload: {
        seasonId: getCurrentSeasonId(),
        holidayDecor,
        motionProfile,
        timestamp: new Date().toISOString(),
      },
    });
    
    res.json({
      success: true,
      directive: historyEntry,
      holidayDecor,
      motionProfile,
      message: 'Holiday directive applied successfully',
    });
  } catch (error) {
    console.error('[Holiday Directives] Apply directive error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to apply holiday directive'
    });
  }
});

/**
 * POST /api/mascot/holiday/profiles
 * Create a new motion profile
 * Support staff endpoint - requires auth
 */
router.post('/holiday/profiles', requireAuth, async (req, res) => {
  try {
    const profileData = req.body;
    
    const profile = await storage.createMascotMotionProfile({
      name: profileData.name,
      description: profileData.description,
      patternType: profileData.patternType || 'TRIAD_SYNCHRONIZED',
      starMotion: profileData.starMotion || {
        co: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 0, noiseAmp: 0 },
        ai: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 2.094, noiseAmp: 0 },
        nx: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 4.188, noiseAmp: 0 },
      },
      physicsOverrides: profileData.physicsOverrides || null,
      randomSeed: profileData.randomSeed || null,
      noiseConfig: profileData.noiseConfig || null,
      isActive: profileData.isActive ?? true,
    });
    
    res.json({
      success: true,
      profile,
      message: 'Motion profile created successfully',
    });
  } catch (error) {
    console.error('[Holiday Profiles] Create profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create motion profile'
    });
  }
});

/**
 * PATCH /api/mascot/holiday/profiles/:id
 * Update an existing motion profile
 * Support staff endpoint - requires auth
 */
router.patch('/holiday/profiles/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const profile = await storage.updateMascotMotionProfile(id, updateData);
    
    if (!profile) {
      return res.status(404).json({ 
        success: false,
        error: 'Motion profile not found'
      });
    }
    
    res.json({
      success: true,
      profile,
      message: 'Motion profile updated successfully',
    });
  } catch (error) {
    console.error('[Holiday Profiles] Update profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update motion profile'
    });
  }
});

/**
 * POST /api/mascot/holiday/decorations
 * Create a new holiday decoration config
 * Support staff endpoint - requires auth
 */
router.post('/holiday/decorations', requireAuth, async (req, res) => {
  try {
    const decorData = req.body;
    
    const decor = await storage.createHolidayMascotDecor({
      holidayKey: decorData.holidayKey,
      holidayName: decorData.holidayName,
      motionProfileId: decorData.motionProfileId || null,
      starDecorations: decorData.starDecorations || {
        co: { attachments: ['led_wrap'], glowPalette: ['#ff0000', '#00ff00'] },
        ai: { attachments: ['led_wrap'], glowPalette: ['#ff00ff', '#00ffff'] },
        nx: { attachments: ['led_wrap'], glowPalette: ['#ffcc00', '#ffffff'] },
      },
      globalGlowIntensity: decorData.globalGlowIntensity || 1.0,
      particleEffects: decorData.particleEffects || null,
      ambientColors: decorData.ambientColors || [],
      priority: decorData.priority || 50,
      isActive: decorData.isActive ?? true,
    });
    
    res.json({
      success: true,
      decoration: decor,
      message: 'Holiday decoration created successfully',
    });
  } catch (error) {
    console.error('[Holiday Decorations] Create decoration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create holiday decoration'
    });
  }
});

/**
 * GET /api/mascot/holiday/history
 * Get history of directive activations
 * Support staff endpoint - requires auth
 */
router.get('/holiday/history', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const triggeredBy = req.query.triggeredBy as string | undefined;
    
    const history = await storage.getHolidayMascotHistory({ 
      limit, 
      triggeredBy 
    });
    
    res.json({
      success: true,
      history,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Holiday History] Get history error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get history'
    });
  }
});

// ============================================================================
// MASCOT SESSION & INTERACTION ENDPOINTS
// Per-org persistent mascot data with AI Brain integration
// ============================================================================

/**
 * POST /api/mascot/sessions
 * Create or get active session for current user/workspace
 * Protected - requires authentication
 */
router.post('/sessions', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }
    
    const { screenWidth, screenHeight, userAgent } = req.body;
    const sessionKey = `${workspaceId}-${userId || 'guest'}-${Date.now()}`;
    
    // Check for existing active session
    const existingSession = await db.execute(sql`
      SELECT * FROM mascot_sessions 
      WHERE workspace_id = ${workspaceId} 
      AND user_id = ${userId}
      AND is_active = true
      ORDER BY started_at DESC
      LIMIT 1
    `);
    
    if (existingSession.rows?.length > 0) {
      return res.json({ 
        success: true, 
        session: existingSession.rows[0],
        isNew: false
      });
    }
    
    // Create new session
    const result = await db.execute(sql`
      INSERT INTO mascot_sessions (workspace_id, user_id, session_key, user_agent, screen_width, screen_height)
      VALUES (${workspaceId}, ${userId}, ${sessionKey}, ${userAgent || null}, ${screenWidth || null}, ${screenHeight || null})
      RETURNING *
    `);
    
    res.json({ 
      success: true, 
      session: result.rows?.[0],
      isNew: true
    });
  } catch (error) {
    console.error('[Mascot Sessions] Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/mascot/sessions/active
 * Get current active session for user/workspace
 * Protected - requires authentication
 */
router.get('/sessions/active', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }
    
    const result = await db.execute(sql`
      SELECT * FROM mascot_sessions 
      WHERE workspace_id = ${workspaceId} 
      AND user_id = ${userId}
      AND is_active = true
      ORDER BY started_at DESC
      LIMIT 1
    `);
    
    if (!result.rows?.length) {
      return res.json({ session: null });
    }
    
    res.json({ session: result.rows[0] });
  } catch (error) {
    console.error('[Mascot Sessions] Get active session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * PATCH /api/mascot/sessions/:id/close
 * Close an active session
 * Protected - requires authentication
 */
router.patch('/sessions/:id/close', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
    await db.execute(sql`
      UPDATE mascot_sessions 
      SET is_active = false, ended_at = NOW(), updated_at = NOW()
      WHERE id = ${id} 
      AND workspace_id = ${workspaceId}
      AND (user_id = ${userId} OR user_id IS NULL)
    `);
    
    res.json({ success: true, message: 'Session closed' });
  } catch (error) {
    console.error('[Mascot Sessions] Close session error:', error);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

/**
 * POST /api/mascot/interactions
 * Log a mascot interaction with optional AI processing
 * Protected - requires authentication
 */
router.post('/interactions', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    const { 
      sessionId, 
      source, 
      interactionType, 
      payload, 
      mascotPositionX, 
      mascotPositionY,
      requestAiResponse 
    } = req.body;
    
    if (!workspaceId || !sessionId || !source || !interactionType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const startTime = Date.now();
    let aiResponse = null;
    let aiResponseType = null;
    let aiTokensUsed = null;
    
    // Generate AI response if requested
    if (requestAiResponse) {
      try {
        const systemPrompt = `You are CoAI, the friendly Trinity mascot for CoAIleague workforce management. 
You observe user interactions and provide helpful, contextual thoughts and advice.
Based on the user's action, generate a brief thought or helpful tip.
Keep responses under 50 words, friendly and supportive.
Source: ${source}, Action: ${interactionType}`;

        const userMessage = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
        
        const response = await geminiClient.generate({
          workspaceId,
          userId,
          featureKey: 'mascot_interaction',
          systemPrompt,
          userMessage: userMessage.substring(0, 500),
          temperature: 0.8,
          maxTokens: 100
        });
        
        aiResponse = response.text;
        aiResponseType = source === 'chat' ? 'advice' : 'thought';
        aiTokensUsed = null; // Token usage tracking not available
      } catch (aiError) {
        console.warn('[Mascot Interactions] AI response failed:', aiError);
      }
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    // Insert interaction
    const result = await db.execute(sql`
      INSERT INTO mascot_interactions (
        session_id, workspace_id, user_id, source, interaction_type,
        payload, ai_response, ai_response_type, ai_tokens_used,
        mascot_position_x, mascot_position_y, processing_time_ms
      ) VALUES (
        ${sessionId}, ${workspaceId}, ${userId}, ${source}, ${interactionType},
        ${JSON.stringify(payload) || null}, ${aiResponse}, ${aiResponseType}, ${aiTokensUsed},
        ${mascotPositionX || null}, ${mascotPositionY || null}, ${processingTimeMs}
      ) RETURNING *
    `);
    
    // Update session stats
    await db.execute(sql`
      UPDATE mascot_sessions SET
        total_interactions = total_interactions + 1,
        total_thoughts = total_thoughts + ${aiResponseType === 'thought' ? 1 : 0},
        total_advice = total_advice + ${aiResponseType === 'advice' ? 1 : 0},
        updated_at = NOW()
      WHERE id = ${sessionId}
    `);
    
    res.json({ 
      success: true, 
      interaction: result.rows?.[0],
      aiResponse,
      aiResponseType
    });
  } catch (error) {
    console.error('[Mascot Interactions] Log interaction error:', error);
    res.status(500).json({ error: 'Failed to log interaction' });
  }
});

/**
 * POST /api/mascot/observe-chat
 * Special endpoint for chat observation with AI-powered contextual advice
 * Protected - requires authentication
 */
router.post('/observe-chat', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    const { sessionId, chatMessage, chatContext } = req.body;
    
    if (!workspaceId || !sessionId || !chatMessage) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const startTime = Date.now();
    
    // Generate contextual advice based on chat
    const systemPrompt = `You are CoAI, the Trinity mascot observing a chat conversation.
Based on the chat message, provide a helpful thought bubble or contextual tip.
Be supportive and helpful without being intrusive.
Keep response under 40 words, casual and friendly.
${chatContext ? `Recent chat context: ${chatContext}` : ''}`;

    let aiResponse = null;
    let aiTokensUsed = null;
    
    try {
      const response = await geminiClient.generate({
        workspaceId,
        userId,
        featureKey: 'mascot_chat_observe',
        systemPrompt,
        userMessage: chatMessage.substring(0, 300),
        temperature: 0.7,
        maxTokens: 80
      });
      
      aiResponse = response.text;
      aiTokensUsed = null; // Token usage tracking not available
    } catch (aiError) {
      console.warn('[Mascot Chat] AI observation failed:', aiError);
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    // Log the interaction
    await db.execute(sql`
      INSERT INTO mascot_interactions (
        session_id, workspace_id, user_id, source, interaction_type,
        payload, ai_response, ai_response_type, ai_tokens_used, processing_time_ms
      ) VALUES (
        ${sessionId}, ${workspaceId}, ${userId}, 'chat', 'observe',
        ${JSON.stringify({ chatMessage, chatContext })}, ${aiResponse}, 'advice', ${aiTokensUsed}, ${processingTimeMs}
      )
    `);
    
    // Update session
    await db.execute(sql`
      UPDATE mascot_sessions SET
        total_interactions = total_interactions + 1,
        total_advice = total_advice + ${aiResponse ? 1 : 0},
        updated_at = NOW()
      WHERE id = ${sessionId}
    `);
    
    res.json({ 
      success: true, 
      advice: aiResponse,
      processingTimeMs
    });
  } catch (error) {
    console.error('[Mascot Chat] Observe chat error:', error);
    res.status(500).json({ error: 'Failed to observe chat' });
  }
});

/**
 * POST /api/mascot/generate-tasks
 * Generate AI-powered task list for user
 * Protected - requires authentication
 */
router.post('/generate-tasks', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    const { sessionId, context, currentPage } = req.body;
    
    if (!workspaceId || !sessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get workspace context for personalized tasks
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    
    const systemPrompt = `You are CoAI, generating a personalized task list for a business owner using CoAIleague workforce management.
Generate 3-5 actionable tasks based on their context.
Return ONLY a JSON array with objects containing: title, description, category, priority (low/medium/high), actionUrl (optional).
${workspace?.industry ? `Industry: ${workspace.industry}` : ''}
${currentPage ? `Current page: ${currentPage}` : ''}
${context ? `Context: ${context}` : ''}`;

    const response = await geminiClient.generate({
      workspaceId,
      userId,
      featureKey: 'mascot_generate_tasks',
      systemPrompt,
      userMessage: 'Generate personalized tasks based on my business needs',
      temperature: 0.7,
      maxTokens: 500
    });
    
    // Parse tasks from AI response
    let tasks: any[] = [];
    try {
      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.warn('[Mascot Tasks] Failed to parse AI tasks');
      tasks = [
        { title: 'Complete profile setup', description: 'Add your business details', category: 'setup', priority: 'high' },
        { title: 'Add team members', description: 'Invite your first employee', category: 'team', priority: 'medium' }
      ];
    }
    
    // Insert tasks into database
    const insertedTasks = [];
    for (const task of tasks.slice(0, 5)) {
      const result = await db.execute(sql`
        INSERT INTO mascot_tasks (
          session_id, workspace_id, user_id, title, description, 
          category, priority, action_url, ai_reasoning
        ) VALUES (
          ${sessionId}, ${workspaceId}, ${userId}, 
          ${task.title}, ${task.description || null},
          ${task.category || 'general'}, ${task.priority || 'medium'},
          ${task.actionUrl || null}, ${'AI-generated based on user context'}
        ) RETURNING *
      `);
      if (result.rows?.[0]) {
        insertedTasks.push(result.rows[0]);
      }
    }
    
    // Update session
    await db.execute(sql`
      UPDATE mascot_sessions SET
        total_tasks_generated = total_tasks_generated + ${insertedTasks.length},
        updated_at = NOW()
      WHERE id = ${sessionId}
    `);
    
    res.json({ 
      success: true, 
      tasks: insertedTasks 
    });
  } catch (error) {
    console.error('[Mascot Tasks] Generate tasks error:', error);
    res.status(500).json({ error: 'Failed to generate tasks' });
  }
});

/**
 * GET /api/mascot/tasks
 * Get user's mascot-generated tasks
 * Protected - requires authentication
 */
router.get('/generated-tasks', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    const status = req.query.status as string;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }
    
    let statusFilter = status ? sql`AND status = ${status}` : sql``;
    
    const result = await db.execute(sql`
      SELECT * FROM mascot_tasks
      WHERE workspace_id = ${workspaceId}
      AND (user_id = ${userId} OR user_id IS NULL)
      ${statusFilter}
      ORDER BY priority DESC, created_at DESC
      LIMIT 20
    `);
    
    res.json({ tasks: result.rows || [] });
  } catch (error) {
    console.error('[Mascot Tasks] Get tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

/**
 * PATCH /api/mascot/tasks/:id/status
 * Update task status
 * Protected - requires authentication
 */
router.patch('/tasks/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
    const validStatuses = ['pending', 'in_progress', 'completed', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const completedAt = status === 'completed' ? sql`NOW()` : sql`NULL`;
    
    await db.execute(sql`
      UPDATE mascot_tasks SET
        status = ${status},
        completed_at = ${completedAt},
        updated_at = NOW()
      WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND (user_id = ${userId} OR user_id IS NULL)
    `);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Mascot Tasks] Update status error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ============================================================================
// SUPPORT STAFF & AI BRAIN QUERY ENDPOINTS
// ============================================================================

/**
 * GET /api/mascot/sessions/query
 * Query mascot sessions - for support staff and AI Brain
 * Protected - requires staff role
 */
router.get('/sessions/query', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const staffRoles = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];
    
    if (!user?.platformRole || !staffRoles.includes(user.platformRole)) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    
    const { workspaceId, userId, startDate, endDate, limit = 50 } = req.query;
    
    let conditions = [];
    if (workspaceId) conditions.push(sql`workspace_id = ${workspaceId}`);
    if (userId) conditions.push(sql`user_id = ${userId}`);
    if (startDate) conditions.push(sql`started_at >= ${startDate}`);
    if (endDate) conditions.push(sql`started_at <= ${endDate}`);
    
    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;
    
    const result = await db.execute(sql`
      SELECT s.*, 
        u.full_name as user_name,
        w.name as workspace_name
      FROM mascot_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN workspaces w ON s.workspace_id = w.id
      ${whereClause}
      ORDER BY s.started_at DESC
      LIMIT ${Number(limit)}
    `);
    
    res.json({ 
      success: true,
      sessions: result.rows || [],
      count: result.rows?.length || 0
    });
  } catch (error) {
    console.error('[Mascot Sessions] Query sessions error:', error);
    res.status(500).json({ error: 'Failed to query sessions' });
  }
});

/**
 * GET /api/mascot/sessions/:id/interactions
 * Get all interactions for a session - for support staff
 * Protected - requires staff role
 */
router.get('/sessions/:id/interactions', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const staffRoles = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];
    
    if (!user?.platformRole || !staffRoles.includes(user.platformRole)) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const result = await db.execute(sql`
      SELECT * FROM mascot_interactions
      WHERE session_id = ${id}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    
    res.json({ 
      success: true,
      interactions: result.rows || [] 
    });
  } catch (error) {
    console.error('[Mascot Sessions] Get interactions error:', error);
    res.status(500).json({ error: 'Failed to get interactions' });
  }
});

/**
 * GET /api/mascot/analytics
 * Get mascot usage analytics - for support staff and AI Brain
 * Protected - requires staff role
 */
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const staffRoles = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];
    
    if (!user?.platformRole || !staffRoles.includes(user.platformRole)) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    
    const { workspaceId, days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    
    const workspaceFilter = workspaceId ? sql`AND workspace_id = ${workspaceId}` : sql``;
    
    const sessionStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(total_interactions) as total_interactions,
        SUM(total_thoughts) as total_thoughts,
        SUM(total_advice) as total_advice,
        SUM(total_tasks_generated) as total_tasks,
        COUNT(DISTINCT workspace_id) as unique_workspaces,
        COUNT(DISTINCT user_id) as unique_users
      FROM mascot_sessions
      WHERE started_at >= ${startDate.toISOString()}
      ${workspaceFilter}
    `);
    
    const interactionBreakdown = await db.execute(sql`
      SELECT 
        source,
        interaction_type,
        COUNT(*) as count
      FROM mascot_interactions
      WHERE created_at >= ${startDate.toISOString()}
      ${workspaceFilter}
      GROUP BY source, interaction_type
      ORDER BY count DESC
    `);
    
    res.json({
      success: true,
      period: { days: Number(days), startDate: startDate.toISOString() },
      summary: sessionStats.rows?.[0] || {},
      interactionBreakdown: interactionBreakdown.rows || []
    });
  } catch (error) {
    console.error('[Mascot Analytics] Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

export default router;
