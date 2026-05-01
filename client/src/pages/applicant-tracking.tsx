import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleDetailShell, ModuleSkeletonList,
  ModuleEmptyState, ModuleToolbar,
} from "@/components/modules/ModulePageShell";
import {
  Users, Star, ChevronRight, ArrowLeft, BriefcaseBusiness,
  Shield, Award,
} from "lucide-react";

interface Applicant {
  id: string;
  job_posting_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  has_guard_card: boolean;
  guard_card_number?: string;
  guard_card_expiration?: string;
  has_armed_endorsement: boolean;
  years_experience: number;
  applied_at: string;
  status: string;
  trinity_score?: number;
  trinity_score_rationale?: string;
  job_title?: string;
}

interface JobPosting {
  id: string;
  title: string;
  status: string;
  applications_count: number;
  pay_rate_min?: number;
  pay_rate_max?: number;
  employment_type: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  applied:            { label: "Applied",     color: BADGE_COLORS.slate },
  reviewing:          { label: "Reviewing",   color: BADGE_COLORS.blue },
  interview_scheduled:{ label: "Interview",   color: BADGE_COLORS.purple },
  offer_sent:         { label: "Offer Sent",  color: BADGE_COLORS.amber },
  offer_accepted:     { label: "Accepted",    color: BADGE_COLORS.green },
  offer_declined:     { label: "Declined",    color: BADGE_COLORS.orange },
  rejected:           { label: "Rejected",    color: BADGE_COLORS.red },
  hired:              { label: "Hired",       color: BADGE_COLORS.green },
};

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return <Badge variant="outline">Unscored</Badge>;
  const color =
    score >= 80 ? BADGE_COLORS.green :
    score >= 60 ? BADGE_COLORS.amber :
    BADGE_COLORS.red;
  return <Badge className={color}>{score}/100</Badge>;
}

