/**
 * AI EXPENSE CATEGORIZATION SERVICE
 * ==================================
 * 
 * Gemini-powered expense analysis and categorization:
 * 
 * 1. Receipt OCR - Extracts text from receipt images using Gemini Vision
 * 2. Category Matching - AI suggests the best expense category
 * 3. Auto-Categorization - Batch processing for uncategorized expenses
 * 4. Duplicate Detection - Identifies potential duplicate expenses
 * 5. Anomaly Detection - Flags unusual expense patterns
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './providers/geminiClient';
import { db } from '../../db';
import { eq, and, isNull, desc, sql, gte, lte } from 'drizzle-orm';
import {
  expenses,
  expenseCategories,
  expenseReceipts,
  employees,
} from '@shared/schema';
import { usageMeteringService } from '../billing/usageMetering';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { aiCreditGateway } from '../billing/aiCreditGateway';
import { createLogger } from '../../lib/logger';
const log = createLogger('aiExpenseCategorizationService');

const AI_CONFIDENCE_THRESHOLDS = {
  AUTO_APPLY: 80,
  RECEIPT_MATCH: 60,
  RECEIPT_AUTO_LINK: 85,
  LOW_CONFIDENCE_FLAG: 50,
} as const;

export interface ReceiptExtractionResult {
  success: boolean;
  merchant?: string;
  amount?: number;
  date?: string;
  items?: string[];
  confidence: number;
  rawText?: string;
  error?: string;
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reasoning: string;
}

export interface ExpenseCategorizationResult {
  expenseId: string;
  suggestedCategory: CategorySuggestion;
  alternativeCategories: CategorySuggestion[];
  extractedData?: ReceiptExtractionResult;
  anomalyFlags: string[];
  duplicateWarning?: string;
}

export interface BatchCategorizationSummary {
  totalProcessed: number;
  successfullyCategized: number;
  requiresReview: number;
  anomaliesDetected: number;
  duplicatesFound: number;
  results: ExpenseCategorizationResult[];
}

class AIExpenseCategorizationService {
  private model: GenerativeModel | null = null;
  private visionModel: GenerativeModel | null = null;
  private initialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        log.warn('[AIExpenseCategorization] GEMINI_API_KEY not configured');
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.SUPERVISOR,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.supervisor.maxTokens,
          temperature: ANTI_YAP_PRESETS.supervisor.temperature,
        }
      });
      this.visionModel = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.SUPERVISOR,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.supervisor.maxTokens,
          temperature: ANTI_YAP_PRESETS.supervisor.temperature,
        }
      });
      this.initialized = true;
      log.info('[AIExpenseCategorization] Service initialized');
    } catch (error: any) {
      log.error('[AIExpenseCategorization] Initialization failed:', (error instanceof Error ? error.message : String(error)));
    }
  }

  async extractReceiptData(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    workspaceId?: string,
    userId?: string
  ): Promise<ReceiptExtractionResult> {
    await this.initialize();
    
    if (!this.visionModel) {
      return { success: false, confidence: 0, error: 'Vision model not available' };
    }

    try {
      const authResult = await aiCreditGateway.preAuthorize(
        workspaceId,
        userId,
        'ai_expense_ocr'
      );
      if (!authResult.authorized) {
        return { success: false, confidence: 0, error: `Credit check failed: ${authResult.reason}` };
      }

      const prompt = `Analyze this receipt image and extract the following information in JSON format:
{
  "merchant": "store/vendor name",
  "amount": numeric total amount,
  "date": "YYYY-MM-DD format",
  "items": ["list of items if visible"],
  "confidence": 0-100 confidence score
}

If any field cannot be determined, use null. Focus on accuracy over completeness.`;

      const result = await this.visionModel.generateContent([ // withGemini
        prompt,
        {
          inlineData: {
            mimeType,
            data: imageBase64
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      const ocrUsage = response.usageMetadata;
      const totalTokens = (ocrUsage?.promptTokenCount || 0) + (ocrUsage?.candidatesTokenCount || 0);
      await aiCreditGateway.finalizeBilling(
        workspaceId,
        userId,
        'ai_expense_ocr',
        totalTokens,
        { model: GEMINI_MODELS.SUPERVISOR, promptTokens: ocrUsage?.promptTokenCount, completionTokens: ocrUsage?.candidatesTokenCount }
      ).catch(err => log.error('[AIExpenseCategorization] Billing error:', err));

      if (workspaceId) {
        const { aiMeteringService } = await import('../billing/aiMeteringService');
        aiMeteringService.recordAiCall({
          workspaceId,
          modelName: GEMINI_MODELS.SUPERVISOR,
          callType: 'expense_receipt_ocr',
          inputTokens: ocrUsage?.promptTokenCount ?? 0,
          outputTokens: ocrUsage?.candidatesTokenCount ?? 0,
          triggeredByUserId: userId,
        });
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          merchant: parsed.merchant || undefined,
          amount: typeof parsed.amount === 'number' ? parsed.amount : undefined,
          date: parsed.date || undefined,
          items: Array.isArray(parsed.items) ? parsed.items : undefined,
          confidence: parsed.confidence || 50,
          rawText: text
        };
      }

      return { success: false, confidence: 0, rawText: text, error: 'Could not parse receipt data' };
    } catch (error: any) {
      log.error('[AIExpenseCategorization] Receipt extraction error:', (error instanceof Error ? error.message : String(error)));
      return { success: false, confidence: 0, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  async suggestCategory(
    expenseDescription: string,
    merchant: string | null,
    amount: number,
    workspaceId: string,
    userId?: string
  ): Promise<CategorySuggestion[]> {
    await this.initialize();
    
    if (!this.model) {
      return [];
    }

    try {
      const categories = await db.select()
        .from(expenseCategories)
        .where(and(
          eq(expenseCategories.workspaceId, workspaceId),
          eq(expenseCategories.isActive, true)
        ));

      if (categories.length === 0) {
        return [];
      }

      const categoryList = categories.map(c => `- ${c.id}: ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n');

      const prompt = `As an expense categorization AI, analyze this expense and suggest the best matching category:

Expense Details:
- Description: ${expenseDescription}
- Merchant: ${merchant || 'Unknown'}
- Amount: $${amount.toFixed(2)}

Available Categories:
${categoryList}

Respond in JSON format with top 3 category suggestions:
{
  "suggestions": [
    {
      "categoryId": "category_id_here",
      "categoryName": "Category Name",
      "confidence": 95,
      "reasoning": "Brief explanation why this category fits"
    }
  ]
}

Rank by confidence (0-100). Be specific in reasoning.`;

      const result = await meteredGemini.generate({
        workspaceId: workspaceId,
        userId,
        featureKey: 'ai_expense_categorization',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 500,
      });

      if (!result.success) return [];

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.suggestions || [];
      }

      return [];
    } catch (error: any) {
      log.error('[AIExpenseCategorization] Category suggestion error:', (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async categorizeExpense(
    expenseId: string,
    workspaceId: string,
    userId?: string
  ): Promise<ExpenseCategorizationResult | null> {
    await this.initialize();

    try {
      const [expense] = await db.select()
        .from(expenses)
        .where(and(
          eq(expenses.id, expenseId),
          eq(expenses.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!expense) {
        return null;
      }

      const suggestions = await this.suggestCategory(
        expense.description || '',
        expense.merchant,
        parseFloat(expense.amount),
        workspaceId,
        userId
      );

      const anomalyFlags: string[] = [];
      const amount = parseFloat(expense.amount);

      if (amount > 5000) {
        anomalyFlags.push('high_value_expense');
      }

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const similarExpenses = await db.select({ count: sql<number>`count(*)` })
        .from(expenses)
        .where(and(
          eq(expenses.workspaceId, workspaceId),
          eq(expenses.merchant, expense.merchant || ''),
          gte(expenses.expenseDate, weekAgo)
        ));

      let duplicateWarning: string | undefined;
      if (similarExpenses[0]?.count > 1) {
        duplicateWarning = `Found ${similarExpenses[0].count} similar expenses from ${expense.merchant} in the last 7 days`;
      }

      return {
        expenseId,
        suggestedCategory: suggestions[0] || {
          categoryId: '',
          categoryName: 'Uncategorized',
          confidence: 0,
          reasoning: 'No matching category found'
        },
        alternativeCategories: suggestions.slice(1),
        anomalyFlags,
        duplicateWarning
      };
    } catch (error: any) {
      log.error('[AIExpenseCategorization] Categorize expense error:', (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async batchCategorize(
    workspaceId: string,
    userId?: string,
    limit: number = 50
  ): Promise<BatchCategorizationSummary> {
    await this.initialize();

    const uncategorizedExpenses = await db.select()
      .from(expenses)
      .where(and(
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.status, 'submitted')
      ))
      .orderBy(desc(expenses.createdAt))
      .limit(limit);

    const results: ExpenseCategorizationResult[] = [];
    let successfullyCategized = 0;
    let requiresReview = 0;
    let anomaliesDetected = 0;
    let duplicatesFound = 0;

    for (const expense of uncategorizedExpenses) {
      const result = await this.categorizeExpense(expense.id, workspaceId, userId);
      
      if (result) {
        results.push(result);
        
        const confidence = result.suggestedCategory.confidence;
        
        if (confidence >= AI_CONFIDENCE_THRESHOLDS.AUTO_APPLY && result.suggestedCategory.categoryId) {
          successfullyCategized++;
          try {
            await db.update(expenses)
              .set({
                categoryId: result.suggestedCategory.categoryId,
                status: 'categorized',
                notes: `Auto-categorized by AI (confidence: ${confidence}%). Category: ${result.suggestedCategory.categoryName}. ${result.suggestedCategory.reasoning}`,
              })
              .where(eq(expenses.id, expense.id));
          } catch (err: any) {
            log.error(`[AIExpenseCategorization] Failed to auto-apply category for expense ${expense.id}:`, (err instanceof Error ? err.message : String(err)));
          }
        } else {
          requiresReview++;
          try {
            await db.update(expenses)
              .set({
                status: 'needs_review',
                notes: `AI categorization confidence too low (${confidence}%) for auto-apply (threshold: ${AI_CONFIDENCE_THRESHOLDS.AUTO_APPLY}%). Suggested: ${result.suggestedCategory.categoryName}. ${result.suggestedCategory.reasoning}`,
              })
              .where(eq(expenses.id, expense.id));
          } catch (err: any) {
            log.error(`[AIExpenseCategorization] Failed to flag expense ${expense.id} for review:`, (err instanceof Error ? err.message : String(err)));
          }
        }
        
        if (result.anomalyFlags.length > 0) {
          anomaliesDetected++;
        }
        
        if (result.duplicateWarning) {
          duplicatesFound++;
        }
      }
    }

    return {
      totalProcessed: uncategorizedExpenses.length,
      successfullyCategized,
      requiresReview,
      anomaliesDetected,
      duplicatesFound,
      results
    };
  }

  async matchReceiptToExpense(
    receiptId: string,
    workspaceId: string,
    userId?: string
  ): Promise<{ matched: boolean; expenseId?: string; confidence: number; reason: string }> {
    await this.initialize();

    try {
      const [receipt] = await db.select()
        .from(expenseReceipts)
        .where(and(
          eq(expenseReceipts.id, receiptId),
          eq(expenseReceipts.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!receipt) {
        return { matched: false, confidence: 0, reason: 'Receipt not found' };
      }

      if (!receipt.extractedAmount || !receipt.extractedDate) {
        return { matched: false, confidence: 0, reason: 'Receipt OCR data incomplete - run extraction first' };
      }

      const dateTolerance = 3;
      const extractedDate = new Date(receipt.extractedDate);
      const minDate = new Date(extractedDate);
      minDate.setDate(minDate.getDate() - dateTolerance);
      const maxDate = new Date(extractedDate);
      maxDate.setDate(maxDate.getDate() + dateTolerance);

      const matchingExpenses = await db.select()
        .from(expenses)
        .where(and(
          eq(expenses.workspaceId, workspaceId),
          isNull(expenses.receiptUrl),
          gte(expenses.expenseDate, minDate),
          lte(expenses.expenseDate, maxDate)
        ))
        .limit(20);

      let bestMatch: { expense: typeof matchingExpenses[0]; score: number } | null = null;
      const receiptAmount = parseFloat(receipt.extractedAmount);

      for (const expense of matchingExpenses) {
        const expenseAmount = parseFloat(expense.amount);
        const amountDiff = Math.abs(receiptAmount - expenseAmount);
        const amountScore = amountDiff < 0.01 ? 100 : amountDiff < 1 ? 80 : amountDiff < 10 ? 50 : 0;

        let merchantScore = 0;
        if (receipt.extractedVendor && expense.merchant) {
          const vendor = receipt.extractedVendor.toLowerCase();
          const merchant = expense.merchant.toLowerCase();
          if (vendor === merchant) merchantScore = 100;
          else if (vendor.includes(merchant) || merchant.includes(vendor)) merchantScore = 70;
        }

        const totalScore = (amountScore * 0.6) + (merchantScore * 0.4);

        if (!bestMatch || totalScore > bestMatch.score) {
          bestMatch = { expense, score: totalScore };
        }
      }

      if (bestMatch && bestMatch.score >= AI_CONFIDENCE_THRESHOLDS.RECEIPT_MATCH) {
        const autoLinked = bestMatch.score >= AI_CONFIDENCE_THRESHOLDS.RECEIPT_AUTO_LINK;
        return {
          matched: true,
          expenseId: bestMatch.expense.id,
          confidence: bestMatch.score,
          reason: autoLinked
            ? `Auto-linked: high confidence match ($${receiptAmount.toFixed(2)}, score: ${bestMatch.score}%)`
            : `Suggested match ($${receiptAmount.toFixed(2)}, score: ${bestMatch.score}%) — requires human confirmation`
        };
      }

      return {
        matched: false,
        confidence: bestMatch?.score || 0,
        reason: `No confident match found (best score: ${bestMatch?.score || 0}%, threshold: ${AI_CONFIDENCE_THRESHOLDS.RECEIPT_MATCH}%) — manual review required`
      };
    } catch (error: any) {
      log.error('[AIExpenseCategorization] Receipt matching error:', (error instanceof Error ? error.message : String(error)));
      return { matched: false, confidence: 0, reason: (error instanceof Error ? error.message : String(error)) };
    }
  }

  async analyzeExpensePatterns(
    workspaceId: string,
    employeeId?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<{
    topCategories: { category: string; total: number; count: number }[];
    topMerchants: { merchant: string; total: number; count: number }[];
    anomalies: string[];
    insights: string[];
  }> {
    await this.initialize();

    try {
      const startDate = dateRange?.start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const endDate = dateRange?.end || new Date();

      let query = db.select({
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
        merchant: expenses.merchant,
        amount: expenses.amount,
        status: expenses.status,
      })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(
          eq(expenses.workspaceId, workspaceId),
          gte(expenses.expenseDate, startDate),
          lte(expenses.expenseDate, endDate),
          employeeId ? eq(expenses.employeeId, employeeId) : sql`1=1`
        ));

      const expenseData = await query;

      const categoryTotals = new Map<string, { total: number; count: number }>();
      const merchantTotals = new Map<string, { total: number; count: number }>();

      for (const exp of expenseData) {
        const catName = exp.categoryName || 'Uncategorized';
        const current = categoryTotals.get(catName) || { total: 0, count: 0 };
        current.total += parseFloat(exp.amount);
        current.count++;
        categoryTotals.set(catName, current);

        if (exp.merchant) {
          const merchCurrent = merchantTotals.get(exp.merchant) || { total: 0, count: 0 };
          merchCurrent.total += parseFloat(exp.amount);
          merchCurrent.count++;
          merchantTotals.set(exp.merchant, merchCurrent);
        }
      }

      const topCategories = Array.from(categoryTotals.entries())
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      const topMerchants = Array.from(merchantTotals.entries())
        .map(([merchant, data]) => ({ merchant, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      const anomalies: string[] = [];
      const insights: string[] = [];

      const totalExpenses = expenseData.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const avgExpense = totalExpenses / (expenseData.length || 1);

      if (topCategories[0] && (topCategories[0].total / totalExpenses) > 0.5) {
        insights.push(`${topCategories[0].category} accounts for over 50% of expenses`);
      }

      for (const exp of expenseData) {
        if (parseFloat(exp.amount) > avgExpense * 5) {
          anomalies.push(`Unusually high expense: $${parseFloat(exp.amount).toFixed(2)} at ${exp.merchant || 'Unknown'}`);
        }
      }

      return {
        topCategories,
        topMerchants,
        anomalies: anomalies.slice(0, 5),
        insights
      };
    } catch (error: any) {
      log.error('[AIExpenseCategorization] Pattern analysis error:', (error instanceof Error ? error.message : String(error)));
      return {
        topCategories: [],
        topMerchants: [],
        anomalies: [],
        insights: []
      };
    }
  }
}

export const aiExpenseCategorizationService = new AIExpenseCategorizationService();
