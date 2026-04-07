/**
 * DOCUMENT UNDERSTANDING PIPELINE
 * ================================
 * AI-powered document ingestion and extraction for new organization setup.
 * Uses Gemini Vision for OCR and table extraction from business documents.
 * 
 * Capabilities:
 * - PDF/Image OCR with Gemini Vision
 * - Table extraction from financial documents
 * - Employee roster import from spreadsheets
 * - Schedule template recognition
 * - Automated org configuration from documents
 */

import { db } from '../../db';
import { 
  employees, 
  workspaces, 
  shifts,
  systemAuditLogs 
} from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { automationOrchestration } from '../orchestration/automationOrchestration';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { createLogger } from '../../lib/logger';
const log = createLogger('documentUnderstandingPipeline');

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentIngestionRequest {
  pipelineId?: string;
  workspaceId: string;
  userId: string;
  documents: DocumentInput[];
  extractionConfig?: ExtractionConfig;
}

export interface DocumentInput {
  type: 'pdf' | 'image' | 'excel' | 'csv' | 'text';
  fileName: string;
  content: string | Buffer;
  mimeType?: string;
}

export interface ExtractionConfig {
  extractEmployees?: boolean;
  extractSchedules?: boolean;
  extractPositions?: boolean;
  extractPayRates?: boolean;
  extractContacts?: boolean;
  validateData?: boolean;
}

export interface ExtractionResult {
  pipelineId: string;
  status: 'success' | 'partial' | 'failed';
  extractedData: {
    employees?: ExtractedEmployee[];
    schedules?: ExtractedSchedule[];
    positions?: ExtractedPosition[];
    contacts?: ExtractedContact[];
  };
  validationResults: ValidationResult[];
  confidence: number;
  processingTimeMs: number;
  warnings: string[];
  errors: string[];
}

export interface ExtractedEmployee {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  hireDate?: string;
  payRate?: number;
  payType?: 'hourly' | 'salary';
  confidence: number;
}

export interface ExtractedSchedule {
  employeeName?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  position?: string;
  confidence: number;
}

export interface ExtractedPosition {
  name: string;
  department?: string;
  payRateMin?: number;
  payRateMax?: number;
  confidence: number;
}

export interface ExtractedContact {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  confidence: number;
}

export interface ValidationResult {
  field: string;
  value: string;
  isValid: boolean;
  issues: string[];
  suggestedFix?: string;
}

export interface OrgSetupResult {
  success: boolean;
  workspaceId: string;
  createdRecords: {
    employees: number;
    positions: number;
    scheduleTemplates: number;
  };
  skippedRecords: number;
  errors: string[];
  readinessChecklist: ReadinessCheckItem[];
}

export interface ReadinessCheckItem {
  item: string;
  status: 'complete' | 'incomplete' | 'optional';
  details?: string;
}

// ============================================================================
// DOCUMENT UNDERSTANDING PIPELINE SERVICE
// ============================================================================

class DocumentUnderstandingPipelineService {
  private static instance: DocumentUnderstandingPipelineService;

  static getInstance(): DocumentUnderstandingPipelineService {
    if (!DocumentUnderstandingPipelineService.instance) {
      DocumentUnderstandingPipelineService.instance = new DocumentUnderstandingPipelineService();
    }
    return DocumentUnderstandingPipelineService.instance;
  }

  // ---------------------------------------------------------------------------
  // MAIN INGESTION PIPELINE
  // ---------------------------------------------------------------------------

