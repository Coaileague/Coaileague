import { db } from './db';
import { supportTickets, helposFaqs, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { usageMeteringService } from './services/billing/usageMetering';

// Bot conversation states
export enum BotState {
  GREETING = 'greeting',
  INTAKE_SUBJECT = 'intake_subject', // Asking for ticket subject/summary
  INTAKE_DESCRIPTION = 'intake_description', // Asking for detailed description
  INTAKE_PRIORITY = 'intake_priority', // Asking for urgency level
  CREATING_TICKET = 'creating_ticket', // Creating the support ticket
  SEARCHING = 'searching',
  ANSWERING = 'answering',
  CLARIFYING = 'clarifying',
  ESCALATING = 'escalating',
  WAITING_FOR_HUMAN = 'waiting_for_human',
  RESOLVED = 'resolved',
  ABANDONED = 'abandoned',
}

// Bot conversation context
export interface BotConversation {
  ticketId: string;
  state: BotState;
  userQuery: string;
  suggestedFaqs: Array<{ id: string; question: string; answer: string; score: number }>;
  conversationHistory: Array<{ role: 'bot' | 'user'; message: string; timestamp: Date }>;
  satisfactionSignals: number; // Positive signals counter
  escalationSignals: number; // Negative signals counter
  lastInteraction: Date;
  workspaceId?: string; // For billing tracking
  userId?: string; // For billing tracking
  // Intake data (for ticket creation)
  intakeData?: {
    subject?: string;
    description?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
}

// In-memory bot conversation store (could be moved to database for persistence)
const activeBotConversations = new Map<string, BotConversation>();

// Lazy OpenAI client initialization
let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized - API key missing');
  }
  return openaiClient;
}

// Satisfaction signals (user is happy)
const SATISFACTION_SIGNALS = [
  'thanks', 'thank you', 'perfect', 'solved', 'done', 'great', 'awesome',
  'got it', 'understand', 'clear', 'helpful', 'works', 'fixed',
  'that helps', 'appreciate', 'good', 'ok', 'okay', 'yes', 'yep', 'yeah'
];

// Escalation signals (user needs human)
const ESCALATION_SIGNALS = [
  'human', 'person', 'agent', 'representative', 'staff', 'help',
  'not working', 'still broken', 'doesn\'t work', 'confused', 'urgent',
  'escalate', 'manager', 'supervisor', 'speak to', 'talk to',
  'no', 'nope', 'wrong', 'incorrect', 'not helpful', 'doesn\'t help'
];

/**
 * Detect user sentiment from message
 */
function detectSentiment(message: string): { satisfaction: number; escalation: number } {
  const lowercaseMsg = message.toLowerCase();
  
  let satisfaction = 0;
  let escalation = 0;
  
  for (const signal of SATISFACTION_SIGNALS) {
    if (lowercaseMsg.includes(signal)) {
      satisfaction++;
    }
  }
  
  for (const signal of ESCALATION_SIGNALS) {
    if (lowercaseMsg.includes(signal)) {
      escalation++;
    }
  }
  
  return { satisfaction, escalation };
}

/**
 * Generate a unique ticket number for support tickets
 * Format: TKT-YYYY-NNNN (e.g., TKT-2025-0001)
 */
async function generateTicketNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  
  // Get the count of tickets for this workspace in the current year
  const yearStart = new Date(year, 0, 1);
  const tickets = await db.select({ ticketNumber: supportTickets.ticketNumber })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.workspaceId, workspaceId),
        sql`${supportTickets.createdAt} >= ${yearStart}`
      )
    )
    .orderBy(desc(supportTickets.createdAt))
    .limit(1);
  
  let nextNumber = 1;
  if (tickets.length > 0 && tickets[0].ticketNumber) {
    // Extract number from last ticket (e.g., "TKT-2025-0042" -> 42)
    const match = tickets[0].ticketNumber.match(/TKT-\d{4}-(\d+)/);
    if (match && match[1]) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  
  // Format: TKT-YYYY-NNNN (padded to 4 digits)
  const paddedNumber = String(nextNumber).padStart(4, '0');
  return `TKT-${year}-${paddedNumber}`;
}

