/**
 * Officer Certification Routes
 * ==============================
 * Mounts under /api/training/certification
 * All routes require auth + workspace scope (applied at domain level).
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import {
  trainingModules,
  trainingSections,
  trainingQuestions,
  officerTrainingAttempts,
  officerTrainingCertificates,
  trainingInterventions,
  employees,
  workspaces,
  users,
} from '@shared/schema';
import { eq, and, desc, isNull, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { seedPlatformTrainingModules } from '../services/training/trainingModuleSeeder';
import { generateCertificatePdf } from '../services/training/certificateGenerator';
import { platformEventBus } from '../services/platformEventBus';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
const log = createLogger('OfficerCertificationRoutes');


const router = Router();

// ── HELPERS ───────────────────────────────────────────────────────────────

function generateCertificateNumber(moduleId: string): string {
  const prefix = 'CERT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = moduleId.slice(-4).toUpperCase();
  return `${prefix}-${timestamp}-${suffix}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function scoreSection(answers: Record<string, string>, questions: typeof trainingQuestions.$inferSelect[]): { score: number; passed: boolean; missedTopics: string[] } {
  const sectionQuestions = questions.filter(q => !q.isFinalExam);
  if (sectionQuestions.length === 0) return { score: 100, passed: true, missedTopics: [] };
  let correct = 0;
  const missedTopics: string[] = [];
  for (const q of sectionQuestions) {
    if (answers[q.id] === q.correctAnswer) {
      correct++;
    } else {
      missedTopics.push(q.questionText.slice(0, 80));
    }
  }
  const score = Math.round((correct / sectionQuestions.length) * 100);
  return { score, passed: score >= 70, missedTopics };
}

// ── SEED MODULES (admin/platform only) ────────────────────────────────────

router.post('/seed-modules', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await seedPlatformTrainingModules();
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    log.error('[CertRoutes] seed-modules error:', err);
    res.status(500).json({ message: 'Seeding failed', error: sanitizeError(err) });
  }
});

// ── GET /modules — list all available modules ─────────────────────────────

router.get('/modules', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const modules = await db
      .select()
      .from(trainingModules)
      .where(
        or(
          eq(trainingModules.isPlatformDefault, true),
          eq(trainingModules.workspaceId, workspaceId),
        ),
      )
      .orderBy(trainingModules.orderIndex);

    if (modules.length === 0) {
      await seedPlatformTrainingModules();
      const seeded = await db
        .select()
        .from(trainingModules)
        .where(eq(trainingModules.isPlatformDefault, true))
        .orderBy(trainingModules.orderIndex);
      return res.json(seeded);
    }

    res.json(modules);
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /modules error:', err);
    res.status(500).json({ message: 'Failed to fetch training modules' });
  }
});

// ── GET /modules/:id — get module detail with sections and questions ────────

router.get('/modules/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, id))
      .limit(1);

    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const sections = await db
      .select()
      .from(trainingSections)
      .where(eq(trainingSections.moduleId, id))
      .orderBy(trainingSections.orderIndex);

    const questions = await db
      .select()
      .from(trainingQuestions)
      .where(eq(trainingQuestions.moduleId, id))
      .orderBy(trainingQuestions.orderIndex);

    const sectionQuestions = sections.map(s => ({
      ...s,
      questions: questions.filter(q => q.sectionId === s.id && !q.isFinalExam),
    }));

    const finalExamQuestions = questions.filter(q => q.isFinalExam);

    res.json({
      module,
      sections: sectionQuestions,
      finalExamQuestions,
    });
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /modules/:id error:', err);
    res.status(500).json({ message: 'Failed to fetch module' });
  }
});

// ── POST /attempts — start a new training attempt ─────────────────────────

router.post('/attempts', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { moduleId, employeeId, attemptType = 'annual' } = req.body;

    if (!moduleId || !employeeId) {
      return res.status(400).json({ message: 'moduleId and employeeId are required' });
    }

    const [module] = await db
      .select({ id: trainingModules.id, title: trainingModules.title })
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId))
      .limit(1);

    if (!module) {
      return res.status(404).json({ message: 'Training module not found' });
    }

    // Count prior attempts for this module by this officer
    const priorAttempts = await db
      .select({ id: officerTrainingAttempts.id })
      .from(officerTrainingAttempts)
      .where(
        and(
          eq(officerTrainingAttempts.workspaceId, workspaceId),
          eq(officerTrainingAttempts.employeeId, employeeId),
          eq(officerTrainingAttempts.moduleId, moduleId),
        ),
      );

    const attemptNumber = priorAttempts.length + 1;

    const [attempt] = await db
      .insert(officerTrainingAttempts)
      .values({
        workspaceId,
        employeeId,
        moduleId,
        attemptNumber,
        attemptType,
        currentSectionIndex: 0,
        sectionScores: {},
        answers: {},
        passed: false,
        flaggedForIntervention: false,
        ipAddress: req.ip ?? null,
      })
      .returning();

    res.status(201).json(attempt);
  } catch (err: unknown) {
    log.error('[CertRoutes] POST /attempts error:', err);
    res.status(500).json({ message: 'Failed to start training attempt' });
  }
});

// ── GET /attempts/:id — get attempt status ────────────────────────────────

router.get('/attempts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;

    const [attempt] = await db
      .select()
      .from(officerTrainingAttempts)
      .where(
        and(
          eq(officerTrainingAttempts.id, id),
          eq(officerTrainingAttempts.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    res.json(attempt);
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /attempts/:id error:', err);
    res.status(500).json({ message: 'Failed to fetch attempt' });
  }
});

// ── PATCH /attempts/:id/section — submit section quiz answers ─────────────

router.patch('/attempts/:id/section', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { sectionId, answers, timeSpentSeconds = 0 } = req.body;

    if (!sectionId || !answers) {
      return res.status(400).json({ message: 'sectionId and answers are required' });
    }

    const [attempt] = await db
      .select()
      .from(officerTrainingAttempts)
      .where(
        and(
          eq(officerTrainingAttempts.id, id),
          eq(officerTrainingAttempts.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }
    if (attempt.completedAt) {
      return res.status(409).json({ message: 'Attempt already completed' });
    }

    const sectionQuestions = await db
      .select()
      .from(trainingQuestions)
      .where(
        and(
          eq(trainingQuestions.moduleId, attempt.moduleId),
          eq(trainingQuestions.sectionId, sectionId),
          eq(trainingQuestions.isFinalExam, false),
        ),
      );

    const { score, passed, missedTopics } = scoreSection(answers, sectionQuestions);

    const updatedSectionScores = {
      ...(attempt.sectionScores as Record<string, any> || {}),
      [sectionId]: { score, passed, missedTopics },
    };
    const updatedAnswers = {
      ...(attempt.answers as Record<string, any> || {}),
      ...answers,
    };

    const [updated] = await db
      .update(officerTrainingAttempts)
      .set({
        sectionScores: updatedSectionScores,
        answers: updatedAnswers,
        currentSectionIndex: (attempt.currentSectionIndex ?? 0) + 1,
        timeSpentSeconds: (attempt.timeSpentSeconds ?? 0) + timeSpentSeconds,
      })
      .where(eq(officerTrainingAttempts.id, id))
      .returning();

    res.json({ attempt: updated, sectionResult: { score, passed, missedTopics } });
  } catch (err: unknown) {
    log.error('[CertRoutes] PATCH /attempts/:id/section error:', err);
    res.status(500).json({ message: 'Failed to submit section' });
  }
});

// ── POST /attempts/:id/final-exam — submit final exam ─────────────────────

router.post('/attempts/:id/final-exam', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { answers, timeSpentSeconds = 0 } = req.body;

    if (!answers) {
      return res.status(400).json({ message: 'answers are required' });
    }

    const [attempt] = await db
      .select()
      .from(officerTrainingAttempts)
      .where(
        and(
          eq(officerTrainingAttempts.id, id),
          eq(officerTrainingAttempts.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
    if (attempt.completedAt) return res.status(409).json({ message: 'Attempt already completed' });

    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, attempt.moduleId))
      .limit(1);

    if (!module) return res.status(404).json({ message: 'Module not found' });

    const finalQuestions = await db
      .select()
      .from(trainingQuestions)
      .where(
        and(
          eq(trainingQuestions.moduleId, attempt.moduleId),
          eq(trainingQuestions.isFinalExam, true),
        ),
      );

    let correctCount = 0;
    const missedTopics: string[] = [];
    for (const q of finalQuestions) {
      if (answers[q.id] === q.correctAnswer) {
        correctCount++;
      } else {
        missedTopics.push(q.questionText.slice(0, 80));
      }
    }

    const finalExamScore = finalQuestions.length > 0
      ? Math.round((correctCount / finalQuestions.length) * 100)
      : 100;

    const sectionScores = attempt.sectionScores as Record<string, { score: number }> || {};
    const sectionAvg = Object.values(sectionScores).length > 0
      ? Math.round(Object.values(sectionScores).reduce((sum, s) => sum + (s.score ?? 0), 0) / Object.values(sectionScores).length)
      : 100;

    const overallScore = Math.round((finalExamScore * 0.7) + (sectionAvg * 0.3));
    const passed = overallScore >= (module.passingScore ?? 80);
    const passingScore = module.passingScore ?? 80;

    const allAttempts = await db
      .select({ id: officerTrainingAttempts.id, passed: officerTrainingAttempts.passed })
      .from(officerTrainingAttempts)
      .where(
        and(
          eq(officerTrainingAttempts.workspaceId, workspaceId),
          eq(officerTrainingAttempts.employeeId, attempt.employeeId),
          eq(officerTrainingAttempts.moduleId, attempt.moduleId),
        ),
      );

    const failCount = allAttempts.filter(a => !a.passed).length;
    const maxAttempts = module.maxAttemptsBeforeIntervention ?? 2;
    const shouldFlagIntervention = !passed && failCount >= maxAttempts - 1;

    // ── Pre-transaction: fetch names + generate PDF (side effects outside TX) ──
    const completionTs = new Date();
    let certNumber: string | null = null;
    let expiresAt: Date | null = null;
    let officerName = 'Officer';
    let pdfUrl: string | null = null;
    let wsName = 'Security Organization';

    if (passed) {
      certNumber = generateCertificateNumber(attempt.moduleId);
      expiresAt = addDays(completionTs, module.certificateValidDays ?? 365);

      const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, attempt.employeeId)).limit(1);
      wsName = ws?.name ?? 'Security Organization';
      officerName = emp ? `${emp.firstName} ${emp.lastName}` : 'Officer';

      try {
        pdfUrl = await generateCertificatePdf({
          certNumber,
          officerName,
          moduleTitle: module.title,
          orgName: wsName,
          issuedAt: completionTs,
          expiresAt,
          overallScore,
          workspaceId,
        });
      } catch (pdfErr) {
        log.error('[CertRoutes] PDF generation failed (non-fatal):', pdfErr);
      }
    } else if (shouldFlagIntervention) {
      const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, attempt.employeeId)).limit(1);
      officerName = emp ? `${emp.firstName} ${emp.lastName}` : 'Officer';
    }

    // ── Atomic transaction: update attempt + insert cert OR intervention ───
    let certificate: typeof officerTrainingCertificates.$inferSelect | null = null;
    const { updated, interventionCreated } = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(officerTrainingAttempts)
        .set({
          completedAt: completionTs,
          finalExamScore,
          overallScore,
          passed,
          answers: { ...(attempt.answers as object || {}), ...answers },
          timeSpentSeconds: (attempt.timeSpentSeconds ?? 0) + timeSpentSeconds,
          flaggedForIntervention: shouldFlagIntervention,
          interventionRequiredAt: shouldFlagIntervention ? completionTs : null,
        })
        .where(eq(officerTrainingAttempts.id, id))
        .returning();

      if (passed && certNumber && expiresAt) {
        const [cert] = await tx
          .insert(officerTrainingCertificates)
          .values({
            workspaceId,
            employeeId: attempt.employeeId,
            moduleId: attempt.moduleId,
            attemptId: id,
            certificateNumber: certNumber,
            expiresAt,
            overallScore,
            isValid: true,
            pdfUrl,
          })
          .returning();
        certificate = cert;
      } else if (shouldFlagIntervention) {
        await tx.insert(trainingInterventions).values({
          workspaceId,
          employeeId: attempt.employeeId,
          moduleId: attempt.moduleId,
          attemptId: id,
          consistentlyMissedTopics: missedTopics.slice(0, 10),
          completed: false,
        });
      }

      return { updated, interventionCreated: shouldFlagIntervention };
    });

    // ── Post-transaction: events + fire-and-forget side effects ───────────
    if (passed && certificate && certNumber) {
      try {
        platformEventBus.publish({
          type: 'training_certificate_earned',
          category: 'workforce',
          title: `${officerName} earned ${module.title} certificate`,
          description: `Score: ${overallScore}%. Certificate #${certNumber} valid until ${expiresAt!.toLocaleDateString()}`,
          workspaceId,
          metadata: {
            workspaceId,
            employeeId: attempt.employeeId,
            moduleId: attempt.moduleId,
            moduleTitle: module.title,
            certNumber,
            overallScore,
            expiresAt: expiresAt!.toISOString(),
            officerName,
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      } catch { /* non-fatal */ }

      // Update training completion percentage (fire-and-forget)
      Promise.resolve().then(async () => {
        try {
          const allModules = await db.select({ id: trainingModules.id }).from(trainingModules).where(or(eq(trainingModules.isPlatformDefault, true), eq(trainingModules.workspaceId, workspaceId)));
          const earnedCerts = await db.select({ moduleId: officerTrainingCertificates.moduleId }).from(officerTrainingCertificates).where(and(eq(officerTrainingCertificates.employeeId, attempt.employeeId), eq(officerTrainingCertificates.workspaceId, workspaceId), eq(officerTrainingCertificates.isValid, true)));
          const uniqueEarned = new Set(earnedCerts.map(c => c.moduleId));
          const pct = allModules.length > 0 ? Math.round((uniqueEarned.size / allModules.length) * 100) : 0;
          await db.update(employees).set({ trainingCompletionPercentage: pct }).where(eq(employees.id, attempt.employeeId));
        } catch (pctErr) {
          log.warn('[CertRoutes] Training completion pct update failed (non-fatal):', pctErr);
        }
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    } else if (interventionCreated) {
      try {
        platformEventBus.publish({
          type: 'training_intervention_required',
          category: 'workforce',
          title: `Training intervention required`,
          description: `Officer failed ${module.title} ${maxAttempts} times. Score: ${overallScore}%. Topics: ${missedTopics.slice(0, 3).join(', ')}`,
          workspaceId,
          metadata: {
            workspaceId,
            employeeId: attempt.employeeId,
            moduleId: attempt.moduleId,
            moduleTitle: module.title,
            overallScore,
            failCount: failCount + 1,
            missedTopics,
            officerName,
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      } catch { /* non-fatal */ }
    }

    res.json({
      attempt: updated,
      certificate,
      finalExamScore,
      overallScore,
      passed,
      passingScore,
      missedTopics,
      interventionRequired: shouldFlagIntervention,
    });
  } catch (err: unknown) {
    log.error('[CertRoutes] POST /attempts/:id/final-exam error:', err);
    res.status(500).json({ message: 'Failed to submit final exam' });
  }
});

// ── GET /transcript/:employeeId — training transcript ─────────────────────

router.get('/transcript/:employeeId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;

    const [employee] = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName, complianceScore: employees.complianceScore, trainingCompletionPercentage: employees.trainingCompletionPercentage })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const certs = await db
      .select({
        cert: officerTrainingCertificates,
        moduleTitle: trainingModules.title,
        moduleCategory: trainingModules.category,
      })
      .from(officerTrainingCertificates)
      .leftJoin(trainingModules, eq(officerTrainingCertificates.moduleId, trainingModules.id))
      .where(
        and(
          eq(officerTrainingCertificates.employeeId, employeeId),
          eq(officerTrainingCertificates.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(officerTrainingCertificates.issuedAt));

    const attempts = await db
      .select({
        attempt: officerTrainingAttempts,
        moduleTitle: trainingModules.title,
      })
      .from(officerTrainingAttempts)
      .leftJoin(trainingModules, eq(officerTrainingAttempts.moduleId, trainingModules.id))
      .where(
        and(
          eq(officerTrainingAttempts.employeeId, employeeId),
          eq(officerTrainingAttempts.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(officerTrainingAttempts.startedAt));

    const interventions = await db
      .select()
      .from(trainingInterventions)
      .where(
        and(
          eq(trainingInterventions.employeeId, employeeId),
          eq(trainingInterventions.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(trainingInterventions.flaggedAt));

    res.json({
      employee,
      certificates: certs,
      attempts,
      interventions,
      summary: {
        totalCertificates: certs.length,
        validCertificates: certs.filter(c => c.cert.isValid).length,
        expiredCertificates: certs.filter(c => !c.cert.isValid || new Date(c.cert.expiresAt) < new Date()).length,
        totalAttempts: attempts.length,
        passedAttempts: attempts.filter(a => a.attempt.passed).length,
        openInterventions: interventions.filter(i => !i.completed).length,
        complianceScore: employee.complianceScore,
        trainingCompletionPercentage: employee.trainingCompletionPercentage,
      },
    });
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /transcript/:employeeId error:', err);
    res.status(500).json({ message: 'Failed to fetch transcript' });
  }
});

// ── GET /compliance-report — workspace-level training compliance ───────────

router.get('/compliance-report', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const allEmployees = await db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, complianceScore: employees.complianceScore, trainingCompletionPercentage: employees.trainingCompletionPercentage, status: employees.status })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));

    const allModules = await db
      .select({ id: trainingModules.id, title: trainingModules.title, isRequired: trainingModules.isRequired, certificateValidDays: trainingModules.certificateValidDays })
      .from(trainingModules)
      .where(or(eq(trainingModules.isPlatformDefault, true), eq(trainingModules.workspaceId, workspaceId)))
      .orderBy(trainingModules.orderIndex);

    const requiredModules = allModules.filter(m => m.isRequired);

    const allCerts = await db
      .select()
      .from(officerTrainingCertificates)
      .where(and(eq(officerTrainingCertificates.workspaceId, workspaceId), eq(officerTrainingCertificates.isValid, true)));

    const openInterventions = await db
      .select({ employeeId: trainingInterventions.employeeId, moduleId: trainingInterventions.moduleId })
      .from(trainingInterventions)
      .where(and(eq(trainingInterventions.workspaceId, workspaceId), eq(trainingInterventions.completed, false)));

    const now = new Date();

    const officerReports = allEmployees.map(emp => {
      const empCerts = allCerts.filter(c => c.employeeId === emp.id);
      const empInterventions = openInterventions.filter(i => i.employeeId === emp.id);

      const requiredStatus = requiredModules.map(m => {
        const cert = empCerts.find(c => c.moduleId === m.id);
        let status: 'current' | 'expiring_soon' | 'expired' | 'not_started' = 'not_started';
        if (cert) {
          const exp = new Date(cert.expiresAt);
          const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
          if (daysLeft < 0) status = 'expired';
          else if (daysLeft <= 30) status = 'expiring_soon';
          else status = 'current';
        }
        return { moduleId: m.id, moduleTitle: m.title, status, expiresAt: empCerts.find(c => c.moduleId === m.id)?.expiresAt ?? null };
      });

      const compliant = requiredStatus.every(s => s.status === 'current' || s.status === 'expiring_soon');

      return {
        employeeId: emp.id,
        officerName: `${emp.firstName} ${emp.lastName}`,
        complianceScore: emp.complianceScore,
        trainingCompletionPercentage: emp.trainingCompletionPercentage,
        compliant,
        openInterventions: empInterventions.length,
        requiredModuleStatus: requiredStatus,
        totalCerts: empCerts.length,
      };
    });

    const compliantCount = officerReports.filter(r => r.compliant).length;
    const interventionCount = officerReports.reduce((sum, r) => sum + r.openInterventions, 0);

    res.json({
      workspaceId,
      generatedAt: now.toISOString(),
      summary: {
        totalOfficers: allEmployees.length,
        compliantOfficers: compliantCount,
        complianceRate: allEmployees.length > 0 ? Math.round((compliantCount / allEmployees.length) * 100) : 0,
        openInterventions: interventionCount,
        requiredModules: requiredModules.length,
        totalModules: allModules.length,
      },
      officers: officerReports,
      modules: allModules,
    });
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /compliance-report error:', err);
    res.status(500).json({ message: 'Failed to generate compliance report' });
  }
});