  async ingestDocuments(request: DocumentIngestionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    const pipelineId = request.pipelineId || crypto.randomUUID();

    log.info(`[DocumentPipeline] Starting ingestion pipeline: ${pipelineId}`);

    const result = await automationOrchestration.executeAutomation(
      {
        domain: 'document',
        automationName: 'document-ingestion-pipeline',
        automationType: 'document_processing',
        triggeredBy: 'api',
        workspaceId: request.workspaceId,
        userId: request.userId,
        payload: {
          pipelineId,
          documentCount: request.documents.length,
          documentTypes: request.documents.map(d => d.type),
        },
        billable: true,
      },
      async (ctx) => {
        const config: ExtractionConfig = {
          extractEmployees: true,
          extractSchedules: true,
          extractPositions: true,
          extractPayRates: true,
          extractContacts: true,
          validateData: true,
          ...request.extractionConfig
        };

        const extractedData: ExtractionResult['extractedData'] = {};
        const validationResults: ValidationResult[] = [];
        const warnings: string[] = [];
        const errors: string[] = [];
        let overallConfidence = 0;
        let documentCount = 0;

        for (const doc of request.documents) {
          documentCount++;
          log.info(`[DocumentPipeline] Processing document ${documentCount}/${request.documents.length}: ${doc.fileName}`);

          try {
            const docResult = await this.processDocument(doc, config, request.workspaceId);
            
            if (docResult.employees?.length) {
              extractedData.employees = [...(extractedData.employees || []), ...docResult.employees];
            }
            if (docResult.schedules?.length) {
              extractedData.schedules = [...(extractedData.schedules || []), ...docResult.schedules];
            }
            if (docResult.positions?.length) {
              extractedData.positions = [...(extractedData.positions || []), ...docResult.positions];
            }
            if (docResult.contacts?.length) {
              extractedData.contacts = [...(extractedData.contacts || []), ...docResult.contacts];
            }

            overallConfidence += docResult.confidence;
            warnings.push(...docResult.warnings);
          } catch (docError: any) {
            errors.push(`Failed to process ${doc.fileName}: ${docError.message}`);
          }
        }

        overallConfidence = documentCount > 0 ? overallConfidence / documentCount : 0;

        const EXTRACTION_CONFIDENCE_THRESHOLD = 0.7;
        const flagLowConfidence = (items: any[] | undefined, entityType: string) => {
          if (!items) return;
          for (const item of items) {
            if (item.confidence !== undefined && item.confidence < EXTRACTION_CONFIDENCE_THRESHOLD) {
              item.requiresHumanReview = true;
              warnings.push(`Low confidence ${entityType} extraction (${Math.round(item.confidence * 100)}%) — flagged for human review: ${item.name || item.title || JSON.stringify(item).slice(0, 80)}`);
            }
          }
        };
        flagLowConfidence(extractedData.employees, 'employee');
        flagLowConfidence(extractedData.schedules, 'schedule');
        flagLowConfidence(extractedData.positions, 'position');
        flagLowConfidence(extractedData.contacts, 'contact');

        if (config.validateData) {
          const validation = await this.validateExtractedData(extractedData);
          validationResults.push(...validation);
        }

        await this.logPipeline(pipelineId, 'ingestion_complete', {
          documentsProcessed: documentCount,
          employeesExtracted: extractedData.employees?.length || 0,
          schedulesExtracted: extractedData.schedules?.length || 0,
          positionsExtracted: extractedData.positions?.length || 0
        });

        platformEventBus.publish({
          type: 'automation' as any,
          title: 'Document Ingestion Complete',
          description: `Extracted ${extractedData.employees?.length || 0} employees, ${extractedData.schedules?.length || 0} schedules`,
          data: { pipelineId, workspaceId: request.workspaceId, extractedCounts: { employees: extractedData.employees?.length || 0, schedules: extractedData.schedules?.length || 0, positions: extractedData.positions?.length || 0 } },
          severity: 'info',
          isNew: true
        }).catch((err) => log.warn('[documentUnderstandingPipeline] Fire-and-forget failed:', err));

        return {
          pipelineId,
          status: errors.length === 0 ? 'success' : warnings.length > 0 ? 'partial' : 'failed',
          extractedData,
          validationResults,
          confidence: overallConfidence,
          processingTimeMs: Date.now() - startTime,
          warnings,
          errors
        };
      }
    );

    if (result.success && result.data) {
      return result.data;
    }

    const errorDetails = [
      result.error || 'Orchestration execution failed',
      result.step ? `(step: ${result.step})` : '',
      result.errorCode ? `[${result.errorCode}]` : '',
    ].filter(Boolean).join(' ');

    return {
      pipelineId,
      status: 'failed',
      extractedData: {},
      validationResults: [],
      confidence: 0,
      processingTimeMs: Date.now() - startTime,
      warnings: [],
      errors: [errorDetails]
    };
  }

