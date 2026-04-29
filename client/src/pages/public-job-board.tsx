import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Shield, MapPin, Clock, DollarSign, ChevronRight, ArrowLeft,
  CheckCircle2, Briefcase, Calendar,
} from "lucide-react";

interface JobPosting {
  id: string;
  title: string;
  description: string;
  position_type: string;
  shift_type?: string;
  employment_type: string;
  sites?: string[] | string;
  pay_rate_min?: number;
  pay_rate_max?: number;
  schedule_details?: string;
  requires_license: boolean;
  applications_count: number;
  posted_at: string;
}

interface Workspace {
  id: string;
  name: string;
  company_name?: string;
  logo_url?: string;
}

interface BoardData {
  workspace: Workspace;
  postings: JobPosting[];
}

const SHIFT_LABELS: Record<string, string> = {
  armed: "Armed Officer", unarmed: "Unarmed Officer",
  supervisor: "Site Supervisor", concierge: "Concierge",
};

const TX_COUNTIES = [
  "TX", "CA", "FL", "GA", "NY", "AZ", "NV", "CO", "IL", "NC", "VA", "WA",
];

const LICENSE_TYPES = [
  "Level II Unarmed", "Level III Armed", "Level IV Manager",
  "Concierge/Hospitality", "Other",
];

