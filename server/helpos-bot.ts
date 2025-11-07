import { db } from './db';
import { supportTickets, helposFaqs, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import OpenAI from 'openai';

// Bot conversation states
export enum BotState {
  GREETING = 'greeting',
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
 * Initialize a new bot conversation
 */
export async function initializeBotConversation(ticketId: string, userQuery: string): Promise<BotConversation> {
  const conversation: BotConversation = {
    ticketId,
    state: BotState.GREETING,
    userQuery,
    suggestedFaqs: [],
    conversationHistory: [],
    satisfactionSignals: 0,
    escalationSignals: 0,
    lastInteraction: new Date(),
  };
  
  activeBotConversations.set(ticketId, conversation);
  return conversation;
}

/**
 * Search FAQs using semantic search
 */
async function searchFaqsForBot(query: string, limit: number = 3): Promise<Array<{ id: string; question: string; answer: string; score: number }>> {
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
 * Process user message and generate bot response
 */
export async function processBotMessage(
  ticketId: string,
  userMessage: string
): Promise<{ response: string; shouldEscalate: boolean; shouldClose: boolean; state: BotState }> {
  
  let conversation = activeBotConversations.get(ticketId);
  
  // Initialize if doesn't exist
  if (!conversation) {
    conversation = await initializeBotConversation(ticketId, userMessage);
  }
  
  // Update conversation history
  conversation.conversationHistory.push({
    role: 'user',
    message: userMessage,
    timestamp: new Date(),
  });
  conversation.lastInteraction = new Date();
  
  // Detect sentiment
  const sentiment = detectSentiment(userMessage);
  conversation.satisfactionSignals += sentiment.satisfaction;
  conversation.escalationSignals += sentiment.escalation;
  
  let response = '';
  let shouldEscalate = false;
  let shouldClose = false;
  
  // State machine logic
  switch (conversation.state) {
    case BotState.GREETING:
    case BotState.SEARCHING:
      // Search FAQs
      conversation.state = BotState.SEARCHING;
      const faqs = await searchFaqsForBot(userMessage);
      conversation.suggestedFaqs = faqs;
      
      if (faqs.length > 0 && faqs[0].score > 0.7) {
        // Found relevant answer
        conversation.state = BotState.ANSWERING;
        response = generateFaqResponse(faqs);
      } else {
        // No good answer found - escalate
        conversation.state = BotState.ESCALATING;
        response = "I couldn't find a clear answer in our knowledge base. Let me connect you with our support team who can provide personalized assistance.";
        shouldEscalate = true;
      }
      break;
      
    case BotState.ANSWERING:
    case BotState.CLARIFYING:
      // User is responding to bot's answer
      if (conversation.satisfactionSignals >= 2 || sentiment.satisfaction >= 2) {
        // User is satisfied!
        conversation.state = BotState.RESOLVED;
        response = "Great! I'm glad I could help. This ticket will be marked as resolved. If you need anything else, feel free to create a new support ticket!";
        shouldClose = true;
      } else if (conversation.escalationSignals >= 2 || sentiment.escalation >= 2) {
        // User needs human help
        conversation.state = BotState.ESCALATING;
        response = "I understand you need more help. Let me connect you with our support team right away. They'll reach out to you shortly.";
        shouldEscalate = true;
      } else {
        // Need clarification
        conversation.state = BotState.CLARIFYING;
        response = "I want to make sure I'm helping you correctly. Could you clarify what you're looking for? Or would you prefer to speak with our support team directly?";
      }
      break;
      
    case BotState.WAITING_FOR_HUMAN:
      // User is waiting for human - acknowledge
      response = "Our support team has been notified and will assist you shortly. They'll reach out via private message. Thank you for your patience!";
      break;
      
    default:
      response = "I'm here to help! What can I assist you with?";
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