/**
 * Initialize a new bot conversation
 */
export async function initializeBotConversation(
  ticketId: string, 
  userQuery: string,
  workspaceId?: string,
  userId?: string,
  startIntake: boolean = false
): Promise<BotConversation> {
  const conversation: BotConversation = {
    ticketId,
    state: startIntake ? BotState.INTAKE_SUBJECT : BotState.GREETING,
    userQuery,
    suggestedFaqs: [],
    conversationHistory: [],
    satisfactionSignals: 0,
    escalationSignals: 0,
    lastInteraction: new Date(),
    workspaceId,
    userId,
    intakeData: startIntake ? {} : undefined,
  };
  
  activeBotConversations.set(ticketId, conversation);
  return conversation;
}

/**
 * Start ticket intake flow for users without tickets
 * Returns the initial bot greeting that prompts for ticket info
 */
export function startIntakeFlow(
  conversationId: string,
  userId: string,
  workspaceId: string
): string {
  // Initialize conversation in INTAKE_SUBJECT state
  const conversation: BotConversation = {
    ticketId: conversationId,
    state: BotState.INTAKE_SUBJECT,
    userQuery: '', // Will be filled as we collect info
    suggestedFaqs: [],
    conversationHistory: [],
    satisfactionSignals: 0,
    escalationSignals: 0,
    lastInteraction: new Date(),
    workspaceId,
    userId,
    intakeData: {},
  };
  
  activeBotConversations.set(conversationId, conversation);
  
  return "👋 Welcome to CoAIleague Support! I'm HelpOS, your AI assistant.\n\nI'll help create a support ticket for you. First, can you briefly describe what you need help with? (Just a short summary)";
}

/**
 * Search FAQs using semantic search with usage tracking
 */
async function searchFaqsForBot(
  query: string, 
  limit: number = 3, 
  workspaceId?: string, 
  userId?: string
): Promise<Array<{ id: string; question: string; answer: string; score: number }>> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return [];
    }
    
    const openai = getOpenAIClient();
    
    // Generate query embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    
    // CRITICAL: Track embedding token usage for billing
    const tokensUsed = embeddingResponse.usage?.total_tokens || 0;
    if (tokensUsed > 0 && workspaceId) {
      await usageMeteringService.recordUsage({
        workspaceId,
        userId,
        featureKey: 'helpdesk_ai_embedding',
        usageType: 'token',
        usageAmount: tokensUsed,
        usageUnit: 'tokens',
        activityType: 'faq_semantic_search',
        metadata: {
          model: 'text-embedding-3-small',
          queryLength: query.length,
        }
      });
      console.log(`💰 HelpOS FAQ Search - Embedding generated (${tokensUsed} tokens) - Billed to workspace: ${workspaceId}`);
    }
    
    const queryEmbedding = embeddingResponse.data[0].embedding;
    
    // Perform semantic search using PostgreSQL pgvector
    const results = await db.execute(sql`
      SELECT 
        id,
        question,
        answer,
        category,
        tags,
        1 - (embedding_vector <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity_score
      FROM helpos_faqs
      WHERE is_published = true
      ORDER BY embedding_vector <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);
    
    return results.rows.map((row: any) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      score: parseFloat(row.similarity_score),
    }));
  } catch (error) {
    console.error('Error searching FAQs for bot:', error);
    return [];
  }
}

/**
 * Generate bot greeting message
 */
export function generateGreeting(): string {
  return "Hello! I'm the HelpOS assistant. I'll do my best to help you right away. If I can't resolve your issue, I'll connect you with our support team. What can I help you with?";
}

/**
 * Generate bot response based on FAQs
 */
function generateFaqResponse(faqs: Array<{ question: string; answer: string; score: number }>): string {
  if (faqs.length === 0) {
    return "I searched our knowledge base but couldn't find a direct answer to your question. Let me connect you with our support team who can help you better.";
  }
  
  const topFaq = faqs[0];
  
  if (topFaq.score > 0.85) {
    // High confidence - present answer directly
    return `I found this in our knowledge base:\n\n**${topFaq.question}**\n\n${topFaq.answer}\n\nDoes this answer your question?`;
  } else if (topFaq.score > 0.7) {
    // Medium confidence - present with caveat
    return `I found something that might help:\n\n**${topFaq.question}**\n\n${topFaq.answer}\n\nIs this what you were looking for, or should I connect you with our support team?`;
  } else {
    // Low confidence - offer alternatives
    return `I found a few related topics, but I'm not sure if they match your question:\n\n**${topFaq.question}**\n\nWould you like to see this answer, or shall I connect you with our support team for more specific help?`;
  }
}

