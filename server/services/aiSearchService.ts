import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { meteredGemini } from './billing/meteredGeminiClient';
import { db } from "../db";
import { employees, clients, shifts, invoices, timeEntries } from "@shared/schema";
import { eq, or, ilike, and, desc, sql } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('aiSearchService');


export interface SearchResult {
  id: string;
  type: 'employee' | 'client' | 'schedule' | 'invoice' | 'timeEntry';
  title: string;
  subtitle: string;
  description?: string;
  relevanceScore: number;
  data: Record<string, unknown>;
  actions?: SearchAction[];
}

export interface SearchAction {
  label: string;
  action: string;
  path?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  aiSummary?: string;
  totalCount: number;
  categories: {
    employees: number;
    clients: number;
    schedules: number;
    invoices: number;
    timeEntries: number;
  };
}

export interface SuggestionResponse {
  query: string;
  suggestions: string[];
}

async function searchEmployees(workspaceId: string, query: string): Promise<SearchResult[]> {
  const searchPattern = `%${query}%`;
  
  const results = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        or(
          ilike(employees.firstName, searchPattern),
          ilike(employees.lastName, searchPattern),
          ilike(employees.email, searchPattern),
          ilike(employees.phone, searchPattern),
          ilike(employees.role, searchPattern),
          ilike(employees.employeeNumber, searchPattern)
        )
      )
    )
    .limit(10);

  return results.map((emp) => ({
    id: emp.id,
    type: 'employee' as const,
    title: `${emp.firstName} ${emp.lastName}`,
    subtitle: emp.role || 'Employee',
    description: emp.email || undefined,
    relevanceScore: calculateTextRelevance(query, `${emp.firstName} ${emp.lastName} ${emp.email || ''}`),
    data: {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      employeeNumber: emp.employeeNumber,
    },
    actions: [
      { label: 'View Profile', action: 'navigate', path: `/employees/${emp.id}` },
      { label: 'View Schedule', action: 'navigate', path: `/schedule?employee=${emp.id}` },
    ],
  }));
}

async function searchClients(workspaceId: string, query: string): Promise<SearchResult[]> {
  const searchPattern = `%${query}%`;
  
  const results = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, workspaceId),
        or(
          ilike(clients.firstName, searchPattern),
          ilike(clients.lastName, searchPattern),
          ilike(clients.companyName, searchPattern),
          ilike(clients.email, searchPattern),
          ilike(clients.phone, searchPattern),
          ilike(clients.clientCode, searchPattern)
        )
      )
    )
    .limit(10);

  return results.map((client) => ({
    id: client.id,
    type: 'client' as const,
    title: client.companyName || `${client.firstName} ${client.lastName}`,
    subtitle: client.companyName ? `${client.firstName} ${client.lastName}` : 'Client',
    description: client.email || undefined,
    relevanceScore: calculateTextRelevance(query, `${client.firstName} ${client.lastName} ${client.companyName || ''}`),
    data: {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      companyName: client.companyName,
      email: client.email,
      phone: client.phone,
      clientCode: client.clientCode,
    },
    actions: [
      { label: 'View Client', action: 'navigate', path: `/clients/${client.id}` },
      { label: 'Create Invoice', action: 'navigate', path: `/invoices/new?client=${client.id}` },
    ],
  }));
}

async function searchSchedules(workspaceId: string, query: string): Promise<SearchResult[]> {
  const searchPattern = `%${query}%`;
  
  const results = await db
    .select({
      shift: shifts,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      clientCompanyName: clients.companyName,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .leftJoin(clients, eq(shifts.clientId, clients.id))
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        or(
          ilike(shifts.title, searchPattern),
          ilike(shifts.description, searchPattern),
          ilike(employees.firstName, searchPattern),
          ilike(employees.lastName, searchPattern),
          ilike(clients.companyName, searchPattern)
        )
      )
    )
    .orderBy(desc(shifts.startTime))
    .limit(10);

  return results.map((row) => {
    const shift = row.shift;
    const employeeName = row.employeeFirstName && row.employeeLastName 
      ? `${row.employeeFirstName} ${row.employeeLastName}` 
      : 'Unassigned';
    const clientName = row.clientCompanyName || 
      (row.clientFirstName && row.clientLastName ? `${row.clientFirstName} ${row.clientLastName}` : 'No Client');
    
    return {
      id: shift.id,
      type: 'schedule' as const,
      title: shift.title || `Shift for ${employeeName}`,
      subtitle: `${employeeName} • ${clientName}`,
      description: shift.startTime ? new Date(shift.startTime).toLocaleDateString() : undefined,
      relevanceScore: calculateTextRelevance(query, `${shift.title || ''} ${employeeName}`),
      data: {
        id: shift.id,
        title: shift.title,
        startTime: shift.startTime,
        endTime: shift.endTime,
        employeeName,
        clientName,
        status: shift.status,
      },
      actions: [
        { label: 'View Shift', action: 'navigate', path: `/schedule?shift=${shift.id}` },
        { label: 'Edit Shift', action: 'edit', path: `/schedule/edit/${shift.id}` },
      ],
    };
  });
}

