import { SEO } from "@/components/seo";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Search,
  User,
  Mail,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  Lock,
  ChevronRight,
  Building2,
  BadgeCheck,
  FileWarning,
  UploadCloud,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface CompanyInfo {
  name: string;
  stateCode: string;
  licenseNumber: string;
}

interface VerificationStatus {
  requestId: string;
  status: string;
  emailDomainVerified: boolean;
  message: string;
}

const AUDIT_PURPOSES = [
  { value: "routine_inspection", label: "Routine Regulatory Inspection" },
  { value: "complaint_investigation", label: "Complaint Investigation" },
  { value: "license_renewal_audit", label: "License Renewal Audit" },
  { value: "targeted_enforcement", label: "Targeted Enforcement Action" },
  { value: "administrative_review", label: "Administrative Review" },
];

const STEPS = [
  { step: 1, label: "Company Lookup", icon: Search },
  { step: 2, label: "Credentials", icon: User },
  { step: 3, label: "Verification", icon: BadgeCheck },
  { step: 4, label: "Owner Notice", icon: Clock },
  { step: 5, label: "Access Issued", icon: Lock },
  { step: 6, label: "Audit Upload", icon: FileSearch },
];

export default function RegulatoryPortal() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationStatus | null>(null);
  const [form, setForm] = useState({
    auditorFullName: "",
    auditorAgencyName: "",
    auditorEmail: "",
    auditorBadgeNumber: "",
    auditPurpose: "",
    authorizationDocUrl: "",
  });
  const [reportForm, setReportForm] = useState({
    reportUrl: "",
    auditOutcome: "",
    findings: "",
    correctiveActions: "",
  });
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const lookupMutation = useMutation({
    mutationFn: async (licenseNum: string) => {
      const res = await apiRequest("POST", "/api/compliance/regulatory-portal/lookup", { licenseNumber: licenseNum });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.found) {
        setCompany(data.company);
        setCurrentStep(2);
      } else {
        toast({
          title: "Company Not Found",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({ title: "Lookup Failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/compliance/regulatory-portal/request", { licenseNumber, ...form });
      return res.json();
    },
    onSuccess: (data) => {
      setVerificationResult(data);
      if (data.emailDomainVerified) {
        setCurrentStep(4);
      } else {
        setCurrentStep(3);
      }
    },
    onError: () => {
      toast({ title: "Submission Failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/compliance/regulatory-portal/complete-report", {
        requestId: verificationResult?.requestId,
        ...reportForm,
      });
      return res.json();
    },
    onSuccess: () => {
      setReportSubmitted(true);
      toast({ title: "Audit Report Submitted", description: "Your final report has been received. The organization owner has been notified." });
    },
    onError: () => {
      toast({ title: "Submission Failed", description: "Please verify your report URL and try again.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <SEO 
        title="Regulatory Auditor Portal | State Compliance" 
        description="Official State Regulatory Auditor Access System. Secure portal for authorized government officials to conduct compliance audits and reviews."
      />
      {/* Header */}
      <div className="border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Shield className="text-[#ffc83c]" size={28} />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">State Regulatory Auditor Portal</h1>
              <p className="text-slate-400 text-xs">State Regulatory Auditor Access System</p>
            </div>
          </div>
          <Badge variant="outline" className="text-slate-300 border-slate-600 text-xs">
            Official Government Access Only
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-8 pb-28 sm:pb-10">
        {/* Step Progress */}
        <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = currentStep === s.step;
            const isComplete = currentStep > s.step;
            return (
              <div key={s.step} className="flex items-center gap-2 min-w-0">
                <div className={`flex items-center gap-2 flex-shrink-0 ${isActive ? "opacity-100" : isComplete ? "opacity-100" : "opacity-40"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    isComplete ? "bg-[#ffc83c] border-[#ffc83c]" :
                    isActive ? "border-[#ffc83c] bg-[#ffc83c]/10" :
                    "border-slate-600 bg-transparent"
                  }`}>
                    {isComplete ? (
                      <CheckCircle2 size={14} className="text-[#0f172a]" />
                    ) : (
                      <Icon size={14} className={isActive ? "text-[#ffc83c]" : "text-slate-500"} />
                    )}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-white" : isComplete ? "text-[#ffc83c]" : "text-slate-500"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={16} className="text-slate-700 mx-1 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1 — Company Lookup */}
        {currentStep === 1 && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Search size={20} className="text-[#ffc83c]" />
                Step 1: Locate the Security Company
              </CardTitle>
              <CardDescription className="text-slate-400">
                Enter the company's state-issued security license number. This is the license number
                issued by your state's security regulatory authority.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Company State License Number</Label>
                <Input
                  data-testid="input-license-number"
                  placeholder="e.g., C11608501, B12345, A12345678"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  onKeyDown={(e) => { if (e.key === "Enter" && licenseNumber.trim()) lookupMutation.mutate(licenseNumber.trim()); }}
                />
                <p className="text-xs text-slate-500">
                  This is the license number on the company's state-issued certificate of authority.
                </p>
              </div>
              <Button
                data-testid="button-lookup-company"
                onClick={() => lookupMutation.mutate(licenseNumber.trim())}
                disabled={!licenseNumber.trim() || lookupMutation.isPending}
                className="bg-[#ffc83c] hover:bg-[#ffc83c]/90 text-[#0f172a] font-semibold"
              >
                {lookupMutation.isPending ? "Searching..." : "Find Company"}
                <Search size={16} className="ml-2" />
              </Button>

              <div className="mt-6 p-4 rounded-md bg-slate-800 border border-slate-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-[#ffc83c] flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-200">Authorized Access Only</p>
                    <p className="text-xs text-slate-400">
                      This portal is exclusively for authorized state regulatory auditors.
                      Unauthorized access attempts are logged and reported to your agency's
                      internal affairs division. All sessions are recorded.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Credentials */}
        {currentStep === 2 && company && (
          <div className="space-y-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-4 flex items-center gap-4 flex-wrap">
                <Building2 size={20} className="text-[#ffc83c]" />
                <div>
                  <p className="text-white font-semibold">{company.name}</p>
                  <p className="text-slate-400 text-sm">License: {company.licenseNumber} · State: {company.stateCode}</p>
                </div>
                <Badge className="bg-green-900/40 text-green-400 border-green-800">
                  <CheckCircle2 size={12} className="mr-1" />
                  Verified Active
                </Badge>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User size={20} className="text-[#ffc83c]" />
                  Step 2: Enter Your Official Credentials
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Provide your agency-issued credentials. Your email domain will be automatically
                  verified against {company.stateCode}'s regulatory authority records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Full Legal Name</Label>
                    <Input
                      data-testid="input-auditor-name"
                      placeholder="First and Last Name"
                      value={form.auditorFullName}
                      onChange={(e) => setForm(f => ({ ...f, auditorFullName: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Agency / Authority Name</Label>
                    <Input
                      data-testid="input-agency-name"
                      placeholder="e.g., Texas DPS Private Security Bureau"
                      value={form.auditorAgencyName}
                      onChange={(e) => setForm(f => ({ ...f, auditorAgencyName: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Official Government Email</Label>
                    <Input
                      data-testid="input-auditor-email"
                      type="email"
                      placeholder="e.g., j.smith@dps.texas.gov"
                      value={form.auditorEmail}
                      onChange={(e) => setForm(f => ({ ...f, auditorEmail: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <p className="text-xs text-slate-500">Must end with your agency's official domain</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Badge / Employee Number</Label>
                    <Input
                      data-testid="input-badge-number"
                      placeholder="Badge or employee number"
                      value={form.auditorBadgeNumber}
                      onChange={(e) => setForm(f => ({ ...f, auditorBadgeNumber: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-slate-300">Purpose of Audit</Label>
                    <Select value={form.auditPurpose} onValueChange={(v) => setForm(f => ({ ...f, auditPurpose: v }))}>
                      <SelectTrigger data-testid="select-audit-purpose" className="bg-slate-800 border-slate-600 text-white">
                        <SelectValue placeholder="Select audit type..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {AUDIT_PURPOSES.map(p => (
                          <SelectItem key={p.value} value={p.value} className="text-white hover:bg-slate-700">
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-slate-300">Authorization Document URL (optional)</Label>
                    <Input
                      data-testid="input-auth-doc-url"
                      placeholder="Link to uploaded authorization letter (PDF)"
                      value={form.authorizationDocUrl}
                      onChange={(e) => setForm(f => ({ ...f, authorizationDocUrl: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                    className="border-slate-600 text-slate-300"
                  >
                    Back
                  </Button>
                  <Button
                    data-testid="button-submit-credentials"
                    onClick={() => submitMutation.mutate()}
                    disabled={
                      !form.auditorFullName || !form.auditorAgencyName || !form.auditorEmail ||
                      !form.auditorBadgeNumber || !form.auditPurpose || submitMutation.isPending
                    }
                    className="bg-[#ffc83c] hover:bg-[#ffc83c]/90 text-[#0f172a] font-semibold"
                  >
                    {submitMutation.isPending ? "Submitting..." : "Submit Credentials"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3 — Domain mismatch / manual verification needed */}
        {currentStep === 3 && verificationResult && !verificationResult.emailDomainVerified && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileWarning size={20} className="text-amber-400" />
                Step 3: Email Domain Verification Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-md bg-amber-900/20 border border-amber-800">
                <p className="text-amber-300 text-sm font-medium mb-2">Domain Verification Failed</p>
                <p className="text-amber-200/80 text-sm">{verificationResult.message}</p>
              </div>
              <div className="space-y-2">
                <p className="text-slate-300 text-sm font-medium">What you should do:</p>
                <ul className="space-y-1 text-slate-400 text-sm list-disc pl-5">
                  <li>Verify that you are using your official government email address</li>
                  <li>Contact your agency IT department if you believe your email domain is correct</li>
                  <li>Contact platform support with your badge number and authorization letter for manual review</li>
                </ul>
              </div>
              <p className="text-xs text-slate-500">Request ID: {verificationResult.requestId}</p>
              <Button
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="border-slate-600 text-slate-300"
              >
                Try a Different Email
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 4 — 24hr Owner Notice */}
        {currentStep === 4 && verificationResult?.emailDomainVerified && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Clock size={20} className="text-[#ffc83c]" />
                Step 4: Organization Owner Notified
              </CardTitle>
              <CardDescription className="text-slate-400">
                Your credentials have been verified. The organization owner has been notified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="p-4 rounded-md bg-green-900/20 border border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <span className="text-green-300 font-medium text-sm">Email Domain Verified</span>
                </div>
                <p className="text-green-200/80 text-sm">
                  Your government email domain has been successfully verified against the state
                  regulatory authority records.
                </p>
              </div>

              <div className="p-4 rounded-md bg-slate-800 border border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[#ffc83c]" />
                  <span className="text-white font-medium text-sm">24-Hour Dispute Window Active</span>
                </div>
                <p className="text-slate-400 text-sm">
                  The organization owner has been notified of your audit access request via email
                  and in-platform notification. They have 24 hours to dispute the access.
                </p>
                <ul className="space-y-1 text-slate-400 text-sm list-disc pl-5">
                  <li>If no dispute is received, access will be granted automatically after 24 hours</li>
                  <li>You will receive credentials via the email address you provided</li>
                  <li>Access expires after 14 days or upon audit completion</li>
                </ul>
              </div>

              <div className="p-3 rounded-md bg-slate-800/50 border border-slate-700">
                <p className="text-xs text-slate-400">
                  Request ID: <span className="font-mono text-slate-300">{verificationResult.requestId}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Keep this ID for your records. You may check the status of your request using this ID.
                </p>
              </div>

              <div className="p-4 rounded-md bg-slate-800 border border-slate-700">
                <p className="text-sm font-medium text-slate-200 mb-2">What happens next?</p>
                <div className="space-y-2">
                  {[
                    { step: 1, label: "24 hours", desc: "Dispute window — owner can contest access" },
                    { step: 2, label: "Access granted", desc: "Credentials sent to your government email" },
                    { step: 3, label: "Audit period", desc: "14-day access window to conduct your audit" },
                    { step: 4, label: "Report upload", desc: "Upload your final audit report via the portal" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#ffc83c]/20 border border-[#ffc83c]/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[#ffc83c] text-xs font-bold">{item.step}</span>
                      </div>
                      <div>
                        <span className="text-white text-xs font-medium">{item.label}: </span>
                        <span className="text-slate-400 text-xs">{item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5 — Access issued notice (shown after credentials are sent) */}
        {currentStep === 5 && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Lock size={20} className="text-[#ffc83c]" />
                Step 5: Access Credentials Issued
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-md bg-green-900/20 border border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <span className="text-green-300 font-medium">Credentials Sent</span>
                </div>
                <p className="text-green-200/80 text-sm">
                  Your portal access token has been sent to your government email address.
                  Check your inbox and use the provided token to access the compliance dashboard.
                </p>
              </div>
              <p className="text-slate-400 text-sm">
                Navigate to <span className="font-mono text-slate-200">/regulatory/dashboard</span> and
                enter your portal token to begin your audit review.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  data-testid="button-go-to-dashboard"
                  onClick={() => navigate("/regulatory/dashboard")}
                  className="bg-[#ffc83c] hover:bg-[#ffc83c]/90 text-[#0f172a] font-semibold"
                >
                  Go to Audit Dashboard
                </Button>
                <Button
                  data-testid="button-advance-to-report-upload"
                  variant="outline"
                  onClick={() => setCurrentStep(6)}
                  className="border-slate-600 text-slate-300"
                >
                  <UploadCloud size={16} className="mr-2" />
                  Submit Final Report
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                After completing your review in the dashboard, return here to submit your final audit report.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 6 — Audit Report Upload */}
        {currentStep === 6 && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <UploadCloud size={20} className="text-[#ffc83c]" />
                Step 6: Submit Final Audit Report
              </CardTitle>
              <CardDescription className="text-slate-400">
                Upload your completed audit findings to formally close this audit cycle.
                The report is WORM-locked to this organization's permanent record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {reportSubmitted ? (
                <div className="p-4 rounded-md bg-green-900/20 border border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-green-400" />
                    <span className="text-green-300 font-medium">Report Received</span>
                  </div>
                  <p className="text-green-200/80 text-sm">
                    Your final audit report has been recorded. The organization owner has been notified.
                    Trinity has generated a corrective action plan based on your findings.
                    This audit cycle is now complete.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-md bg-amber-900/20 border border-amber-800/40 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-200/80 text-xs">
                      Report submissions are permanent and cannot be altered. Ensure all findings are accurate before submitting.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Report URL</Label>
                    <Input
                      data-testid="input-report-url"
                      placeholder="https://your-agency.gov/reports/audit-2026-..."
                      value={reportForm.reportUrl}
                      onChange={(e) => setReportForm(f => ({ ...f, reportUrl: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <p className="text-xs text-slate-500">
                      Link to the official audit report hosted on your agency's secure server.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Audit Outcome</Label>
                    <Select
                      value={reportForm.auditOutcome}
                      onValueChange={(v) => setReportForm(f => ({ ...f, auditOutcome: v }))}
                    >
                      <SelectTrigger
                        data-testid="select-audit-outcome"
                        className="bg-slate-800 border-slate-600 text-white"
                      >
                        <SelectValue placeholder="Select outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">Pass — No violations found</SelectItem>
                        <SelectItem value="pass_with_conditions">Pass with Conditions — Minor issues noted</SelectItem>
                        <SelectItem value="conditional">Conditional — Corrective action required</SelectItem>
                        <SelectItem value="fail">Fail — Significant violations found</SelectItem>
                        <SelectItem value="referral">Referral — Forwarded for formal enforcement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Findings Summary</Label>
                    <Textarea
                      data-testid="textarea-findings"
                      placeholder="Summarize the key findings of this audit..."
                      value={reportForm.findings}
                      onChange={(e) => setReportForm(f => ({ ...f, findings: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Required Corrective Actions</Label>
                    <Textarea
                      data-testid="textarea-corrective-actions"
                      placeholder="List any corrective actions required by the organization..."
                      value={reportForm.correctiveActions}
                      onChange={(e) => setReportForm(f => ({ ...f, correctiveActions: e.target.value }))}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 min-h-[80px]"
                    />
                    <p className="text-xs text-slate-500">
                      Trinity will generate a corrective action plan and send it to the organization owner.
                    </p>
                  </div>

                  <Button
                    data-testid="button-submit-audit-report"
                    onClick={() => reportMutation.mutate()}
                    disabled={!reportForm.reportUrl.trim() || !reportForm.auditOutcome || reportMutation.isPending}
                    className="bg-[#ffc83c] hover:bg-[#ffc83c]/90 text-[#0f172a] font-semibold"
                  >
                    {reportMutation.isPending ? "Submitting..." : "Submit Final Report"}
                    <UploadCloud size={16} className="ml-2" />
                  </Button>
                </>
              )}

              <div className="p-3 rounded-md bg-slate-800/50 border border-slate-700 mt-2">
                <p className="text-xs text-slate-400">
                  <span className="font-medium text-slate-300">WORM Notice:</span> All data in this portal is write-once-read-many.
                  Submitted reports are permanently attached to this organization's regulatory record and are admissible in enforcement proceedings.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-600">
State Regulatory Auditor Portal · All sessions are cryptographically logged · WORM-compliant audit trail
          </p>
        </div>
      </div>
    </div>
  );
}
