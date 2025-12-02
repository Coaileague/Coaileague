/**
 * Mascot Intelligence Routes
 * 
 * Backend API endpoints for the CoAI Twin mascot's AI-powered features:
 * - Live FAQ data pulling
 * - Business insights and advice
 * - Task suggestions for account setup and growth
 * - AI-driven contextual responses
 * 
 * Leverages Gemini AI and existing platform services for intelligence.
 */

import { Router } from 'express';
import { db } from '../db';
import { helposFaqs, workspaces, employees, shifts } from '@shared/schema';
import { eq, desc, and, gte, count, sql } from 'drizzle-orm';
import { geminiClient } from '../services/ai-brain/providers/geminiClient';
import { requireAuth } from '../auth';

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
 */
router.get('/insights', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
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
    
    res.json({ insights });
  } catch (error) {
    console.error('[Mascot] Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

/**
 * GET /api/mascot/faqs
 * Get relevant FAQ data for the mascot to reference
 */
router.get('/faqs', async (req, res) => {
  try {
    const { category, limit = 10 } = req.query;
    
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
    
    res.json({ faqs });
  } catch (error) {
    console.error('[Mascot] Error fetching FAQs:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

/**
 * GET /api/mascot/tasks
 * Get suggested tasks for the user based on their progress
 * Protected - requires authentication
 */
router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
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
    res.json({ tasks: tasks.filter(t => !t.completed) });
  } catch (error) {
    console.error('[Mascot] Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * POST /api/mascot/advice
 * Get AI-generated business advice based on context
 * Protected - requires authentication
 */
router.post('/advice', requireAuth, async (req, res) => {
  try {
    const { context, businessCategory, question } = req.body;
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
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
    
    res.json({ 
      advice: response.text,
      category: businessCategory || 'general'
    });
  } catch (error) {
    console.error('[Mascot] Error generating advice:', error);
    res.status(500).json({ error: 'Failed to generate advice' });
  }
});

/**
 * GET /api/mascot/holiday
 * Get current holiday information for holiday-aware thoughts
 */
router.get('/holiday', async (_req, res) => {
  try {
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
          return res.json({ holiday, isHoliday: true });
        }
      } else {
        if ((month > startMonth || (month === startMonth && day >= startDay)) ||
            (month < endMonth || (month === endMonth && day <= endDay))) {
          return res.json({ holiday, isHoliday: true });
        }
      }
    }
    
    res.json({ holiday: null, isHoliday: false });
  } catch (error) {
    console.error('[Mascot] Error checking holiday:', error);
    res.status(500).json({ error: 'Failed to check holiday' });
  }
});

/**
 * POST /api/mascot/ask
 * Alias for /advice endpoint - used by frontend hooks
 * Protected - requires authentication
 */
router.post('/ask', requireAuth, async (req, res) => {
  try {
    const { question, context, businessCategory } = req.body;
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).session?.activeWorkspaceId;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
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
    
    res.json({ 
      advice: response.text,
      category: businessCategory || 'general'
    });
  } catch (error) {
    console.error('[Mascot] Error generating advice:', error);
    res.status(500).json({ error: 'Failed to generate advice' });
  }
});

/**
 * POST /api/mascot/complete-task
 * Mark a mascot-suggested task as complete
 * Protected - requires authentication
 */
router.post('/complete-task', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.body;
    const userId = (req as any).user?.id;
    
    if (!taskId || !userId) {
      return res.status(400).json({ error: 'Task ID and user ID required' });
    }
    
    // For now, just acknowledge the completion
    // Future: integrate with gamification system
    console.log(`[Mascot] Task ${taskId} completed by user ${userId}`);
    
    res.json({ success: true, message: 'Task completed!' });
  } catch (error) {
    console.error('[Mascot] Error completing task:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// ============================================================================
// USER MASCOT PREFERENCES ENDPOINTS
// ============================================================================

/**
 * GET /api/mascot/preferences
 * Get user's mascot preferences
 * Protected - requires authentication
 */
router.get('/preferences', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const [prefs] = await db.execute(sql`
      SELECT * FROM user_mascot_preferences WHERE user_id = ${userId}
    `);
    
    if (!prefs) {
      // Return default preferences
      return res.json({
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
      });
    }
    
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('[Mascot] Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
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
    
    // Build update query dynamically based on provided fields
    const allowedFields = [
      'position_x', 'position_y', 'is_enabled', 'is_minimized', 
      'preferred_size', 'roaming_enabled', 'react_to_actions', 
      'show_thoughts', 'sound_enabled', 'nickname'
    ];
    
    const updateParts: string[] = [];
    const values: any[] = [];
    
    Object.entries(updates).forEach(([key, value]) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        updateParts.push(`${snakeKey} = $${values.length + 1}`);
        values.push(value);
      }
    });
    
    if (updateParts.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updateParts.push('updated_at = NOW()');
    values.push(userId);
    
    // Upsert: insert if not exists, update if exists
    await db.execute(sql`
      INSERT INTO user_mascot_preferences (user_id, updated_at)
      VALUES (${userId}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        ${sql.raw(updateParts.join(', ').replace(/\$(\d+)/g, (_, n) => '$' + n))}
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
    const { type } = req.body; // 'tap', 'drag', 'general'
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    let updateField = 'total_interactions';
    if (type === 'tap') updateField = 'total_taps';
    else if (type === 'drag') updateField = 'total_drags';
    
    await db.execute(sql`
      INSERT INTO user_mascot_preferences (user_id, ${sql.raw(updateField)}, total_interactions, last_interaction_at, updated_at)
      VALUES (${userId}, 1, 1, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        ${sql.raw(updateField)} = user_mascot_preferences.${sql.raw(updateField)} + 1,
        total_interactions = user_mascot_preferences.total_interactions + 1,
        last_interaction_at = NOW(),
        updated_at = NOW()
    `);
    
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

export default router;
