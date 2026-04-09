// AI-Powered Smart Support Knowledge Base Routes
// Intelligent FAQ system with semantic search using AI embeddings

import { sanitizeError } from '../middleware/errorHandler';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { db } from '../db';
import { helposFaqs, insertHelposFaqSchema, faqSearchHistory, insertFaqSearchHistorySchema } from '@shared/schema';
import { requireAuth } from '../auth';
import { requirePlatformStaff, isPlatformStaff, type AuthenticatedRequest } from '../rbac';
import { readLimiter } from '../middleware/rateLimiter';
import { eq, desc, sql, like, or, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import OpenAI from 'openai';
import { ChatServerHub } from '../services/ChatServerHub';
import { geminiClient } from '../services/ai-brain/providers/geminiClient';
import { getMeteredOpenAICompletion } from '../services/billing/universalAIBillingInterceptor';
import { AI, PLATFORM } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('FaqRoutes');


let openaiEmbeddingClient: OpenAI | null = null;
function getEmbeddingClient(): OpenAI | null {
  if (!openaiEmbeddingClient && process.env.OPENAI_API_KEY) {
    openaiEmbeddingClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  if (!openaiEmbeddingClient) {
    log.warn('[FAQ] OpenAI embedding client not available - API key not configured');
    return null;
  }
  return openaiEmbeddingClient;
}

async function checkSupportPoolAvailable(): Promise<boolean> {
  try {
    const { creditManager } = await import('../services/billing/creditManager');
    return creditManager.checkSupportPoolAvailable();
  } catch {
    return true;
  }
}

export function registerFaqRoutes(app: Express) {
  // ============================================================================
  // FAQ CRUD Operations
  // ============================================================================

  // Get all FAQs (filtered by publish status for non-staff users)
  app.get('/api/helpos/faqs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { category, search, limit = 50, includeUnpublished } = req.query;
    
    // Use canonical staff detection from rbac.ts
    const showUnpublished = isPlatformStaff(req.user) && includeUnpublished === 'true';

    // Build base query with all records
    let query = db.select().from(helposFaqs);

    // Build where conditions using Drizzle's and() function
    const conditions: any[] = [];
    
    // Filter by published status (unless staff requesting unpublished)
    if (!showUnpublished) {
      conditions.push(eq(helposFaqs.isPublished, true));
    }

    // Filter by category if provided
    if (category && typeof category === 'string') {
      conditions.push(eq(helposFaqs.category, category));
    }

    // Search by question or answer text
    if (search && typeof search === 'string') {
      conditions.push(
        or(
          like(helposFaqs.question, `%${search}%`),
          like(helposFaqs.answer, `%${search}%`)
        )
      );
    }

    // Apply all conditions together using Drizzle's and() combinator
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as any;
    }

    const faqs = await query.orderBy(desc(helposFaqs.viewCount)).limit(Math.min(Math.max(1, Number(limit) || 20), 100));
    res.json(faqs);
  } catch (error: unknown) {
    log.error('Error fetching FAQs:', error);
    res.status(500).json({ message: 'Failed to fetch FAQs', error: sanitizeError(error) });
  }
});

// Get single FAQ by ID
app.get('/api/helpos/faqs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const faq = await db.select()
      .from(helposFaqs)
      .where(eq(helposFaqs.id, id))
      .limit(1);

    if (!faq || faq.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    // Block access to unpublished FAQs for non-staff users (use canonical staff check)
    if (!faq[0].isPublished && !isPlatformStaff(req.user)) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    // Increment view count
    await db.update(helposFaqs)
      .set({ viewCount: sql`${helposFaqs.viewCount} + 1` })
      .where(eq(helposFaqs.id, id));

    res.json(faq[0]);
  } catch (error: unknown) {
    log.error('Error fetching FAQ:', error);
    res.status(500).json({ message: 'Failed to fetch FAQ', error: sanitizeError(error) });
  }
});