/**
 * Bot workflow tools - commands bot can use to assist users
 */
export const BOT_TOOLS = {
  searchKnowledgeBase: async (query: string, workspaceId?: string, userId?: string) => 
    await searchFaqsForBot(query, 3, workspaceId, userId),
  detectUserSentiment: (message: string) => detectSentiment(message),
  checkTicketStatus: async (ticketId: string) => {
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    return ticket[0] || null;
  },
  formatFaqAnswer: (faqs: Array<{ question: string; answer: string; score: number }>) => generateFaqResponse(faqs),
};

/**
 * Bot decision logic - determines next action based on context
 */
function determineBotAction(
  conversation: BotConversation,
  userMessage: string
): { action: 'search' | 'present_answer' | 'clarify' | 'escalate' | 'close'; confidence: number } {
  
  // Check if user is satisfied (2+ satisfaction signals)
  if (conversation.satisfactionSignals >= 2) {
    return { action: 'close', confidence: 0.9 };
  }
  
  // Check if user wants escalation (2+ escalation signals)
  if (conversation.escalationSignals >= 2) {
    return { action: 'escalate', confidence: 0.9 };
  }
  
  // If we have FAQs and user is asking follow-up question
  if (conversation.suggestedFaqs.length > 0 && conversation.state === BotState.ANSWERING) {
    const topScore = conversation.suggestedFaqs[0]?.score || 0;
    if (topScore < 0.7) {
      return { action: 'escalate', confidence: 0.8 }; // Low confidence FAQs = escalate
    }
    return { action: 'clarify', confidence: 0.75 };
  }
  
  // If greeting state, search for answers
  if (conversation.state === BotState.GREETING || conversation.state === BotState.SEARCHING) {
    return { action: 'search', confidence: 0.95 };
  }
  
  // Default: search for new answer
  return { action: 'search', confidence: 0.7 };
}

/**
 * Process user message and generate bot response
 */
