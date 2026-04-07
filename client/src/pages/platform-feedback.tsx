/**
 * Platform Feedback Admin — /platform-feedback
 *
 * Two-tab view:
 *  • Survey Editor  — add/edit/reorder/delete survey questions, choose types
 *  • Analytics      — aggregate response data, rating averages, choice distribution
 *
 * Any user can open the survey wizard modal to submit feedback.
 * Platform admins can edit the questions.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  MessageSquarePlus,
  BarChart2,
  Star,
  ListChecks,
  Type,
  ToggleLeft,
  Save,
  RefreshCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlatformFeedbackSurvey } from "@/components/PlatformFeedbackSurvey";

// ── Types ──────────────────────────────────────────────────────────────────────
type QuestionType = "rating" | "multiple_choice" | "text" | "yes_no";
type QuestionCategory = "workload" | "management" | "environment" | "growth" | "compensation" | "culture" | "safety" | "resources";

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  category: QuestionCategory;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  frequency: string;
  isActive: boolean;
}

interface Analytics {
  survey: { id: string; title: string; description: string };
  totalResponses: number;
  questions: {
    question: string;
    type: string;
    totalAnswers: number;
    ratingAvg?: number;
    ratingDist?: Record<number, number>;
    choiceDist?: Record<string, number>;
    textSamples?: string[];
  }[];
  byWorkspace: Record<string, number>;
  recentResponses: any[];
}

const QUESTION_TYPE_LABELS: Record<QuestionType, { label: string; icon: typeof Star }> = {
  rating: { label: "Star Rating (1–5)", icon: Star },
  multiple_choice: { label: "Multiple Choice", icon: ListChecks },
  text: { label: "Open Text", icon: Type },
  yes_no: { label: "Yes / No", icon: ToggleLeft },
};

const CATEGORY_OPTIONS: QuestionCategory[] = [
  "culture", "workload", "management", "environment",
  "growth", "compensation", "safety", "resources",
];

function genId() {
  return `q-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Question Editor Row ────────────────────────────────────────────────────────
function QuestionRow({
  q, index, total,
  onChange, onRemove, onMoveUp, onMoveDown,
}: {
  q: Question; index: number; total: number;
  onChange: (updated: Question) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [newOption, setNewOption] = useState("");
  const TypeIcon = QUESTION_TYPE_LABELS[q.type]?.icon || Star;

  return (
    <Card data-testid={`question-row-${q.id}`} className="mb-3">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <Button
              size="icon" variant="ghost"
              disabled={index === 0}
              onClick={onMoveUp}
              data-testid={`button-move-up-${q.id}`}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon" variant="ghost"
              disabled={index === total - 1}
              onClick={onMoveDown}
              data-testid={`button-move-down-${q.id}`}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs shrink-0">
                <TypeIcon className="h-3 w-3 mr-1" />
                {QUESTION_TYPE_LABELS[q.type]?.label}
              </Badge>
              <span className="text-xs text-muted-foreground">Q{index + 1}</span>
            </div>

            <Input
              value={q.text}
              onChange={(e) => onChange({ ...q, text: e.target.value })}
              placeholder="Question text..."
              data-testid={`input-question-text-${q.id}`}
            />

            <div className="flex gap-2 flex-wrap">
              <Select
                value={q.type}
                onValueChange={(v) => onChange({ ...q, type: v as QuestionType, options: v === "multiple_choice" ? (q.options.length ? q.options : ["Option A", "Option B"]) : [] })}
              >
                <SelectTrigger className="w-44" data-testid={`select-type-${q.id}`}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(QUESTION_TYPE_LABELS).map(([val, { label }]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={q.category}
                onValueChange={(v) => onChange({ ...q, category: v as QuestionCategory })}
              >
                <SelectTrigger className="w-36" data-testid={`select-category-${q.id}`}>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost" size="sm"
                onClick={() => onChange({ ...q, required: !q.required })}
                data-testid={`button-toggle-required-${q.id}`}
              >
                {q.required ? "Required" : "Optional"}
              </Button>
            </div>

            {q.type === "multiple_choice" && (
              <div className="space-y-1.5 pl-1">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const updated = [...q.options];
                        updated[oi] = e.target.value;
                        onChange({ ...q, options: updated });
                      }}
                      className="h-8 text-sm"
                      data-testid={`input-option-${q.id}-${oi}`}
                    />
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => onChange({ ...q, options: q.options.filter((_, i) => i !== oi) })}
                      data-testid={`button-remove-option-${q.id}-${oi}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option..."
                    className="h-8 text-sm"
                    data-testid={`input-new-option-${q.id}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newOption.trim()) {
                        onChange({ ...q, options: [...q.options, newOption.trim()] });
                        setNewOption("");
                      }
                    }}
                  />
                  <Button
                    size="sm" variant="outline"
                    disabled={!newOption.trim()}
                    onClick={() => {
                      if (newOption.trim()) {
                        onChange({ ...q, options: [...q.options, newOption.trim()] });
                        setNewOption("");
                      }
                    }}
                    data-testid={`button-add-option-${q.id}`}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            size="icon" variant="ghost"
            onClick={onRemove}
            data-testid={`button-remove-question-${q.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PlatformFeedbackPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [localQuestions, setLocalQuestions] = useState<Question[]>([]);
  const [localTitle, setLocalTitle] = useState("");
  const [localDescription, setLocalDescription] = useState("");

  const { data: survey, isLoading } = useQuery<Survey>({
    queryKey: ["/api/platform-feedback/active"],
  });

  // Sync local editor state when survey loads (only when not actively editing)
  useEffect(() => {
    if (survey && !editMode) {
      setLocalQuestions(survey.questions || []);
      setLocalTitle(survey.title || "");
      setLocalDescription(survey.description || "");
    }
  }, [survey?.id, editMode]);

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/platform-feedback/analytics"],
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      survey
        ? apiRequest("PUT", `/api/platform-feedback/surveys/${survey.id}`, payload)
        : apiRequest("POST", "/api/platform-feedback/surveys", payload),
    onSuccess: () => {
      toast({ title: "Survey updated", description: "Changes saved successfully." });
      qc.invalidateQueries({ queryKey: ["/api/platform-feedback/active"] });
      qc.invalidateQueries({ queryKey: ["/api/platform-feedback/analytics"] });
      setEditMode(false);
    },
    onError: () => toast({ title: "Save failed", description: "Could not save changes.", variant: "destructive" }),
  });

  function startEdit() {
    if (survey) {
      setLocalQuestions(survey.questions || []);
      setLocalTitle(survey.title || "");
      setLocalDescription(survey.description || "");
    }
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    if (survey) {
      setLocalQuestions(survey.questions || []);
      setLocalTitle(survey.title);
      setLocalDescription(survey.description);
    }
  }

  function addQuestion() {
    setLocalQuestions((qs) => [
      ...qs,
      {
        id: genId(),
        text: "",
        type: "multiple_choice",
        options: ["Option A", "Option B"],
        required: true,
        category: "culture",
      },
    ]);
  }

  function handleSave() {
    if (!localTitle.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (localQuestions.length === 0) {
      toast({ title: "At least one question required", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      title: localTitle,
      description: localDescription,
      questions: localQuestions,
      isActive: true,
    });
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setLocalQuestions((qs) => {
      const arr = [...qs];
      const swapIdx = index + dir;
      if (swapIdx < 0 || swapIdx >= arr.length) return arr;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return arr;
    });
  }

  // ── Analytics helpers ──────────────────────────────────────────────────────
  function RatingBar({ dist }: { dist: Record<number, number> }) {
    const data = [1, 2, 3, 4, 5].map((v) => ({
      star: `${v}★`,
      count: dist[v] || 0,
    }));
    return (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="star" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  function ChoiceBar({ dist }: { dist: Record<string, number> }) {
    const data = Object.entries(dist).map(([choice, count]) => ({ choice: choice.length > 20 ? choice.slice(0, 18) + "…" : choice, count }));
    return (
      <ResponsiveContainer width="100%" height={Math.max(80, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="choice" width={140} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Feedback</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Collect and analyze feedback from your users to continuously improve CoAIleague.
          </p>
        </div>
        <Button
          onClick={() => setSurveyOpen(true)}
          data-testid="button-take-survey"
        >
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Take Survey
        </Button>
      </div>

      <Tabs defaultValue="editor">
        <TabsList data-testid="tabs-feedback">
          <TabsTrigger value="editor" data-testid="tab-editor">
            <ListChecks className="h-4 w-4 mr-2" />
            Question Editor
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart2 className="h-4 w-4 mr-2" />
            Analytics
            {analytics && analytics.totalResponses > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {analytics.totalResponses}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── EDITOR TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="editor" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Survey Configuration</CardTitle>
                  <CardDescription>
                    {editMode
                      ? "Edit questions below. Changes take effect immediately when saved."
                      : "View the current active platform feedback survey."}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {editMode ? (
                    <>
                      <Button variant="outline" size="sm" onClick={cancelEdit} data-testid="button-cancel-edit">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-survey">
                        <Save className="h-4 w-4 mr-1.5" />
                        {saveMutation.isPending ? "Saving..." : "Save Survey"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={startEdit} data-testid="button-edit-survey">
                      Edit Questions
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="survey-title">Survey Title</Label>
                      <Input
                        id="survey-title"
                        value={localTitle}
                        onChange={(e) => setLocalTitle(e.target.value)}
                        placeholder="e.g. CoAIleague Platform Feedback"
                        data-testid="input-survey-title"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="survey-desc">Description</Label>
                      <Input
                        id="survey-desc"
                        value={localDescription}
                        onChange={(e) => setLocalDescription(e.target.value)}
                        placeholder="Brief description shown to users"
                        data-testid="input-survey-description"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{survey?.title}</p>
                  {survey?.description && (
                    <p className="text-sm text-muted-foreground">{survey.description}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{survey?.questions?.length || 0} questions</Badge>
                    {survey?.isActive && <Badge variant="secondary" className="text-green-700 dark:text-green-400">Active</Badge>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="text-center text-muted-foreground text-sm py-8">Loading survey...</div>
          ) : (
            <div>
              {(editMode ? localQuestions : (survey?.questions || [])).map((q, i) => (
                editMode ? (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    index={i}
                    total={localQuestions.length}
                    onChange={(updated) =>
                      setLocalQuestions((qs) => qs.map((x) => (x.id === updated.id ? updated : x)))
                    }
                    onRemove={() => setLocalQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                    onMoveUp={() => moveQuestion(i, -1)}
                    onMoveDown={() => moveQuestion(i, 1)}
                  />
                ) : (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/20 mb-2"
                    data-testid={`view-question-${q.id}`}
                  >
                    <Badge variant="outline" className="shrink-0 mt-0.5 text-xs">Q{i + 1}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{q.text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {QUESTION_TYPE_LABELS[q.type as QuestionType]?.label}
                        {q.required ? " · Required" : " · Optional"}
                        {q.type === "multiple_choice" && q.options?.length > 0
                          ? ` · ${q.options.length} options`
                          : ""}
                      </p>
                    </div>
                  </div>
                )
              ))}

              {editMode && (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={addQuestion}
                  data-testid="button-add-question"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              )}

              {!editMode && (!survey?.questions || survey.questions.length === 0) && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No questions configured. Click "Edit Questions" to add some.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS TAB ──────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          {analyticsLoading ? (
            <div className="text-center text-muted-foreground text-sm py-8">Loading analytics...</div>
          ) : !analytics || analytics.totalResponses === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-foreground">No responses yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Once users submit the survey, their aggregated responses will appear here.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setSurveyOpen(true)}
                  data-testid="button-be-first"
                >
                  Be the first to respond
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Responses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-foreground" data-testid="stat-total-responses">
                      {analytics.totalResponses}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Workspaces Responded</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-foreground">
                      {Object.keys(analytics.byWorkspace).length}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Questions Answered</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-foreground">
                      {analytics.questions.reduce((s, q) => s + q.totalAnswers, 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                {analytics.questions.map((q, i) => (
                  <Card key={i} data-testid={`analytics-question-${i}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{q.question}</CardTitle>
                      <CardDescription>
                        {q.totalAnswers} response{q.totalAnswers !== 1 ? "s" : ""}
                        {q.type === "rating" && q.ratingAvg !== undefined && (
                          <> &bull; Average: <strong>{q.ratingAvg} / 5</strong></>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {q.type === "rating" && q.ratingDist && (
                        <RatingBar dist={q.ratingDist} />
                      )}
                      {(q.type === "multiple_choice" || q.type === "yes_no") && q.choiceDist && (
                        <ChoiceBar dist={q.choiceDist} />
                      )}
                      {q.type === "text" && q.textSamples && q.textSamples.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {q.textSamples.slice(0, 10).map((s, si) => (
                            <div
                              key={si}
                              className="text-sm text-foreground bg-muted/30 rounded-md px-3 py-2 border border-border"
                              data-testid={`text-sample-${i}-${si}`}
                            >
                              "{s}"
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {Object.keys(analytics.byWorkspace).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Responses by Workspace</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(analytics.byWorkspace).map(([ws, count]) => (
                        <div key={ws} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-mono text-xs">{ws}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <PlatformFeedbackSurvey
        open={surveyOpen}
        onClose={() => {
          setSurveyOpen(false);
          qc.invalidateQueries({ queryKey: ["/api/platform-feedback/analytics"] });
        }}
      />
    </div>
  );
}