// ── GET /interventions — list open interventions ───────────────────────────

router.get('/interventions', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const interventions = await db
      .select({
        intervention: trainingInterventions,
        moduleTitle: trainingModules.title,
        empFirstName: employees.firstName,
        empLastName: employees.lastName,
      })
      .from(trainingInterventions)
      .leftJoin(trainingModules, eq(trainingInterventions.moduleId, trainingModules.id))
      .leftJoin(employees, eq(trainingInterventions.employeeId, employees.id))
      .where(eq(trainingInterventions.workspaceId, workspaceId))
      .orderBy(desc(trainingInterventions.flaggedAt));

    res.json(interventions.map(r => ({
      ...r.intervention,
      moduleTitle: r.moduleTitle,
      officerName: `${r.empFirstName ?? ''} ${r.empLastName ?? ''}`.trim(),
    })));
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /interventions error:', err);
    res.status(500).json({ message: 'Failed to fetch interventions' });
  }
});

// ── PATCH /interventions/:id — resolve an intervention ────────────────────

router.patch('/interventions/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { conductedBy, durationMinutes, notes, outcome } = req.body;

    const [updated] = await db
      .update(trainingInterventions)
      .set({
        completed: true,
        completedAt: new Date(),
        conductedBy,
        durationMinutes,
        notes,
        outcome,
      })
      .where(and(eq(trainingInterventions.id, id), eq(trainingInterventions.workspaceId, workspaceId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Intervention not found' });
    }

    res.json(updated);
  } catch (err: unknown) {
    log.error('[CertRoutes] PATCH /interventions/:id error:', err);
    res.status(500).json({ message: 'Failed to update intervention' });
  }
});