export async function processBotMessage(
  ticketId: string,
  userMessage: string,
  workspaceId?: string,
  userId?: string
): Promise<{ response: string; shouldEscalate: boolean; shouldClose: boolean; state: BotState }> {
  
  let conversation = activeBotConversations.get(ticketId);
  
  // Initialize if doesn't exist
  if (!conversation) {
    conversation = await initializeBotConversation(ticketId, userMessage, workspaceId, userId);
  } else {
    // CRITICAL: Don't reinitialize - preserve existing state and intakeData
    // Just update workspace/user context if provided
    if (workspaceId && !conversation.workspaceId) {
      conversation.workspaceId = workspaceId;
    }
    if (userId && !conversation.userId) {
      conversation.userId = userId;
    }
    // Preserve existing intakeData if in intake flow
    // (Don't overwrite with new initialization)
  }
  
  // Update conversation history
  conversation.conversationHistory.push({
    role: 'user',
    message: userMessage,
    timestamp: new Date(),
  });
  conversation.lastInteraction = new Date();
  
  // CRITICAL: Skip sentiment detection during intake flow
  // Prevents premature escalation before ticket creation completes
  const isIntakeFlow = [
    BotState.INTAKE_SUBJECT,
    BotState.INTAKE_DESCRIPTION,
    BotState.INTAKE_PRIORITY,
    BotState.CREATING_TICKET
  ].includes(conversation.state);
  
  if (!isIntakeFlow) {
    // Detect sentiment only after intake completes
    const sentiment = detectSentiment(userMessage);
    conversation.satisfactionSignals += sentiment.satisfaction;
    conversation.escalationSignals += sentiment.escalation;
  }
  
  let response = '';
  let shouldEscalate = false;
  let shouldClose = false;
  
  // State machine logic
  switch (conversation.state) {
    case BotState.INTAKE_SUBJECT:
      // Collect subject from user
      if (!conversation.intakeData) {
        conversation.intakeData = {};
      }
      conversation.intakeData.subject = userMessage.trim();
      conversation.state = BotState.INTAKE_DESCRIPTION;
      response = "Got it! Now, please describe your issue in detail. What's happening, and when did it start?";
      break;
      
    case BotState.INTAKE_DESCRIPTION:
      // Collect description from user
      if (!conversation.intakeData) {
        conversation.intakeData = {};
      }
      conversation.intakeData.description = userMessage.trim();
      conversation.state = BotState.INTAKE_PRIORITY;
      response = "Thanks for the details. How urgent is this issue?\n\nPlease respond with:\n• **urgent** - Needs immediate attention\n• **high** - Important but not critical\n• **normal** - Standard priority\n• **low** - Can wait";
      break;
      
    case BotState.INTAKE_PRIORITY:
      // Collect priority and create ticket with validation
      const priorityMap: Record<string, 'urgent' | 'high' | 'normal' | 'low'> = {
        'urgent': 'urgent',
        'high': 'high',
        'normal': 'normal',
        'low': 'low',
        '1': 'urgent',
        '2': 'high',
        '3': 'normal',
        '4': 'low',
        'critical': 'urgent',
        'important': 'high',
        'medium': 'normal',
        'minor': 'low',
      };
      
      const userPriority = (userMessage || '').trim().toLowerCase();
      // Safe priority parsing with explicit default
      const priority: 'urgent' | 'high' | 'normal' | 'low' = 
        priorityMap[userPriority] !== undefined 
          ? priorityMap[userPriority] 
          : 'normal';
      
      if (!conversation.intakeData) {
        conversation.intakeData = {};
      }
      conversation.intakeData.priority = priority;
      
      // Move to ticket creation
      conversation.state = BotState.CREATING_TICKET;
      response = `Perfect! Creating your support ticket with **${priority}** priority. I'll search our knowledge base while your ticket is being processed...`;
      
      // Create the ticket (will be handled after this switch)
      break;
      
    case BotState.CREATING_TICKET:
      // Ticket should have been created, move to search mode
      conversation.state = BotState.SEARCHING;
      // Fall through to search logic
      
    case BotState.GREETING:
    case BotState.SEARCHING:
      // Search FAQs
      conversation.state = BotState.SEARCHING;
      const faqs = await searchFaqsForBot(userMessage, 3, conversation.workspaceId, conversation.userId);
      conversation.suggestedFaqs = faqs;
      
      if (faqs.length > 0 && faqs[0].score > 0.7) {
        // Found relevant answer
        conversation.state = BotState.ANSWERING;
        response = generateFaqResponse(faqs);
      } else {
        // No good answer found - escalate
        conversation.state = BotState.ESCALATING;
        response = "I couldn't find a clear answer in our knowledge base. **Redirecting you to the main HelpDesk** where our support team can provide personalized assistance...";
        shouldEscalate = true;
      }
      break;
      
    case BotState.ANSWERING:
    case BotState.CLARIFYING:
      // User is responding to bot's answer
      // Use accumulated signals from conversation object (sentiment was already added at line 385-386)
      if (conversation.satisfactionSignals >= 2) {
        // User is satisfied!
        conversation.state = BotState.RESOLVED;
        response = "Great! I'm glad I could help. This ticket will be marked as resolved. If you need anything else, feel free to create a new support ticket!";
        shouldClose = true;
      } else if (conversation.escalationSignals >= 2) {
        // User needs human help
        conversation.state = BotState.ESCALATING;
        response = "I understand you need more help. **Redirecting you to our main HelpDesk** where our support team is standing by to assist you...";
        shouldEscalate = true;
      } else {
        // Need clarification
        conversation.state = BotState.CLARIFYING;
        response = "I want to make sure I'm helping you correctly. Could you clarify what you're looking for? Or would you prefer to speak with our support team directly?";
      }
      break;
      
    case BotState.WAITING_FOR_HUMAN:
      // User is waiting for human - acknowledge
      response = "You're now in the main HelpDesk! Our support team has been notified and will assist you shortly. Thank you for your patience!";
      break;
      
    default:
      response = "I'm here to help! What can I assist you with?";
  }
  
  // Handle ticket creation if in CREATING_TICKET state
  if (conversation.state === BotState.CREATING_TICKET && conversation.intakeData) {
    const { subject, description, priority } = conversation.intakeData;
    
    if (subject && description && priority && workspaceId && userId) {
      try {
        // Generate unique ticket number
        const ticketNumber = await generateTicketNumber(workspaceId);
        
        // Create the support ticket
        await db.insert(supportTickets).values({
          workspaceId,
          ticketNumber,
          type: 'support',
          priority,
          subject,
          description,
          requestedBy: userId, // Store the user who created it
          status: 'open',
        });
        
        // Clear intake data and move to searching state
        conversation.intakeData = undefined;
        conversation.state = BotState.SEARCHING;
        
        // Update response to include ticket number
        response += `\n\n✅ **Ticket ${ticketNumber}** created successfully! Let me search for answers to your issue...`;
      } catch (error) {
        console.error('Error creating support ticket:', error);
        response = "I encountered an error creating your ticket. **Redirecting you to the main HelpDesk** where a support agent can assist you directly...";
        shouldEscalate = true;
        conversation.state = BotState.ESCALATING;
      }
    } else {
      // Missing required data - fall back to escalation
      response = "I'm missing some information to create your ticket. **Redirecting you to the main HelpDesk** where a support agent can help...";
      shouldEscalate = true;
      conversation.state = BotState.ESCALATING;
    }
  }
  
  // Record bot response
  conversation.conversationHistory.push({
    role: 'bot',
    message: response,
    timestamp: new Date(),
  });
  
  activeBotConversations.set(ticketId, conversation);
  
  return {
    response,
    shouldEscalate,
    shouldClose,
    state: conversation.state,
  };
}