async function searchInvoices(workspaceId: string, query: string): Promise<SearchResult[]> {
  const searchPattern = `%${query}%`;
  
  const results = await db
    .select({
      invoice: invoices,
      clientCompanyName: clients.companyName,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        or(
          ilike(invoices.invoiceNumber, searchPattern),
          ilike(invoices.notes, searchPattern),
          ilike(clients.companyName, searchPattern),
          ilike(clients.firstName, searchPattern),
          ilike(clients.lastName, searchPattern)
        )
      )
    )
    .orderBy(desc(invoices.createdAt))
    .limit(10);

  return results.map((row) => {
    const invoice = row.invoice;
    const clientName = row.clientCompanyName || 
      (row.clientFirstName && row.clientLastName ? `${row.clientFirstName} ${row.clientLastName}` : 'Unknown Client');
    
    return {
      id: invoice.id,
      type: 'invoice' as const,
      title: `Invoice #${invoice.invoiceNumber}`,
      subtitle: clientName,
      description: `$${invoice.total} • ${invoice.status}`,
      relevanceScore: calculateTextRelevance(query, `${invoice.invoiceNumber} ${clientName}`),
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName,
        total: invoice.total,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
      },
      actions: [
        { label: 'View Invoice', action: 'navigate', path: `/invoices/${invoice.id}` },
        { label: 'Send Invoice', action: 'send', path: `/invoices/${invoice.id}/send` },
      ],
    };
  });
}

async function searchTimeEntries(workspaceId: string, query: string): Promise<SearchResult[]> {
  const searchPattern = `%${query}%`;
  
  const results = await db
    .select({
      timeEntry: timeEntries,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      clientCompanyName: clients.companyName,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(timeEntries)
    .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
    .leftJoin(clients, eq(timeEntries.clientId, clients.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        or(
          ilike(employees.firstName, searchPattern),
          ilike(employees.lastName, searchPattern),
          ilike(clients.companyName, searchPattern),
          ilike(timeEntries.jobSiteAddress, searchPattern)
        )
      )
    )
    .orderBy(desc(timeEntries.clockIn))
    .limit(10);

  return results.map((row) => {
    const entry = row.timeEntry;
    const employeeName = row.employeeFirstName && row.employeeLastName 
      ? `${row.employeeFirstName} ${row.employeeLastName}` 
      : 'Unknown Employee';
    const clientName = row.clientCompanyName || 
      (row.clientFirstName && row.clientLastName ? `${row.clientFirstName} ${row.clientLastName}` : '');
    
    return {
      id: entry.id,
      type: 'timeEntry' as const,
      title: `Time Entry - ${employeeName}`,
      subtitle: clientName || entry.jobSiteAddress || 'No location',
      description: entry.clockIn ? new Date(entry.clockIn).toLocaleDateString() : undefined,
      relevanceScore: calculateTextRelevance(query, `${employeeName} ${clientName}`),
      data: {
        id: entry.id,
        employeeName,
        clientName,
        clockIn: entry.clockIn,
        clockOut: entry.clockOut,
        totalHours: entry.totalHours,
        status: entry.status,
      },
      actions: [
        { label: 'View Entry', action: 'navigate', path: `/time-tracking?entry=${entry.id}` },
        { label: 'Approve', action: 'approve', path: `/pending-time-entries` },
      ],
    };
  });
}

function calculateTextRelevance(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  if (textLower === queryLower) return 1.0;
  if (textLower.startsWith(queryLower)) return 0.9;
  if (textLower.includes(queryLower)) return 0.7;
  
  const queryWords = queryLower.split(/\s+/);
  const matchedWords = queryWords.filter(word => textLower.includes(word));
  return matchedWords.length / queryWords.length * 0.6;
}

async function generateAISummary(query: string, results: SearchResult[], workspaceId: string): Promise<string | undefined> {
  if (results.length === 0) return undefined;
  
  try {
    const resultsSummary = results.slice(0, 5).map(r => 
      `- ${r.type}: ${r.title} (${r.subtitle})`
    ).join('\n');
    
    const prompt = `You are a helpful assistant for a workforce management platform. 
The user searched for: "${query}"

Here are the top results found:
${resultsSummary}

Provide a brief, helpful 1-2 sentence summary of what was found. Be concise and helpful.
If the results seem relevant to the query, mention the most relevant finding.
If results seem limited or not directly matching, suggest how the user might refine their search.`;

    if (!workspaceId) {
      return { success: false, summary: 'Search summary requires workspace context' };
    }
    const aiResult = await meteredGemini.generate({
      workspaceId,
      featureKey: 'ai_search_summary',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: ANTI_YAP_PRESETS.lookup.temperature,
      maxOutputTokens: ANTI_YAP_PRESETS.lookup.maxTokens,
    });

    if (!aiResult.success) {
      log.warn('[AISearch] Metered AI call failed:', aiResult.error);
      return undefined;
    }

    return aiResult.text;
  } catch (error) {
    log.error('Error generating AI summary:', error);
    return undefined;
  }
}

async function generateSearchSuggestions(query: string, workspaceId: string): Promise<string[]> {
  const suggestions: string[] = [];
  
  const sampleEmployees = await db
    .select({ firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        or(
          ilike(employees.firstName, `${query}%`),
          ilike(employees.lastName, `${query}%`)
        )
      )
    )
    .limit(3);
  
  suggestions.push(...sampleEmployees.map(e => `${e.firstName} ${e.lastName}`));
  
  const sampleClients = await db
    .select({ 
      companyName: clients.companyName, 
      firstName: clients.firstName, 
      lastName: clients.lastName 
    })
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, workspaceId),
        or(
          ilike(clients.companyName, `${query}%`),
          ilike(clients.firstName, `${query}%`),
          ilike(clients.lastName, `${query}%`)
        )
      )
    )
    .limit(3);
  
  suggestions.push(...sampleClients.map(c => c.companyName || `${c.firstName} ${c.lastName}`));
  
  const sampleInvoices = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        ilike(invoices.invoiceNumber, `${query}%`)
      )
    )
    .limit(2);
  
  suggestions.push(...sampleInvoices.map(i => `Invoice ${i.invoiceNumber}`));
  
  const contextualSuggestions = getContextualSuggestions(query);
  suggestions.push(...contextualSuggestions);
  
  return [...new Set(suggestions)].slice(0, 8);
}