// ── GET /verify/:certNumber — public certificate verification ─────────────

router.get('/verify/:certNumber', async (req, res) => {
  try {
    const { certNumber } = req.params;

    const [cert] = await db
      .select({
        cert: officerTrainingCertificates,
        moduleTitle: trainingModules.title,
        moduleCategory: trainingModules.category,
        empFirstName: employees.firstName,
        empLastName: employees.lastName,
      })
      .from(officerTrainingCertificates)
      .leftJoin(trainingModules, eq(officerTrainingCertificates.moduleId, trainingModules.id))
      .leftJoin(employees, eq(officerTrainingCertificates.employeeId, employees.id))
      .where(eq(officerTrainingCertificates.certificateNumber, certNumber))
      .limit(1);

    if (!cert) {
      return res.status(404).json({ valid: false, message: 'Certificate not found' });
    }

    const now = new Date();
    const expired = new Date(cert.cert.expiresAt) < now;
    const isValid = cert.cert.isValid && !expired;

    res.json({
      valid: isValid,
      certificateNumber: certNumber,
      officerName: `${cert.empFirstName ?? ''} ${cert.empLastName ?? ''}`.trim(),
      moduleTitle: cert.moduleTitle,
      moduleCategory: cert.moduleCategory,
      issuedAt: cert.cert.issuedAt,
      expiresAt: cert.cert.expiresAt,
      overallScore: cert.cert.overallScore,
      expired,
    });
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /verify/:certNumber error:', err);
    res.status(500).json({ message: 'Verification failed' });
  }
});