  // ---------------------------------------------------------------------------
  // DOCUMENT PROCESSING WITH GEMINI VISION
  // ---------------------------------------------------------------------------

  private async processDocument(
    doc: DocumentInput, 
    config: ExtractionConfig,
    workspaceId?: string
  ): Promise<{
    employees: ExtractedEmployee[];
    schedules: ExtractedSchedule[];
    positions: ExtractedPosition[];
    contacts: ExtractedContact[];
    confidence: number;
    warnings: string[];
  }> {
    const employees: ExtractedEmployee[] = [];
    const schedules: ExtractedSchedule[] = [];
    const positions: ExtractedPosition[] = [];
    const contacts: ExtractedContact[] = [];
    const warnings: string[] = [];
    let confidence = 0;

    // Use Gemini Vision for image/PDF processing
    if (doc.type === 'pdf' || doc.type === 'image') {
      const visionResult = await this.processWithVision(doc, config, workspaceId);
      employees.push(...visionResult.employees);
      schedules.push(...visionResult.schedules);
      positions.push(...visionResult.positions);
      contacts.push(...visionResult.contacts);
      confidence = visionResult.confidence;
      warnings.push(...visionResult.warnings);
    } else if (doc.type === 'csv' || doc.type === 'text') {
      // Process structured text data
      const textResult = await this.processTextDocument(doc, config);
      employees.push(...textResult.employees);
      schedules.push(...textResult.schedules);
      positions.push(...textResult.positions);
      confidence = textResult.confidence;
    }

    return { employees, schedules, positions, contacts, confidence, warnings };
  }

  private async processWithVision(
    doc: DocumentInput,
    config: ExtractionConfig,
    workspaceId?: string
  ): Promise<{
    employees: ExtractedEmployee[];
    schedules: ExtractedSchedule[];
    positions: ExtractedPosition[];
    contacts: ExtractedContact[];
    confidence: number;
    warnings: string[];
  }> {
    const prompt = `Analyze this document and extract structured workforce data.

Extract the following (if present):
${config.extractEmployees ? '1. EMPLOYEES: First name, last name, email, phone, position, department, hire date, pay rate, pay type (hourly/salary)' : ''}
${config.extractSchedules ? '2. SCHEDULES: Employee name, day of week, start time, end time, position' : ''}
${config.extractPositions ? '3. POSITIONS: Position name, department, pay rate range' : ''}
${config.extractContacts ? '4. CONTACTS: Name, role, email, phone' : ''}

Return a JSON object with this structure:
{
  "employees": [...],
  "schedules": [...],
  "positions": [...],
  "contacts": [...],
  "confidence": 0.0-1.0,
  "warnings": [...]
}

Only include fields where data was found. Estimate confidence based on data clarity.`;

    try {
      const contentString = typeof doc.content === 'string' 
        ? doc.content 
        : doc.content.toString('base64');

      const fullPrompt = `${prompt}\n\nDocument content (${doc.type}): ${contentString.substring(0, 10000)}`;

      const genResult = await meteredGemini.generate({
        prompt: fullPrompt,
        workspaceId: workspaceId,
        featureKey: 'ai_document_processing',
        systemInstruction: 'You are a document analysis AI. Extract structured data from documents and return valid JSON.',
      });

      const responseText = genResult.text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          employees: (parsed.employees || []).map((e: any) => ({ ...e, confidence: parsed.confidence || 0.7 })),
          schedules: (parsed.schedules || []).map((s: any) => ({ ...s, confidence: parsed.confidence || 0.7 })),
          positions: (parsed.positions || []).map((p: any) => ({ ...p, confidence: parsed.confidence || 0.7 })),
          contacts: (parsed.contacts || []).map((c: any) => ({ ...c, confidence: parsed.confidence || 0.7 })),
          confidence: parsed.confidence || 0.7,
          warnings: parsed.warnings || []
        };
      }

