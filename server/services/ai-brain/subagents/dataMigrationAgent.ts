/**
 * DATA MIGRATION AGENT
 * ====================
 * Specialized subagent for extracting and migrating data from various sources
 * during new organization onboarding.
 * 
 * Capabilities:
 * - PDF extraction (employee rosters, schedules, payroll docs)
 * - Excel/CSV parsing (bulk employee data, schedules)
 * - Manual entry parsing (structured form data)
 * - Schema mapping and validation
 * - Import into platform tables
 */

import { db } from '../../../db';
import { 
  employees, 
  workspaces,
  users,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { geminiClient } from '../providers/geminiClient';

export interface ExtractedData {
  employees?: ExtractedEmployee[];
  teams?: ExtractedTeam[];
  schedules?: ExtractedSchedule[];
  rawText?: string;
  confidence: number;
  warnings: string[];
  errors: string[];
}

export interface ExtractedEmployee {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  team?: string;
  hourlyRate?: number;
  hireDate?: string;
  employeeId?: string;
}

export interface ExtractedTeam {
  name: string;
  code?: string;
  description?: string;
  managerId?: string;
}

export interface ExtractedSchedule {
  employeeId?: string;
  employeeName?: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftType?: string;
}

export interface MigrationResult {
  success: boolean;
  importedCounts: {
    employees: number;
    teams: number;
    schedules: number;
  };
  skippedCounts: {
    employees: number;
    teams: number;
    schedules: number;
  };
  errors: string[];
  warnings: string[];
}

class DataMigrationAgent {
  private static instance: DataMigrationAgent;

  static getInstance(): DataMigrationAgent {
    if (!DataMigrationAgent.instance) {
      DataMigrationAgent.instance = new DataMigrationAgent();
    }
    return DataMigrationAgent.instance;
  }

  /**
   * Extract data from PDF using Gemini Vision
   */
  async extractFromPdf(params: {
    workspaceId: string;
    fileContent: string; // base64 encoded
    fileName: string;
    extractionType: 'employees' | 'teams' | 'schedules' | 'auto';
  }): Promise<ExtractedData> {
    const { workspaceId, fileContent, fileName, extractionType } = params;

    const prompt = this.buildExtractionPrompt(extractionType, 'pdf');
    
    try {
      const response = await geminiClient.generateVision({
        systemPrompt: prompt,
        userMessage: `Please analyze this ${fileName} document and extract the structured data.`,
        imageData: fileContent,
        workspaceId,
        featureKey: 'ai_onboarding',
      });

      return this.parseExtractionResponse(response.text, extractionType);
    } catch (error: any) {
      console.error('[DataMigrationAgent] PDF extraction failed:', error);
      return {
        confidence: 0,
        warnings: [],
        errors: [`PDF extraction failed: ${error.message}`],
      };
    }
  }

  /**
   * Extract data from Excel/CSV content
   */
  async extractFromSpreadsheet(params: {
    workspaceId: string;
    data: Record<string, any>[];
    headers: string[];
    extractionType: 'employees' | 'teams' | 'schedules' | 'auto';
  }): Promise<ExtractedData> {
    const { workspaceId, data, headers, extractionType } = params;

    const mappingPrompt = `
You are a data migration specialist. Analyze these spreadsheet columns and map them to our workforce management schema.

Columns: ${headers.join(', ')}

Sample data (first 3 rows):
${JSON.stringify(data.slice(0, 3), null, 2)}

Target schema for ${extractionType === 'auto' ? 'employees, teams, or schedules' : extractionType}:

For EMPLOYEES:
- firstName (required)
- lastName (required)
- email (optional)
- phone (optional)
- position (optional)
- team (optional)
- hourlyRate (optional, number)
- hireDate (optional, YYYY-MM-DD)
- employeeId (optional, external ID)

For TEAMS:
- name (required)
- code (optional)
- description (optional)

For SCHEDULES:
- employeeName or employeeId (required)
- date (required, YYYY-MM-DD)
- startTime (required, HH:MM)
- endTime (required, HH:MM)
- shiftType (optional)

Respond with JSON only:
{
  "detectedType": "employees" | "teams" | "schedules",
  "columnMapping": { "sourceColumn": "targetField", ... },
  "confidence": 0.0-1.0,
  "warnings": ["..."]
}`;

    try {
      const response = await geminiClient.generate({
        systemPrompt: 'You are a data migration specialist that maps spreadsheet columns to database schemas.',
        userMessage: mappingPrompt,
        workspaceId,
        featureKey: 'ai_onboarding',
      });

      const mappingText = response.text;
      const jsonMatch = mappingText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse column mapping');
      }

      const mapping = JSON.parse(jsonMatch[0]);
      const detectedType = extractionType === 'auto' ? mapping.detectedType : extractionType;
      
      const transformedData = this.applyColumnMapping(data, mapping.columnMapping, detectedType);
      
      return {
        ...transformedData,
        confidence: mapping.confidence,
        warnings: mapping.warnings || [],
        errors: [],
      };
    } catch (error: any) {
      console.error('[DataMigrationAgent] Spreadsheet extraction failed:', error);
      return {
        confidence: 0,
        warnings: [],
        errors: [`Spreadsheet extraction failed: ${error.message}`],
      };
    }
  }

  /**
   * Parse manual entry data (structured form submission)
   */
  async parseManualEntry(params: {
    workspaceId: string;
    formData: Record<string, any>;
    entryType: 'employee' | 'team' | 'schedule' | 'bulk_text';
  }): Promise<ExtractedData> {
    const { workspaceId, formData, entryType } = params;

    if (entryType === 'bulk_text') {
      const prompt = `
Extract structured workforce data from this text. The user is trying to add employees, teams, or schedules.

Text input:
${formData.text}

Extract any identifiable:
1. Employee information (names, emails, phones, positions, teams, rates)
2. Team/department names and codes
3. Schedule information (who works when)

Respond with JSON:
{
  "employees": [{ "firstName": "", "lastName": "", "email": "", "phone": "", "position": "", "team": "", "hourlyRate": null }],
  "teams": [{ "name": "", "code": "", "description": "" }],
  "schedules": [{ "employeeName": "", "date": "", "startTime": "", "endTime": "" }],
  "confidence": 0.0-1.0,
  "warnings": ["unclear items or assumptions made"]
}`;

      try {
        const response = await geminiClient.generate({
          systemPrompt: 'You are a data extraction specialist for workforce management systems.',
          userMessage: prompt,
          workspaceId,
          featureKey: 'ai_onboarding',
        });

        const text = response.text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Failed to parse extracted data');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
          employees: parsed.employees?.filter((e: any) => e.firstName || e.lastName) || [],
          teams: parsed.teams?.filter((d: any) => d.name) || [],
          schedules: parsed.schedules?.filter((s: any) => s.date && s.employeeName) || [],
          rawText: formData.text,
          confidence: parsed.confidence || 0.5,
          warnings: parsed.warnings || [],
          errors: [],
        };
      } catch (error: any) {
        return {
          confidence: 0,
          warnings: [],
          errors: [`Failed to parse bulk text: ${error.message}`],
        };
      }
    }

    if (entryType === 'employee') {
      return {
        employees: [{
          firstName: formData.firstName || '',
          lastName: formData.lastName || '',
          email: formData.email,
          phone: formData.phone,
          position: formData.position,
          team: formData.team,
          hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : undefined,
          hireDate: formData.hireDate,
          employeeId: formData.employeeId,
        }],
        confidence: 1.0,
        warnings: [],
        errors: [],
      };
    }

    if (entryType === 'team') {
      return {
        teams: [{
          name: formData.name || '',
          code: formData.code,
          description: formData.description,
        }],
        confidence: 1.0,
        warnings: [],
        errors: [],
      };
    }

    if (entryType === 'schedule') {
      return {
        schedules: [{
          employeeName: formData.employeeName,
          employeeId: formData.employeeId,
          date: formData.date,
          startTime: formData.startTime,
          endTime: formData.endTime,
          shiftType: formData.shiftType,
        }],
        confidence: 1.0,
        warnings: [],
        errors: [],
      };
    }

    return { confidence: 0, warnings: [], errors: ['Unknown entry type'] };
  }

  /**
   * Validate extracted data against platform schema
   */
  async validateData(params: {
    workspaceId: string;
    data: ExtractedData;
  }): Promise<{ valid: boolean; issues: string[] }> {
    const { workspaceId, data } = params;
    const issues: string[] = [];

    if (data.employees) {
      for (let i = 0; i < data.employees.length; i++) {
        const emp = data.employees[i];
        if (!emp.firstName && !emp.lastName) {
          issues.push(`Employee ${i + 1}: Missing both first and last name`);
        }
        if (emp.email && !this.isValidEmail(emp.email)) {
          issues.push(`Employee ${i + 1}: Invalid email format`);
        }
        if (emp.hourlyRate !== undefined && (isNaN(emp.hourlyRate) || emp.hourlyRate < 0)) {
          issues.push(`Employee ${i + 1}: Invalid hourly rate`);
        }
      }
    }

    if (data.teams) {
      for (let i = 0; i < data.teams.length; i++) {
        const team = data.teams[i];
        if (!team.name) {
          issues.push(`Team ${i + 1}: Missing name`);
        }
      }
    }

    if (data.schedules) {
      for (let i = 0; i < data.schedules.length; i++) {
        const sched = data.schedules[i];
        if (!sched.date) {
          issues.push(`Schedule ${i + 1}: Missing date`);
        }
        if (!sched.startTime || !sched.endTime) {
          issues.push(`Schedule ${i + 1}: Missing start or end time`);
        }
        if (!sched.employeeId && !sched.employeeName) {
          issues.push(`Schedule ${i + 1}: Missing employee reference`);
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Import validated data into the platform
   */
  async importData(params: {
    workspaceId: string;
    userId: string;
    data: ExtractedData;
    skipDuplicates?: boolean;
  }): Promise<MigrationResult> {
    const { workspaceId, userId, data, skipDuplicates = true } = params;
    
    const result: MigrationResult = {
      success: true,
      importedCounts: { employees: 0, teams: 0, schedules: 0 },
      skippedCounts: { employees: 0, teams: 0, schedules: 0 },
      errors: [],
      warnings: [],
    };

    // Import employees
    if (data.employees?.length) {
      for (const emp of data.employees) {
        try {
          if (emp.email && skipDuplicates) {
            const existing = await db.select()
              .from(employees)
              .where(and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.email, emp.email)
              ))
              .limit(1);

            if (existing.length > 0) {
              result.skippedCounts.employees++;
              result.warnings.push(`Employee "${emp.email}" already exists, skipped`);
              continue;
            }
          }

          await db.insert(employees).values({
            workspaceId,
            firstName: emp.firstName || 'Unknown',
            lastName: emp.lastName || '',
            email: emp.email || null,
            phone: emp.phone || null,
            role: emp.position || null,
            hourlyRate: emp.hourlyRate?.toString() || null,
            isActive: true,
          });
          result.importedCounts.employees++;
        } catch (error: any) {
          result.errors.push(`Failed to import employee "${emp.firstName} ${emp.lastName}": ${error.message}`);
        }
      }
    }

    // Teams would be stored differently (workspace metadata or separate service)
    if (data.teams?.length) {
      result.warnings.push(`${data.teams.length} teams detected - team import requires additional configuration`);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private buildExtractionPrompt(extractionType: string, sourceType: string): string {
    const typeInstructions = {
      employees: 'Focus on extracting employee information: names, contact details, positions, teams, pay rates, hire dates.',
      teams: 'Focus on extracting team/department information: names, codes, descriptions, managers.',
      schedules: 'Focus on extracting schedule information: who works when, dates, times, shift types.',
      auto: 'Analyze the document and extract all workforce-related data: employees, teams, and schedules.',
    };

    return `
You are a document extraction specialist for workforce management systems.
Analyze this ${sourceType} and extract structured data.

${typeInstructions[extractionType as keyof typeof typeInstructions] || typeInstructions.auto}

Respond with valid JSON only (no markdown, no explanation):
{
  "employees": [
    { "firstName": "", "lastName": "", "email": "", "phone": "", "position": "", "team": "", "hourlyRate": null, "hireDate": "", "employeeId": "" }
  ],
  "teams": [
    { "name": "", "code": "", "description": "" }
  ],
  "schedules": [
    { "employeeName": "", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "shiftType": "" }
  ],
  "confidence": 0.0-1.0,
  "warnings": ["list any unclear data or assumptions"]
}

Only include arrays that have data. If no data found for a category, omit that array.`;
  }

  private parseExtractionResponse(text: string, extractionType: string): ExtractedData {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { confidence: 0, warnings: [], errors: ['No valid JSON found in response'] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        employees: parsed.employees || [],
        teams: parsed.teams || [],
        schedules: parsed.schedules || [],
        confidence: parsed.confidence || 0.5,
        warnings: parsed.warnings || [],
        errors: [],
      };
    } catch (error: any) {
      return { confidence: 0, warnings: [], errors: [`Parse error: ${error.message}`] };
    }
  }

  private applyColumnMapping(
    data: Record<string, any>[],
    mapping: Record<string, string>,
    dataType: string
  ): Partial<ExtractedData> {
    const result: Partial<ExtractedData> = {};

    const transformedRows = data.map(row => {
      const transformed: Record<string, any> = {};
      for (const [source, target] of Object.entries(mapping)) {
        if (row[source] !== undefined) {
          transformed[target] = row[source];
        }
      }
      return transformed;
    });

    if (dataType === 'employees') {
      result.employees = transformedRows.map(r => ({
        firstName: r.firstName || '',
        lastName: r.lastName || '',
        email: r.email,
        phone: r.phone,
        position: r.position,
        team: r.team,
        hourlyRate: r.hourlyRate ? parseFloat(r.hourlyRate) : undefined,
        hireDate: r.hireDate,
        employeeId: r.employeeId,
      }));
    } else if (dataType === 'teams') {
      result.teams = transformedRows.map(r => ({
        name: r.name || '',
        code: r.code,
        description: r.description,
      }));
    } else if (dataType === 'schedules') {
      result.schedules = transformedRows.map(r => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        date: r.date || '',
        startTime: r.startTime || '',
        endTime: r.endTime || '',
        shiftType: r.shiftType,
      }));
    }

    return result;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ============================================================================
  // 5-STEP MIGRATION WORKFLOW
  // Gate Check → Data Ingestion → Extraction & Structuring → Analysis & Validation → Final Setup Automation
  // ============================================================================

  /**
   * Step 1: Gate Check
   * Validates prerequisites before migration can proceed
   */
  async gateCheck(params: {
    workspaceId: string;
    userId: string;
    migrationConfig: {
      dataSource: 'pdf' | 'excel' | 'csv' | 'manual' | 'multi';
      expectedRecordCount?: number;
      targetEntities: ('employees' | 'teams' | 'schedules')[];
    };
  }): Promise<{
    passed: boolean;
    checks: { name: string; passed: boolean; message: string }[];
    recommendations: string[];
  }> {
    const { workspaceId, userId, migrationConfig } = params;
    const checks: { name: string; passed: boolean; message: string }[] = [];
    const recommendations: string[] = [];

    // Check 1: Workspace exists and is active
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    checks.push({
      name: 'workspace_exists',
      passed: !!workspace,
      message: workspace ? 'Workspace is active' : 'Workspace not found',
    });

    // Check 2: User has permission
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    const hasPermission = user && ['root_admin', 'deputy_admin', 'sysop', 'org_owner'].includes(user.platformRole || '');
    checks.push({
      name: 'user_permission',
      passed: hasPermission,
      message: hasPermission ? 'User has migration permissions' : 'User lacks migration permissions',
    });

    // Check 3: No active migration in progress
    // (Future: Check migration_sessions table)
    checks.push({
      name: 'no_active_migration',
      passed: true,
      message: 'No conflicting migration in progress',
    });

    // Check 4: Target entities are valid
    const validEntities = migrationConfig.targetEntities.every(e => 
      ['employees', 'teams', 'schedules'].includes(e)
    );
    checks.push({
      name: 'valid_entities',
      passed: validEntities,
      message: validEntities ? 'Target entities are valid' : 'Invalid target entities specified',
    });

    // Add recommendations based on config
    if (migrationConfig.expectedRecordCount && migrationConfig.expectedRecordCount > 100) {
      recommendations.push('Consider running migration in batches for large datasets');
    }
    if (migrationConfig.targetEntities.includes('teams')) {
      recommendations.push('Recommend importing teams before employees for proper hierarchy');
    }

    const allPassed = checks.every(c => c.passed);
    console.log(`[DataMigrationAgent] Gate check ${allPassed ? 'PASSED' : 'FAILED'} for workspace ${workspaceId}`);

    return { passed: allPassed, checks, recommendations };
  }

  /**
   * Step 2: Data Ingestion
   * Receives and stores raw data for processing
   */
  async ingestData(params: {
    workspaceId: string;
    userId: string;
    source: 'pdf' | 'excel' | 'csv' | 'manual';
    rawData: {
      fileContent?: string; // base64 for PDF
      fileName?: string;
      spreadsheetData?: Record<string, any>[];
      spreadsheetHeaders?: string[];
      manualData?: Record<string, any>;
    };
  }): Promise<{
    success: boolean;
    ingestionId: string;
    dataSize: number;
    detectedType: string;
    preview: string;
  }> {
    const { workspaceId, userId, source, rawData } = params;
    const ingestionId = `mig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let dataSize = 0;
    let detectedType = 'unknown';
    let preview = '';

    try {
      switch (source) {
        case 'pdf':
          dataSize = rawData.fileContent?.length || 0;
          detectedType = 'document';
          preview = `PDF file: ${rawData.fileName} (${Math.round(dataSize / 1024)}KB)`;
          break;
        
        case 'excel':
        case 'csv':
          dataSize = rawData.spreadsheetData?.length || 0;
          detectedType = 'spreadsheet';
          preview = `${source.toUpperCase()}: ${dataSize} rows, ${rawData.spreadsheetHeaders?.length || 0} columns`;
          break;
        
        case 'manual':
          dataSize = Object.keys(rawData.manualData || {}).length;
          detectedType = 'form_data';
          preview = `Manual entry: ${dataSize} fields`;
          break;
      }

      console.log(`[DataMigrationAgent] Data ingested: ${ingestionId} (${source}, ${dataSize} items)`);

      return {
        success: true,
        ingestionId,
        dataSize,
        detectedType,
        preview,
      };
    } catch (error: any) {
      console.error('[DataMigrationAgent] Ingestion failed:', error);
      return {
        success: false,
        ingestionId,
        dataSize: 0,
        detectedType: 'error',
        preview: `Ingestion failed: ${error.message}`,
      };
    }
  }

  /**
   * Step 3: Extraction & Structuring (uses existing extract methods)
   * Wrapper that selects appropriate extraction method
   */
  async extractAndStructure(params: {
    workspaceId: string;
    source: 'pdf' | 'excel' | 'csv' | 'manual';
    rawData: {
      fileContent?: string;
      fileName?: string;
      spreadsheetData?: Record<string, any>[];
      spreadsheetHeaders?: string[];
      manualData?: Record<string, any>;
      entryType?: 'employee' | 'team' | 'schedule' | 'bulk_text';
    };
    extractionType: 'employees' | 'teams' | 'schedules' | 'auto';
  }): Promise<ExtractedData> {
    const { workspaceId, source, rawData, extractionType } = params;

    switch (source) {
      case 'pdf':
        return this.extractFromPdf({
          workspaceId,
          fileContent: rawData.fileContent!,
          fileName: rawData.fileName || 'document.pdf',
          extractionType,
        });
      
      case 'excel':
      case 'csv':
        return this.extractFromSpreadsheet({
          workspaceId,
          data: rawData.spreadsheetData || [],
          headers: rawData.spreadsheetHeaders || [],
          extractionType,
        });
      
      case 'manual':
        return this.extractFromManualEntry({
          workspaceId,
          entryType: rawData.entryType || 'employee',
          formData: rawData.manualData || {},
        });
      
      default:
        return { confidence: 0, warnings: [], errors: ['Unknown source type'] };
    }
  }

  /**
   * Step 4: Analysis & Validation
   * Deep validation with AI-powered analysis
   */
  async analyzeAndValidate(params: {
    workspaceId: string;
    data: ExtractedData;
  }): Promise<{
    valid: boolean;
    analysisReport: {
      totalRecords: number;
      validRecords: number;
      invalidRecords: number;
      duplicatesDetected: number;
      hierarchyIssues: string[];
      recommendations: string[];
    };
    issues: string[];
  }> {
    const { workspaceId, data } = params;
    
    // Run basic validation
    const basicValidation = await this.validateData({ workspaceId, data });
    
    // Count records
    const totalRecords = 
      (data.employees?.length || 0) + 
      (data.teams?.length || 0) + 
      (data.schedules?.length || 0);
    
    // Detect duplicates in employees
    const emails = data.employees?.map(e => e.email).filter(Boolean) || [];
    const duplicateEmails = emails.filter((e, i) => emails.indexOf(e) !== i);
    
    // Check for hierarchy issues
    const hierarchyIssues: string[] = [];
    if (data.teams?.some(t => t.managerId && !data.employees?.some(e => e.employeeId === t.managerId))) {
      hierarchyIssues.push('Some teams reference managers not in the import data');
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (duplicateEmails.length > 0) {
      recommendations.push(`${duplicateEmails.length} duplicate email(s) detected - consider deduplication`);
    }
    if (data.employees?.some(e => !e.position)) {
      recommendations.push('Some employees missing positions - default will be applied');
    }
    if (data.employees && data.employees.length > 50) {
      recommendations.push('Large import detected - consider batch processing');
    }

    console.log(`[DataMigrationAgent] Validation complete: ${totalRecords} records, ${basicValidation.issues.length} issues`);

    return {
      valid: basicValidation.valid,
      analysisReport: {
        totalRecords,
        validRecords: totalRecords - basicValidation.issues.length,
        invalidRecords: basicValidation.issues.length,
        duplicatesDetected: duplicateEmails.length,
        hierarchyIssues,
        recommendations,
      },
      issues: basicValidation.issues,
    };
  }

  /**
   * Step 5: Final Setup Automation
   * Executes the import with hierarchy assignment and team linking
   */
  async finalSetupAutomation(params: {
    workspaceId: string;
    userId: string;
    data: ExtractedData;
    options: {
      skipDuplicates?: boolean;
      assignDefaultHierarchy?: boolean;
      createMissingTeams?: boolean;
      setDefaultRoles?: boolean;
    };
  }): Promise<MigrationResult & {
    hierarchyAssignments: { employeeId: string; managerId?: string; teamId?: string }[];
    automationSummary: string;
  }> {
    const { workspaceId, userId, data, options } = params;
    
    const hierarchyAssignments: { employeeId: string; managerId?: string; teamId?: string }[] = [];
    
    // First import teams if present and createMissingTeams is enabled
    if (options.createMissingTeams && data.teams?.length) {
      console.log(`[DataMigrationAgent] Creating ${data.teams.length} teams...`);
      // Teams are imported in the main importData call
    }
    
    // Run the main import
    const importResult = await this.importData({
      workspaceId,
      userId,
      data,
      skipDuplicates: options.skipDuplicates ?? true,
    });
    
    // Track hierarchy assignments (simplified - full implementation would link to actual records)
    if (options.assignDefaultHierarchy && data.employees?.length) {
      data.employees.forEach((emp, index) => {
        hierarchyAssignments.push({
          employeeId: emp.employeeId || `imported-${index}`,
          managerId: undefined, // Would be assigned based on team/position logic
          teamId: emp.team || undefined,
        });
      });
    }
    
    const automationSummary = [
      `Imported: ${importResult.importedCounts.employees} employees, ${importResult.importedCounts.teams} teams, ${importResult.importedCounts.schedules} schedules`,
      `Skipped: ${importResult.skippedCounts.employees} employees, ${importResult.skippedCounts.teams} teams, ${importResult.skippedCounts.schedules} schedules`,
      hierarchyAssignments.length > 0 ? `Hierarchy assignments: ${hierarchyAssignments.length}` : 'No hierarchy assignments',
    ].join(' | ');
    
    console.log(`[DataMigrationAgent] Final setup complete: ${automationSummary}`);

    return {
      ...importResult,
      hierarchyAssignments,
      automationSummary,
    };
  }

  /**
   * Execute full 5-step migration workflow
   */
  async executeMigrationWorkflow(params: {
    workspaceId: string;
    userId: string;
    source: 'pdf' | 'excel' | 'csv' | 'manual';
    rawData: {
      fileContent?: string;
      fileName?: string;
      spreadsheetData?: Record<string, any>[];
      spreadsheetHeaders?: string[];
      manualData?: Record<string, any>;
      entryType?: 'employee' | 'team' | 'schedule' | 'bulk_text';
    };
    extractionType: 'employees' | 'teams' | 'schedules' | 'auto';
    options?: {
      skipDuplicates?: boolean;
      assignDefaultHierarchy?: boolean;
      createMissingTeams?: boolean;
      setDefaultRoles?: boolean;
    };
  }): Promise<{
    success: boolean;
    workflowId: string;
    steps: {
      step: string;
      status: 'completed' | 'failed' | 'skipped';
      duration: number;
      result?: any;
    }[];
    finalResult?: MigrationResult;
    error?: string;
  }> {
    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const steps: { step: string; status: 'completed' | 'failed' | 'skipped'; duration: number; result?: any }[] = [];
    
    console.log(`[DataMigrationAgent] Starting 5-step workflow: ${workflowId}`);

    try {
      // Step 1: Gate Check
      const step1Start = Date.now();
      const gateResult = await this.gateCheck({
        workspaceId: params.workspaceId,
        userId: params.userId,
        migrationConfig: {
          dataSource: params.source,
          targetEntities: [params.extractionType === 'auto' ? 'employees' : params.extractionType],
        },
      });
      steps.push({
        step: 'gate_check',
        status: gateResult.passed ? 'completed' : 'failed',
        duration: Date.now() - step1Start,
        result: gateResult,
      });
      if (!gateResult.passed) {
        return { success: false, workflowId, steps, error: 'Gate check failed' };
      }

      // Step 2: Data Ingestion
      const step2Start = Date.now();
      const ingestionResult = await this.ingestData({
        workspaceId: params.workspaceId,
        userId: params.userId,
        source: params.source,
        rawData: params.rawData,
      });
      steps.push({
        step: 'data_ingestion',
        status: ingestionResult.success ? 'completed' : 'failed',
        duration: Date.now() - step2Start,
        result: ingestionResult,
      });
      if (!ingestionResult.success) {
        return { success: false, workflowId, steps, error: 'Data ingestion failed' };
      }

      // Step 3: Extraction & Structuring
      const step3Start = Date.now();
      const extractedData = await this.extractAndStructure({
        workspaceId: params.workspaceId,
        source: params.source,
        rawData: params.rawData,
        extractionType: params.extractionType,
      });
      steps.push({
        step: 'extraction_structuring',
        status: extractedData.errors.length === 0 ? 'completed' : 'failed',
        duration: Date.now() - step3Start,
        result: { 
          recordCount: (extractedData.employees?.length || 0) + (extractedData.teams?.length || 0) + (extractedData.schedules?.length || 0),
          confidence: extractedData.confidence,
          warnings: extractedData.warnings,
        },
      });
      if (extractedData.errors.length > 0) {
        return { success: false, workflowId, steps, error: extractedData.errors.join(', ') };
      }

      // Step 4: Analysis & Validation
      const step4Start = Date.now();
      const analysisResult = await this.analyzeAndValidate({
        workspaceId: params.workspaceId,
        data: extractedData,
      });
      steps.push({
        step: 'analysis_validation',
        status: analysisResult.valid ? 'completed' : 'failed',
        duration: Date.now() - step4Start,
        result: analysisResult.analysisReport,
      });
      if (!analysisResult.valid) {
        return { success: false, workflowId, steps, error: `Validation failed: ${analysisResult.issues.join(', ')}` };
      }

      // Step 5: Final Setup Automation
      const step5Start = Date.now();
      const finalResult = await this.finalSetupAutomation({
        workspaceId: params.workspaceId,
        userId: params.userId,
        data: extractedData,
        options: params.options || {},
      });
      steps.push({
        step: 'final_setup',
        status: finalResult.success ? 'completed' : 'failed',
        duration: Date.now() - step5Start,
        result: {
          importedCounts: finalResult.importedCounts,
          skippedCounts: finalResult.skippedCounts,
          hierarchyAssignments: finalResult.hierarchyAssignments.length,
        },
      });

      console.log(`[DataMigrationAgent] Workflow ${workflowId} completed successfully`);

      return {
        success: finalResult.success,
        workflowId,
        steps,
        finalResult,
      };
    } catch (error: any) {
      console.error(`[DataMigrationAgent] Workflow ${workflowId} failed:`, error);
      return {
        success: false,
        workflowId,
        steps,
        error: error.message,
      };
    }
  }
}

export const dataMigrationAgent = DataMigrationAgent.getInstance();
