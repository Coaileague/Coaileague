import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Star,
  Shield,
  Plus,
  Flag,
  Award,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, formatDistanceToNow } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DisciplinaryRecord {
  id: string;
  employeeId: string;
  recordType: string;
  description: string;
  issuedBy: string;
  issuedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  status: string;
  notes: string | null;
  pipGoals: string | null;
  // Phase 35J fields
  evidenceUrls: string[] | null;
  appealStatus: string | null;
  appealReason: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
}

interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewType: string | null;
  overallRating: number | null;
  attendanceRating: number | null;
  reliabilityRating: number | null;
  professionalismRating: number | null;
  clientFeedbackRating: number | null;
  communicationRating: number | null;
  teamworkRating: number | null;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: string[] | null;
  reviewerComments: string | null;
  employeeComments: string | null;
  employeeAcknowledgedAt: string | null;
  status: string;
  createdAt: string;
}

interface RiskRosterEntry {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: string | null;
  activeRecords: number;
  hasSuspension: boolean;
  hasWrittenWarning: boolean;
  unacknowledged: number;
  riskLevel: string;
  avgRating: number | null;
  totalReviews: number;
  latestReviewDate: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MANAGER_ROLES = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'];

function isManager(role: string): boolean {
  return MANAGER_ROLES.includes(role);
}

function recordTypeBadge(type: string) {
  const map: Record<string, { label: string; variant: 'destructive' | 'secondary' | 'outline' | 'default' }> = {
    verbal_caution:      { label: 'Verbal Caution', variant: 'secondary' },
    verbal_warning:      { label: 'Verbal Warning', variant: 'secondary' },
    written_warning:     { label: 'Written Warning', variant: 'destructive' },
    termination_warning: { label: 'Termination Warning', variant: 'destructive' },
    pip:                 { label: 'PIP', variant: 'destructive' },
    suspension:          { label: 'Suspension', variant: 'destructive' },
    termination:         { label: 'Termination', variant: 'destructive' },
    commendation:        { label: 'Commendation', variant: 'default' },
  };
  const entry = map[type] || { label: type.replace(/_/g, ' '), variant: 'outline' as const };
  return <Badge variant={entry.variant} className="text-xs">{entry.label}</Badge>;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    appealed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

function riskBadge(level: string) {
  const map: Record<string, string> = {
    high:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    low:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    none:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${map[level] || 'bg-muted text-muted-foreground'}`}>
      {level === 'none' ? 'Clean' : level.charAt(0).toUpperCase() + level.slice(1)} Risk
    </span>
  );
}

function RatingStars({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-3.5 w-3.5 ${s <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </span>
  );
}

function RatingDot({ value }: { value: number | null }) {
  if (!value) return null;
  const pct = Math.round((value / 5) * 100);
  const color = value >= 4 ? 'bg-green-500' : value >= 3 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-3 shrink-0">{value}</span>
    </div>
  );
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const disciplinarySchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  recordType: z.enum([
    'verbal_caution',
    'verbal_warning',
    'written_warning',
    'termination_warning',
    'pip',
    'suspension',
    'termination',
    'commendation',
  ]),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  pipGoals: z.string().optional(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  evidenceUrls: z.string().optional(), // comma-separated URLs
});

const reviewSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  reviewType: z.enum(['annual', 'quarterly', 'probation', '90_day', 'promotion', 'pip']).optional(),
  overallRating:        z.number().int().min(1).max(5).optional(),
  attendanceRating:     z.number().int().min(1).max(5).optional(),
  reliabilityRating:    z.number().int().min(1).max(5).optional(),
  professionalismRating:z.number().int().min(1).max(5).optional(),
  clientFeedbackRating: z.number().int().min(1).max(5).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.array(z.string()).optional(),
  reviewerComments: z.string().optional(),
});

const appealSchema = z.object({
  appealReason: z.string().min(20, 'Please provide at least 20 characters explaining your appeal'),
});

// ─── Disciplinary Timeline ────────────────────────────────────────────────────

function DisciplinaryTimeline({ records }: { records: DisciplinaryRecord[] }) {
  if (records.length === 0) return null;
  const sorted = [...records].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );
  return (
    <div className="relative pl-5 space-y-4" data-testid="section-disciplinary-timeline">
      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
      {sorted.map((r) => (
        <div key={r.id} className="relative">
          <div className="absolute -left-3.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/50" />
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              {recordTypeBadge(r.recordType)}
              {statusBadge(r.status)}
              {r.acknowledgedAt && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Acknowledged
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(r.issuedAt), 'MMM d, yyyy')}
            </p>
            <p className="text-sm">{r.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Disciplinary Record Card ─────────────────────────────────────────────────

function DisciplinaryCard({ record, canManage }: { record: DisciplinaryRecord; canManage: boolean }) {
  const { toast } = useToast();
  const [showAppeal, setShowAppeal] = useState(false);

  const acknowledgeMutation = useMutation({
    mutationFn: () => apiRequest('PATCH', `/api/performance/disciplinary/${record.id}/acknowledge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/performance/disciplinary'] });
      toast({ title: 'Record acknowledged', description: 'Your acknowledgment has been recorded.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to acknowledge record.', variant: 'destructive' }),
  });

  const appealForm = useForm({ resolver: zodResolver(appealSchema), defaultValues: { appealReason: '' } });

  const appealMutation = useMutation({
    mutationFn: (data: { appealReason: string }) =>
      apiRequest('PATCH', `/api/performance/disciplinary/${record.id}/appeal`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/performance/disciplinary'] });
      setShowAppeal(false);
      toast({ title: 'Appeal submitted', description: 'Your appeal is under review.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to submit appeal.', variant: 'destructive' }),
  });

  return (
    <Card data-testid={`card-disciplinary-${record.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {recordTypeBadge(record.recordType)}
            {statusBadge(record.status)}
            {!record.acknowledgedAt && !['verbal_caution', 'verbal_warning', 'commendation'].includes(record.recordType) && (
              <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400">
                Needs Acknowledgment
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(record.issuedAt), { addSuffix: true })}
          </span>
        </div>

        <p className="text-sm text-foreground mb-2">{record.description}</p>

        {record.pipGoals && (
          <div className="rounded-md bg-muted p-3 mb-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">PIP Goals</p>
            <p className="text-sm">{record.pipGoals}</p>
          </div>
        )}

        {record.notes && (
          <div className="text-xs text-muted-foreground mt-1 mb-2">{record.notes}</div>
        )}

        {(record.effectiveDate || record.expiryDate) && (
          <div className="grid grid-cols-2 gap-3 mt-2 mb-2">
            {record.effectiveDate && (
              <div>
                <p className="text-xs text-muted-foreground">Effective</p>
                <p className="text-xs font-medium">{format(new Date(record.effectiveDate), 'MMM d, yyyy')}</p>
              </div>
            )}
            {record.expiryDate && (
              <div>
                <p className="text-xs text-muted-foreground">Expires</p>
                <p className="text-xs font-medium">{format(new Date(record.expiryDate), 'MMM d, yyyy')}</p>
              </div>
            )}
          </div>
        )}

        {record.evidenceUrls && record.evidenceUrls.length > 0 && (
          <div className="mt-2 mb-2">
            <p className="text-xs text-muted-foreground mb-1">Evidence</p>
            <div className="flex flex-wrap gap-1">
              {record.evidenceUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                  data-testid={`link-evidence-${record.id}-${i}`}
                >
                  Evidence {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        {record.appealStatus && record.appealStatus !== 'none' && (
          <div className="mt-2 mb-2 rounded-md bg-muted p-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-medium text-muted-foreground">Appeal</p>
              <span className="text-xs rounded-md px-1.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                {record.appealStatus}
              </span>
            </div>
            {record.appealReason && (
              <p className="text-xs">{record.appealReason}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {record.acknowledgedAt ? (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400" data-testid={`status-acknowledged-${record.id}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acknowledged {format(new Date(record.acknowledgedAt), 'MMM d, yyyy')}
            </div>
          ) : (
            !canManage && !['verbal_caution', 'verbal_warning', 'commendation'].includes(record.recordType) && (
              <Button
                size="sm"
                variant="outline"
                data-testid={`button-acknowledge-${record.id}`}
                onClick={() => acknowledgeMutation.mutate()}
                disabled={acknowledgeMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Acknowledge
              </Button>
            )
          )}

          {!canManage && record.status === 'active' && !['commendation', 'verbal_caution', 'verbal_warning'].includes(record.recordType) && (
            <Button
              size="sm"
              variant="ghost"
              data-testid={`button-appeal-${record.id}`}
              onClick={() => setShowAppeal(true)}
            >
              <Flag className="h-3.5 w-3.5 mr-1.5" />
              Submit Appeal
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={showAppeal} onOpenChange={setShowAppeal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Appeal</DialogTitle>
          </DialogHeader>
          <Form {...appealForm}>
            <form onSubmit={appealForm.handleSubmit((data) => appealMutation.mutate(data))} className="space-y-4">
              <FormField
                control={appealForm.control}
                name="appealReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Appeal Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Explain the basis for your appeal..."
                        rows={4}
                        data-testid="textarea-appeal-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setShowAppeal(false)}>Cancel</Button>
                <Button type="submit" disabled={appealMutation.isPending} data-testid="button-submit-appeal">
                  Submit Appeal
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────

function ReviewCard({ review, canManage }: { review: PerformanceReview; canManage: boolean }) {
  const { toast } = useToast();
  const [showAck, setShowAck] = useState(false);

  const ackForm = useForm({
    resolver: zodResolver(z.object({ employeeComments: z.string().optional() })),
    defaultValues: { employeeComments: '' },
  });

  const ackMutation = useMutation({
    mutationFn: (data: { employeeComments?: string }) =>
      apiRequest('PATCH', `/api/performance/reviews/${review.id}/acknowledge`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/performance/reviews'] });
      setShowAck(false);
      toast({ title: 'Review acknowledged', description: 'Your acknowledgment has been recorded.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to acknowledge review.', variant: 'destructive' }),
  });

  const dimensions = [
    { label: 'Overall', value: review.overallRating },
    { label: 'Attendance', value: review.attendanceRating },
    { label: 'Reliability', value: review.reliabilityRating },
    { label: 'Professionalism', value: review.professionalismRating },
    { label: 'Client Feedback', value: review.clientFeedbackRating },
    { label: 'Teamwork', value: review.teamworkRating },
  ].filter((d) => d.value !== null && d.value !== undefined);

  return (
    <Card data-testid={`card-review-${review.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs capitalize">
              {(review.reviewType || 'review').replace(/_/g, ' ')}
            </Badge>
            <Badge variant={review.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
              {review.status}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
          </span>
        </div>

        {dimensions.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-3 sm:grid-cols-3">
            {dimensions.map((d) => (
              <div key={d.label}>
                <p className="text-xs text-muted-foreground mb-0.5">{d.label}</p>
                <RatingStars value={d.value ?? null} />
              </div>
            ))}
          </div>
        )}

        {review.strengths && (
          <div className="mb-2">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Strengths</p>
            <p className="text-sm">{review.strengths}</p>
          </div>
        )}
        {review.areasForImprovement && (
          <div className="mb-2">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Areas for Improvement</p>
            <p className="text-sm">{review.areasForImprovement}</p>
          </div>
        )}
        {review.reviewerComments && (
          <div className="mb-2">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Reviewer Comments</p>
            <p className="text-sm">{review.reviewerComments}</p>
          </div>
        )}
        {review.employeeComments && (
          <div className="mb-2 rounded-md bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Officer Response</p>
            <p className="text-sm">{review.employeeComments}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {review.employeeAcknowledgedAt ? (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400" data-testid={`status-ack-review-${review.id}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acknowledged {format(new Date(review.employeeAcknowledgedAt), 'MMM d, yyyy')}
            </div>
          ) : !canManage ? (
            <Button
              size="sm"
              variant="outline"
              data-testid={`button-ack-review-${review.id}`}
              onClick={() => setShowAck(true)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Acknowledge Review
            </Button>
          ) : null}
        </div>
      </CardContent>

      <Dialog open={showAck} onOpenChange={setShowAck}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Review</DialogTitle>
          </DialogHeader>
          <Form {...ackForm}>
            <form onSubmit={ackForm.handleSubmit((data) => ackMutation.mutate(data))} className="space-y-4">
              <FormField
                control={ackForm.control}
                name="employeeComments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Optional Response</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Add any comments about this review (optional)..."
                        rows={3}
                        data-testid="textarea-review-response"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setShowAck(false)}>Cancel</Button>
                <Button type="submit" disabled={ackMutation.isPending} data-testid="button-submit-ack-review">
                  Acknowledge
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Risk Roster Card ─────────────────────────────────────────────────────────

function RiskRosterCard({ entry }: { entry: RiskRosterEntry }) {
  const riskIcon = entry.riskLevel === 'high'
    ? <TrendingDown className="h-4 w-4 text-destructive" />
    : entry.riskLevel === 'medium'
    ? <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
    : entry.riskLevel === 'low'
    ? <Minus className="h-4 w-4 text-blue-500" />
    : <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />;

  return (
    <Card data-testid={`card-roster-${entry.employeeId}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{riskIcon}</div>
            <div>
              <p className="text-sm font-medium">
                {entry.firstName} {entry.lastName}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{entry.role?.replace(/_/g, ' ') || 'Officer'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {riskBadge(entry.riskLevel)}
            {entry.hasSuspension && (
              <Badge variant="destructive" className="text-xs">Suspended</Badge>
            )}
            {entry.unacknowledged > 0 && (
              <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400">
                {entry.unacknowledged} unacknowledged
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Active Records</p>
            <p className="font-semibold text-sm">{entry.activeRecords}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Reviews</p>
            <p className="font-semibold text-sm">{entry.totalReviews}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Rating</p>
            <p className="font-semibold text-sm">
              {entry.avgRating !== null ? `${entry.avgRating}/5` : '—'}
            </p>
          </div>
        </div>

        {entry.latestReviewDate && (
          <p className="text-xs text-muted-foreground mt-2">
            Last reviewed {formatDistanceToNow(new Date(entry.latestReviewDate), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Disciplinary Dialog ───────────────────────────────────────────────

function CreateDisciplinaryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(disciplinarySchema),
    defaultValues: {
      employeeId: '',
      description: '',
      pipGoals: '',
      effectiveDate: '',
      expiryDate: '',
      evidenceUrls: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof disciplinarySchema>) => {
      const payload = {
        ...data,
        evidenceUrls: data.evidenceUrls
          ? data.evidenceUrls.split(',').map((u) => u.trim()).filter(Boolean)
          : undefined,
        effectiveDate: data.effectiveDate || undefined,
        expiryDate: data.expiryDate || undefined,
      };
      return apiRequest('POST', '/api/performance/disciplinary', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/performance/disciplinary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/risk-roster'] });
      onClose();
      form.reset();
      toast({ title: 'Record created', description: 'Disciplinary record issued and officer notified.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create record.', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Disciplinary Record</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data as any))} className="space-y-4">
            <FormField
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Employee ID" data-testid="input-disciplinary-employee-id" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              // @ts-expect-error — TS migration: fix in refactoring sprint
              name="recordType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Record Type</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger data-testid="select-record-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verbal_caution">Verbal Caution</SelectItem>
                        <SelectItem value="verbal_warning">Verbal Warning</SelectItem>
                        <SelectItem value="written_warning">Written Warning</SelectItem>
                        <SelectItem value="termination_warning">Termination Warning</SelectItem>
                        <SelectItem value="pip">Performance Improvement Plan</SelectItem>
                        <SelectItem value="suspension">Suspension</SelectItem>
                        <SelectItem value="termination">Termination</SelectItem>
                        <SelectItem value="commendation">Commendation</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Describe the incident or reasoning..." rows={3} data-testid="textarea-disciplinary-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="effectiveDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-effective-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-expiry-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="pipGoals"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIP Goals (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="List improvement goals if applicable..." rows={2} data-testid="textarea-pip-goals" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="evidenceUrls"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evidence URLs (optional, comma-separated)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://docs.example.com/evidence1, https://..."
                      data-testid="input-evidence-urls"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-create-disciplinary">
                Issue Record
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Review Dialog ─────────────────────────────────────────────────────

function CreateReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      employeeId: '',
      reviewerComments: '',
      strengths: '',
      areasForImprovement: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof reviewSchema>) =>
      apiRequest('POST', '/api/performance/reviews', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/performance/reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/risk-roster'] });
      onClose();
      form.reset();
      toast({ title: 'Review submitted', description: 'Performance review saved and officer notified.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to submit review.', variant: 'destructive' }),
  });

  const ratingFields = [
    { name: 'overallRating' as const,         label: 'Overall (1-5)' },
    { name: 'attendanceRating' as const,       label: 'Attendance (1-5)' },
    { name: 'reliabilityRating' as const,      label: 'Reliability (1-5)' },
    { name: 'professionalismRating' as const,  label: 'Professionalism (1-5)' },
    { name: 'clientFeedbackRating' as const,   label: 'Client Feedback (1-5)' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Performance Review</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data as any))} className="space-y-4">
            <FormField
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Employee ID" data-testid="input-review-employee-id" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              // @ts-expect-error — TS migration: fix in refactoring sprint
              name="reviewType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Review Type</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger data-testid="select-review-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="probation">Probation</SelectItem>
                        <SelectItem value="90_day">90-Day</SelectItem>
                        <SelectItem value="promotion">Promotion</SelectItem>
                        <SelectItem value="pip">PIP</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {ratingFields.map(({ name, label }) => (
                <FormField
                  key={name}
                  control={form.control}
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value ?? ''}
                          data-testid={`input-${name}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <FormField
              control={form.control}
              name="strengths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strengths</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} data-testid="textarea-strengths" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="areasForImprovement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Areas for Improvement</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} data-testid="textarea-areas-improvement" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              // @ts-expect-error — TS migration: fix in refactoring sprint
              name="goals"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Goals (one per line)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Enter each goal on a new line"
                      data-testid="textarea-goals"
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      value={field.value ? field.value.join('\n') : ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? e.target.value.split('\n').filter(Boolean) : [])
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reviewerComments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reviewer Comments</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} data-testid="textarea-reviewer-comments" />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-review">
                Submit Review
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { workspaceRole, isLoading: accessLoading } = useWorkspaceAccess();
  const canManage = isManager(workspaceRole || '');

  const [showCreateDisciplinary, setShowCreateDisciplinary] = useState(false);
  const [showCreateReview, setShowCreateReview] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const disciplinaryQuery = useQuery<DisciplinaryRecord[]>({
    queryKey: ['/api/performance/disciplinary'],
  });

  const reviewsQuery = useQuery<PerformanceReview[]>({
    queryKey: ['/api/performance/reviews'],
  });

  const riskRosterQuery = useQuery<RiskRosterEntry[]>({
    queryKey: ['/api/performance/risk-roster'],
    enabled: canManage,
  });

  const disciplinaryRecordsData = disciplinaryQuery.data || [];
  const reviews = reviewsQuery.data || [];
  const riskRoster = riskRosterQuery.data || [];

  const pendingAcknowledgments = disciplinaryRecordsData.filter(
    (r) => !r.acknowledgedAt && !['verbal_caution', 'verbal_warning', 'commendation'].includes(r.recordType),
  ).length;

  const activeWarnings = disciplinaryRecordsData.filter(
    (r) => r.status === 'active' && ['written_warning', 'suspension'].includes(r.recordType),
  ).length;

  const pendingReviewAcks = reviews.filter((r) => !r.employeeAcknowledgedAt).length;

  const highRiskCount = riskRoster.filter((e) => e.riskLevel === 'high').length;

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Loading performance records</p>
          <p className="text-xs text-muted-foreground">
            We are checking your permissions and pulling reviews, acknowledgments, and risk signals.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            {canManage ? 'Officer Performance Management' : 'My Performance Record'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {canManage
              ? 'Formal disciplinary records, performance reviews, and risk-sorted officer roster'
              : 'Your disciplinary history and performance reviews'}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="default"
              data-testid="button-create-review"
              onClick={() => setShowCreateReview(true)}
            >
              <Star className="h-4 w-4 mr-2" />
              New Review
            </Button>
            <Button
              size="default"
              data-testid="button-issue-disciplinary"
              onClick={() => setShowCreateDisciplinary(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Issue Record
            </Button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Records</p>
            <p className="text-2xl font-semibold mt-1" data-testid="text-total-records">
              {canManage ? riskRoster.reduce((s, e) => s + e.activeRecords, 0) : disciplinaryRecordsData.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <p className="text-xs text-muted-foreground">Active Warnings</p>
            </div>
            <p className="text-2xl font-semibold mt-1 text-destructive" data-testid="text-active-warnings">
              {canManage ? highRiskCount : activeWarnings}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Reviews</p>
            </div>
            <p className="text-2xl font-semibold mt-1" data-testid="text-total-reviews">
              {canManage ? riskRoster.reduce((s, e) => s + e.totalReviews, 0) : reviews.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-xs text-muted-foreground">Pending Acks</p>
            </div>
            <p className="text-2xl font-semibold mt-1 text-amber-600 dark:text-amber-400" data-testid="text-pending-acks">
              {canManage
                ? riskRoster.reduce((s, e) => s + e.unacknowledged, 0)
                : pendingAcknowledgments + pendingReviewAcks}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending acknowledgment alert for officers */}
      {(pendingAcknowledgments > 0 || pendingReviewAcks > 0) && !canManage && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 p-4">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Action Required</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              You have {pendingAcknowledgments + pendingReviewAcks} item(s) pending your acknowledgment.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="disciplinary" className="space-y-4">
        <TabsList data-testid="tabs-performance" className="flex-wrap">
          <TabsTrigger value="disciplinary" data-testid="tab-disciplinary">
            Disciplinary Records
            {(canManage ? riskRoster.reduce((s, e) => s + e.unacknowledged, 0) : pendingAcknowledgments) > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {canManage ? riskRoster.reduce((s, e) => s + e.unacknowledged, 0) : pendingAcknowledgments}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviews" data-testid="tab-reviews">
            Performance Reviews
            {!canManage && pendingReviewAcks > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{pendingReviewAcks}</Badge>
            )}
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="roster" data-testid="tab-risk-roster">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Risk Roster
              {highRiskCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{highRiskCount}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Disciplinary Records Tab */}
        <TabsContent value="disciplinary" className="space-y-4">
          {/* Timeline toggle for non-empty records */}
          {disciplinaryRecordsData.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {disciplinaryRecordsData.length} record{disciplinaryRecordsData.length !== 1 ? 's' : ''}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTimeline(!showTimeline)}
                data-testid="button-toggle-timeline"
              >
                {showTimeline ? 'Card View' : 'Timeline View'}
              </Button>
            </div>
          )}

          {disciplinaryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading disciplinary records and acknowledgment status...
            </p>
          ) : disciplinaryRecordsData.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No disciplinary records</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {canManage ? 'Issue a disciplinary record using the button above.' : 'You have a clean record.'}
                </p>
              </CardContent>
            </Card>
          ) : showTimeline ? (
            <Card>
              <CardContent className="p-5">
                <DisciplinaryTimeline records={disciplinaryRecordsData} />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {disciplinaryRecordsData.map((record) => (
                <DisciplinaryCard key={record.id} record={record} canManage={canManage} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Performance Reviews Tab */}
        <TabsContent value="reviews" className="space-y-4">
          {/* Rating history — shows when there are multiple reviews with overall ratings */}
          {reviews.length >= 2 && reviews.some((r) => r.overallRating !== null) && (
            <Card data-testid="section-rating-history">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Rating History</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex items-end gap-2 h-16">
                  {[...reviews]
                    .filter((r) => r.overallRating !== null)
                    .slice(-10)
                    .map((r) => {
                      const pct = Math.round(((r.overallRating ?? 0) / 5) * 100);
                      const color =
                        (r.overallRating ?? 0) >= 4
                          ? 'bg-green-500'
                          : (r.overallRating ?? 0) >= 3
                          ? 'bg-yellow-500'
                          : 'bg-red-400';
                      return (
                        <div key={r.id} className="flex flex-col items-center gap-1 flex-1">
                          <span className="text-xs text-muted-foreground">{r.overallRating}</span>
                          <div className="w-full rounded-sm" style={{ height: '100%' }}>
                            <div
                              className={`w-full rounded-sm ${color}`}
                              style={{ height: `${pct}%` }}
                              title={`${format(new Date(r.createdAt), 'MMM d, yyyy')}: ${r.overallRating}/5`}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground/60">
                            {format(new Date(r.createdAt), 'MMM yy')}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming review indicator for officers */}
          {!canManage && reviews.length > 0 && (() => {
            const lastReview = reviews[0];
            const daysSince = Math.floor((Date.now() - new Date(lastReview.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince >= 90) {
              return (
                <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10 p-3" data-testid="alert-review-due">
                  <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Review Due</p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                      Your last review was {daysSince} days ago. Contact your manager to schedule a new review.
                    </p>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {reviewsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading review history and acknowledgment activity...
            </p>
          ) : reviews.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Award className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No performance reviews yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {canManage
                    ? 'Submit a performance review using the button above.'
                    : 'No reviews have been submitted yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            reviews.map((review) => (
              <ReviewCard key={review.id} review={review} canManage={canManage} />
            ))
          )}
        </TabsContent>

        {/* Risk Roster Tab — managers only */}
        {canManage && (
          <TabsContent value="roster" className="space-y-3" data-testid="section-risk-roster">
            {riskRosterQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Loading officer roster, risk flags, and review activity...
              </p>
            ) : riskRoster.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No officers in roster</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Officers will appear here once they join the workspace and start generating review
                    or disciplinary history.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {riskRoster.length} officer{riskRoster.length !== 1 ? 's' : ''} — sorted by risk level
                  </p>
                  {highRiskCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {highRiskCount} high-risk officer{highRiskCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {riskRoster.map((entry) => (
                    <RiskRosterCard key={entry.employeeId} entry={entry} />
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Modals */}
      <CreateDisciplinaryDialog open={showCreateDisciplinary} onClose={() => setShowCreateDisciplinary(false)} />
      <CreateReviewDialog open={showCreateReview} onClose={() => setShowCreateReview(false)} />
    </div>
  );
}
