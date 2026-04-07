/**
 * PlatformFeedbackSurvey
 *
 * Multi-step survey wizard for collecting end-user feedback about the
 * CoAIleague platform. Each question is shown one at a time with progress
 * tracking. Inspired by Twilio's onboarding survey UX (step-by-step, radio
 * buttons, one question per screen).
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Star, ChevronLeft, ChevronRight, CheckCircle2, MessageSquarePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Question {
  id: string;
  text: string;
  type: "rating" | "multiple_choice" | "text" | "yes_no";
  options: string[];
  required: boolean;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
}

export function PlatformFeedbackSurvey({ open, onClose, workspaceId }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [hoverRating, setHoverRating] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: survey, isLoading } = useQuery<Survey>({
    queryKey: ["/api/platform-feedback/active"],
    enabled: open,
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: object) =>
      apiRequest("POST", "/api/platform-feedback/respond", payload),
    onSuccess: () => setSubmitted(true),
    onError: () => toast({ title: "Could not submit feedback", description: "Please try again.", variant: "destructive" }),
  });

  const questions: Question[] = survey?.questions || [];
  const current = questions[step];
  const progress = questions.length > 0 ? ((step + 1) / questions.length) * 100 : 0;
  const answer = current ? answers[current.id] : undefined;
  const canAdvance = !current?.required || (answer !== undefined && answer !== "");

  function handleClose() {
    setStep(0);
    setAnswers({});
    setSubmitted(false);
    onClose();
  }

  function handleNext() {
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
    } else {
      const formattedAnswers = Object.entries(answers).map(([questionId, ans]) => ({
        questionId,
        answer: ans,
      }));
      submitMutation.mutate({
        surveyId: survey!.id,
        answers: formattedAnswers,
        workspaceId,
      });
    }
  }

  function setAnswer(questionId: string, value: string | number) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function renderQuestion(q: Question) {
    if (q.type === "rating") {
      const currentRating = Number(answers[q.id] || 0);
      const hoverVal = hoverRating[q.id] || 0;

      return (
        <div className="flex gap-2 justify-center py-4">
          {[1, 2, 3, 4, 5].map((val) => {
            const filled = val <= (hoverVal || currentRating);
            return (
              <button
                key={val}
                type="button"
                data-testid={`star-rating-${q.id}-${val}`}
                onMouseEnter={() => setHoverRating((h) => ({ ...h, [q.id]: val }))}
                onMouseLeave={() => setHoverRating((h) => ({ ...h, [q.id]: 0 }))}
                onClick={() => setAnswer(q.id, val)}
                className="focus:outline-none transition-transform active:scale-110"
              >
                <Star
                  className={`h-10 w-10 transition-colors ${
                    filled
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground/40"
                  }`}
                />
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === "yes_no") {
      return (
        <div className="flex gap-4 justify-center py-4">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              type="button"
              data-testid={`answer-${q.id}-${opt}`}
              onClick={() => setAnswer(q.id, opt)}
              className={`px-8 py-3 rounded-md border text-sm font-medium transition-colors ${
                answers[q.id] === opt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted/30 text-foreground hover-elevate"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }

    if (q.type === "multiple_choice") {
      return (
        <RadioGroup
          value={String(answers[q.id] || "")}
          onValueChange={(v) => setAnswer(q.id, v)}
          className="space-y-2 py-2"
          data-testid={`radio-group-${q.id}`}
        >
          {(q.options || []).map((opt) => (
            <div
              key={opt}
              className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                answers[q.id] === opt
                  ? "border-primary bg-primary/10"
                  : "border-border hover-elevate"
              }`}
              onClick={() => setAnswer(q.id, opt)}
            >
              <RadioGroupItem
                value={opt}
                id={`${q.id}-${opt}`}
                data-testid={`radio-${q.id}-${opt}`}
              />
              <Label htmlFor={`${q.id}-${opt}`} className="cursor-pointer text-sm flex-1">
                {opt}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }

    if (q.type === "text") {
      return (
        <Textarea
          placeholder="Share your thoughts..."
          value={String(answers[q.id] || "")}
          onChange={(e) => setAnswer(q.id, e.target.value)}
          className="min-h-28 resize-none mt-2"
          data-testid={`text-answer-${q.id}`}
        />
      );
    }

    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-platform-feedback">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading survey...</div>
        ) : submitted ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
            <DialogTitle className="text-xl">Thank you for your feedback!</DialogTitle>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your response helps us prioritize what to improve in CoAIleague. We review all feedback regularly.
            </p>
            <Button onClick={handleClose} data-testid="button-close-feedback-success">
              Close
            </Button>
          </div>
        ) : !survey || questions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No survey available right now.</div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">
                  Question {step + 1} of {questions.length}
                </span>
                <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
              </div>
              <Progress value={progress} className="h-1.5 mb-3" data-testid="survey-progress" />
              <DialogTitle className="text-base font-semibold leading-snug">
                {current?.text}
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-36">
              {current && renderQuestion(current)}
            </div>

            <div className="flex items-center justify-between pt-2 gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 0}
                onClick={() => setStep((s) => s - 1)}
                data-testid="button-survey-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              <Button
                disabled={!canAdvance || submitMutation.isPending}
                onClick={handleNext}
                data-testid="button-survey-next"
              >
                {step < questions.length - 1 ? (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : submitMutation.isPending ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