function getContextualSuggestions(query: string): string[] {
  const queryLower = query.toLowerCase();
  const suggestions: string[] = [];
  
  if (queryLower.includes('employee') || queryLower.includes('staff')) {
    suggestions.push('All employees', 'Active employees', 'New hires');
  }
  if (queryLower.includes('invoice') || queryLower.includes('bill')) {
    suggestions.push('Pending invoices', 'Overdue invoices', 'Paid invoices');
  }
  if (queryLower.includes('schedule') || queryLower.includes('shift')) {
    suggestions.push('Today\'s schedule', 'This week\'s shifts', 'Unassigned shifts');
  }
  if (queryLower.includes('time') || queryLower.includes('clock')) {
    suggestions.push('Pending time entries', 'Today\'s time entries', 'Unapproved entries');
  }
  if (queryLower.includes('client') || queryLower.includes('customer')) {
    suggestions.push('All clients', 'Active clients', 'New clients');
  }
  
  return suggestions;
}

export async function performSearch(workspaceId: string, query: string): Promise<SearchResponse> {
  if (!query || query.trim().length < 2) {
    return {
      query,
      results: [],
      totalCount: 0,
      categories: {
        employees: 0,
        clients: 0,
        schedules: 0,
        invoices: 0,
        timeEntries: 0,
      },
    };
  }

  const trimmedQuery = query.trim();

  const [employeeResults, clientResults, scheduleResults, invoiceResults, timeEntryResults] = 
    await Promise.all([
      searchEmployees(workspaceId, trimmedQuery),
      searchClients(workspaceId, trimmedQuery),
      searchSchedules(workspaceId, trimmedQuery),
      searchInvoices(workspaceId, trimmedQuery),
      searchTimeEntries(workspaceId, trimmedQuery),
    ]);

  const allResults = [
    ...employeeResults,
    ...clientResults,
    ...scheduleResults,
    ...invoiceResults,
    ...timeEntryResults,
  ].sort((a, b) => b.relevanceScore - a.relevanceScore);

  const aiSummary = await generateAISummary(trimmedQuery, allResults, workspaceId);

  return {
    query: trimmedQuery,
    results: allResults,
    aiSummary,
    totalCount: allResults.length,
    categories: {
      employees: employeeResults.length,
      clients: clientResults.length,
      schedules: scheduleResults.length,
      invoices: invoiceResults.length,
      timeEntries: timeEntryResults.length,
    },
  };
}

export async function getSuggestions(workspaceId: string, query: string): Promise<SuggestionResponse> {
  if (!query || query.trim().length < 1) {
    return {
      query,
      suggestions: [],
    };
  }

  const suggestions = await generateSearchSuggestions(query.trim(), workspaceId);

  return {
    query: query.trim(),
    suggestions,
  };
}

export const aiSearchService = {
  performSearch,
  getSuggestions,
};