function parseSites(sites: string[] | string | undefined): string[] {
  if (!sites) return [];
  if (Array.isArray(sites)) return sites;
  try { return JSON.parse(sites); } catch { return [String(sites)]; }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Form
// ─────────────────────────────────────────────────────────────────────────────

function ApplicationForm({
  posting,
  workspaceId,
  onSuccess,
  onCancel,
}: {
  posting: JobPosting;
  workspaceId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    has_license: "" as "" | "yes" | "no",
    license_number: "", license_state: "TX", license_type: "",
    interested_in_sponsorship: false,
  });

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/jobs/${workspaceId}/apply`, {
      job_posting_id: posting.id,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone || undefined,
      has_license: form.has_license === "yes",
      license_number: form.has_license === "yes" ? form.license_number : undefined,
      license_state: form.has_license === "yes" ? form.license_state : undefined,
      license_type: form.has_license === "yes" ? form.license_type : undefined,
      interested_in_sponsorship: form.interested_in_sponsorship,
    }),
    onSuccess,
  });

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const canSubmit = form.first_name && form.last_name && form.email && form.has_license &&
    (form.has_license === "no" || (form.license_number && form.license_type));

  return (
    <div className="space-y-5" data-testid="application-form">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel} data-testid="button-cancel-apply">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="font-semibold text-lg">Apply Now</h2>
          <p className="text-sm text-muted-foreground">{posting.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First Name</Label>
          <Input id="first_name" value={form.first_name} onChange={e => set("first_name", e.target.value)}
            placeholder="First" data-testid="input-first-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last Name</Label>
          <Input id="last_name" value={form.last_name} onChange={e => set("last_name", e.target.value)}
            placeholder="Last" data-testid="input-last-name" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email Address</Label>
        <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)}
          placeholder="you@email.com" data-testid="input-email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone Number (optional)</Label>
        <Input id="phone" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
          placeholder="(555) 000-0000" data-testid="input-phone" />
      </div>

      <div className="space-y-2">
        <Label>Do you currently hold an active security license in your state?</Label>
        <Select value={form.has_license} onValueChange={v => set("has_license", v)}
          data-testid="select-has-license">
          <SelectTrigger data-testid="trigger-has-license">
            <SelectValue placeholder="Select one..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes — I have an active license</SelectItem>
            <SelectItem value="no">No — I do not hold a license</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.has_license === "yes" && (
        <div className="space-y-4 bg-muted/30 rounded-md p-4">
          <p className="text-sm font-medium">License Details</p>
          <div className="space-y-1.5">
            <Label htmlFor="license_number">License Number</Label>
            <Input id="license_number" value={form.license_number}
              onChange={e => set("license_number", e.target.value)}
              placeholder="e.g. TX-2025-00000" data-testid="input-license-number" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Issuing State</Label>
              <Select value={form.license_state} onValueChange={v => set("license_state", v)}>
                <SelectTrigger data-testid="trigger-license-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TX_COUNTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>License Type</Label>
              <Select value={form.license_type} onValueChange={v => set("license_type", v)}>
                <SelectTrigger data-testid="trigger-license-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your license will be verified by Trinity AI as part of the application review process.
          </p>
        </div>
      )}

      {form.has_license === "no" && (
        <div className="bg-muted/30 rounded-md p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            This position requires a valid security officer license. Applicants without a license may be
            considered for our sponsorship or training track.
          </p>
          <div className="flex items-start gap-2">
            <Checkbox
              id="sponsorship"
              checked={form.interested_in_sponsorship}
              onCheckedChange={v => set("interested_in_sponsorship", Boolean(v))}
              data-testid="checkbox-sponsorship"
            />
            <Label htmlFor="sponsorship" className="text-sm leading-relaxed cursor-pointer">
              I am interested in license sponsorship or training consideration. I understand I will be placed in a
              separate training pipeline and contacted when opportunities become available.
            </Label>
          </div>
        </div>
      )}

      {mut.isError && (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-error-apply">
          Submission failed. Please check your information and try again.
        </p>
      )}

      <Button
        onClick={() => mut.mutate()}
        disabled={!canSubmit || mut.isPending}
        className="w-full"
        data-testid="button-submit-apply"
      >
        {mut.isPending ? "Submitting..." : "Submit Application"}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Card
// ─────────────────────────────────────────────────────────────────────────────

function JobCard({ posting, onApply }: { posting: JobPosting; onApply: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const sites = parseSites(posting.sites);

  return (
    <Card data-testid={`card-job-${posting.id}`}>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-base leading-tight">{posting.title}</h3>
            <div className="flex gap-2 flex-wrap">
              {posting.shift_type && (
                <Badge variant="outline" className="text-xs">
                  <Shield className="w-3 h-3 mr-1" />
                  {SHIFT_LABELS[posting.shift_type] || posting.shift_type}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs capitalize">
                {posting.employment_type?.replace("_", " ")}
              </Badge>
              {posting.requires_license && (
                <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-600 dark:text-blue-400">
                  License Required
                </Badge>
              )}
            </div>
          </div>
          <Button onClick={onApply} size="sm" data-testid={`button-apply-${posting.id}`}>
            Apply Now <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          {posting.pay_rate_min && posting.pay_rate_max && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
              <span>${posting.pay_rate_min}–${posting.pay_rate_max}/hr</span>
            </div>
          )}
          {posting.schedule_details && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{posting.schedule_details}</span>
            </div>
          )}
          {sites.length > 0 && (
            <div className="flex items-center gap-1.5 col-span-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{sites.slice(0, 2).join(", ")}{sites.length > 2 && ` +${sites.length - 2} more`}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Posted {formatDate(posting.posted_at)}</span>
          </div>
        </div>

        {posting.description && (
          <>
            {!expanded ? (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                data-testid={`button-expand-${posting.id}`}
              >
                View job description
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm leading-relaxed text-muted-foreground">{posting.description}</p>
                <button
                  onClick={() => setExpanded(false)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Collapse
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PublicJobBoard() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [applyTo, setApplyTo] = useState<JobPosting | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError } = useQuery<BoardData>({
    queryKey: [`/api/public/jobs/${workspaceId}`],
    enabled: !!workspaceId,
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground text-sm">Loading job board...</p>
    </div>
  );

  if (isError || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <Briefcase className="w-10 h-10 mx-auto text-muted-foreground/40" />
        <p className="text-foreground font-medium">Organization not found</p>
        <p className="text-muted-foreground text-sm">This job board link may be invalid or expired.</p>
      </div>
    </div>
  );

  const ws = data.workspace;
  const postings = data.postings;

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-md" data-testid="div-submission-success">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-semibold">Application Submitted</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Thank you for applying to {ws.company_name || ws.name}. Our hiring team will review your application
          and Trinity AI will reach out within 2–3 business days to schedule your initial screening.
        </p>
        <Button variant="outline" onClick={() => { setSubmitted(false); setApplyTo(null); }}
          data-testid="button-apply-another">
          View More Openings
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background" data-testid="page-public-job-board">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {ws.logo_url ? (
              <img src={ws.logo_url} alt={ws.name} width={48} height={48} className="w-12 h-12 rounded-md object-contain border" />
            ) : (
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold">{ws.company_name || ws.name}</h1>
              <p className="text-sm text-muted-foreground">Open Positions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {applyTo ? (
          <ApplicationForm
            posting={applyTo}
            workspaceId={workspaceId || ""}
            onSuccess={() => setSubmitted(true)}
            onCancel={() => setApplyTo(null)}
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {postings.length} open position{postings.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">AI-assisted hiring powered by Trinity</p>
            </div>

            {postings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground" data-testid="text-no-postings">
                <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No open positions at this time</p>
                <p className="text-sm mt-1">Check back soon or reach out directly.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {postings.map(p => (
                  <JobCard key={p.id} posting={p} onApply={() => setApplyTo(p)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t mt-8 py-4">
        <p className="text-center text-xs text-muted-foreground">
          Powered by CoAIleague — AI-Powered Workforce Management
        </p>
      </div>
    </div>
  );
}
