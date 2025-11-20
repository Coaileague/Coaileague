/**
 * AutoForce™ Data Migration Service
 * 
 * Enables importing data from external platforms using Gemini Vision AI.
 * Supports: employees, schedules, payroll, invoices, clients, timesheets
 * 
 * Workflow:
 * 1. Upload - User uploads document (PDF/image)
 * 2. Analyze - Gemini Vision extracts data
 * 3. Review - User reviews extracted records
 * 4. Import - Records imported into AutoForce
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { migrationJobs, migrationDocuments, migrationRecords, employees, clients, shifts } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { withCredits } from './billing/creditWrapper';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export type MigrationType = 'employees' | 'payroll' | 'schedules' | 'invoices' | 'timesheets' | 'clients' | 'other';
export type MigrationJobStatus = 'uploaded' | 'analyzing' | 'reviewed' | 'importing' | 'completed' | 'failed' | 'cancelled';

export interface CreateMigrationJobParams {
  workspaceId: string;
  userId: string;
  documentType: MigrationType;
  fileName: string;
  fileData: string; // base64
  mimeType: string;
}

export interface ExtractedRecord {
  recordType: MigrationType;
  data: any;
  confidence: number;
  warnings: string[];
}

export class MigrationService {
  /**
   * Step 1: Create migration job and upload document
   */
  async createMigrationJob(params: CreateMigrationJobParams) {
    const jobId = `MIG-${nanoid(12)}`;
    const docId = `DOC-${nanoid(12)}`;

    // Create migration job
    const [job] = await db.insert(migrationJobs).values({
      id: jobId,
      workspaceId: params.workspaceId,
      createdBy: params.userId,
      status: 'uploaded',
      documentType: params.documentType,
      totalDocuments: 1,
      processedDocuments: 0,
      totalRecords: 0,
      importedRecords: 0,
    }).returning();

    // Create migration document
    const [document] = await db.insert(migrationDocuments).values({
      id: docId,
      jobId: job.id,
      workspaceId: params.workspaceId,
      fileName: params.fileName,
      fileData: params.fileData,
      mimeType: params.mimeType,
      documentType: params.documentType,
      processingStatus: 'pending',
      confidenceScore: 0,
    }).returning();

    console.log(`✅ Migration job created: ${jobId}, Document: ${docId}`);

    return { job, document };
  }

  /**
   * Step 2: Analyze document using Gemini Vision
   */
  async analyzeDocument(documentId: string, workspaceId: string) {
    // Get document with workspace scoping (security: prevent cross-tenant access)
    const [document] = await db.select()
      .from(migrationDocuments)
      .where(
        and(
          eq(migrationDocuments.id, documentId),
          eq(migrationDocuments.workspaceId, workspaceId)
        )
      );

    if (!document) {
      throw new Error(`Document ${documentId} not found or access denied`);
    }

    // Update status to analyzing
    await db.update(migrationDocuments)
      .set({ processingStatus: 'analyzing' })
      .where(eq(migrationDocuments.id, documentId));

    await db.update(migrationJobs)
      .set({ status: 'analyzing' })
      .where(eq(migrationJobs.id, document.jobId));

    // Get userId from migration job for credit tracking
    const [job] = await db.select()
      .from(migrationJobs)
      .where(eq(migrationJobs.id, document.jobId));
    
    const userId = job?.createdBy;

    try {
      // Extract data using Gemini Vision WITH CREDIT DEDUCTION
      const creditResult = await withCredits(
        {
          workspaceId: document.workspaceId,
          featureKey: 'ai_migration',
          description: `Gemini Vision data extraction from ${document.fileName} (${document.documentType})`,
          userId,
        },
        async () => {
          return await this.extractDataWithGemini(
            document.fileData,
            document.mimeType,
            document.documentType
          );
        }
      );

      // Handle insufficient credits
      if (!creditResult.success) {
        if (creditResult.insufficientCredits) {
          throw new Error(`Insufficient credits: Migration requires 10 credits. ${creditResult.error}`);
        }
        throw new Error(`Credit deduction failed: ${creditResult.error}`);
      }

      const extractedData = creditResult.result!;

      // Create migration records
      const records = await Promise.all(
        extractedData.records.map(async (record: ExtractedRecord) => {
          const recordId = `REC-${nanoid(12)}`;
          
          return db.insert(migrationRecords).values({
            id: recordId,
            documentId: document.id,
            jobId: document.jobId,
            workspaceId: document.workspaceId,
            recordType: record.recordType,
            extractedData: record.data,
            importedData: null,
            confidenceScore: record.confidence,
            validationErrors: record.warnings,
            importStatus: 'pending',
            accessibleByRoles: ['org_owner', 'org_admin', 'org_manager', 'employee', 'support_staff'],
          }).returning();
        })
      );

      // Update document with results
      await db.update(migrationDocuments)
        .set({
          processingStatus: 'completed',
          confidenceScore: extractedData.overallConfidence,
          extractedRecordCount: records.length,
          validationErrors: extractedData.errors,
        })
        .where(eq(migrationDocuments.id, documentId));

      // Update job
      await db.update(migrationJobs)
        .set({
          status: 'reviewed',
          processedDocuments: 1,
          totalRecords: records.length,
        })
        .where(eq(migrationJobs.id, document.jobId));

      console.log(`✅ Document analyzed: ${documentId}, ${records.length} records extracted`);

      return {
        document,
        records: records.flat(),
        overallConfidence: extractedData.overallConfidence,
      };

    } catch (error) {
      console.error(`❌ Document analysis failed:`, error);

      await db.update(migrationDocuments)
        .set({ processingStatus: 'failed', validationErrors: [error instanceof Error ? error.message : String(error)] })
        .where(eq(migrationDocuments.id, documentId));

      await db.update(migrationJobs)
        .set({ status: 'failed' })
        .where(eq(migrationJobs.id, document.jobId));

      throw error;
    }
  }

  /**
   * Step 3: Import migration records into AutoForce
   */
  async importRecords(jobId: string, recordIds: string[], workspaceId: string) {
    // Get job with workspace scoping (security: prevent cross-tenant access)
    const [job] = await db.select()
      .from(migrationJobs)
      .where(
        and(
          eq(migrationJobs.id, jobId),
          eq(migrationJobs.workspaceId, workspaceId)
        )
      );

    if (!job) {
      throw new Error(`Migration job ${jobId} not found or access denied`);
    }

    // Update job status
    await db.update(migrationJobs)
      .set({ status: 'importing' })
      .where(eq(migrationJobs.id, jobId));

    const importedRecords = [];

    for (const recordId of recordIds) {
      // Get record with workspace scoping (security: prevent cross-tenant access)
      const [record] = await db.select()
        .from(migrationRecords)
        .where(
          and(
            eq(migrationRecords.id, recordId),
            eq(migrationRecords.workspaceId, workspaceId)
          )
        );

      if (!record || record.jobId !== jobId) {
        console.warn(`⚠️  Skipping invalid or unauthorized record: ${recordId}`);
        continue;
      }

      try {
        // Import based on record type
        const importedData = await this.importRecordByType(
          record.workspaceId,
          record.recordType,
          record.extractedData
        );

        // Update record with imported data
        await db.update(migrationRecords)
          .set({
            importStatus: 'imported',
            importedData,
            importedAt: new Date(),
          })
          .where(eq(migrationRecords.id, recordId));

        importedRecords.push({ recordId, success: true, importedData });

      } catch (error) {
        console.error(`❌ Failed to import record ${recordId}:`, error);

        await db.update(migrationRecords)
          .set({
            importStatus: 'failed',
            validationErrors: [...(record.validationErrors || []), error instanceof Error ? error.message : String(error)],
          })
          .where(eq(migrationRecords.id, recordId));

        importedRecords.push({ recordId, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Update job with import results
    const importedCount = importedRecords.filter(r => r.success).length;
    await db.update(migrationJobs)
      .set({
        status: 'completed',
        importedRecords: importedCount,
      })
      .where(eq(migrationJobs.id, jobId));

    console.log(`✅ Migration job completed: ${jobId}, ${importedCount}/${recordIds.length} records imported`);

    return {
      job,
      importedCount,
      totalAttempted: recordIds.length,
      results: importedRecords,
    };
  }

  /**
   * Extract data from document using Gemini Vision
   */
  private async extractDataWithGemini(
    fileData: string,
    mimeType: string,
    documentType: MigrationType
  ): Promise<{
    records: ExtractedRecord[];
    overallConfidence: number;
    errors: string[];
  }> {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // Build extraction prompt based on document type
    const prompt = this.buildExtractionPrompt(documentType);

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileData,
          mimeType,
        },
      },
    ]);

    const responseText = result.response.text();
    console.log(`🧠 Gemini Vision extraction response:`, responseText.substring(0, 500));

    // Parse JSON response
    try {
      const parsed = JSON.parse(responseText);
      return {
        records: parsed.records || [],
        overallConfidence: parsed.confidence || 0.5,
        errors: parsed.errors || [],
      };
    } catch (parseError) {
      console.error(`❌ Failed to parse Gemini response:`, parseError);
      throw new Error('AI failed to extract structured data from document');
    }
  }

  /**
   * Build extraction prompt for specific document type
   */
  private buildExtractionPrompt(documentType: MigrationType): string {
    const basePrompt = `You are a data extraction AI for AutoForce™ workforce management.
Extract data from the provided document and return a JSON response with this structure:

{
  "records": [/* array of extracted records */],
  "confidence": 0.95, /* overall confidence 0-1 */
  "errors": [/* any warnings or issues */]
}

`;

    const prompts: Record<MigrationType, string> = {
      employees: basePrompt + `Extract employee data. Each record should have:
{
  "recordType": "employees",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "role": "Manager",
    "hourlyRate": 25.00,
    "status": "active"
  },
  "confidence": 0.95,
  "warnings": []
}`,
      schedules: basePrompt + `Extract schedule/shift data. Each record should have:
{
  "recordType": "schedules",
  "data": {
    "employeeName": "John Doe",
    "date": "2024-01-15",
    "startTime": "09:00",
    "endTime": "17:00",
    "role": "Manager",
    "location": "Downtown Office"
  },
  "confidence": 0.95,
  "warnings": []
}`,
      payroll: basePrompt + `Extract payroll data. Each record should have:
{
  "recordType": "payroll",
  "data": {
    "employeeName": "John Doe",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-15",
    "regularHours": 80,
    "overtimeHours": 5,
    "grossPay": 2125.00
  },
  "confidence": 0.95,
  "warnings": []
}`,
      invoices: basePrompt + `Extract invoice data. Each record should have:
{
  "recordType": "invoices",
  "data": {
    "clientName": "ABC Corp",
    "invoiceNumber": "INV-001",
    "date": "2024-01-15",
    "amount": 1500.00,
    "dueDate": "2024-02-15",
    "items": [{"description": "Service", "amount": 1500}]
  },
  "confidence": 0.95,
  "warnings": []
}`,
      clients: basePrompt + `Extract client data. Each record should have:
{
  "recordType": "clients",
  "data": {
    "name": "ABC Corp",
    "contactName": "Jane Smith",
    "email": "jane@abc.com",
    "phone": "+1234567890",
    "billingRate": 75.00
  },
  "confidence": 0.95,
  "warnings": []
}`,
      timesheets: basePrompt + `Extract timesheet data. Each record should have:
{
  "recordType": "timesheets",
  "data": {
    "employeeName": "John Doe",
    "date": "2024-01-15",
    "hoursWorked": 8,
    "notes": "Regular shift"
  },
  "confidence": 0.95,
  "warnings": []
}`,
      other: basePrompt + `Extract any workforce-related data you find. Use your best judgment for structure.`,
    };

    return prompts[documentType] || prompts.other;
  }

  /**
   * Import a single record by type
   */
  private async importRecordByType(
    workspaceId: string,
    recordType: MigrationType,
    data: any
  ): Promise<any> {
    switch (recordType) {
      case 'employees':
        // Import employee (simplified - would need full validation)
        const [employee] = await db.insert(employees).values({
          workspaceId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          workspaceRole: 'employee',
          hourlyRate: data.hourlyRate,
          status: data.status || 'active',
        }).returning();
        return { employeeId: employee.id };

      case 'clients':
        // Import client
        const [client] = await db.insert(clients).values({
          workspaceId,
          name: data.name,
          contactName: data.contactName,
          email: data.email,
          phone: data.phone,
        }).returning();
        return { clientId: client.id };

      case 'schedules':
        // Would need to match employee names to IDs first
        throw new Error('Schedule import requires employee matching - not implemented yet');

      case 'payroll':
      case 'invoices':
      case 'timesheets':
        throw new Error(`${recordType} import not implemented yet`);

      default:
        throw new Error(`Unknown record type: ${recordType}`);
    }
  }

  /**
   * Get migration jobs for workspace
   */
  async getMigrationJobs(workspaceId: string) {
    return db.select()
      .from(migrationJobs)
      .where(eq(migrationJobs.workspaceId, workspaceId))
      .orderBy(desc(migrationJobs.createdAt));
  }

  /**
   * Get migration records for job
   */
  async getMigrationRecords(jobId: string, workspaceId: string) {
    // Fetch records with workspace scoping (security: prevent cross-tenant access)
    return db.select()
      .from(migrationRecords)
      .where(
        and(
          eq(migrationRecords.jobId, jobId),
          eq(migrationRecords.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(migrationRecords.createdAt));
  }
}

export const migrationService = new MigrationService();
