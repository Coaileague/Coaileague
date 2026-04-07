import { db } from '../../db';
import { clients, shifts, shiftAcknowledgments, sites, employees } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createNotification } from '../notificationService';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

interface PostOrderQuiz {
  shiftId: string;
  clientName: string;
  siteName?: string;
  questions: QuizQuestion[];
  postOrderSummary: string;
}

interface QuizResult {
  passed: boolean;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  failedQuestions: string[];
}

function generateQuestionsFromPostOrders(postOrders: string, siteName?: string, specialInstructions?: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const combined = [postOrders, specialInstructions].filter(Boolean).join('\n');
  const lines = combined.split(/[\n.!?]+/).map(l => l.trim()).filter(l => l.length > 15);

  const accessPatterns = lines.filter(l =>
    /gate|door|entrance|exit|access|lock|key|badge|credential|perimeter/i.test(l)
  );
  if (accessPatterns.length > 0) {
    const instruction = accessPatterns[0];
    questions.push({
      id: 'access_control',
      question: `What is the access control procedure for this site?`,
      options: [
        instruction.length > 80 ? instruction.substring(0, 80) + '...' : instruction,
        'No access control procedures are required',
        'Only check IDs during daytime hours',
        'Access is unrestricted for all visitors'
      ],
      correctIndex: 0
    });
  }

  const emergencyPatterns = lines.filter(l =>
    /emergency|fire|evacuat|alarm|911|medical|first.aid|hazard|danger/i.test(l)
  );
  if (emergencyPatterns.length > 0) {
    const instruction = emergencyPatterns[0];
    questions.push({
      id: 'emergency_procedures',
      question: `What is the emergency procedure at this site?`,
      options: [
        'Leave immediately without notifying anyone',
        instruction.length > 80 ? instruction.substring(0, 80) + '...' : instruction,
        'Wait for the next shift to handle it',
        'Only respond during business hours'
      ],
      correctIndex: 1
    });
  }

  const patrolPatterns = lines.filter(l =>
    /patrol|round|check|inspect|walk|tour|checkpoint|monitor|surveil/i.test(l)
  );
  if (patrolPatterns.length > 0) {
    const instruction = patrolPatterns[0];
    questions.push({
      id: 'patrol_duties',
      question: `What are the patrol/monitoring duties at this site?`,
      options: [
        'Stay at the front desk only',
        'Patrols are optional based on weather',
        instruction.length > 80 ? instruction.substring(0, 80) + '...' : instruction,
        'Only patrol during the last hour of shift'
      ],
      correctIndex: 2
    });
  }

  const reportingPatterns = lines.filter(l =>
    /report|log|document|record|notify|supervisor|manager|contact|incident/i.test(l)
  );
  if (reportingPatterns.length > 0) {
    const instruction = reportingPatterns[0];
    questions.push({
      id: 'reporting_procedures',
      question: `What are the reporting/incident procedures?`,
      options: [
        'Handle everything independently without reporting',
        'Reports are only needed for major incidents',
        'Wait until end of shift to report anything',
        instruction.length > 80 ? instruction.substring(0, 80) + '...' : instruction
      ],
      correctIndex: 3
    });
  }

  if (questions.length === 0 && lines.length > 0) {
    questions.push({
      id: 'general_awareness',
      question: `Have you reviewed and understood the post orders for ${siteName || 'this site'}?`,
      options: [
        'Yes, I have read and understand all site-specific instructions',
        'No, I have not reviewed them',
        'I am unsure about some instructions',
        'Post orders are not applicable to my role'
      ],
      correctIndex: 0
    });
  }

  return questions;
}