// Create new FAQ (platform staff only)
app.post('/api/helpos/faqs', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const validatedData = insertHelposFaqSchema.parse(req.body);

    // Generate embedding for semantic search using OpenAI
    let embeddingVector: string | null = null;
    if (process.env.OPENAI_API_KEY) {
      const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId || null;
      const poolAvailable = await checkSupportPoolAvailable();
      if (!poolAvailable) {
        return res.status(503).json({ message: 'Support AI temporarily unavailable' });
      }
      try {
        const embeddingText = `${validatedData.question} ${validatedData.answer}`;
        const client = getEmbeddingClient();
        if (!client) throw new Error('Embedding client not available');
        const embeddingResponse = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: embeddingText,
        });
        embeddingVector = JSON.stringify(embeddingResponse.data[0].embedding);
        const { creditManager } = await import('../services/billing/creditManager');
        await creditManager.deductSupportPoolCredits('faq_embedding', 'FAQ Create Embedding', wsId || undefined, req.user?.id);
      } catch (embeddingError) {
        log.error('Error generating embedding:', embeddingError);
      }
    }

    const newFaq = await db.insert(helposFaqs).values({
      category: validatedData.category,
      question: validatedData.question,
      answer: validatedData.answer,
      tags: validatedData.tags || [],
      embeddingVector: embeddingVector,
      viewCount: 0,
      helpfulCount: 0,
    }).returning();

    res.status(201).json(newFaq[0]);
  } catch (error: unknown) {
    log.error('Error creating FAQ:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to create FAQ', error: sanitizeError(error) });
  }
});

// Update FAQ (platform staff only)
app.patch('/api/helpos/faqs/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If question or answer changed, regenerate embedding
    let embeddingVector: string | null | undefined = undefined;
    if ((updateData.question || updateData.answer) && process.env.OPENAI_API_KEY) {
      const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId || null;
      const poolAvailable = await checkSupportPoolAvailable();
      if (!poolAvailable) {
        return res.status(503).json({ message: 'Support AI temporarily unavailable' });
      }
      try {
        // Fetch existing FAQ to get current values
        const existing = await db.select()
          .from(helposFaqs)
          .where(eq(helposFaqs.id, id))
          .limit(1);

        if (existing.length === 0) {
          return res.status(404).json({ message: 'FAQ not found' });
        }

        const question = updateData.question || existing[0].question;
        const answer = updateData.answer || existing[0].answer;
        const embeddingText = `${question} ${answer}`;

        const client = getEmbeddingClient();
        if (!client) throw new Error('Embedding client not available');
        const embeddingResponse = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: embeddingText,
        });
        embeddingVector = JSON.stringify(embeddingResponse.data[0].embedding);
        const { creditManager } = await import('../services/billing/creditManager');
        await creditManager.deductSupportPoolCredits('faq_embedding', 'FAQ Update Embedding', wsId || undefined, req.user?.id);
      } catch (embeddingError) {
        log.error('Error generating embedding:', embeddingError);
      }
    }

    const updatedFaq = await db.update(helposFaqs)
      .set({
        ...updateData,
        ...(embeddingVector !== undefined && { embeddingVector }),
        updatedAt: new Date(),
      })
      .where(eq(helposFaqs.id, id))
      .returning();

    if (!updatedFaq || updatedFaq.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json(updatedFaq[0]);
  } catch (error: unknown) {
    log.error('Error updating FAQ:', error);
    res.status(500).json({ message: 'Failed to update FAQ', error: sanitizeError(error) });
  }
});

// Delete FAQ (platform staff only)
app.delete('/api/helpos/faqs/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const deletedFaq = await db.delete(helposFaqs)
      .where(eq(helposFaqs.id, id))
      .returning();

    if (!deletedFaq || deletedFaq.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json({ message: 'FAQ deleted successfully', faq: deletedFaq[0] });
  } catch (error: unknown) {
    log.error('Error deleting FAQ:', error);
    res.status(500).json({ message: 'Failed to delete FAQ', error: sanitizeError(error) });
  }
});

// Mark FAQ as helpful
app.post('/api/helpos/faqs/:id/helpful', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const updatedFaq = await db.update(helposFaqs)
      .set({ helpfulCount: sql`${helposFaqs.helpfulCount} + 1` })
      .where(eq(helposFaqs.id, id))
      .returning();

    if (!updatedFaq || updatedFaq.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json(updatedFaq[0]);
  } catch (error: unknown) {
    log.error('Error marking FAQ as helpful:', error);
    res.status(500).json({ message: 'Failed to mark FAQ as helpful', error: sanitizeError(error) });
  }
});

// ============================================================================
// Semantic Search (AI-powered)
// ============================================================================

