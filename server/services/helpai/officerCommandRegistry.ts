import { db } from '../../db';
import { sql, eq } from 'drizzle-orm';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { timeEntries } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('officerCommandRegistry');


export type OfficerCommandTier = 'T0' | 'T1' | 'T2' | 'T3';

export interface OfficerCommand {
  id: string;
  tier: OfficerCommandTier;
  intent: string;
  aliases: string[];
  description: string;
  responseTemplate?: string;
  requiresTrinityReasoning: boolean;
  maxContextTokens?: number;
  escalationTarget?: 'supervisor' | 'owner' | 'emergency';
}

export interface CommandMatch {
  command: OfficerCommand;
  confidence: number;
  extractedParams?: Record<string, string>;
}

export interface OfficerCommandResult {
  tier: OfficerCommandTier;
  intent: string;
  response: string;
  requiresTrinityCall: boolean;
  escalationTarget?: string;
  actionTaken?: string;
  contextForTrinity?: string;
}

const OFFICER_COMMANDS: OfficerCommand[] = [
  // ─── TIER 0 — Zero LLM, pure DB lookup ──────────────────────────────
  {
    id: 'clock_in',
    tier: 'T0',
    intent: 'clock_in',
    aliases: ['clock in', 'clock me in', 'punch in', 'start my shift', 'im here', "i'm here", 'clockme in', '/clockme in',
      'marcar entrada', 'marcar', 'estoy aquí', 'estoy aqui', 'llegué', 'llegue', 'entrar', 'comenzar turno', 'iniciar turno'],
    description: 'Clock in to current shift',
    requiresTrinityReasoning: false,
    responseTemplate: 'Done — you\'re clocked in at {site_name}. Your shift ends at {shift_end}. Post orders are in your room.',
  },
  {
    id: 'clock_out',
    tier: 'T0',
    intent: 'clock_out',
    aliases: ['clock out', 'clock me out', 'punch out', 'end my shift', 'im done', 'leaving', 'clockme out', '/clockme out',
      'marcar salida', 'ya salí', 'ya sali', 'terminar turno', 'salir', 'ya terminé', 'ya termine', 'fin de turno'],
    description: 'Clock out from current shift',
    requiresTrinityReasoning: false,
    responseTemplate: 'Done — you\'re clocked out. Total hours: {total_hours}. Great work tonight.',
  },
  {
    id: 'my_schedule',
    tier: 'T0',
    intent: 'my_schedule',
    aliases: ['my schedule', 'when do i work', 'next shift', 'my shifts', 'what are my shifts', 'when is my next shift', 'show schedule', 'schedule',
      'mi horario', 'cuándo trabajo', 'cuando trabajo', 'próximo turno', 'proximo turno', 'ver horario', 'mis turnos', 'mis días de trabajo'],
    description: 'View your schedule for the next 7 days',
    requiresTrinityReasoning: false,
    responseTemplate: 'Your upcoming shifts:\n{schedule_list}',
  },
  {
    id: 'my_post_orders',
    tier: 'T0',
    intent: 'my_post_orders',
    aliases: ['post orders', 'my post orders', 'what are my orders', 'site orders', 'post instructions', 'what should i do', 'orders',
      'órdenes de puesto', 'ordenes de puesto', 'instrucciones del turno', 'qué debo hacer', 'que debo hacer', 'mis instrucciones'],
    description: 'View post orders for current shift site',
    requiresTrinityReasoning: false,
    responseTemplate: 'Post orders for {site_name}:\n{post_orders}',
  },
  {
    id: 'my_supervisor',
    tier: 'T0',
    intent: 'my_supervisor',
    aliases: ['who is my supervisor', 'supervisor', 'my supervisor', 'whos in charge', "who's my supervisor", 'supervisor contact', 'supervisor tonight'],
    description: 'Get your supervisor for the current shift',
    requiresTrinityReasoning: false,
    responseTemplate: 'Your supervisor tonight is {supervisor_name}. You can reach them at {supervisor_contact}.',
  },
  {
    id: 'help',
    tier: 'T0',
    intent: 'help',
    aliases: ['help', '/help', 'what can you do', 'commands', 'options', 'what do you do', 'how do i',
      'ayuda', '/ayuda', 'qué puedes hacer', 'que puedes hacer', 'comandos', 'opciones', 'cómo funciona', 'como funciona'],
    description: 'Show available commands',
    requiresTrinityReasoning: false,
    responseTemplate: 'Here\'s what I can help you with:\n• Clock in/out\n• View your schedule\n• Post orders for your site\n• File an incident report\n• Request a calloff\n• View your timesheet\n• Message your supervisor\n\nFor emergencies, tell me "emergency" or call 911 immediately.',
  },

  // ─── TIER 1 — Routes to Trinity with officer-scoped context (2K max) ─
  {
    id: 'file_incident',
    tier: 'T1',
    intent: 'file_incident_report',
    aliases: ['file incident', 'incident report', '/incident', '/report', 'report incident', 'i need to file a report', 'something happened', 'there was an incident',
      'reporte de incidente', 'reportar incidente', 'algo pasó', 'algo paso', 'incidente', 'necesito reportar', 'hubo un incidente', 'hay un problema'],
    description: 'Start an incident report guided flow',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
    responseTemplate: undefined,
  },
  {
    id: 'calloff',
    tier: 'T1',
    intent: 'request_calloff',
    aliases: ['call off', 'calloff', 'i cant make it', "i can't make it", 'need to call off', 'sick', 'i am sick', "can't work", 'cancel my shift', 'calloff request',
      'no puedo ir', 'estoy enfermo', 'estoy enferma', 'cancelar turno', 'no voy a poder trabajar', 'necesito ausentarme', 'ausencia'],
    description: 'Process a calloff request',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
  },
  {
    id: 'my_timesheet',
    tier: 'T1',
    intent: 'my_timesheet',
    aliases: ['my timesheet', 'my hours', 'timesheet', 'how many hours', 'hours worked', 'my time', 'check my hours'],
    description: 'View your timesheet (read only)',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
  },
  {
    id: 'my_pay_stub',
    tier: 'T1',
    intent: 'my_pay_stub',
    aliases: ['my pay stub', 'pay stub', 'paystub', 'what did i make', 'how much am i getting paid', 'my paycheck', 'pay check'],
    description: 'View your pay stub (read only)',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
  },
  {
    id: 'schedule_change',
    tier: 'T1',
    intent: 'schedule_change_request',
    aliases: ['change my schedule', 'schedule change', 'swap shift', 'i need to change my shift', 'different time', 'change shift'],
    description: 'Request a schedule change (logs and notifies supervisor)',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
  },
  {
    id: 'message_supervisor',
    tier: 'T1',
    intent: 'message_supervisor',
    aliases: ['message supervisor', 'tell supervisor', 'let supervisor know', 'contact supervisor', 'send message to supervisor', 'supervisor message'],
    description: 'Send a message to your supervisor',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
  },
  {
    id: 'post_order_question',
    tier: 'T1',
    intent: 'post_order_question',
    aliases: ['question about post orders', 'clarify post orders', 'what does this mean', 'post order question', 'i have a question about my orders'],
    description: 'Ask a question about your post orders',
    requiresTrinityReasoning: true,
    maxContextTokens: 2000,
  },

  // ─── TIER 2 — Escalates to supervisor ────────────────────────────────
  {
    id: 'pay_discrepancy',
    tier: 'T2',
    intent: 'pay_discrepancy',
    aliases: ['pay discrepancy', 'wrong pay', 'missing pay', 'i wasnt paid right', 'pay issue', 'payroll error', 'short on my check'],
    description: 'Report a pay discrepancy (escalated to supervisor)',
    requiresTrinityReasoning: false,
    escalationTarget: 'supervisor',
    responseTemplate: 'Got it — I\'ve flagged your pay discrepancy to your supervisor and logged the request. Your concern is documented and has been sent for review.',
  },
  {
    id: 'schedule_dispute',
    tier: 'T2',
    intent: 'schedule_dispute',
    aliases: ['schedule dispute', 'wrong schedule', 'i wasnt scheduled', 'schedule mistake', 'schedule error', 'wrong shift time'],
    description: 'Dispute a schedule entry',
    requiresTrinityReasoning: false,
    escalationTarget: 'supervisor',
    responseTemplate: 'Understood — I\'ve sent your schedule dispute to your supervisor. They\'ll review and get back to you. Your current schedule shows {schedule_info}.',
  },
  {
    id: 'equipment_issue',
    tier: 'T2',
    intent: 'equipment_issue',
    aliases: ['equipment issue', 'equipment broken', 'my equipment', 'radio broken', 'gear issue', 'equipment problem'],
    description: 'Report an equipment issue',
    requiresTrinityReasoning: false,
    escalationTarget: 'supervisor',
    responseTemplate: 'I\'ve notified your supervisor about the equipment issue. Someone will follow up. If equipment failure affects your ability to perform your duties, document what\'s non-functional.',
  },
  {
    id: 'safety_concern',
    tier: 'T2',
    intent: 'safety_concern',
    aliases: ['safety concern', 'feel unsafe', 'unsafe condition', 'hazard', 'dangerous', 'i dont feel safe', "i don't feel safe"],
    description: 'Report a non-emergency safety concern',
    requiresTrinityReasoning: false,
    escalationTarget: 'supervisor',
    responseTemplate: 'Your safety concern has been sent to your supervisor. If this is an immediate threat, call 911 now — CoAIleague does not contact emergency services on your behalf.',
  },

  // ─── TIER 3 — Immediate escalation ───────────────────────────────────
  {
    id: 'emergency',
    tier: 'T3',
    intent: 'emergency',
    aliases: ['emergency', '911', 'help me', 'panic', 'im in danger', "i'm in danger", 'active threat', 'shots fired', 'man down', 'code red', 'sos'],
    description: 'Trigger emergency response',
    requiresTrinityReasoning: false,
    escalationTarget: 'emergency',
    responseTemplate: 'EMERGENCY ALERT SENT to your supervisor and owner. CALL 911 NOW — CoAIleague does not contact emergency services. Your safety is the priority.',
  },
  {
    id: 'unsafe_condition',
    tier: 'T3',
    intent: 'unsafe_condition',
    aliases: ['unsafe', 'very dangerous', 'extreme hazard', 'life threatening', 'weapon', 'armed person', 'threat on site'],
    description: 'Report an unsafe condition — immediate escalation',
    requiresTrinityReasoning: false,
    escalationTarget: 'emergency',
    responseTemplate: 'SAFETY ALERT sent to owner and supervisor. Do not engage the threat. Call 911 now — CoAIleague does not contact emergency services. Your priority is your safety.',
  },
];