      return {
        employees: [],
        schedules: [],
        positions: [],
        contacts: [],
        confidence: 0,
        warnings: ['Could not parse document structure']
      };

    } catch (error: any) {
      log.error('[DocumentPipeline] Vision processing error:', error);
      return {
        employees: [],
        schedules: [],
        positions: [],
        contacts: [],
        confidence: 0,
        warnings: [`Vision processing failed: ${(error instanceof Error ? error.message : String(error))}`]
      };
    }
  }

  private async processTextDocument(
    doc: DocumentInput,
    config: ExtractionConfig
  ): Promise<{
    employees: ExtractedEmployee[];
    schedules: ExtractedSchedule[];
    positions: ExtractedPosition[];
    confidence: number;
  }> {
    const content = typeof doc.content === 'string' ? doc.content : doc.content.toString('utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const employees: ExtractedEmployee[] = [];
    const schedules: ExtractedSchedule[] = [];
    const positions: ExtractedPosition[] = [];

    // Detect CSV structure
    if (lines.length > 0 && lines[0].includes(',')) {
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        // Try to extract employee
        if (config.extractEmployees && (row['first name'] || row['firstname'] || row['name'])) {
          const nameParts = (row['name'] || '').split(' ');
          employees.push({
            firstName: row['first name'] || row['firstname'] || nameParts[0] || '',
            lastName: row['last name'] || row['lastname'] || nameParts.slice(1).join(' ') || '',
            email: row['email'] || row['e-mail'] || '',
            phone: row['phone'] || row['telephone'] || row['mobile'] || '',
            position: row['position'] || row['title'] || row['job title'] || '',
            department: row['department'] || row['dept'] || '',
            payRate: parseFloat(row['pay rate'] || row['rate'] || row['salary'] || '0') || undefined,
            payType: row['pay type']?.toLowerCase().includes('salary') ? 'salary' : 'hourly',
            confidence: 0.8
          });
        }

        // Try to extract schedule
        if (config.extractSchedules && (row['day'] || row['shift'])) {
          schedules.push({
            employeeName: row['employee'] || row['name'] || '',
            dayOfWeek: row['day'] || row['day of week'] || '',
            startTime: row['start'] || row['start time'] || '',
            endTime: row['end'] || row['end time'] || '',
            position: row['position'] || '',
            confidence: 0.8
          });
        }
      }
    }

    return {
      employees,
      schedules,
      positions,
      confidence: employees.length > 0 || schedules.length > 0 ? 0.8 : 0.3
    };
  }

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------

  private async validateExtractedData(data: ExtractionResult['extractedData']): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Validate employees
    if (data.employees) {
      for (const emp of data.employees) {
        // Validate email format
        if (emp.email && !this.isValidEmail(emp.email)) {
          results.push({
            field: 'employee.email',
            value: emp.email,
            isValid: false,
            issues: ['Invalid email format'],
            suggestedFix: 'Check and correct email address'
          });
        }

        // Validate required fields
        if (!emp.firstName || !emp.lastName) {
          results.push({
            field: 'employee.name',
            value: `${emp.firstName} ${emp.lastName}`,
            isValid: false,
            issues: ['Missing first or last name'],
            suggestedFix: 'Ensure both first and last names are provided'
          });
        }
      }
    }

    // Validate schedules
    if (data.schedules) {
      for (const sched of data.schedules) {
        if (!this.isValidTime(sched.startTime) || !this.isValidTime(sched.endTime)) {
          results.push({
            field: 'schedule.time',
            value: `${sched.startTime} - ${sched.endTime}`,
            isValid: false,
            issues: ['Invalid time format'],
            suggestedFix: 'Use HH:MM format (e.g., 09:00)'
          });
        }
      }
    }

    return results;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidTime(time: string): boolean {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  }

  // ---------------------------------------------------------------------------
  // ORG SETUP FROM EXTRACTED DATA
  // ---------------------------------------------------------------------------

  async setupOrgFromExtraction(
    workspaceId: string,
    userId: string,
    extractionResult: ExtractionResult
  ): Promise<OrgSetupResult> {
    log.info(`[DocumentPipeline] Setting up org from extracted data for workspace: ${workspaceId}`);

    const createdRecords = { employees: 0, positions: 0, scheduleTemplates: 0 };
    let skippedRecords = 0;
    const errors: string[] = [];
    const { extractedData } = extractionResult;

    try {
      if (extractedData.positions?.length) {
        for (const pos of extractedData.positions) {
          log.info(`[DocumentPipeline] Position extracted: "${pos.name}" - mapped to employee.position field`);
        }
        createdRecords.positions = 0;
      }

      // Create employees
      if (extractedData.employees?.length) {
        for (const emp of extractedData.employees) {
          if (!emp.firstName || !emp.lastName) {
            skippedRecords++;
            continue;
          }

          try {
            await db.insert(employees).values({
              id: crypto.randomUUID(),
              workspaceId,
              firstName: emp.firstName,
              lastName: emp.lastName,
              email: emp.email || `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}@${workspaceId}.internal`,
              phone: emp.phone || null,
              role: emp.position || null,
              hireDate: emp.hireDate ? new Date(emp.hireDate) : new Date(),
              hourlyRate: emp.payRate?.toString() || null,
              payType: emp.payType || 'hourly',
              isActive: true,
              createdAt: new Date()
            });
            createdRecords.employees++;
          } catch (err: any) {
            if (err.code === '23505') {
              skippedRecords++;
            } else {
              errors.push(`Failed to create employee ${emp.firstName} ${emp.lastName}: ${(err instanceof Error ? err.message : String(err))}`);
            }
          }
        }
      }

      // Generate readiness checklist
      const readinessChecklist = this.generateReadinessChecklist(extractedData, createdRecords);

      // Log operation
      await this.logPipeline(extractionResult.pipelineId, 'org_setup_complete', {
        workspaceId,
        createdRecords,
        skippedRecords
      });

      // Emit event
      platformEventBus.publish({
        type: 'automation' as any,
        title: 'Organization Setup Complete',
        description: `Created ${createdRecords.employees} employees, ${createdRecords.positions} positions`,
        data: { workspaceId, createdRecords },
        severity: 'success',
        isNew: true
      }).catch((err) => log.warn('[documentUnderstandingPipeline] Fire-and-forget failed:', err));

      return {
        success: errors.length === 0,
        workspaceId,
        createdRecords,
        skippedRecords,
        errors,
        readinessChecklist
      };

    } catch (error: any) {
      log.error('[DocumentPipeline] Org setup error:', error);
      return {
        success: false,
        workspaceId,
        createdRecords,
        skippedRecords,
        errors: [(error instanceof Error ? error.message : String(error))],
        readinessChecklist: []
      };
    }
  }

  private generateReadinessChecklist(
    data: ExtractionResult['extractedData'],
    created: OrgSetupResult['createdRecords']
  ): ReadinessCheckItem[] {
    return [
      {
        item: 'Employees imported',
        status: created.employees > 0 ? 'complete' : 'incomplete',
        details: `${created.employees} employees created`
      },
      {
        item: 'Positions configured',
        status: created.positions > 0 ? 'complete' : data.positions?.length ? 'incomplete' : 'optional',
        details: `${created.positions} positions created`
      },
      {
        item: 'Schedule templates ready',
        status: created.scheduleTemplates > 0 ? 'complete' : 'optional',
        details: 'Configure schedule templates in Settings'
      },
      {
        item: 'Email verification pending',
        status: 'incomplete',
        details: 'Send invitation emails to employees'
      },
      {
        item: 'Pay rates configured',
        status: (data.employees?.filter(e => e.payRate)?.length || 0) > 0 ? 'complete' : 'optional',
        details: 'Review and confirm pay rates'
      },
      {
        item: 'Trinity AI initialized',
        status: 'complete',
        details: 'AI assistant ready to help'
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // LOGGING
  // ---------------------------------------------------------------------------

  private async logPipeline(pipelineId: string, action: string, data: Record<string, any>): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        action: `document_pipeline:${action}`,
        entityType: 'document_pipeline',
        entityId: pipelineId,
        changes: { ...data } as any,
        createdAt: new Date()
      });
    } catch (error) {
      log.error('[DocumentPipeline] Failed to log operation:', error);
    }
  }
}

export const documentUnderstandingPipeline = DocumentUnderstandingPipelineService.getInstance();