// Cosine similarity helper function
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search FAQs using OpenAI semantic search
app.post('/api/helpos/faqs/search/semantic', readLimiter, requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Query is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ message: 'Semantic search not available - OpenAI API key not configured' });
    }

    // Use canonical staff detection from rbac.ts
    const canSearchUnpublished = isPlatformStaff(req.user);

    const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId || null;
    const poolAvailable = await checkSupportPoolAvailable();
    if (!poolAvailable) {
      return res.status(503).json({ message: 'Support AI temporarily unavailable' });
    }

    // Generate embedding for the user's query
    const embeddingClient = getEmbeddingClient();
    if (!embeddingClient) {
      return res.status(503).json({ error: 'AI FAQ service is not available - embedding client not configured' });
    }
    const queryEmbedding = await embeddingClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryVector = queryEmbedding.data[0].embedding;

    // Fetch all FAQs with embeddings (filter by publish status for non-staff)
    const allFaqs = await db.select()
      .from(helposFaqs)
      .where(
        canSearchUnpublished 
          ? sql`${helposFaqs.embeddingVector} IS NOT NULL`
          : sql`${helposFaqs.embeddingVector} IS NOT NULL AND ${helposFaqs.isPublished} = true`
      );

    // Calculate cosine similarity for each FAQ
    const faqsWithSimilarity = allFaqs.map(faq => {
      const faqVector = JSON.parse(faq.embeddingVector!);
      const similarity = cosineSimilarity(queryVector, faqVector);
      return {
        ...faq,
        similarity,
        embeddingVector: undefined, // Don't send embeddings to client
      };
    });

    // Sort by similarity and return top results
    const topFaqs = faqsWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Number(limit));

    try {
      const { creditManager } = await import('../services/billing/creditManager');
      await creditManager.deductSupportPoolCredits('faq_embedding', 'FAQ Semantic Search Embedding', wsId || undefined);
    } catch (billingErr: unknown) {
      log.error('[FAQ AI] Support pool deduction failed:', billingErr);
    }

    res.json(topFaqs);
  } catch (error: unknown) {
    log.error('Error performing semantic search:', error);
    res.status(500).json({ message: 'Failed to perform semantic search', error: sanitizeError(error) });
  }
});

// Get FAQ categories (for filtering)
app.get('/api/helpos/faqs/categories/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const categories = await db.selectDistinct({ category: helposFaqs.category })
      .from(helposFaqs)
      .orderBy(helposFaqs.category);

    res.json(categories.map(c => c.category));
  } catch (error: unknown) {
    log.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories', error: sanitizeError(error) });
  }
});

// ============================================================================
// AI-POWERED FAQ AUTO-GENERATION
// ============================================================================

// Generate FAQ suggestion from support ticket resolution
app.post('/api/helpos/faqs/generate/from-ticket', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { ticketId } = req.body;

    if (!ticketId) {
      return res.status(400).json({ message: 'Ticket ID is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ message: 'AI generation not available - OpenAI API key not configured' });
    }

    // Fetch the support ticket with resolution
    const ticket = await db.query.supportTickets.findFirst({
      where: eq((await import('@shared/schema')).supportTickets.id, ticketId),
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Support ticket not found' });
    }

    if (!ticket.resolution && !ticket.resolutionSummary) {
      return res.status(400).json({ message: 'Ticket must have a resolution to generate FAQ' });
    }

    const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId || null;
    const poolAvailable = await checkSupportPoolAvailable();
    if (!poolAvailable) {
      return res.status(503).json({ message: 'Support AI temporarily unavailable' });
    }

    // Use OpenAI to generate FAQ from ticket
    const result = await getMeteredOpenAICompletion({
      workspaceId: wsId || undefined,
      userId: req.user?.id,
      featureKey: 'faq_chat',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates clear, concise FAQ entries from support ticket resolutions. Create a question-answer pair that would help other users with similar issues. Return JSON with: question, answer, category (one of: billing, technical, account, features, general), tags (array of 3-5 relevant keywords).'
        },
        {
          role: 'user',
          content: `Support Ticket:\nSubject: ${ticket.subject}\nDescription: ${ticket.description}\nResolution: ${ticket.resolutionSummary || ticket.resolution}\n\nCreate a helpful FAQ entry from this.`
        }
      ],
      model: 'gpt-4o-mini',
      maxTokens: 500,
      jsonMode: true,
      temperature: 0.7,
    });

    if (result.blocked || !result.success) {
      return res.status(503).json({ message: result.error || 'AI service unavailable' });
    }

    const suggestion = JSON.parse(result.content || '{}');

    // Generate embedding for the suggested answer
    const embClient = getEmbeddingClient();
    if (!embClient) {
      return res.status(503).json({ error: 'AI FAQ service is not available - embedding client not configured' });
    }
    const embeddingResponse = await embClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: `${suggestion.question} ${suggestion.answer}`,
    });

    res.json({
      suggestion: {
        ...suggestion,
        embeddingVector: JSON.stringify(embeddingResponse.data[0].embedding),
        sourceTicketId: ticketId,
        isPublished: false, // Default to draft
      }
    });
  } catch (error: unknown) {
    log.error('Error generating FAQ from ticket:', error);
    res.status(500).json({ message: 'Failed to generate FAQ suggestion', error: sanitizeError(error) });
  }
});