/**
 * Close ticket successfully and generate FAQ suggestion
 */
export async function closeBotTicketSuccess(
  ticketId: string,
  userId: string
): Promise<{ faqSuggestion: any | null; conversationSummary: string }> {
  
  const conversation = activeBotConversations.get(ticketId);
  
  if (!conversation) {
    return {
      faqSuggestion: null,
      conversationSummary: 'Bot conversation not found',
    };
  }
  
  // Mark conversation as resolved
  conversation.state = BotState.RESOLVED;
  activeBotConversations.set(ticketId, conversation);
  
  // Generate conversation summary
  const conversationSummary = `Bot successfully resolved user query.\n\nOriginal Query: ${conversation.userQuery}\n\nResolution: ${conversation.suggestedFaqs[0]?.question || 'Custom response'}\n\nConversation turns: ${conversation.conversationHistory.length}`;
  
  // Update ticket status
  await db.update(supportTickets)
    .set({
      status: 'closed',
      resolution: conversationSummary,
      resolutionSummary: `Resolved by HelpOS bot - user confirmed satisfaction`,
      closedAt: new Date(),
      closedBy: 'helpos-bot',
    })
    .where(eq(supportTickets.id, ticketId));
  
  // Generate FAQ suggestion if conversation was valuable
  let faqSuggestion = null;
  
  if (process.env.OPENAI_API_KEY && conversation.conversationHistory.length >= 3) {
    try {
      const openai = getOpenAIClient();
      
      const conversationText = conversation.conversationHistory
        .map(msg => `${msg.role === 'bot' ? 'Bot' : 'User'}: ${msg.message}`)
        .join('\n');
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates clear FAQ entries from successful support bot conversations. Return JSON with: question, answer, category (billing/technical/account/features/general), tags (array of 3-5 keywords).'
          },
          {
            role: 'user',
            content: `Successful bot conversation:\n\n${conversationText}\n\nCreate a helpful FAQ entry.`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
      
      faqSuggestion = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: `${faqSuggestion.question} ${faqSuggestion.answer}`,
      });
      
      faqSuggestion.embeddingVector = JSON.stringify(embeddingResponse.data[0].embedding);
      faqSuggestion.isPublished = false; // Requires staff review
      faqSuggestion.sourceTicketId = ticketId;
      
    } catch (error) {
      console.error('Error generating FAQ suggestion:', error);
    }
  }
  
  // Clean up conversation
  activeBotConversations.delete(ticketId);
  
  return {
    faqSuggestion,
    conversationSummary,
  };
}

