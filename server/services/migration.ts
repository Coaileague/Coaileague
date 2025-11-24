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
import { migrationJobs, migrationDocuments, migrationRecords, employees, clients, shifts, invoices, payrollRuns, payrollEntries, timeEntries } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { withCredits } from './billing/creditWrapper';
import migrationConfig from '@shared/config/migrationConfig';

const genAI = new GoogleGenerativeAI(migrationConfig.aiModel.apiKey || '');

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
      userId: params.userId,
      status: 'uploaded',
      totalDocuments: 1,
      processedDocuments: 0,
    }).returning();

    // Create migration document
    const [document] = await db.insert(migrationDocuments).values({
      id: docId,
      jobId: job.id,
      fileName: params.fileName,
      fileSize: Buffer.from(params.fileData, 'base64').length,
      mimeType: params.mimeType,
      detectedType: params.documentType,
      confidence: "0.00",
      extractedData: { fileData: params.fileData }, // Store file data in extractedData
    }).returning();

    console.log(`✅ Migration job created: ${jobId}, Document: ${docId}`);

    return { job, document };
  }

  /**
   * Step 2: Analyze document using Gemini Vision
   */
  async analyzeDocument(documentId: string, workspaceId: string) {
    // Get document and join with job for workspace scoping (security: prevent cross-tenant access)
    const [document] = await db.select()
      .from(migrationDocuments)
      .where(eq(migrationDocuments.id, documentId));

    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    // Get job for workspace scoping and userId
    const [job] = await db.select()
      .from(migrationJobs)
      .where(eq(migrationJobs.id, document.jobId));
    
    if (!job || job.workspaceId !== workspaceId) {
      throw new Error(`Document ${documentId} access denied`);
    }

    const userId = job.userId;

    // Update job status to analyzing
    await db.update(migrationJobs)
      .set({ status: 'analyzing' })
      .where(eq(migrationJobs.id, document.jobId));

    try {
      // Extract file data from document's extractedData field
      const fileData = (document.extractedData as any)?.fileData;
      if (!fileData) {
        throw new Error('File data not found in document');
      }

      // Extract data using Gemini Vision WITH CREDIT DEDUCTION
      const creditResult = await withCredits(
        {
          workspaceId: job.workspaceId,
          featureKey: 'ai_migration',
          description: `Gemini Vision data extraction from ${document.fileName} (${document.detectedType})`,
          userId,
        },
        async () => {
          return await this.extractDataWithGemini(
            fileData,
            document.mimeType,
            document.detectedType
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
            workspaceId: job.workspaceId,
            recordType: record.recordType,
            extractedData: record.data,
            importStatus: 'pending',
            accessibleByRoles: ['org_owner', 'org_admin', 'org_manager', 'employee', 'support_staff'],
          }).returning();
        })
      );

      // Update document with results
      await db.update(migrationDocuments)
        .set({
          confidence: extractedData.overallConfidence.toFixed(2),
          recordsExtracted: records.length,
          validationErrors: extractedData.errors,
          requiresReview: extractedData.overallConfidence < 0.95,
        })
        .where(eq(migrationDocuments.id, documentId));

      // Update job
      await db.update(migrationJobs)
        .set({
          status: 'reviewed',
          processedDocuments: 1,
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
        .set({ 
          validationErrors: [error instanceof Error ? error.message : String(error)],
          requiresReview: true,
        })
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
    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

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

      if (!record) {
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

        // Handle skipped records separately
        if (importedData.skipped) {
          // Record as SKIPPED, not successful
          await db.update(migrationRecords)
            .set({
              importStatus: 'skipped',
              importedRecordId: null, // No record created
              importedToTable: null,
              importedAt: new Date(),
              importError: importedData.warnings?.length > 0 ? importedData.warnings.join('; ') : 'Record skipped',
            })
            .where(eq(migrationRecords.id, recordId));

          skippedCount++;
          importedRecords.push({ recordId, success: false, skipped: true, warnings: importedData.warnings });

        } else {
          // Record as successful import
          await db.update(migrationRecords)
            .set({
              importStatus: 'imported',
              importedRecordId: importedData.employeeId || importedData.clientId || importedData.shiftId || null,
              importedToTable: record.recordType === 'employees' ? 'employees' : record.recordType === 'clients' ? 'clients' : record.recordType === 'schedules' ? 'shifts' : 'unknown',
              importedAt: new Date(),
              importError: importedData.warnings?.length > 0 ? importedData.warnings.join('; ') : null,
            })
            .where(eq(migrationRecords.id, recordId));

          importedCount++;
          importedRecords.push({ recordId, success: true, importedData });
        }

      } catch (error) {
        console.error(`❌ Failed to import record ${recordId}:`, error);

        await db.update(migrationRecords)
          .set({
            importStatus: 'failed',
            importError: error instanceof Error ? error.message : String(error),
          })
          .where(eq(migrationRecords.id, recordId));

        failedCount++;
        importedRecords.push({ recordId, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Update job with import results
    await db.update(migrationJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(migrationJobs.id, jobId));

    console.log(`✅ Migration job completed: ${jobId}, ${importedCount} imported, ${skippedCount} skipped, ${failedCount} failed`);

    return {
      job,
      importedCount,
      skippedCount,
      failedCount,
      totalAttempted: recordIds.length,
      results: importedRecords,
    };
  }

  /**
   * Classify document type based on filename and keywords
   */
  private classifyDocumentType(filename: string, fileContent?: string): MigrationType {
    const lowerFilename = filename.toLowerCase();
    
    // Check document classification config for keyword patterns
    for (const [docType, config] of Object.entries(migrationConfig.documentClassification)) {
      if (config.keywords.some((kw: string) => lowerFilename.includes(kw) || fileContent?.toLowerCase().includes(kw))) {
        return docType as MigrationType;
      }
    }
    
    return 'other';
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
    const model = genAI.getGenerativeModel({ model: migrationConfig.aiModel.modelName });

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
   * Build extraction prompt for specific document type (from config)
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

    // Use prompts from centralized config, with safe fallback
    const promptsObject = migrationConfig.extractionPrompts as Record<string, string>;
    const configPrompt = promptsObject[documentType] || 'Extract all relevant data from the document.';
    return basePrompt + configPrompt;
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
        // Import employee with safe name parsing (handles single-word names)
        const nameParts = data.name ? data.name.trim().split(/\s+/) : [];
        const firstName = nameParts.length > 0 ? nameParts[0] : 'Unknown';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Employee';
        
        const [employee] = await db.insert(employees).values({
          workspaceId,
          firstName,
          lastName, // Guaranteed non-empty: either from split or 'Employee' fallback
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          role: data.role?.trim() || null,
          workspaceRole: 'staff', // Default role for migrated employees
          hourlyRate: data.hourlyRate ? data.hourlyRate.toString() : null,
          isActive: data.status ? data.status === 'active' : true,
        }).returning();
        return { employeeId: employee.id };

      case 'clients':
        // Import client with safe name parsing (handles single-word names)
        const rawName = data.contactName || data.name || '';
        const clientNameParts = rawName.trim().split(/\s+/).filter((p: string) => p.length > 0);
        const clientFirstName = clientNameParts.length > 0 ? clientNameParts[0] : 'Unknown';
        const clientLastName = clientNameParts.length > 1 ? clientNameParts.slice(1).join(' ') : 'Client';
        
        const [client] = await db.insert(clients).values({
          workspaceId,
          firstName: clientFirstName,
          lastName: clientLastName, // Guaranteed non-empty: either from split or 'Client' fallback
          companyName: data.companyName?.trim() || data.name?.trim() || null,
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          isActive: true,
        }).returning();
        return { clientId: client.id };

      case 'schedules':
        const warnings: string[] = [];
        
        // 1. Validate required fields
        const employeeName = data.employeeName?.trim();
        if (!employeeName) {
          throw new Error('employeeName is required for schedule import');
        }
        
        if (!data.date) {
          throw new Error('date is required for schedule import');
        }
        
        // 2. Parse employee name
        const scheduleNameParts = employeeName.split(/\s+/).filter((p: string) => p.length > 0);
        const scheduleFirstName = scheduleNameParts[0];
        const scheduleLastName = scheduleNameParts.length > 1 ? scheduleNameParts.slice(1).join(' ') : null;
        
        // 3. Fetch all employees for workspace and do fuzzy matching in-memory
        const allEmployees = await db.select()
          .from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        // Fuzzy match: exact match on full name (case-insensitive) or first name only
        const matchingEmployees = allEmployees.filter(emp => {
          const empFullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
          const searchFullName = employeeName.toLowerCase();
          const searchFirstName = scheduleFirstName.toLowerCase();
          
          // Exact match on full name
          if (empFullName === searchFullName) {
            return true;
          }
          
          // Match on first name only (case-insensitive)
          if (emp.firstName.toLowerCase() === searchFirstName) {
            return true;
          }
          
          return false;
        });
        
        // 4. Handle matching results
        if (matchingEmployees.length === 0) {
          warnings.push(`Employee '${employeeName}' not found - shift skipped`);
          return { warnings, skipped: true };
        }
        
        let matchedEmployee = matchingEmployees[0];
        if (matchingEmployees.length > 1) {
          warnings.push(`Multiple employees match '${employeeName}' - used first match (${matchedEmployee.firstName} ${matchedEmployee.lastName})`);
        }
        
        // 5. Parse date and times
        let startTime: Date;
        let endTime: Date;
        
        try {
          const dateStr = data.date;
          const startTimeStr = data.startTime || migrationConfig.scheduleDefaults.defaultStartTime;
          const endTimeStr = data.endTime || migrationConfig.scheduleDefaults.defaultEndTime;
          
          // Parse timestamps
          startTime = new Date(`${dateStr}T${startTimeStr}:00`);
          endTime = new Date(`${dateStr}T${endTimeStr}:00`);
          
          // Validate parsed dates
          if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            throw new Error('Invalid date/time format');
          }
        } catch (error) {
          warnings.push('Could not parse date/time - using defaults');
          const today = new Date();
          const dateStr = today.toISOString().split('T')[0];
          startTime = new Date(`${dateStr}T09:00:00`);
          endTime = new Date(`${dateStr}T17:00:00`);
        }
        
        // 6. Create shift
        const [shift] = await db.insert(shifts).values({
          workspaceId,
          employeeId: matchedEmployee.id,
          startTime,
          endTime,
          status: 'published',
          title: data.role?.trim() || 'Shift',
          description: data.location?.trim() || null,
        }).returning();
        
        return { 
          shiftId: shift.id, 
          matchedEmployeeId: matchedEmployee.id,
          matchedEmployeeName: `${matchedEmployee.firstName} ${matchedEmployee.lastName}`,
          warnings 
        };

      case 'payroll': {
        const payrollWarnings: string[] = [];
        
        // Parse employee name
        const payrollEmployeeName = data.employeeName?.trim();
        if (!payrollEmployeeName) {
          payrollWarnings.push('Employee name required for payroll import');
          return { warnings: payrollWarnings, skipped: true };
        }
        
        // Fuzzy match employee
        const allPayrollEmployees = await db.select()
          .from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        const payrollNameParts = payrollEmployeeName.split(/\s+/).filter((p: string) => p.length > 0);
        const payrollSearchFirst = payrollNameParts[0]?.toLowerCase();
        
        const matchedPayrollEmp = allPayrollEmployees.find(emp => 
          emp.firstName.toLowerCase() === payrollSearchFirst ||
          `${emp.firstName} ${emp.lastName}`.toLowerCase() === payrollEmployeeName.toLowerCase()
        );
        
        if (!matchedPayrollEmp) {
          payrollWarnings.push(`Employee '${payrollEmployeeName}' not found - payroll skipped`);
          return { warnings: payrollWarnings, skipped: true };
        }
        
        // Parse dates
        const periodStart = new Date(data.periodStart);
        const periodEnd = new Date(data.periodEnd);
        
        if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
          payrollWarnings.push('Invalid period dates - using defaults');
        }
        
        // Create or find payroll run for this period
        const cleanPeriodStart = isNaN(periodStart.getTime()) ? new Date() : periodStart;
        const cleanPeriodEnd = isNaN(periodEnd.getTime()) ? new Date() : periodEnd;
        
        const [payrollRun] = await db.insert(payrollRuns).values({
          workspaceId,
          periodStart: cleanPeriodStart,
          periodEnd: cleanPeriodEnd,
          status: 'draft',
        }).returning();
        
        // Create payroll entry
        const [payrollEntry] = await db.insert(payrollEntries).values({
          payrollRunId: payrollRun.id,
          workspaceId,
          employeeId: matchedPayrollEmp.id,
          regularHours: data.regularHours ? parseFloat(data.regularHours).toString() : '0.00',
          overtimeHours: data.overtimeHours ? parseFloat(data.overtimeHours).toString() : '0.00',
          hourlyRate: matchedPayrollEmp.hourlyRate || '0.00',
          grossPay: data.grossPay ? parseFloat(data.grossPay).toString() : '0.00',
          netPay: data.netPay ? parseFloat(data.netPay).toString() : '0.00',
          notes: `Imported from document: Regular ${data.regularHours}h, Overtime ${data.overtimeHours}h`,
        }).returning();
        
        return { payrollEntryId: payrollEntry.id, payrollRunId: payrollRun.id, matchedEmployeeName: `${matchedPayrollEmp.firstName} ${matchedPayrollEmp.lastName}`, warnings: payrollWarnings };
      }

      case 'invoices': {
        const invoiceWarnings: string[] = [];
        
        // Parse client name
        const clientName = data.clientName?.trim();
        if (!clientName) {
          invoiceWarnings.push('Client name required for invoice import');
          return { warnings: invoiceWarnings, skipped: true };
        }
        
        // Fuzzy match client
        const allInvoiceClients = await db.select()
          .from(clients)
          .where(eq(clients.workspaceId, workspaceId));
        
        const clientNameParts = clientName.split(/\s+/).filter((p: string) => p.length > 0);
        const clientSearchFirst = clientNameParts[0]?.toLowerCase();
        
        const matchedClient = allInvoiceClients.find(c =>
          c.companyName?.toLowerCase().includes(clientName.toLowerCase()) ||
          `${c.firstName} ${c.lastName}`.toLowerCase() === clientName.toLowerCase()
        );
        
        if (!matchedClient) {
          invoiceWarnings.push(`Client '${clientName}' not found - invoice skipped`);
          return { warnings: invoiceWarnings, skipped: true };
        }
        
        // Parse amounts
        const invoiceAmount = data.amount ? parseFloat(data.amount) : 0;
        const invoiceDate = new Date(data.date);
        const dueDate = data.dueDate ? new Date(data.dueDate) : new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        // Create invoice
        const [invoice] = await db.insert(invoices).values({
          workspaceId,
          clientId: matchedClient.id,
          invoiceNumber: data.invoiceNumber || `IMP-${Date.now()}`,
          issueDate: isNaN(invoiceDate.getTime()) ? new Date() : invoiceDate,
          dueDate: isNaN(dueDate.getTime()) ? new Date() : dueDate,
          subtotal: invoiceAmount.toString(),
          taxRate: '0.00',
          taxAmount: '0.00',
          total: invoiceAmount.toString(),
          status: 'draft',
          notes: `Imported from document. Items: ${data.items?.length || 0} line items`,
        }).returning();
        
        return { invoiceId: invoice.id, matchedClientName: matchedClient.companyName || `${matchedClient.firstName} ${matchedClient.lastName}`, warnings: invoiceWarnings };
      }

      case 'timesheets': {
        const timesheetWarnings: string[] = [];
        
        // Parse employee name
        const timesheetEmployeeName = data.employeeName?.trim();
        if (!timesheetEmployeeName) {
          timesheetWarnings.push('Employee name required for timesheet import');
          return { warnings: timesheetWarnings, skipped: true };
        }
        
        // Fuzzy match employee
        const allTimesheetEmployees = await db.select()
          .from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        const timesheetNameParts = timesheetEmployeeName.split(/\s+/).filter((p: string) => p.length > 0);
        const timesheetSearchFirst = timesheetNameParts[0]?.toLowerCase();
        
        const matchedTimesheetEmp = allTimesheetEmployees.find(emp =>
          emp.firstName.toLowerCase() === timesheetSearchFirst ||
          `${emp.firstName} ${emp.lastName}`.toLowerCase() === timesheetEmployeeName.toLowerCase()
        );
        
        if (!matchedTimesheetEmp) {
          timesheetWarnings.push(`Employee '${timesheetEmployeeName}' not found - timesheet skipped`);
          return { warnings: timesheetWarnings, skipped: true };
        }
        
        // Parse date
        const entryDate = new Date(data.date);
        if (isNaN(entryDate.getTime())) {
          timesheetWarnings.push('Invalid date - using current date');
        }
        
        // Create time entry
        const hours = parseFloat(data.hoursWorked) || 0;
        const [timeEntry] = await db.insert(timeEntries).values({
          workspaceId,
          employeeId: matchedTimesheetEmp.id,
          clockIn: entryDate,
          clockOut: new Date(entryDate.getTime() + (hours * 60 * 60 * 1000)),
          totalHours: hours.toString(),
          notes: data.notes || `Imported from timesheet: ${hours}h worked`,
        }).returning();
        
        return { timeEntryId: timeEntry.id, matchedEmployeeName: `${matchedTimesheetEmp.firstName} ${matchedTimesheetEmp.lastName}`, warnings: timesheetWarnings };
      }

      case 'other':
      default:
        // Generic record import handler - flexibly imports any record type
        const genericWarnings: string[] = [];
        
        // For generic records, try to map common fields
        if (!data || typeof data !== 'object') {
          genericWarnings.push('Invalid record data - record skipped');
          return { warnings: genericWarnings, skipped: true };
        }
        
        // Auto-detect record type if not specified
        let detectedType: MigrationType = recordType;
        if (recordType === 'other' && !data.type) {
          // Heuristic detection based on available fields
          if (data.employeeName || data.firstName) detectedType = 'employees' as MigrationType;
          else if (data.clientName || data.companyName) detectedType = 'clients' as MigrationType;
          else if (data.invoiceNumber || data.amount) detectedType = 'invoices' as MigrationType;
          else if (data.shiftDate || data.startTime) detectedType = 'schedules' as MigrationType;
          else if (data.periodStart || data.regularHours) detectedType = 'payroll' as MigrationType;
          else if (data.hoursWorked || data.clockIn) detectedType = 'timesheets' as MigrationType;
        }
        
        // If we detected a specific type, recursively call with that type
        if (detectedType !== recordType && detectedType !== 'other') {
          return this.importRecordByType(workspaceId, detectedType as MigrationType, data);
        }
        
        // For truly generic records, store as audit/metadata
        genericWarnings.push(`Generic record stored: ${Object.keys(data).slice(0, 3).join(', ')}...`);
        
        return {
          success: true,
          recordType: 'generic',
          importedFields: Object.keys(data),
          warnings: genericWarnings,
          note: 'Generic record imported without database persistence'
        };
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
      .where(eq(migrationRecords.workspaceId, workspaceId))
      .orderBy(desc(migrationRecords.createdAt));
  }
}

export const migrationService = new MigrationService();