// Generate FAQ suggestion from free-form Q&A (for manual entry during support)
app.post('/api/helpos/faqs/generate/from-conversation', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { question, answer, context } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ message: 'AI generation not available - OpenAI API key not configured' });
    }

    const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId || null;
    const poolAvailable = await checkSupportPoolAvailable();
    if (!poolAvailable) {
      return res.status(503).json({ message: 'Support AI temporarily unavailable' });
    }

    // Use OpenAI to refine and categorize the FAQ
    const result = await getMeteredOpenAICompletion({
      workspaceId: wsId || undefined,
      userId: req.user?.id,
      featureKey: 'faq_chat',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that refines and categorizes FAQ entries. Improve the question and answer for clarity, and suggest a category and tags. Return JSON with: question (refined), answer (refined), category (one of: billing, technical, account, features, general), tags (array of 3-5 relevant keywords).'
        },
        {
          role: 'user',
          content: `Question: ${question}\nAnswer: ${answer}${context ? `\nContext: ${context}` : ''}\n\nRefine this into a clear FAQ entry.`
        }
      ],
      model: 'gpt-4o-mini',
      maxTokens: 500,
      jsonMode: true,
      temperature: 0.7,
    });

    if (result.blocked || !result.success) {
      return res.status(503).json({ message: result.error || 'AI service unavailable' });
    }

    const refined = JSON.parse(result.content || '{}');

    // Generate embedding
    const embClient2 = getEmbeddingClient();
    if (!embClient2) {
      return res.status(503).json({ error: 'AI FAQ service is not available - embedding client not configured' });
    }
    const embeddingResponse = await embClient2.embeddings.create({
      model: 'text-embedding-3-small',
      input: `${refined.question} ${refined.answer}`,
    });

    res.json({
      suggestion: {
        ...refined,
        embeddingVector: JSON.stringify(embeddingResponse.data[0].embedding),
        isPublished: false,
      }
    });
  } catch (error: unknown) {
    log.error('Error generating FAQ from conversation:', error);
    res.status(500).json({ message: 'Failed to generate FAQ suggestion', error: sanitizeError(error) });
  }
});

// Bulk import FAQs (for new feature releases)
app.post('/api/helpos/faqs/bulk-import', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { faqs } = req.body;

    if (!Array.isArray(faqs) || faqs.length === 0) {
      return res.status(400).json({ message: 'FAQs array is required and must not be empty' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ message: 'Bulk import requires OpenAI API key for generating embeddings' });
    }

    const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId || null;
    const poolAvailable = await checkSupportPoolAvailable();
    if (!poolAvailable) {
      return res.status(503).json({ message: 'Support AI temporarily unavailable' });
    }

    const bulkEmbeddingClient = getEmbeddingClient();
    if (!bulkEmbeddingClient) {
      return res.status(503).json({ error: 'AI FAQ service is not available - embedding client not configured' });
    }
    const createdFaqs = [];
    const errors = [];

    for (const faq of faqs) {
      try {
        // Validate FAQ structure
        const validated = insertHelposFaqSchema.omit({ id: true }).parse({
          category: faq.category || 'general',
          question: faq.question,
          answer: faq.answer,
          tags: faq.tags || [],
          searchKeywords: faq.searchKeywords || null,
          isPublished: faq.isPublished ?? true,
          createdBy: req.user?.id,
          updatedBy: req.user?.id,
        });

        // Generate embedding
        const embeddingResponse = await bulkEmbeddingClient.embeddings.create({
          model: 'text-embedding-3-small',
          input: `${validated.question} ${validated.answer}`,
        });

        // Create FAQ
        const [created] = await db.insert(helposFaqs).values({
          ...validated,
          embeddingVector: JSON.stringify(embeddingResponse.data[0].embedding),
        }).returning();

        createdFaqs.push(created);
      } catch (error: unknown) {
        errors.push({
          question: faq.question?.substring(0, 50) || 'Unknown',
          error: sanitizeError(error),
        });
      }
    }

    if (createdFaqs.length > 0) {
      try {
        const { creditManager } = await import('../services/billing/creditManager');
        await creditManager.deductSupportPoolCredits('faq_embedding', 'FAQ Bulk Import Embeddings', wsId || undefined);
      } catch (billingErr: unknown) {
        log.error('[FAQ AI] Support pool deduction failed:', billingErr);
      }
    }

    res.json({
      success: true,
      created: createdFaqs.length,
      errors: errors.length,
      details: {
        createdFaqs: createdFaqs.map(f => ({ id: f.id, question: f.question })),
        errors,
      }
    });
  } catch (error: unknown) {
    log.error('Error bulk importing FAQs:', error);
    res.status(500).json({ message: 'Failed to bulk import FAQs', error: sanitizeError(error) });
  }
});

