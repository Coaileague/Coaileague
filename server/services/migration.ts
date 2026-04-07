/**
 * CoAIleague Data Migration Service (STUBBED)
 * Migration tables have been removed from schema. This service is a no-op stub.
 */

export type MigrationType = 'employees' | 'payroll' | 'schedules' | 'invoices' | 'timesheets' | 'clients' | 'other';
export type MigrationJobStatus = 'uploaded' | 'analyzing' | 'reviewed' | 'importing' | 'completed' | 'failed' | 'cancelled';

export interface CreateMigrationJobParams {
  workspaceId: string;
  userId: string;
  documentType: MigrationType;
  fileName: string;
  fileData: string;
  mimeType: string;
}

export interface ExtractedRecord {
  recordType: MigrationType;
  data: any;
  confidence: number;
  warnings: string[];
}

export interface MigrationJob {
  id: string;
  workspaceId: string;
  userId: string;
  status: MigrationJobStatus;
  totalDocuments: number;
  processedDocuments: number;
  syncedToAiBrain: boolean;
  aiBrainJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface MigrationDocument {
  id: string;
  jobId: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  detectedType: MigrationType;
  confidence: string;
  extractedData: any;
  validationErrors: any[];
  warnings: any[];
  recordsExtracted: number;
  recordsImported: number;
  requiresReview: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationRecord {
  id: string;
  documentId: string;
  workspaceId: string;
  recordType: MigrationType;
  extractedData: any;
  importedToTable: string | null;
  importedRecordId: string | null;
  importStatus: string;
  importError: string | null;
  createdAt: Date;
  updatedAt: Date;
  importedAt: Date | null;
}

export class MigrationService {
  async createMigrationJob(_params: CreateMigrationJobParams): Promise<{ job: MigrationJob; document: MigrationDocument }> {
    throw new Error('Migration service is not available');
  }

  async getMigrationJobs(_workspaceId: string): Promise<(MigrationJob & { documents: MigrationDocument[] })[]> {
    return [];
  }

  async getMigrationRecords(_jobId: string, _workspaceId: string): Promise<(MigrationRecord & { document: MigrationDocument })[]> {
    return [];
  }

  async importRecords(_jobId: string, _recordIds: string[], _workspaceId: string, _userId: string): Promise<{ imported: number; failed: number; errors: string[] }> {
    throw new Error('Migration service is not available');
  }

  async cancelMigrationJob(_jobId: string, _workspaceId: string): Promise<void> {
    throw new Error('Migration service is not available');
  }
}

export const migrationService = new MigrationService();