class OfficerCommandRegistry {
  private commands: OfficerCommand[] = OFFICER_COMMANDS;

  classifyInput(input: string): CommandMatch | null {
    const normalized = input.toLowerCase().trim();

    for (const command of this.commands) {
      for (const alias of command.aliases) {
        if (normalized === alias || normalized.startsWith(alias + ' ') || normalized.includes(alias)) {
          const exactMatch = normalized === alias;
          const startsWithAlias = normalized.startsWith(alias + ' ');
          const confidence = exactMatch ? 1.0 : startsWithAlias ? 0.95 : 0.75;

          return {
            command,
            confidence,
            extractedParams: this.extractParams(normalized, alias, command),
          };
        }
      }
    }

    return null;
  }

  private extractParams(input: string, alias: string, command: OfficerCommand): Record<string, string> {
    const params: Record<string, string> = {};
    const remainder = input.replace(alias, '').trim();
    if (remainder) {
      params.additionalContext = remainder;
    }
    return params;
  }

  async handleTier0Command(
    command: OfficerCommand,
    employeeId: string,
    workspaceId: string,
    params?: Record<string, string>
  ): Promise<OfficerCommandResult> {
    try {
      switch (command.intent) {
        case 'clock_in':
          return await this.handleClockIn(employeeId, workspaceId);
        case 'clock_out':
          return await this.handleClockOut(employeeId, workspaceId);
        case 'my_schedule':
          return await this.handleMySchedule(employeeId, workspaceId);
        case 'my_post_orders':
          return await this.handleMyPostOrders(employeeId, workspaceId);
        case 'my_supervisor':
          return await this.handleMySupervisor(employeeId, workspaceId);
        case 'help':
          return {
            tier: 'T0',
            intent: 'help',
            response: command.responseTemplate!,
            requiresTrinityCall: false,
          };
        default:
          return this.buildEscalationResponse(command, 'supervisor');
      }
    } catch (err) {
      return {
        tier: command.tier,
        intent: command.intent,
        response: 'I ran into a brief issue. Please try again or type "help" for options.',
        requiresTrinityCall: false,
      };
    }
  }

