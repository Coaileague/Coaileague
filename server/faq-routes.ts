// HelpOS FAQ Management Routes
// AI-powered FAQ system with semantic search using OpenAI embeddings

import type { Express } from 'express';
import { db } from './db';
import { helposFaqs, insertHelposFaqSchema } from '@shared/schema';
import { requireAuth } from './auth';
import { requirePlatformStaff, isPlatformStaff, type AuthenticatedRequest } from './rbac';
import { readLimiter } from './middleware/rateLimiter';
import { eq, desc, sql, like, or, and } from 'drizzle-orm';
import { z } from 'zod';
import OpenAI from 'openai';

// Lazy OpenAI client initialization - only create when needed
let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  if (!openaiClient) {
    throw new Error('OpenAI API key not configured');
  }
  return openaiClient;
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

    const faqs = await query.orderBy(desc(helposFaqs.viewCount)).limit(Number(limit));
    res.json(faqs);
  } catch (error: any) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ message: 'Failed to fetch FAQs', error: error.message });
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
  } catch (error: any) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({ message: 'Failed to fetch FAQ', error: error.message });
  }
});

// Create new FAQ (platform staff only)
app.post('/api/helpos/faqs', requireAuth, requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const validatedData = insertHelposFaqSchema.parse(req.body);

    // Generate embedding for semantic search using OpenAI
    let embeddingVector: string | null = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const embeddingText = `${validatedData.question} ${validatedData.answer}`;
        const embeddingResponse = await getOpenAIClient().embeddings.create({
          model: 'text-embedding-3-small',
          input: embeddingText,
        });
        // Store embedding as JSON string in text column
        embeddingVector = JSON.stringify(embeddingResponse.data[0].embedding);
      } catch (embeddingError) {
        console.error('Error generating embedding:', embeddingError);
        // Continue without embedding - semantic search won't work but FAQ will still be created
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
  } catch (error: any) {
    console.error('Error creating FAQ:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to create FAQ', error: error.message });
  }
});

// Update FAQ (platform staff only)
app.patch('/api/helpos/faqs/:id', requireAuth, requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If question or answer changed, regenerate embedding
    let embeddingVector: string | null | undefined = undefined;
    if ((updateData.question || updateData.answer) && process.env.OPENAI_API_KEY) {
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

        const embeddingResponse = await getOpenAIClient().embeddings.create({
          model: 'text-embedding-3-small',
          input: embeddingText,
        });
        // Store as JSON string
        embeddingVector = JSON.stringify(embeddingResponse.data[0].embedding);
      } catch (embeddingError) {
        console.error('Error generating embedding:', embeddingError);
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
  } catch (error: any) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({ message: 'Failed to update FAQ', error: error.message });
  }
});

// Delete FAQ (platform staff only)
app.delete('/api/helpos/faqs/:id', requireAuth, requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const deletedFaq = await db.delete(helposFaqs)
      .where(eq(helposFaqs.id, id))
      .returning();

    if (!deletedFaq || deletedFaq.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json({ message: 'FAQ deleted successfully', faq: deletedFaq[0] });
  } catch (error: any) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ message: 'Failed to delete FAQ', error: error.message });
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
  } catch (error: any) {
    console.error('Error marking FAQ as helpful:', error);
    res.status(500).json({ message: 'Failed to mark FAQ as helpful', error: error.message });
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

    // Generate embedding for the user's query
    const queryEmbedding = await getOpenAIClient().embeddings.create({
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

    res.json(topFaqs);
  } catch (error: any) {
    console.error('Error performing semantic search:', error);
    res.status(500).json({ message: 'Failed to perform semantic search', error: error.message });
  }
});

// Get FAQ categories (for filtering)
app.get('/api/helpos/faqs/categories/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const categories = await db.selectDistinct({ category: helposFaqs.category })
      .from(helposFaqs)
      .orderBy(helposFaqs.category);

    res.json(categories.map(c => c.category));
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
});

} // End of registerFaqRoutes function