/**
 * Escalate ticket to human support
 */
export async function escalateBotTicket(
  ticketId: string,
  reason: string = 'Bot unable to resolve'
): Promise<void> {
  
  let conversation = activeBotConversations.get(ticketId);
  
  if (!conversation) {
    // Initialize conversation if it doesn't exist
    conversation = {
      ticketId,
      state: BotState.WAITING_FOR_HUMAN,
      userQuery: '',
      suggestedFaqs: [],
      conversationHistory: [],
      satisfactionSignals: 0,
      escalationSignals: 0,
      lastInteraction: new Date(),
    };
  } else {
    conversation.state = BotState.WAITING_FOR_HUMAN;
  }
  
  activeBotConversations.set(ticketId, conversation);
  
  // Update ticket with escalation note
  await db.update(supportTickets)
    .set({
      status: 'in_progress',
      assignedTo: null, // Will be picked up by next available agent
    })
    .where(eq(supportTickets.id, ticketId));
}

/**
 * Notify all support staff of escalation via notification system
 * This ensures agents get notified even if they're not in the HelpDesk chat
 */
export async function notifySupportStaffOfEscalation(
  ticketId: string,
  ticketTitle: string,
  userQuery: string
): Promise<void> {
  try {
    // Import storage dynamically to avoid circular dependencies
    const { storage } = await import('./storage');
    const { notifications } = await import('@shared/schema');
    
    // Get all platform support staff (ROOT_ADMIN, DEPUTY_ADMIN, DEPUTY_ASSISTANT)
    const supportStaff = await db.execute(sql`
      SELECT u.id, u.current_workspace_id
      FROM users u
      INNER JOIN platform_roles pr ON pr.user_id = u.id
      WHERE pr.role IN ('root_admin', 'deputy_admin', 'deputy_assistant', 'sysop')
      AND pr.is_active = true
    `);
    
    // Create notification for each support staff member
    for (const staff of supportStaff.rows as any[]) {
      await storage.createNotification({
        workspaceId: staff.current_workspace_id || 'platform-external',
        userId: staff.id,
        type: 'support_escalation',
        title: `Support Ticket Escalated: ${ticketTitle}`,
        message: `HelpOS bot escalated ticket to human support.\n\n**User Query:** ${userQuery}\n\n**Ticket ID:** ${ticketId}\n\nPlease review and assist the user.`,
        actionUrl: `/helpdesk?ticket=${ticketId}`,
        relatedEntityType: 'support_ticket',
        relatedEntityId: ticketId,
        metadata: {
          ticketId,
          escalationReason: 'Bot unable to resolve',
          botAttempted: true,
        },
      });
    }
    
    console.log(`✅ Notified ${supportStaff.rows.length} support staff members of escalation for ticket ${ticketId}`);
  } catch (error) {
    console.error('Error notifying support staff of escalation:', error);
    // Don't throw - escalation should still work even if notifications fail
  }
}

/**
 * Get bot conversation state
 */
export function getBotConversation(ticketId: string): BotConversation | undefined {
  return activeBotConversations.get(ticketId);
}

/**
 * Check if bot is enabled (can be controlled by settings)
 */
export function isBotEnabled(): boolean {
  // TODO: Add database setting to enable/disable bot
  // For now, bot is enabled if OpenAI key is present
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Get bot stats for monitoring
 */
export function getBotStats() {
  const activeConversations = activeBotConversations.size;
  const states = Array.from(activeBotConversations.values()).reduce((acc, conv) => {
    acc[conv.state] = (acc[conv.state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    activeConversations,
    conversationsByState: states,
    isEnabled: isBotEnabled(),
  };
}