// ============================================================================
// GEMINI-POWERED FAQ SEARCH WITH ANALYTICS & CHAT INTEGRATION
// ============================================================================

/**
 * Search FAQs using Gemini semantic understanding
 * GET /api/ai/faq/search?query=...&conversationId=...&limit=5&workspaceId=...
 * 
 * Returns:
 * - Matching FAQs with confidence scores
 * - Stores search history for analytics
 * - Emits ai_suggestion events to chatroom if conversationId provided
 */
app.get('/api/ai/faq/search', readLimiter, requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { query, conversationId, limit = 5, workspaceId } = req.query;

    // Validate required parameters
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Query parameter is required and must be a non-empty string' 
      });
    }

    const searchLimit = Math.min(Number(limit) || 5, 20); // Cap at 20 results
    const wsId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const convId = (conversationId as string) || undefined;

    log.info(`🔍 [FAQ Search] Query: "${query}" - Limit: ${searchLimit}${convId ? ` - ConvId: ${convId}` : ''}`);

    const poolAvailable = await checkSupportPoolAvailable();
    if (!poolAvailable) {
      return res.status(503).json({ message: 'Support AI temporarily unavailable' });
    }

    // Step 1: Get all published FAQs
    const allFaqs = await db.select()
      .from(helposFaqs)
      .where(eq(helposFaqs.isPublished, true));

    if (allFaqs.length === 0) {
      // Store search history even with no results
      await db.insert(faqSearchHistory).values({
        query: query.trim(),
        workspaceId: wsId || null,
        userId: req.user?.id || null,
        conversationId: convId || null,
        matchedFaqIds: [],
        matchCount: 0,
        topConfidenceScore: 0,
        averageConfidenceScore: 0,
        searchMethod: 'semantic',
        tokensUsed: 0,
        suggestionEmitted: false,
      });

      return res.json({
        query: query.trim(),
        matchCount: 0,
        results: [],
        topConfidenceScore: 0,
        averageConfidenceScore: 0,
      });
    }

    // Step 2: Use Gemini to rank FAQs by relevance
    // Build FAQ context for Gemini
    const faqContext = allFaqs
      .map((faq, idx) => `[${idx + 1}] Q: ${faq.question}\nA: ${faq.answer}`)
      .join('\n\n');

    const systemPrompt = `You are a FAQ relevance ranker for CoAIleague workforce management platform.
Your task is to rank the provided FAQs by how well they answer the user's query.

For each FAQ, provide:
1. A relevance score from 0-100 (0 = not relevant, 100 = perfect match)
2. An explanation of why it matches (or doesn't match)

Return ONLY valid JSON in this format:
{
  "rankings": [
    { "index": 1, "score": 95, "reason": "..." },
    { "index": 2, "score": 60, "reason": "..." }
  ]
}

Be strict about relevance. Only include FAQs with score >= 30.`;

    const userMessage = `User Query: "${query.trim()}"

Available FAQs:
${faqContext}

Rank these FAQs by relevance to the user's query. Return only valid JSON.`;

    let tokensCost = 0;
    let rankings: Array<{ index: number; score: number; reason: string }> = [];

    try {
      const geminiResponse = await geminiClient.generate({
        workspaceId: wsId,
        userId: req.user?.id,
        featureKey: 'faq_search',
        systemPrompt,
        userMessage,
        temperature: 0.3,
        maxTokens: 2048,
      });

      tokensCost = geminiResponse.tokensUsed;
      
      // Parse Gemini response
      try {
        const jsonMatch = geminiResponse.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          rankings = parsed.rankings || [];
        }
      } catch (parseError) {
        log.warn('Failed to parse Gemini rankings JSON, falling back to keyword matching');
        rankings = [];
      }
    } catch (geminiError) {
      log.warn('Gemini ranking failed, using fallback keyword matching:', geminiError);
      // Fallback: keyword-based scoring
      rankings = [];
    }

    // Step 3: Build results with confidence scores
    const resultsWithScores = allFaqs.map((faq, faqIndex) => {
      let confidenceScore = 0;

      // Find score from Gemini rankings
      const ranking = rankings.find(r => r.index === faqIndex + 1);
      if (ranking && ranking.score >= 30) {
        confidenceScore = ranking.score / 100; // Convert to 0-1 scale
      } else if (!ranking) {
        // Fallback: keyword matching
        const queryLower = query.trim().toLowerCase();
        const questionLower = faq.question.toLowerCase();
        const answerLower = faq.answer.toLowerCase();
        
        if (questionLower.includes(queryLower)) {
          confidenceScore = AI.faqConfidenceTiers.high;
        } else if (answerLower.includes(queryLower)) {
          confidenceScore = AI.faqConfidenceTiers.medium;
        } else {
          // Check for partial matches on words
          const queryWords = queryLower.split(/\s+/);
          const matchedWords = queryWords.filter(word => 
            word.length > 2 && (questionLower.includes(word) || answerLower.includes(word))
          );
          confidenceScore = Math.min(AI.faqConfidenceTiers.low, matchedWords.length * AI.faqConfidenceTiers.threshold);
        }
      }

      return {
        ...faq,
        confidenceScore,
        embeddingVector: undefined, // Don't send embeddings
      };
    });

    // Step 4: Sort by confidence and limit results
    const topResults = resultsWithScores
      .filter(r => r.confidenceScore > 0)
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, searchLimit);

    const matchedFaqIds = topResults.map(r => r.id);
    const topConfidenceScore = topResults.length > 0 ? topResults[0].confidenceScore : 0;
    const avgConfidenceScore = topResults.length > 0 
      ? topResults.reduce((sum, r) => sum + r.confidenceScore, 0) / topResults.length
      : 0;

    // Step 5: Store search history for analytics
    const [historyRecord] = await db.insert(faqSearchHistory).values({
      query: query.trim(),
      workspaceId: wsId || null,
      userId: req.user?.id || null,
      conversationId: convId || null,
      matchedFaqIds,
      matchCount: topResults.length,
      topConfidenceScore,
      averageConfidenceScore: avgConfidenceScore,
      searchMethod: rankings.length > 0 ? 'semantic' : 'keyword',
      tokensUsed: tokensCost,
      suggestionEmitted: !!convId,
      suggestionEmittedAt: convId ? new Date() : null,
    }).returning();

    // Step 6: Emit ai_suggestion event if conversationId provided
    if (convId && topResults.length > 0) {
      const topMatch = topResults[0];
      const resultSummary = topResults.length === 1
        ? topMatch.question
        : `${topResults.length} matching FAQs found`;

      try {
        await ChatServerHub.emitAIAction({
          conversationId: convId,
          workspaceId: wsId,
          actionType: 'suggestion',
          title: 'FAQ Suggestions Found',
          description: resultSummary,
        });
        
        // Update record to mark event as emitted
        await db.update(faqSearchHistory)
          .set({ 
            suggestionEmitted: true,
            suggestionEmittedAt: new Date()
          })
          .where(eq(faqSearchHistory.id, historyRecord.id));

        log.info(`✅ [FAQ Search] Emitted ai_suggestion event for conversation ${convId}`);
      } catch (eventError) {
        log.error('Failed to emit ai_suggestion event:', eventError);
        // Continue anyway - search was still successful
      }
    }

    // Update FAQ match and resolve metrics
    if (topResults.length > 0) {
      const topMatch = topResults[0];
      await db.update(helposFaqs)
        .set({ 
          matchCount: sql`${helposFaqs.matchCount} + 1`,
        })
        .where(eq(helposFaqs.id, topMatch.id));
    }

    // Bill to shared platform support pool (not individual org)
    try {
      const { creditManager } = await import('../services/billing/creditManager');
      await creditManager.deductSupportPoolCredits('faq_search', 'FAQ AI Search', wsId || undefined);
    } catch (billingErr: unknown) {
      log.warn('[FAQ] Support pool billing failed (non-blocking):', billingErr.message);
    }

    log.info(`✅ [FAQ Search] Found ${topResults.length} results (confidence: ${(topConfidenceScore * 100).toFixed(0)}%)`);

    res.json({
      query: query.trim(),
      matchCount: topResults.length,
      results: topResults.map(faq => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        tags: faq.tags,
        confidenceScore: Number((faq.confidenceScore * 100).toFixed(1)), // Return as 0-100
        viewCount: faq.viewCount,
        helpfulCount: faq.helpfulCount,
      })),
      topConfidenceScore: Number((topConfidenceScore * 100).toFixed(1)),
      averageConfidenceScore: Number((avgConfidenceScore * 100).toFixed(1)),
      searchMethod: rankings.length > 0 ? 'semantic' : 'keyword',
      conversationId: convId,
      searchHistoryId: historyRecord.id,
      suggestion: {
        emitted: !!convId && topResults.length > 0,
        timestamp: convId && topResults.length > 0 ? new Date().toISOString() : null,
      },
    });

  } catch (error: unknown) {
    log.error('Error searching FAQs:', error);
    res.status(500).json({ 
      message: 'Failed to search FAQs', 
      error: sanitizeError(error) 
    });
  }
});


  // ============================================================================
  // PHASE E — LIVING FAQ DRAFT / APPROVAL WORKFLOW
  // ============================================================================

  // Submit FAQ for review (any staff can request, platform staff must approve)
  app.post('/api/helpos/faqs/:id/submit-review', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { changeReason } = req.body;
      const faq = await db.select().from(helposFaqs).where(eq(helposFaqs.id, id)).limit(1);
      if (!faq.length) return res.status(404).json({ message: 'FAQ not found' });
      const updated = await db.update(helposFaqs).set({
        status: 'under_review',
        reviewRequired: true,
        changeReason: changeReason || 'Submitted for review',
        updateOrderedBy: req.user?.id || 'system',
        updateOrderReason: changeReason || 'Content review requested',
        updatedBy: req.user?.id,
        updatedAt: new Date(),
      }).where(eq(helposFaqs.id, id)).returning();
      res.json(updated[0]);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to submit for review', error: sanitizeError(err) });
    }
  });

  // Approve FAQ — platform staff only; publishes immediately
  app.post('/api/helpos/faqs/:id/approve', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { reviewerNotes } = req.body;
      const faq = await db.select().from(helposFaqs).where(eq(helposFaqs.id, id)).limit(1);
      if (!faq.length) return res.status(404).json({ message: 'FAQ not found' });
      const now = new Date();
      const updated = await db.update(helposFaqs).set({
        status: 'approved',
        isPublished: true,
        publishedAt: now,
        publishedBy: req.user?.id,
        reviewRequired: false,
        reviewedBy: req.user?.id,
        reviewedAt: now,
        verificationNotes: reviewerNotes || 'Approved by platform staff',
        lastVerifiedAt: now,
        lastVerifiedBy: req.user?.id,
        version: sql`${helposFaqs.version} + 1`,
        updatedAt: now,
      }).where(eq(helposFaqs.id, id)).returning();
      res.json(updated[0]);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to approve FAQ', error: sanitizeError(err) });
    }
  });

  // Reject FAQ — platform staff only; returns to draft with reason
  app.post('/api/helpos/faqs/:id/reject', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: 'Rejection reason required' });
      const faq = await db.select().from(helposFaqs).where(eq(helposFaqs.id, id)).limit(1);
      if (!faq.length) return res.status(404).json({ message: 'FAQ not found' });
      const now = new Date();
      const updated = await db.update(helposFaqs).set({
        status: 'draft',
        isPublished: false,
        reviewRequired: false,
        reviewedBy: req.user?.id,
        reviewedAt: now,
        verificationNotes: `REJECTED: ${reason}`,
        updatedAt: now,
      }).where(eq(helposFaqs.id, id)).returning();
      res.json(updated[0]);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to reject FAQ', error: sanitizeError(err) });
    }
  });

  // Get all FAQs pending review (platform staff queue)
  app.get('/api/helpos/faqs/queue/pending-review', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const pending = await db.select().from(helposFaqs)
        .where(eq(helposFaqs.status, 'under_review'))
        .orderBy(desc(helposFaqs.updatedAt));
      res.json(pending);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to fetch review queue', error: sanitizeError(err) });
    }
  });

  // Seed CoAIleague platform FAQs — platform staff only, idempotent
  app.post('/api/helpos/faqs/seed/platform', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await db.select({ id: helposFaqs.id }).from(helposFaqs).limit(1);
      if (existing.length > 0) {
        return res.json({ message: 'FAQs already seeded', skipped: true });
      }
      const platformFaqs = [
        { category: 'general', question: `What is ${PLATFORM.name}?`, answer: `${PLATFORM.name} is an AI-powered workforce management platform built specifically for Texas security guard companies. It combines scheduling, GPS timekeeping, incident reporting, payroll, invoicing, and compliance monitoring into one unified system powered by Trinity AI.` },
        { category: 'billing', question: 'What does a "seat" mean in pricing?', answer: 'Every person on your account counts as one seat — owners, managers, supervisors, and officers alike. Seats are not limited to officers. If you have 1 owner, 2 managers, and 20 officers, that is 23 seats.' },
        { category: 'billing', question: 'What happens if I go over my included seats?', answer: 'Seat overages are billed at your tier\'s per-seat rate: Starter $20/seat, Professional $25/seat, Business $30/seat, Enterprise $35/seat. You are never cut off — overage usage is simply billed at the end of the month.' },
        { category: 'billing', question: 'What is an AI interaction?', answer: 'An AI interaction is any meaningful exchange with Trinity AI — a HelpAI question, a smart schedule generation, a report narrative polish, a compliance check, a chat response, or any other AI-powered action. Passive background automations (like shift reminder checks) do not count.' },
        { category: 'features', question: 'What is the Trinity AI brain?', answer: `Trinity is the biological AI brain powering the entire ${PLATFORM.name} platform. It monitors all operations in real-time, proactively finds compliance gaps, fills open shifts, coaches underperforming officers, detects anomalies, and even answers questions for every officer 24/7 through HelpAI. Trinity never replaces your judgment — it handles the operational burden so your team can focus on security.` },
        { category: 'features', question: `Can officers use ${PLATFORM.name} on their phones?`, answer: `Yes. ${PLATFORM.name} is fully mobile-responsive and works on any smartphone browser with no app download required. Officers can clock in/out with GPS, file incident reports, view their schedule, chat with supervisors, and ask HelpAI questions all from their phone.` },
        { category: 'features', question: 'What is HelpAI?', answer: 'HelpAI is a 24/7 AI assistant available to every officer on your account. Officers can ask questions about post orders, company policies, state regulations, safety procedures, and anything else relevant to their work. HelpAI is powered by Trinity and understands the security industry context.' },
        { category: 'compliance', question: `Does ${PLATFORM.name} handle Texas DPS license compliance?`, answer: `Yes. ${PLATFORM.name} monitors Texas Department of Public Safety (DPS) security officer licensing requirements, tracks license expiration dates, and alerts managers before licenses expire. It also stores required documentation and generates compliance reports for auditors.` },
        { category: 'compliance', question: `Can ${PLATFORM.name} help during emergencies?`, answer: `${PLATFORM.name} has a Panic Button feature that immediately notifies your on-call supervisor chain with the officer's GPS location. The system follows an 8-step protocol to escalate through your chain of command. For any life-threatening emergency, officers must call 911 directly — ${PLATFORM.name} does not contact 911 on their behalf.` },
        { category: 'technical', question: 'How is my data protected?', answer: `All data is encrypted in transit and at rest. ${PLATFORM.name} uses PostgreSQL with row-level security, ensuring each security company's data is completely isolated from others. Incident reports include SHA-256 content hashing so any tampering is immediately detectable.` },
        { category: 'general', question: 'Can I cancel my subscription at any time?', answer: 'Monthly plans can be cancelled at any time and take effect at the end of the current billing period. Annual plans can be cancelled but are non-refundable for the remaining term. Contact support at support@coaileague.com to initiate cancellation.' },
        { category: 'features', question: 'What is the difference between Professional and Business tiers?', answer: 'Professional (30 seats, $749/mo) includes payroll and invoicing, unlimited clients, and multi-state compliance. Business (75 seats, $2,249/mo) adds multi-workspace management, full financial intelligence (P&L per site/contract), social graph team dynamics, custom reporting, and API access.' },
        { category: 'billing', question: 'Is there a free trial?', answer: `Yes. ${PLATFORM.name} offers a 14-day free trial with full platform access — no credit card required. Trials include up to 10 seats, 2 sites, and 500 total AI interactions. Trials do not auto-charge.` },
        { category: 'technical', question: `Does ${PLATFORM.name} send text messages to officers?`, answer: `${PLATFORM.name} can send SMS alerts (shift reminders, open shift offers, emergency escalations) only to officers who have provided written SMS consent. Officers who have replied STOP to opt out will never receive SMS messages from the system. All SMS activity is logged for compliance.` },
        { category: 'compliance', question: `What legal disclaimers apply to ${PLATFORM.name}?`, answer: `${PLATFORM.name} is a workforce management tool, not a licensed law enforcement, emergency dispatch, or legal advisory service. AI-generated content (narratives, compliance suggestions, legal interpretations) is for operational reference only and does not constitute legal advice. Always consult a licensed attorney for legal decisions. In any emergency, contact 911 directly.` },
      ];
      const now = new Date();
      const inserted = await db.insert(helposFaqs).values(
        platformFaqs.map(f => ({
          id: `plat-faq-${randomUUID()}`,
          workspaceId: 'platform',
          category: f.category,
          question: f.question,
          answer: f.answer,
          tags: [f.category, 'platform'],
          isPublished: true,
          publishedAt: now,
          publishedBy: req.user?.id || 'system',
          status: 'published',
          version: 1,
          scope: 'platform',
          language: 'en',
          viewCount: 0,
          helpfulCount: 0,
          notHelpfulCount: 0,
          createdBy: req.user?.id || 'system',
        }))
      ).returning();
      res.json({ seeded: inserted.length, message: `${inserted.length} platform FAQs seeded successfully` });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Seed failed', error: sanitizeError(err) });
    }
  });

} // End of registerFaqRoutes function