class PostOrderQuizService {
  async getQuizForShift(shiftId: string, workspaceId: string): Promise<PostOrderQuiz | null> {
    const [shift] = await db.select().from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
      .limit(1);

    if (!shift) return null;

    let postOrders: string | null = null;
    let siteName: string | undefined;
    let specialInstructions: string | null = null;
    let clientName = 'Unknown Client';

    if (shift.siteId) {
      const [site] = await db.select().from(sites)
        .where(eq(sites.id, shift.siteId))
        .limit(1);
      if (site) {
        siteName = site.name;
        specialInstructions = site.specialInstructions;
      }
    }

    if (shift.clientId) {
      const [client] = await db.select().from(clients)
        .where(eq(clients.id, shift.clientId))
        .limit(1);
      if (client) {
        clientName = client.companyName || `${client.firstName} ${client.lastName}`;
        postOrders = client.postOrders;
      }
    }

    if (!postOrders && !specialInstructions) return null;

    const questions = generateQuestionsFromPostOrders(
      postOrders || '',
      siteName,
      specialInstructions
    );

    if (questions.length === 0) return null;

    return {
      shiftId,
      clientName,
      siteName,
      questions,
      postOrderSummary: (postOrders || specialInstructions || '').substring(0, 500),
    };
  }

  async validateQuizAnswers(
    shiftId: string,
    workspaceId: string,
    employeeId: string,
    answers: Record<string, number>
  ): Promise<QuizResult> {
    const quiz = await this.getQuizForShift(shiftId, workspaceId);

    if (!quiz) {
      return { passed: true, score: 100, totalQuestions: 0, correctAnswers: 0, failedQuestions: [] };
    }

    let correct = 0;
    const failedQuestions: string[] = [];

    for (const q of quiz.questions) {
      if (answers[q.id] === q.correctIndex) {
        correct++;
      } else {
        failedQuestions.push(q.question);
      }
    }

    const score = quiz.questions.length > 0 ? Math.round((correct / quiz.questions.length) * 100) : 100;
    const passed = score >= 75;

    await db.insert(shiftAcknowledgments).values({
      workspaceId,
      shiftId,
      employeeId,
      type: 'post_order',
      title: `Post Order Quiz — ${quiz.clientName}${quiz.siteName ? ` (${quiz.siteName})` : ''}`,
      content: JSON.stringify({
        score,
        passed,
        totalQuestions: quiz.questions.length,
        correctAnswers: correct,
        failedQuestions,
        answeredAt: new Date().toISOString(),
      }),
      isRequired: true,
      acknowledgedAt: passed ? new Date() : null,
      acknowledgedBy: passed ? employeeId : null,
    });

    if (!passed) {
      const emp = await db.query.employees.findFirst({
        where: eq(employees.id, employeeId),
        columns: { userId: true, firstName: true, lastName: true },
      });

      if (emp?.userId) {
        await createNotification({
          workspaceId,
          userId: emp.userId,
          type: 'issue_detected',
          title: 'Post Order Quiz Failed',
          message: `You scored ${score}% on the post order quiz for ${quiz.clientName}. You must score at least 75% to clock in. Please review the post orders and try again.`,
          actionUrl: '/time-tracking',
          relatedEntityType: 'shift',
          relatedEntityId: shiftId,
          metadata: { notificationType: 'post_order_quiz_failed', score, failedQuestions },
        });
      }
    }

    return { passed, score, totalQuestions: quiz.questions.length, correctAnswers: correct, failedQuestions };
  }

  async hasPassedQuiz(shiftId: string, employeeId: string, workspaceId: string): Promise<boolean> {
    const ack = await db.query.shiftAcknowledgments.findFirst({
      where: and(
        eq(shiftAcknowledgments.shiftId, shiftId),
        eq(shiftAcknowledgments.employeeId, employeeId),
        eq(shiftAcknowledgments.workspaceId, workspaceId),
        eq(shiftAcknowledgments.type, 'post_order'),
      ),
    });

    if (!ack) return false;
    if (!ack.acknowledgedAt) return false;

    try {
      const content = JSON.parse(ack.content);
      return content.passed === true;
    } catch {
      return !!ack.acknowledgedAt;
    }
  }
}

export const postOrderQuizService = new PostOrderQuizService();
