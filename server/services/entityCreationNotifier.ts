/**
 * Entity Creation Notifier
 * 
 * Notifies Trinity and triggers workflows when employees or clients are created locally.
 * This enables:
 * 1. Trinity notifications to support staff about new entities
 * 2. Automatic onboarding task creation for employees
 * 3. Client setup for scheduling availability
 * 4. Audit trail logging
 */

import { notifySupportStaff } from './ai-brain/trinityAutonomousNotifier';
import { employeeDocumentOnboardingService } from './employeeDocumentOnboardingService';
import { db } from '../db';
import { employees, clients, clientContracts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('entityCreationNotifier');


export interface NewEmployeeEvent {
  employeeId: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  role?: string | null;
  createdBy?: string;
}

export interface NewClientEvent {
  clientId: string;
  workspaceId: string;
  name: string;
  contactEmail?: string | null;
  address?: string | null;
  createdBy?: string;
}

class EntityCreationNotifierService {
  
  async notifyNewEmployee(event: NewEmployeeEvent): Promise<void> {
    const { employeeId, workspaceId, firstName, lastName, email, role, createdBy } = event;
    const employeeName = `${firstName} ${lastName}`;

    log.info(`[EntityCreationNotifier] New employee created: ${employeeName} (${employeeId})`);

    try {
      await notifySupportStaff({
        severity: 'info',
        category: 'platform',
        title: 'New Employee Added',
        description: `${employeeName}${role ? ` (${role})` : ''} has been added to the workforce.`,
        suggestedAction: 'Review onboarding documents and assign to schedule when ready.',
        autoFixAvailable: false,
        autoFixRisk: 'low',
        workspaceId,
        metadata: {
          entityType: 'employee',
          employeeId,
          employeeName,
          email,
          role,
          createdBy,
        },
      });

      await employeeDocumentOnboardingService.createOnboardingTasksForEmployee(employeeId);

      const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(employeeId);
      
      if (!eligibility.eligible) {
        log.info(`[EntityCreationNotifier] Employee ${employeeName} blocked from scheduling - missing documents:`, eligibility.reasons);
        
        await notifySupportStaff({
          severity: 'warning',
          category: 'compliance',
          title: 'Employee Blocked from Scheduling',
          description: `${employeeName} cannot be assigned to shifts until required documents are uploaded.`,
          suggestedAction: `Missing: ${eligibility.reasons.slice(0, 3).join(', ')}`,
          autoFixAvailable: false,
          autoFixRisk: 'low',
          workspaceId,
          metadata: {
            entityType: 'employee',
            employeeId,
            employeeName,
            blockedReasons: eligibility.reasons,
          },
        });
      }

      log.info(`[EntityCreationNotifier] Employee creation notification sent for ${employeeName}`);
    } catch (error) {
      log.error(`[EntityCreationNotifier] Failed to notify about new employee:`, error);
    }
  }

  async notifyNewClient(event: NewClientEvent): Promise<void> {
    const { clientId, workspaceId, name, contactEmail, address, createdBy } = event;

    log.info(`[EntityCreationNotifier] New client created: ${name} (${clientId})`);

    try {
      await notifySupportStaff({
        severity: 'info',
        category: 'platform',
        title: 'New Client Added',
        description: `${name} has been added as a client.${address ? ` Location: ${address}` : ''}`,
        suggestedAction: 'Client is now available for scheduling. Create shifts to assign employees.',
        autoFixAvailable: false,
        autoFixRisk: 'low',
        workspaceId,
        metadata: {
          entityType: 'client',
          clientId,
          clientName: name,
          contactEmail,
          address,
          createdBy,
          schedulingEnabled: true,
        },
      });

      log.info(`[EntityCreationNotifier] Client creation notification sent for ${name}`);

      // OMEGA L3.B.1: Client creation initializes CRM pipeline record (draft contract)
      try {
        await db.insert(clientContracts).values({
          workspaceId,
          clientId,
          clientName: name,
          clientEmail: contactEmail,
          title: `Initial Service Agreement - ${name}`,
          content: 'Draft contract generated on client creation.',
          docType: 'master_service_agreement',
          status: 'draft',
          createdBy: createdBy || 'system',
          documentData: { source: 'entity_creation_notifier' }
        });
        log.info(`[EntityCreationNotifier] CRM pipeline initialized with draft contract for client: ${name}`);
      } catch (crmErr) {
        log.error(`[EntityCreationNotifier] Failed to initialize CRM pipeline for client ${name}:`, crmErr);
      }
    } catch (error) {
      log.error(`[EntityCreationNotifier] Failed to notify about new client:`, error);
    }
  }

  async getSchedulableClients(workspaceId: string): Promise<Array<{ id: string; name: string; address?: string | null }>> {
    const result = await db.query.clients.findMany({
      where: eq(clients.workspaceId, workspaceId),
      columns: {
        id: true,
        companyName: true,
        firstName: true,
        lastName: true,
        address: true,
      },
    });

    return result
      .map(c => ({
        id: c.id,
        name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '',
        address: c.address,
      }))
      .filter(c => c.name);
  }

  async getSchedulableEmployees(workspaceId: string): Promise<Array<{ id: string; name: string; isWorkEligible: boolean }>> {
    const workspaceEmployees = await db.query.employees.findMany({
      where: eq(employees.workspaceId, workspaceId),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    const results = await Promise.all(
      workspaceEmployees.map(async (emp) => {
        const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(emp.id);
        return {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          isWorkEligible: eligibility.eligible,
        };
      })
    );

    return results;
  }
}

export const entityCreationNotifier = new EntityCreationNotifierService();