  private async handleClockIn(employeeId: string, workspaceId: string): Promise<OfficerCommandResult> {
    // Converted to Drizzle ORM: Clock-in check → LEFT JOIN + INTERVAL
    const { shifts, sites, timeEntries } = await import('@shared/schema');
    const { and, eq, lte, gte, ne, isNull } = await import('drizzle-orm');

    const activeShiftData = await db
      .select({
        id: shifts.id,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        siteName: sites.name,
      })
      .from(shifts)
      .leftJoin(sites, eq(shifts.siteId, sites.id))
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.assignedEmployeeId, employeeId),
        lte(shifts.startTime, sql`NOW() + INTERVAL '1 hour'`),
        gte(shifts.endTime, sql`NOW()`),
        ne(shifts.status, 'cancelled'),
      ))
      .limit(1);

    const shift = activeShiftData[0];
    if (!shift) {
      return {
        tier: 'T0',
        intent: 'clock_in',
        response: 'I don\'t see an active shift for you right now. If you believe this is an error, contact your supervisor.',
        requiresTrinityCall: false,
      };
    }

    // Converted to Drizzle ORM: Clock-in duplicate check → IS NULL
    const existingResult = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.shiftId, shift.id),
        eq(timeEntries.employeeId, employeeId),
        isNull(timeEntries.clockOut),
      ))
      .limit(1);

    if (existingResult.length > 0) {
      return {
        tier: 'T0',
        intent: 'clock_in',
        response: `You're already clocked in at ${shift.siteName || 'your site'}. Type "clock out" when your shift ends.`,
        requiresTrinityCall: false,
      };
    }

    await db.insert(timeEntries).values({
      shiftId: shift.id,
      employeeId: employeeId,
      clockIn: new Date(),
      workspaceId: workspaceId,
      status: 'active',
    }).catch((err) => log.warn('[officerCommandRegistry] Fire-and-forget failed:', err));

    const endTime = shift.endTime ? new Date(shift.endTime).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    }) : 'end of shift';

    return {
      tier: 'T0',
      intent: 'clock_in',
      response: `Done — you're clocked in at ${shift.siteName || 'your site'}. Your shift ends at ${endTime}. Post orders are in your room.`,
      requiresTrinityCall: false,
      actionTaken: `Clock-in recorded for shift ${shift.id}`,
    };
  }

  private async handleClockOut(employeeId: string, workspaceId: string): Promise<OfficerCommandResult> {
    // Converted to Drizzle ORM: Clock-out check → EXTRACT EPOCH
    const { timeEntries } = await import('@shared/schema');
    const { and, eq, isNull, desc } = await import('drizzle-orm');

    const activeEntryData = await db
      .select({
        id: timeEntries.id,
        clockIn: timeEntries.clockIn,
        shiftId: timeEntries.shiftId,
        hoursWorked: sql<number>`EXTRACT(EPOCH FROM (NOW() - ${timeEntries.clockIn})) / 3600.0`,
      })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.workspaceId, workspaceId),
        isNull(timeEntries.clockOut),
      ))
      .orderBy(desc(timeEntries.clockIn))
      .limit(1);

    const entry = activeEntryData[0];
    if (!entry) {
      return {
        tier: 'T0',
        intent: 'clock_out',
        response: 'You don\'t appear to be clocked in. If you think this is wrong, contact your supervisor.',
        requiresTrinityCall: false,
      };
    }

    // Converted to Drizzle ORM
    await db.update(timeEntries).set({
      clockOut: sql`now()`,
      status: 'complete',
    }).where(eq(timeEntries.id, entry.id)).catch((err) => log.warn('[officerCommandRegistry] Fire-and-forget failed:', err));

    const hoursWorked = entry.hoursWorked || 0;
    const hoursDisplay = `${Math.floor(hoursWorked)}h ${Math.round((hoursWorked % 1) * 60)}m`;

    return {
      tier: 'T0',
      intent: 'clock_out',
      response: `Done — you're clocked out. Total hours: ${hoursDisplay}. Great work tonight.`,
      requiresTrinityCall: false,
      actionTaken: `Clock-out recorded for time entry ${entry.id}`,
    };
  }

  private async handleMySchedule(employeeId: string, workspaceId: string): Promise<OfficerCommandResult> {
    // Converted to Drizzle ORM: Schedule lookup → LEFT JOIN + INTERVAL
    const { shifts, sites } = await import('@shared/schema');
    const { and, eq, gte, lte, ne, asc } = await import('drizzle-orm');

    const shiftsData = await db
      .select({
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        siteName: sites.name,
        status: shifts.status,
      })
      .from(shifts)
      .leftJoin(sites, eq(shifts.siteId, sites.id))
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.assignedEmployeeId, employeeId),
        gte(shifts.startTime, sql`NOW()`),
        lte(shifts.startTime, sql`NOW() + INTERVAL '7 days'`),
        ne(shifts.status, 'cancelled'),
      ))
      .orderBy(asc(shifts.startTime))
      .limit(10);

    if (!shiftsData.length) {
      return {
        tier: 'T0',
        intent: 'my_schedule',
        response: 'No shifts scheduled in the next 7 days. Contact your supervisor if you believe this is incorrect.',
        requiresTrinityCall: false,
      };
    }

    const scheduleLines = shiftsData.map(s => {
      const start = new Date(s.startTime!);
      const end = new Date(s.endTime!);
      const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      return `${dateStr} | ${timeStr} | ${s.siteName || 'Site TBD'}`;
    });

    return {
      tier: 'T0',
      intent: 'my_schedule',
      response: `Your upcoming shifts:\n${scheduleLines.join('\n')}`,
      requiresTrinityCall: false,
    };
  }

  private async handleMyPostOrders(employeeId: string, workspaceId: string): Promise<OfficerCommandResult> {
    // Converted to Drizzle ORM: Post orders → LEFT JOINs + INTERVAL
    const { shifts, sites, postOrders } = await import('@shared/schema');
    const { and, eq, lte, gte, ne, desc } = await import('drizzle-orm');

    const activeShiftData = await db
      .select({
        siteId: shifts.siteId,
        siteName: sites.name,
        instructions: postOrders.instructions,
        specialInstructions: postOrders.specialInstructions,
      })
      .from(shifts)
      .leftJoin(sites, eq(shifts.siteId, sites.id))
      .leftJoin(postOrders, and(eq(postOrders.siteId, shifts.siteId), eq(postOrders.isActive, true)))
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.assignedEmployeeId, employeeId),
        lte(shifts.startTime, sql`NOW() + INTERVAL '1 hour'`),
        gte(shifts.endTime, sql`NOW()`),
        ne(shifts.status, 'cancelled'),
      ))
      .orderBy(desc(shifts.startTime))
      .limit(1);

    const s = activeShiftData[0];
    if (!s) {
      return {
        tier: 'T0',
        intent: 'my_post_orders',
        response: 'I don\'t see an active shift right now. Post orders are available once your shift begins. If your shift has started, contact your supervisor.',
        requiresTrinityCall: false,
      };
    }

    const orders = s.instructions || s.specialInstructions || 'No specific post orders on file. Follow standard procedures and contact your supervisor for site-specific guidance.';

    return {
      tier: 'T0',
      intent: 'my_post_orders',
      response: `Post orders for ${s.siteName || 'your site'}:\n${orders}`,
      requiresTrinityCall: false,
    };
  }

  private async handleMySupervisor(employeeId: string, workspaceId: string): Promise<OfficerCommandResult> {
    // Converted to Drizzle ORM: Supervisor lookup → JOIN + INTERVAL
    const { shifts, users } = await import('@shared/schema');
    const { and, eq, lte, gte, ne } = await import('drizzle-orm');

    const supervisorData = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        email: users.email,
      })
      .from(shifts)
      .innerJoin(users, eq(shifts.supervisorId, users.id))
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.assignedEmployeeId, employeeId),
        lte(shifts.startTime, sql`NOW() + INTERVAL '1 hour'`),
        gte(shifts.endTime, sql`NOW()`),
        ne(shifts.status, 'cancelled'),
      ))
      .limit(1);

    const sup = supervisorData[0];
    if (!sup) {
      return {
        tier: 'T0',
        intent: 'my_supervisor',
        response: 'I couldn\'t locate a supervisor assignment for your current shift. Check your shift room for supervisor contact, or reach out to dispatch.',
        requiresTrinityCall: false,
      };
    }

    const contact = sup.phone || sup.email || 'via your shift room';
    return {
      tier: 'T0',
      intent: 'my_supervisor',
      response: `Your supervisor is ${sup.firstName} ${sup.lastName}. Contact: ${contact}.`,
      requiresTrinityCall: false,
    };
  }

  buildEscalationResponse(command: OfficerCommand, target?: string): OfficerCommandResult {
    const escalationTarget = target || command.escalationTarget || 'supervisor';
    const template = command.responseTemplate ||
      `Got it — I've escalated this to your ${escalationTarget}. You'll hear back shortly. Your request is logged.`;

    return {
      tier: command.tier,
      intent: command.intent,
      response: template,
      requiresTrinityCall: false,
      escalationTarget,
    };
  }

  buildTrinityContext(command: OfficerCommand, employeeId: string, userInput: string): string {
    return `OFFICER INTERACTION — Tier ${command.tier} | Intent: ${command.intent}
Officer ID: ${employeeId}
Officer Request: ${userInput}
SCOPE RESTRICTION: Respond using ONLY this officer's own data. No other officers' data. No financial data. No org-wide queries.
Response must be 3 sentences maximum. Action-oriented. Always confirm what was done.
Context window: ${command.maxContextTokens || 2000} tokens max.`;
  }

  getCommandsByTier(tier: OfficerCommandTier): OfficerCommand[] {
    return this.commands.filter(c => c.tier === tier);
  }

  getAllIntents(): string[] {
    return this.commands.map(c => c.intent);
  }
}

export const officerCommandRegistry = new OfficerCommandRegistry();