export default function ApplicantTrackingPage() {
  const { toast } = useAppToast();
  const [selectedPosting, setSelectedPosting] = useState("all");
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");

  const { data: postings = [], isLoading: loadingPostings } = useQuery<JobPosting[]>({
    queryKey: ["/api/ats/postings"],
  });

  const { data: applicants = [], isLoading: loadingApplicants } = useQuery<Applicant[]>({
    queryKey: ["/api/ats/applicants", selectedPosting, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedPosting !== "all") params.set("job_posting_id", selectedPosting);
      if (statusFilter !== "all") params.set("status", statusFilter);
      return fetch(`/api/ats/applicants?${params}`, { credentials: "include" }).then((r) => r.json());
    },
  });

  const scoreAllMutation = useMutation({
    mutationFn: (jobPostingId: string) =>
      apiRequest("POST", `/api/ats/postings/${jobPostingId}/score-all`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ats/applicants"] });
      toast({ title: "Scoring complete", description: "All applicants have been scored by Trinity." });
    },
    onError: (err) => toast({ title: "Scoring failed", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ats/applicants/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ats/applicants"] });
      toast({ title: "Status updated" });
    },
  });

  const filtered = applicants.filter((a) => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });
  const sorted = [...filtered].sort((a, b) => (b.trinity_score || 0) - (a.trinity_score || 0));

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedApplicant) {
    return (
      <ModuleDetailShell
        backButton={
          <Button variant="ghost" size="sm" onClick={() => setSelectedApplicant(null)} data-testid="button-back-applicants" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to applicants
          </Button>
        }
        title={`${selectedApplicant.first_name} ${selectedApplicant.last_name}`}
        subtitle={`${selectedApplicant.email} · ${selectedApplicant.phone}`}
        badges={
          <>
            <ScoreBadge score={selectedApplicant.trinity_score} />
            <Badge className={(STATUS_CONFIG[selectedApplicant.status] || STATUS_CONFIG.applied).color}>
              {(STATUS_CONFIG[selectedApplicant.status] || STATUS_CONFIG.applied).label}
            </Badge>
          </>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Guard Card",        value: selectedApplicant.has_guard_card ? "Yes" : "No",  ok: selectedApplicant.has_guard_card },
            { label: "Armed Endorsement", value: selectedApplicant.has_armed_endorsement ? "Yes" : "No", ok: selectedApplicant.has_armed_endorsement },
            { label: "Experience",        value: `${selectedApplicant.years_experience} yr${selectedApplicant.years_experience !== 1 ? "s" : ""}`, ok: selectedApplicant.years_experience >= 2 },
            { label: "Applied",           value: formatDate(selectedApplicant.applied_at), ok: true },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-sm font-semibold mt-1 ${item.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                  {item.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedApplicant.trinity_score_rationale && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Trinity Scoring Rationale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground" data-testid="text-score-rationale">
                {selectedApplicant.trinity_score_rationale}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Update Status</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={selectedApplicant.status === k ? "default" : "outline"}
                  onClick={() => {
                    updateStatusMutation.mutate({ id: selectedApplicant.id, status: k });
                    setSelectedApplicant({ ...selectedApplicant, status: k });
                  }}
                  data-testid={`button-status-${k}`}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </ModuleDetailShell>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <ModulePageShell
      title="Applicant Tracking"
      description="Manage job postings and track applicant pipeline"
    >
      <Tabs defaultValue="applicants">
        <TabsList className="mb-4">
          <TabsTrigger value="applicants" data-testid="tab-applicants">Applicants</TabsTrigger>
          <TabsTrigger value="postings" data-testid="tab-postings">Job Postings</TabsTrigger>
        </TabsList>

        <TabsContent value="applicants">
          <ModuleToolbar>
            <Select value={selectedPosting} onValueChange={setSelectedPosting}>
              <SelectTrigger className="w-52" data-testid="select-posting-filter">
                <SelectValue placeholder="All Postings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Postings</SelectItem>
                {postings.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search applicants..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-52"
              data-testid="input-applicant-search"
            />
            {selectedPosting !== "all" && (
              <Button size="sm" variant="outline" onClick={() => scoreAllMutation.mutate(selectedPosting)} disabled={scoreAllMutation.isPending} data-testid="button-score-all">
                <Star className="w-3 h-3 mr-1" /> {scoreAllMutation.isPending ? "Scoring..." : "Score All"}
              </Button>
            )}
          </ModuleToolbar>

          {loadingApplicants ? (
            <ModuleSkeletonList count={4} height="h-16" />
          ) : sorted.length === 0 ? (
            <ModuleEmptyState icon={Users} title="No applicants found" />
          ) : (
            <div className="space-y-2">
              {sorted.map((a) => (
                <Card key={a.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedApplicant(a)} data-testid={`card-applicant-${a.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                          {a.first_name[0]}{a.last_name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground" data-testid={`text-applicant-name-${a.id}`}>
                            {a.first_name} {a.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.years_experience} yr exp · {a.has_guard_card ? "Guard card" : "No guard card"}{a.has_armed_endorsement ? " · Armed" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBadge score={a.trinity_score} />
                        <Badge className={(STATUS_CONFIG[a.status] || STATUS_CONFIG.applied).color} data-testid={`badge-status-${a.id}`}>
                          {(STATUS_CONFIG[a.status] || STATUS_CONFIG.applied).label}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="postings">
          {loadingPostings ? (
            <ModuleSkeletonList count={2} height="h-20" />
          ) : postings.length === 0 ? (
            <ModuleEmptyState icon={BriefcaseBusiness} title="No job postings found" />
          ) : (
            <div className="space-y-3">
              {postings.map((p) => (
                <Card key={p.id} data-testid={`card-posting-${p.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground" data-testid={`text-posting-title-${p.id}`}>{p.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.employment_type} · {p.applications_count} applicant{p.applications_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <Badge className={p.status === "active" ? BADGE_COLORS.green : BADGE_COLORS.slate}>{p.status}</Badge>
                        {p.pay_rate_min && p.pay_rate_max && (
                          <p className="text-sm text-muted-foreground">${p.pay_rate_min}–${p.pay_rate_max}/hr</p>
                        )}
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setSelectedPosting(p.id)}
                          data-testid={`button-view-applicants-${p.id}`}
                        >
                          View Applicants
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ModulePageShell>
  );
}
