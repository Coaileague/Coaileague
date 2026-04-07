import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  BookOpen,
  Award,
  RotateCcw,
  Lightbulb,
  ClipboardList,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEmployee } from "@/hooks/useEmployee";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────────

interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  category: string;
  passingScore: number;
  certificateValidDays: number;
  isRequired: boolean;
  orderIndex: number;
}

interface TrainingSection {
  id: string;
  moduleId: string;
  title: string;
  contentBody: string;
  flashcardData: Array<{ front: string; back: string }> | null;
  orderIndex: number;
  sectionQuizRequired: boolean;
  questions: TrainingQuestion[];
}

interface TrainingQuestion {
  id: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  explanation: string | null;
  isFinalExam: boolean;
}

interface ModuleDetail {
  module: TrainingModule;
  sections: TrainingSection[];
  finalExamQuestions: TrainingQuestion[];
}

type Step = 'reading' | 'flashcards' | 'quiz' | 'final_exam' | 'result';

// ── Helpers ────────────────────────────────────────────────────────────────

function Flashcard({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  return (
    <div
      data-testid="flashcard"
      className="cursor-pointer select-none w-full"
      style={{ perspective: '1000px', minHeight: '220px' }}
      onClick={() => setFlipped(f => !f)}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '220px',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          <Card className="h-full flex items-center justify-center p-6 text-center min-h-[220px]">
            <CardContent className="p-0 w-full">
              <Badge className="mb-3 text-xs border bg-primary/10 text-primary border-primary/20">Question</Badge>
              <p className="text-lg font-medium leading-snug">{front}</p>
              <p className="text-xs text-muted-foreground mt-4">
                {isTouchDevice ? 'Tap to reveal answer' : 'Click to reveal answer'}
              </p>
            </CardContent>
          </Card>
        </div>
        {/* Back */}
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <Card className="h-full flex items-center justify-center p-6 text-center min-h-[220px] border-green-500/20 bg-green-500/5">
            <CardContent className="p-0 w-full">
              <Badge className="mb-3 text-xs border bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Answer</Badge>
              <p className="text-base font-medium leading-relaxed">{back}</p>
              <p className="text-xs text-muted-foreground mt-4">
                {isTouchDevice ? 'Tap to flip back' : 'Click to flip back'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuizQuestion({
  question,
  selected,
  onSelect,
  showResult,
}: {
  question: TrainingQuestion;
  selected: string | null;
  onSelect: (id: string) => void;
  showResult: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="font-medium text-sm leading-relaxed">{question.questionText}</p>
      <div className="space-y-2">
        {question.options.map(opt => {
          const isSelected = selected === opt.id;
          const isCorrect = opt.id === question.correctAnswer;
          let cls = 'border rounded-md px-4 py-3 text-sm cursor-pointer transition-colors min-h-[48px] flex items-center gap-2';
          if (!showResult) {
            cls += isSelected
              ? ' border-primary bg-primary/10 text-primary font-medium'
              : ' border-border hover-elevate';
          } else {
            if (isCorrect) cls += ' border-green-500 bg-green-500/10 text-green-700 dark:text-green-400 font-medium';
            else if (isSelected) cls += ' border-red-500 bg-red-500/10 text-red-600';
            else cls += ' border-border text-muted-foreground';
          }
          return (
            <div
              key={opt.id}
              data-testid={`option-${opt.id}`}
              className={cls}
              onClick={() => !showResult && onSelect(opt.id)}
            >
              {showResult && isCorrect && <CheckCircle className="inline w-3.5 h-3.5 mr-1.5 text-green-500" />}
              {showResult && isSelected && !isCorrect && <XCircle className="inline w-3.5 h-3.5 mr-1.5 text-red-500" />}
              {opt.text}
            </div>
          );
        })}
      </div>
      {showResult && question.explanation && (
        <div className="flex gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
          <span>{question.explanation}</span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ModuleLearningPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { employee } = useEmployee();

  const moduleId = params.id!;

  // Step tracking
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [step, setStep] = useState<Step>('reading');
  const [flashcardIdx, setFlashcardIdx] = useState(0);

  // Quiz/exam answers
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [showSectionResult, setShowSectionResult] = useState(false);
  const [showExamResult, setShowExamResult] = useState(false);

  // Attempt state
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<{
    passed: boolean;
    overallScore: number;
    passingScore: number;
    certificate: any;
    missedTopics: string[];
    interventionRequired: boolean;
  } | null>(null);

  // Time tracking
  const [sectionStartTime] = useState(Date.now());

  const { data: moduleDetail, isLoading } = useQuery<ModuleDetail>({
    queryKey: ['/api/training/certification/modules', moduleId],
    queryFn: () => fetch(`/api/training/certification/modules/${moduleId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const startAttempt = useMutation({
    mutationFn: (employeeId: string) =>
      apiRequest('POST', '/api/training/certification/attempts', {
        moduleId,
        employeeId,
        attemptType: 'annual',
      }),
    onSuccess: (data: any) => {
      setAttemptId(data.id);
    },
    onError: () => toast({ title: 'Failed to start attempt', variant: 'destructive' }),
  });

  const submitSection = useMutation({
    mutationFn: ({ sectionId, answers }: { sectionId: string; answers: Record<string, string> }) =>
      apiRequest('PATCH', `/api/training/certification/attempts/${attemptId}/section`, {
        sectionId,
        answers,
        timeSpentSeconds: Math.floor((Date.now() - sectionStartTime) / 1000),
      }),
  });

  const submitFinalExam = useMutation({
    mutationFn: (answers: Record<string, string>) =>
      apiRequest('POST', `/api/training/certification/attempts/${attemptId}/final-exam`, {
        answers,
        timeSpentSeconds: Math.floor((Date.now() - sectionStartTime) / 1000),
      }),
    onSuccess: (data: any) => {
      setFinalResult(data);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['/api/training/certification/my-certificates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/certification/compliance-report'] });
    },
    onError: () => toast({ title: 'Failed to submit exam', variant: 'destructive' }),
  });

  // Auto-start attempt when employee is known
  useEffect(() => {
    if (employee && !attemptId && !startAttempt.isPending && (employee as any)?.id) {
      startAttempt.mutate((employee as any).id);
    }
  }, [employee]);

  if (isLoading || !moduleDetail) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-64 rounded-md" />
        <Skeleton className="h-48 rounded-md" />
      </div>
    );
  }

  const { module, sections, finalExamQuestions } = moduleDetail;
  const currentSection = sections[currentSectionIdx];
  const totalProgress = sections.length > 0 ? Math.round((currentSectionIdx / sections.length) * 100) : 0;

  // ── RESULT SCREEN ────────────────────────────────────────────────────────
  if (step === 'result' && finalResult) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-6">
        <Button data-testid="button-back-to-hub" variant="ghost" className="self-start mb-6 -ml-2" onClick={() => navigate('/training-certification')}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Training Hub
        </Button>

        <Card className="max-w-lg mx-auto w-full">
          <CardContent className="p-8 text-center space-y-4">
            {finalResult.passed ? (
              <Award className="w-16 h-16 mx-auto text-yellow-500" />
            ) : (
              <XCircle className="w-16 h-16 mx-auto text-red-500" />
            )}
            <h2 data-testid="text-result-title" className="text-2xl font-bold">
              {finalResult.passed ? 'Certificate Earned!' : 'Training Not Passed'}
            </h2>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div>
                <p className="text-xs text-muted-foreground">Your Score</p>
                <p data-testid="text-result-score" className={`text-3xl font-bold ${finalResult.passed ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {finalResult.overallScore}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Required</p>
                <p className="text-3xl font-bold text-muted-foreground">{finalResult.passingScore}%</p>
              </div>
            </div>

            {finalResult.passed && finalResult.certificate && (
              <div className="rounded-md border bg-green-500/5 border-green-500/20 p-4 text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">Certificate #{finalResult.certificate.certificateNumber}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Valid until {new Date(finalResult.certificate.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {finalResult.certificate.pdfUrl && (
                  <Button
                    data-testid="button-download-certificate"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      const pdfUrl = finalResult.certificate.pdfUrl as string;
                      if (pdfUrl.startsWith('data:')) {
                        const arr = pdfUrl.split(',');
                        const mime = arr[0].match(/:(.*?);/)?.[1] ?? 'application/pdf';
                        const bstr = atob(arr[1]);
                        const u8arr = new Uint8Array(bstr.length);
                        for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
                        const blob = new Blob([u8arr], { type: mime });
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = `${finalResult.certificate.certificateNumber}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                      } else {
                        const a = document.createElement('a');
                        a.href = pdfUrl;
                        a.download = `${finalResult.certificate.certificateNumber}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }
                    }}
                  >
                    Download Certificate PDF
                  </Button>
                )}
              </div>
            )}

            {!finalResult.passed && finalResult.missedTopics.length > 0 && (
              <div className="text-left rounded-md border bg-muted p-4 text-sm space-y-2">
                <p className="font-medium">Topics to review:</p>
                <ul className="list-disc pl-4 space-y-1">
                  {finalResult.missedTopics.slice(0, 5).map((t, i) => (
                    <li key={i} className="text-muted-foreground text-xs">{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {finalResult.interventionRequired && (
              <div className="rounded-md border bg-red-500/5 border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400">
                A training intervention has been flagged. Your manager will be notified.
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-center pt-2">
              {!finalResult.passed && (
                <Button
                  data-testid="button-retry-module"
                  variant="outline"
                  onClick={() => {
                    setStep('reading');
                    setCurrentSectionIdx(0);
                    setSectionAnswers({});
                    setExamAnswers({});
                    setShowSectionResult(false);
                    setShowExamResult(false);
                    setFinalResult(null);
                    setAttemptId(null);
                    if (employee && (employee as any)?.id) {
                      startAttempt.mutate((employee as any).id);
                    }
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-1" /> Retry Module
                </Button>
              )}
              <Button data-testid="button-back-to-hub-result" onClick={() => navigate('/training-certification')}>
                Back to Training Hub
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── FINAL EXAM ────────────────────────────────────────────────────────────
  if (step === 'final_exam') {
    const allAnswered = finalExamQuestions.every(q => examAnswers[q.id]);
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="border-b px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Final Exam</p>
            <h2 className="text-lg font-bold">{module.title}</h2>
          </div>
          <Badge className="text-xs border bg-primary/10 text-primary border-primary/20">
            {finalExamQuestions.length} questions &middot; {module.passingScore}% to pass
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-2xl mx-auto space-y-8">
            {finalExamQuestions.map((q, i) => (
              <div key={q.id} data-testid={`final-q-${i}`}>
                <p className="text-xs text-muted-foreground mb-2">Question {i + 1} of {finalExamQuestions.length}</p>
                <QuizQuestion
                  question={q}
                  selected={examAnswers[q.id] ?? null}
                  onSelect={optId => setExamAnswers(prev => ({ ...prev, [q.id]: optId }))}
                  showResult={showExamResult}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t px-4 sm:px-6 py-4">
          <div className="max-w-2xl mx-auto flex justify-end">
            {!showExamResult ? (
              <Button
                data-testid="button-submit-exam"
                className="w-full sm:w-auto"
                disabled={!allAnswered || submitFinalExam.isPending || !attemptId}
                onClick={() => {
                  setShowExamResult(true);
                  submitFinalExam.mutate(examAnswers);
                }}
              >
                {submitFinalExam.isPending ? 'Submitting...' : 'Submit Final Exam'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                data-testid="button-view-results"
                className="w-full sm:w-auto"
                onClick={() => setStep('result')}
                disabled={submitFinalExam.isPending}
              >
                {submitFinalExam.isPending ? 'Processing...' : 'View Results'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SECTION VIEW ──────────────────────────────────────────────────────────
  if (!currentSection) {
    // All sections done — go to final exam
    if (step !== 'final_exam' && finalExamQuestions.length > 0) {
      setStep('final_exam');
    }
    return null;
  }

  const flashcards = currentSection.flashcardData ?? [];
  const sectionQuestions = currentSection.questions ?? [];
  const allSectionAnswered = sectionQuestions.every(q => sectionAnswers[q.id]);

  const handleNextSection = async () => {
    // Submit section answers if quiz has questions
    if (sectionQuestions.length > 0 && attemptId) {
      try {
        await submitSection.mutateAsync({ sectionId: currentSection.id, answers: sectionAnswers });
      } catch {
        // Non-fatal — continue anyway
      }
    }

    setSectionAnswers({});
    setShowSectionResult(false);
    setFlashcardIdx(0);

    if (currentSectionIdx < sections.length - 1) {
      setCurrentSectionIdx(i => i + 1);
      setStep('reading');
    } else {
      // All sections done
      if (finalExamQuestions.length > 0) {
        setStep('final_exam');
      } else {
        // No final exam — auto-submit
        if (attemptId) submitFinalExam.mutate({});
      }
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT SIDEBAR — section progress */}
      <div className="hidden md:flex flex-col w-64 border-r bg-muted/30 p-4 overflow-y-auto shrink-0">
        <Button
          data-testid="button-back-from-module"
          variant="ghost"
          size="sm"
          className="self-start mb-4 -ml-1"
          onClick={() => navigate('/training-certification')}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>

        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Overall Progress</p>
          <Progress value={totalProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1">{currentSectionIdx}/{sections.length} sections</p>
        </div>

        <div className="space-y-1">
          {sections.map((s, i) => {
            const done = i < currentSectionIdx;
            const current = i === currentSectionIdx;
            return (
              <div
                key={s.id}
                data-testid={`sidebar-section-${i}`}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                  current ? 'bg-primary/10 text-primary font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'
                }`}
              >
                {done ? (
                  <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
                ) : (
                  <span className={`w-4 h-4 shrink-0 rounded-full border text-xs flex items-center justify-center ${current ? 'border-primary text-primary' : 'border-muted-foreground/30'}`}>{i + 1}</span>
                )}
                <span className="line-clamp-2 leading-snug">{s.title}</span>
              </div>
            );
          })}
          {finalExamQuestions.length > 0 && (
            <div
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                step === 'final_exam' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground/60'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              Final Exam
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile-only top bar: back + progress (sidebar is hidden on mobile) */}
        <div className="md:hidden flex items-center gap-3 px-4 py-2 border-b bg-muted/20">
          <Button
            data-testid="button-back-mobile"
            variant="ghost"
            size="sm"
            className="-ml-1 shrink-0"
            onClick={() => navigate('/training-certification')}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground truncate">{module.title}</span>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">{currentSectionIdx + 1}/{sections.length}</span>
            </div>
            <Progress value={totalProgress} className="h-1" />
          </div>
        </div>

        {/* Section header */}
        <div className="border-b px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Section {currentSectionIdx + 1} of {sections.length}</p>
              <h2 data-testid="text-section-title" className="text-lg font-bold leading-tight">{currentSection.title}</h2>
            </div>
            <div className="flex gap-2">
              {step === 'reading' && <Badge className="text-xs border bg-primary/10 text-primary border-primary/20"><BookOpen className="w-3 h-3 mr-1" />Reading</Badge>}
              {step === 'flashcards' && <Badge className="text-xs border bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"><Lightbulb className="w-3 h-3 mr-1" />Flashcards</Badge>}
              {step === 'quiz' && <Badge className="text-xs border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"><ClipboardList className="w-3 h-3 mr-1" />Quiz</Badge>}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-2xl mx-auto">

            {/* READING STEP */}
            {step === 'reading' && (
              <div className="space-y-4">
                <div
                  data-testid="section-content"
                  className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-sm whitespace-pre-line"
                >
                  {currentSection.contentBody}
                </div>
                <div className="flex justify-end pt-4">
                  <Button
                    data-testid="button-done-reading"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      if (flashcards.length > 0) {
                        setStep('flashcards');
                        setFlashcardIdx(0);
                      } else if (sectionQuestions.length > 0) {
                        setStep('quiz');
                      } else {
                        handleNextSection();
                      }
                    }}
                  >
                    {flashcards.length > 0 ? 'Continue to Flashcards' : sectionQuestions.length > 0 ? 'Continue to Quiz' : 'Next Section'}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* FLASHCARDS STEP */}
            {step === 'flashcards' && flashcards.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Flashcard {flashcardIdx + 1} of {flashcards.length}</p>
                  <Progress value={((flashcardIdx + 1) / flashcards.length) * 100} className="h-1.5 w-32" />
                </div>
                <Flashcard front={flashcards[flashcardIdx].front} back={flashcards[flashcardIdx].back} />
                <div className="flex justify-between">
                  <Button
                    data-testid="button-prev-flashcard"
                    variant="outline"
                    disabled={flashcardIdx === 0}
                    onClick={() => setFlashcardIdx(i => i - 1)}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                  </Button>
                  {flashcardIdx < flashcards.length - 1 ? (
                    <Button data-testid="button-next-flashcard" onClick={() => setFlashcardIdx(i => i + 1)}>
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      data-testid="button-done-flashcards"
                      onClick={() => {
                        if (sectionQuestions.length > 0) setStep('quiz');
                        else handleNextSection();
                      }}
                    >
                      {sectionQuestions.length > 0 ? 'Continue to Quiz' : 'Next Section'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* QUIZ STEP */}
            {step === 'quiz' && sectionQuestions.length > 0 && (
              <div className="space-y-8">
                {sectionQuestions.map((q, i) => (
                  <div key={q.id} data-testid={`quiz-q-${i}`}>
                    <p className="text-xs text-muted-foreground mb-2">Question {i + 1} of {sectionQuestions.length}</p>
                    <QuizQuestion
                      question={q}
                      selected={sectionAnswers[q.id] ?? null}
                      onSelect={optId => setSectionAnswers(prev => ({ ...prev, [q.id]: optId }))}
                      showResult={showSectionResult}
                    />
                  </div>
                ))}
                <div className="flex justify-end gap-3">
                  {!showSectionResult ? (
                    <Button
                      data-testid="button-check-answers"
                      className="w-full sm:w-auto"
                      disabled={!allSectionAnswered}
                      onClick={() => setShowSectionResult(true)}
                    >
                      Check Answers
                    </Button>
                  ) : (
                    <Button
                      data-testid="button-next-section"
                      className="w-full sm:w-auto"
                      onClick={handleNextSection}
                      disabled={submitSection.isPending}
                    >
                      {currentSectionIdx < sections.length - 1 ? 'Next Section' : finalExamQuestions.length > 0 ? 'Go to Final Exam' : 'Finish'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