// ── GET /my-certificates — officer's own certificates ─────────────────────

router.get('/my-certificates', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.userId;

    const [emp] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, userId)))
      .limit(1);

    if (!emp) {
      return res.json([]);
    }

    const certs = await db
      .select({
        cert: officerTrainingCertificates,
        moduleTitle: trainingModules.title,
        moduleCategory: trainingModules.category,
        passingScore: trainingModules.passingScore,
      })
      .from(officerTrainingCertificates)
      .leftJoin(trainingModules, eq(officerTrainingCertificates.moduleId, trainingModules.id))
      .where(and(eq(officerTrainingCertificates.employeeId, emp.id), eq(officerTrainingCertificates.workspaceId, workspaceId)))
      .orderBy(desc(officerTrainingCertificates.issuedAt));

    res.json(certs);
  } catch (err: unknown) {
    log.error('[CertRoutes] GET /my-certificates error:', err);
    res.status(500).json({ message: 'Failed to fetch certificates' });
  }
});

export default router;

// ── Public router — no auth required ─────────────────────────────────────────
// Mounted separately at /api/public/training/certification (no requireAuth)
// Used by QR codes printed on physical certificates.
export const publicCertRouter = Router();

publicCertRouter.get('/verify/:certNumber', async (req, res) => {
  try {
    const { certNumber } = req.params;
    const [cert] = await db
      .select({
        cert: officerTrainingCertificates,
        moduleTitle: trainingModules.title,
        moduleCategory: trainingModules.category,
        empFirstName: employees.firstName,
        empLastName: employees.lastName,
      })
      .from(officerTrainingCertificates)
      .leftJoin(trainingModules, eq(officerTrainingCertificates.moduleId, trainingModules.id))
      .leftJoin(employees, eq(officerTrainingCertificates.employeeId, employees.id))
      .where(eq(officerTrainingCertificates.certificateNumber, certNumber))
      .limit(1);

    if (!cert) return res.status(404).json({ valid: false, message: 'Certificate not found' });

    const now = new Date();
    const expired = new Date(cert.cert.expiresAt) < now;
    const isValid = cert.cert.isValid && !expired;

    res.json({
      valid: isValid,
      certificateNumber: certNumber,
      officerName: `${cert.empFirstName ?? ''} ${cert.empLastName ?? ''}`.trim(),
      moduleTitle: cert.moduleTitle,
      moduleCategory: cert.moduleCategory,
      issuedAt: cert.cert.issuedAt,
      expiresAt: cert.cert.expiresAt,
      overallScore: cert.cert.overallScore,
      expired,
    });
  } catch (err: unknown) {
    log.error('[PublicCertVerify] GET /verify/:certNumber error:', err);
    res.status(500).json({ message: 'Verification failed' });
  }
});
