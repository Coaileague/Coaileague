import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield, CheckCircle, ChevronRight, ChevronLeft, Pen, Eraser,
  AlertTriangle, FileText, Lock, User
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PacketType = "unarmed" | "armed" | "ppo" | "contractor";

interface PacketData {
  id: string;
  packetType: PacketType;
  documentTitle: string;
  recipientName: string;
  recipientEmail: string;
  formData: Record<string, any>;
  sectionInitials: Record<string, boolean>;
  status: string;
}

// ── Signature Canvas ──────────────────────────────────────────────────────────

function SignatureCanvas({ onChange }: { onChange: (data: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    setDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  };

  const stop = () => {
    if (!drawing) return;
    setDrawing(false);
    setHasSig(true);
    onChange(canvasRef.current!.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="border rounded-md bg-card dark:bg-slate-50 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={560}
          height={120}
          className="w-full touch-none cursor-crosshair"
          data-testid="canvas-signature"
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
        {!hasSig && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-300 text-sm select-none">Sign here</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={clear} data-testid="button-clear-signature">
          <Eraser className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}

// ── InitialBlock ──────────────────────────────────────────────────────────────

function InitialBlock({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md border bg-muted/30"
      data-testid={`row-initial-${id}`}
    >
      <Checkbox
        id={`init-${id}`}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        data-testid={`checkbox-initial-${id}`}
        className="mt-0.5"
      />
      <Label htmlFor={`init-${id}`} className="text-sm leading-snug cursor-pointer">
        {label}
      </Label>
      {checked && <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <Input
      id={id}
      data-testid={`input-${id}`}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
    />
  );
}

// ── SECTION DEFINITIONS ───────────────────────────────────────────────────────

const COMMON_INITIALS = [
  {
    key: "at_will",
    label:
      "At-Will Employment: I understand that my employment is at-will, meaning either party may terminate the employment relationship at any time, for any reason, with or without notice or cause, consistent with Texas law.",
  },
  {
    key: "drug_free",
    label:
      "Drug-Free Workplace Policy: I have read and agree to comply with the company's Drug-Free Workplace Policy. I consent to pre-employment, random, post-accident, and reasonable-suspicion drug testing as a condition of employment.",
  },
  {
    key: "code_conduct",
    label:
      "Code of Conduct & Ethics: I acknowledge receipt of the Company's Code of Conduct and Ethics Policy and agree to abide by all standards of professional behavior outlined therein, including those specific to the private security industry.",
  },
  {
    key: "electronic_policy",
    label:
      "Electronic Communications Policy: I acknowledge receipt of the Electronic Communications and Social Media Policy and understand that company devices and systems are subject to monitoring. I agree not to disclose client or company confidential information on personal or social media platforms.",
  },
  {
    key: "uniform_equip",
    label:
      "Uniform & Equipment: I acknowledge that I am responsible for company-issued uniform items and equipment. Lost, damaged, or unreturned items may result in payroll deduction as permitted by Texas law.",
  },
  {
    key: "background_consent",
    label:
      "Background Check Authorization: I authorize the Company and its agents to procure a consumer report and/or investigative consumer report in connection with my employment application and, if employed, at any time during my employment. I authorize DPS (via IdentoGO) fingerprint submission per Chapter 1702, Texas Occupations Code.",
  },
];

const ARMED_INITIALS = [
  {
    key: "firearm_policy",
    label:
      "Firearms Policy: I understand that carrying a firearm in the course of duty is governed by Texas DPS regulations under 37 TAC §35.182. I will maintain current firearms qualification, carry only authorized weapons, and will immediately report any firearm discharge event to my supervisor and the DPS Private Security Bureau.",
  },
  {
    key: "psych_consent",
    label:
      "Psychological Evaluation Consent: I consent to a psychological evaluation as required for armed officer licensure under 37 TAC §35.145 and understand results will be reviewed by the Company's licensed medical review officer.",
  },
];

const PPO_INITIALS = [
  {
    key: "ppo_scope",
    label:
      "PPO Scope of Authority: I understand the scope of authority granted to Personal Protection Officers under Texas Occupations Code §1702.324. I agree to operate within authorized parameters and will not exceed lawful use of force as defined by Texas Penal Code §9.33.",
  },
];

// ── Main Portal ───────────────────────────────────────────────────────────────

export default function EmployeePacketPortal() {
  const [, params] = useRoute("/packet-portal/:token");
  const token = params?.token;
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [sectionInitials, setSectionInitials] = useState<Record<string, boolean>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submittedOk, setSubmittedOk] = useState(false);

  const { data: packet, isLoading, error } = useQuery<PacketData>({
    queryKey: ["/api/public/packets", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/packets/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || "Not found"), body);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (packet) {
      setFormData(packet.formData || {});
      setSectionInitials(packet.sectionInitials || {});
    }
  }, [packet]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/public/packets/${token}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData, sectionInitials }),
      }).then((r) => r.json()),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/packets/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formData,
          sectionInitials,
          signatureData,
          signedByName: formData.firstName + " " + formData.lastName,
          signatureDate: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error || "Submit failed");
      }
      return res.json();
    },
    onSuccess: () => setSubmittedOk(true),
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setField = (key: string, value: any) =>
    setFormData((prev) => ({ ...prev, [key]: value }));
  const setInitial = (key: string, value: boolean) =>
    setSectionInitials((prev) => ({ ...prev, [key]: value }));

  const pt = packet?.packetType ?? "unarmed";

  // Build initials list based on packet type
  const allInitials = [
    ...COMMON_INITIALS,
    ...(pt === "armed" ? ARMED_INITIALS : []),
    ...(pt === "ppo" ? PPO_INITIALS : []),
  ];

  const STEPS = [
    "Personal Info",
    "Employment Eligibility",
    "Tax & Direct Deposit",
    "TX License Info",
    "Emergency Contact",
    "Policy Acknowledgments",
    "Signature",
  ];

  const goNext = () => {
    saveMutation.mutate();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo(0, 0);
  };
  const goPrev = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo(0, 0);
  };

  const allInitialed = allInitials.every((i) => sectionInitials[i.key]);
  const canSubmit = allInitialed && !!signatureData && !!formData.firstName && !!formData.lastName;

  // ── Loading / Error / Complete states ───────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading your packet…</p>
        </div>
      </div>
    );
  }

  const err = error as any;
  if (err?.completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold">Packet Already Completed</h2>
            <p className="text-sm text-muted-foreground">
              This packet has been signed and submitted. Thank you — your records are on file.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (err?.voided || (error && !packet)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Packet Not Available</h2>
            <p className="text-sm text-muted-foreground">
              {err?.voided
                ? "This packet has been voided by the organization."
                : "This link is invalid or has expired. Please contact HR."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submittedOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-lg w-full mx-4">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-green-600 mx-auto" />
            <h2 className="text-2xl font-semibold">Packet Complete!</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your onboarding packet has been signed and submitted. A copy has been recorded with your employer.
              Welcome to the team.
            </p>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 text-left space-y-1">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Lock className="w-3 h-3" /> Legally Binding Record
              </div>
              <p>
                This packet is legally binding per the Texas E-Sign Act (Tex. Bus. & Com. Code §322) and the
                federal ESIGN Act (15 U.S.C. §7001). Your IP address, timestamp, and signature have been
                recorded as evidence of agreement.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!packet) return null;

  // ── Main form ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Onboarding Packet</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {packet.documentTitle}
            </span>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Lock className="w-3 h-3 mr-1" /> Secure
          </Badge>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
          <div className="flex justify-between mt-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={['text-xs', i === step ? "text-primary font-medium" : i < step ? "text-muted-foreground" : "text-muted-foreground/50"].join(' ')}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* ── Step 0: Personal Information ─────────────────────────────────── */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Section 1 — Personal Information
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Per 37 TAC §35.111, your employer must maintain a complete personnel file including a color
                photograph and the following information.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name" id="firstName" required>
                  <TextInput id="firstName" value={formData.firstName || ""} onChange={(v) => setField("firstName", v)} placeholder="Jane" required />
                </Field>
                <Field label="Last Name" id="lastName" required>
                  <TextInput id="lastName" value={formData.lastName || ""} onChange={(v) => setField("lastName", v)} placeholder="Smith" required />
                </Field>
              </div>
              <Field label="Middle Name" id="middleName">
                <TextInput id="middleName" value={formData.middleName || ""} onChange={(v) => setField("middleName", v)} placeholder="Optional" />
              </Field>
              <Field label="Date of Birth" id="dob" required>
                <TextInput id="dob" type="date" value={formData.dob || ""} onChange={(v) => setField("dob", v)} required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Social Security Number (Last 4)" id="ssn4" required>
                  <TextInput id="ssn4" value={formData.ssn4 || ""} onChange={(v) => setField("ssn4", v)} placeholder="XXXX" />
                </Field>
                <Field label="Personal Phone" id="phone" required>
                  <TextInput id="phone" type="tel" value={formData.phone || ""} onChange={(v) => setField("phone", v)} placeholder="(555) 000-0000" />
                </Field>
              </div>
              <Field label="Personal Email" id="email" required>
                <TextInput id="email" type="email" value={formData.email || ""} onChange={(v) => setField("email", v)} placeholder="jane@email.com" />
              </Field>
              <Field label="Home Address" id="address" required>
                <TextInput id="address" value={formData.address || ""} onChange={(v) => setField("address", v)} placeholder="123 Main St" />
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="City" id="city">
                  <TextInput id="city" value={formData.city || ""} onChange={(v) => setField("city", v)} placeholder="Austin" />
                </Field>
                <Field label="State" id="state">
                  <TextInput id="state" value={formData.state || ""} onChange={(v) => setField("state", v)} placeholder="TX" />
                </Field>
                <Field label="ZIP Code" id="zip">
                  <TextInput id="zip" value={formData.zip || ""} onChange={(v) => setField("zip", v)} placeholder="78701" />
                </Field>
              </div>
              <Separator />
              <Field label="Ethnicity (Optional, for EEO reporting only)" id="ethnicity">
                <Select value={formData.ethnicity || ""} onValueChange={(v) => setField("ethnicity", v)}>
                  <SelectTrigger data-testid="input-ethnicity">
                    <SelectValue placeholder="Prefer not to answer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prefer_not">Prefer not to answer</SelectItem>
                    <SelectItem value="hispanic">Hispanic or Latino</SelectItem>
                    <SelectItem value="white">White (Non-Hispanic)</SelectItem>
                    <SelectItem value="black">Black or African American</SelectItem>
                    <SelectItem value="asian">Asian</SelectItem>
                    <SelectItem value="native">American Indian or Alaska Native</SelectItem>
                    <SelectItem value="pacific">Native Hawaiian or Pacific Islander</SelectItem>
                    <SelectItem value="two_or_more">Two or more races</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        )}

        {/* ── Step 1: Employment Eligibility (I-9) ─────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Section 2 — Employment Eligibility (I-9)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                As required by federal law (8 U.S.C. §1324a), all employers must verify that each new
                employee is authorized to work in the United States. You will present original documents to
                your employer within 3 business days of your start date.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="text-sm font-medium">Citizenship / Immigration Status</Label>
                <div className="mt-2 space-y-2">
                  {[
                    { v: "citizen", label: "U.S. Citizen or U.S. National" },
                    { v: "noncitizen_national", label: "Lawful Permanent Resident (USCIS/Alien Registration #)" },
                    { v: "ead", label: "Alien authorized to work until (EAD/I-94)" },
                    { v: "permanent_resident", label: "Noncitizen National" },
                  ].map(({ v, label }) => (
                    <div key={v} className="flex items-center gap-2">
                      <Checkbox
                        id={`citizen-${v}`}
                        checked={formData.citizenStatus === v}
                        onCheckedChange={(c) => c && setField("citizenStatus", v)}
                        data-testid={`checkbox-citizen-${v}`}
                      />
                      <Label htmlFor={`citizen-${v}`} className="text-sm">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>
              {formData.citizenStatus === "permanent_resident" && (
                <Field label="USCIS/Alien Registration Number" id="alienRegNum">
                  <TextInput id="alienRegNum" value={formData.alienRegNum || ""} onChange={(v) => setField("alienRegNum", v)} placeholder="A-Number" />
                </Field>
              )}
              {formData.citizenStatus === "ead" && (
                <>
                  <Field label="EAD/I-94 Number" id="eadNumber">
                    <TextInput id="eadNumber" value={formData.eadNumber || ""} onChange={(v) => setField("eadNumber", v)} placeholder="Card/Admission Number" />
                  </Field>
                  <Field label="Work Authorization Expiration Date" id="eadExpiry">
                    <TextInput id="eadExpiry" type="date" value={formData.eadExpiry || ""} onChange={(v) => setField("eadExpiry", v)} />
                  </Field>
                </>
              )}
              <Separator />
              <div>
                <Label className="text-sm font-medium">Documents You Will Present (List A — OR — List B + C)</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Check all documents you plan to bring on your first day.
                </p>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">LIST A — Identity AND Work Authorization (one document):</p>
                  {[
                    "U.S. Passport",
                    "Permanent Resident Card (Form I-551)",
                    "Employment Authorization Document (EAD, Form I-766)",
                    "Foreign Passport with I-551 stamp",
                  ].map((doc) => (
                    <div key={doc} className="flex items-center gap-2">
                      <Checkbox
                        id={`doc-${doc}`}
                        checked={!!(formData.listADocs || {})[doc]}
                        onCheckedChange={(c) => setField("listADocs", { ...(formData.listADocs || {}), [doc]: !!c })}
                        data-testid={`checkbox-doc-${doc.replace(/\s/g, "-")}`}
                      />
                      <Label htmlFor={`doc-${doc}`} className="text-sm">{doc}</Label>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">LIST B — Identity (one):</p>
                  {["Driver's License (state-issued)", "State ID Card", "Military ID Card"].map((doc) => (
                    <div key={doc} className="flex items-center gap-2">
                      <Checkbox
                        id={`doc-${doc}`}
                        checked={!!(formData.listBDocs || {})[doc]}
                        onCheckedChange={(c) => setField("listBDocs", { ...(formData.listBDocs || {}), [doc]: !!c })}
                        data-testid={`checkbox-doc-b-${doc.replace(/\s/g, "-")}`}
                      />
                      <Label htmlFor={`doc-${doc}`} className="text-sm">{doc}</Label>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">LIST C — Work Authorization (one):</p>
                  {["Social Security Card", "Form I-797C (Notice of Action)", "U.S. Birth Certificate"].map((doc) => (
                    <div key={doc} className="flex items-center gap-2">
                      <Checkbox
                        id={`doc-${doc}`}
                        checked={!!(formData.listCDocs || {})[doc]}
                        onCheckedChange={(c) => setField("listCDocs", { ...(formData.listCDocs || {}), [doc]: !!c })}
                        data-testid={`checkbox-doc-c-${doc.replace(/\s/g, "-")}`}
                      />
                      <Label htmlFor={`doc-${doc}`} className="text-sm">{doc}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Tax & Direct Deposit ──────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Section 3 — Federal Tax Withholding (W-4) & Direct Deposit
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                This information is used to withhold the correct amount of federal income tax from your
                paycheck (IRS Form W-4 equivalent). Your employer will keep this on file.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Filing Status" id="filingStatus" required>
                <Select value={formData.filingStatus || ""} onValueChange={(v) => setField("filingStatus", v)}>
                  <SelectTrigger data-testid="input-filingStatus">
                    <SelectValue placeholder="Select filing status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single or Married Filing Separately</SelectItem>
                    <SelectItem value="married_jointly">Married Filing Jointly or Qualifying Surviving Spouse</SelectItem>
                    <SelectItem value="head_of_household">Head of Household</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Additional Withholding per Paycheck ($)" id="extraWithholding">
                  <TextInput id="extraWithholding" type="number" value={formData.extraWithholding || ""} onChange={(v) => setField("extraWithholding", v)} placeholder="0.00" />
                </Field>
                <Field label="Claim Exempt from Withholding?" id="claimExempt">
                  <Select value={formData.claimExempt || "no"} onValueChange={(v) => setField("claimExempt", v)}>
                    <SelectTrigger data-testid="input-claimExempt">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes — I am exempt</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-3">Direct Deposit Authorization</p>
                <p className="text-xs text-muted-foreground mb-4">
                  I authorize the Company to electronically deposit my paycheck to the account below. I
                  understand that a pre-note test deposit may be made prior to the first payroll.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Bank / Financial Institution" id="bankName">
                    <TextInput id="bankName" value={formData.bankName || ""} onChange={(v) => setField("bankName", v)} placeholder="Chase Bank" />
                  </Field>
                  <Field label="Account Type" id="accountType">
                    <Select value={formData.accountType || ""} onValueChange={(v) => setField("accountType", v)}>
                      <SelectTrigger data-testid="input-accountType">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Field label="Routing Number (9 digits)" id="routingNumber">
                    <TextInput id="routingNumber" value={formData.routingNumber || ""} onChange={(v) => setField("routingNumber", v)} placeholder="021000021" />
                  </Field>
                  <Field label="Account Number" id="accountNumber">
                    <TextInput id="accountNumber" value={formData.accountNumber || ""} onChange={(v) => setField("accountNumber", v)} placeholder="•••••••••" />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: TX DPS License Information ───────────────────────────── */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Section 4 — Texas DPS Private Security Registration
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Required per Texas Occupations Code Chapter 1702 and 37 TAC §35.111.{" "}
                {pt === "unarmed" && "Level II — Non-Commissioned Security Officer."}
                {pt === "armed" && "Level III — Commissioned Security Officer. Firearm qualification required."}
                {pt === "ppo" && "Level IV — Personal Protection Officer. Complete PPO training certification required."}
                {pt === "contractor" && "Contractor registration and license verification."}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="DPS Registration / License Number" id="dpsLicenseNum">
                  <TextInput id="dpsLicenseNum" value={formData.dpsLicenseNum || ""} onChange={(v) => setField("dpsLicenseNum", v)} placeholder="e.g., B12345" />
                </Field>
                <Field label="Registration / License Expiry Date" id="dpsLicenseExpiry">
                  <TextInput id="dpsLicenseExpiry" type="date" value={formData.dpsLicenseExpiry || ""} onChange={(v) => setField("dpsLicenseExpiry", v)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="DPS Pocket Card Number" id="dpsPocketCard">
                  <TextInput id="dpsPocketCard" value={formData.dpsPocketCard || ""} onChange={(v) => setField("dpsPocketCard", v)} placeholder="Pocket card #" />
                </Field>
                <Field label="Level Designation" id="dpsLevel">
                  <Select value={formData.dpsLevel || ""} onValueChange={(v) => setField("dpsLevel", v)}>
                    <SelectTrigger data-testid="input-dpsLevel">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ii">Level II — Unarmed / Non-commissioned</SelectItem>
                      <SelectItem value="iii">Level III — Armed / Commissioned</SelectItem>
                      <SelectItem value="iv">Level IV — Personal Protection Officer</SelectItem>
                      <SelectItem value="v">Level V — Security Salesperson</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="IdentoGO / DPS Fingerprint Receipt Number" id="fingerprintReceipt">
                <TextInput id="fingerprintReceipt" value={formData.fingerprintReceipt || ""} onChange={(v) => setField("fingerprintReceipt", v)} placeholder="IdentoGO receipt #" />
              </Field>
              {(pt === "armed" || pt === "ppo") && (
                <>
                  <Separator />
                  <p className="text-sm font-medium">Firearm Information (Armed / PPO only)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Firearm Make / Model Authorized" id="firearmMake">
                      <TextInput id="firearmMake" value={formData.firearmMake || ""} onChange={(v) => setField("firearmMake", v)} placeholder="e.g., Glock 17" />
                    </Field>
                    <Field label="Caliber" id="firearmCaliber">
                      <TextInput id="firearmCaliber" value={formData.firearmCaliber || ""} onChange={(v) => setField("firearmCaliber", v)} placeholder="e.g., 9mm" />
                    </Field>
                  </div>
                  <Field label="Firearm Qualification Certificate Expiry" id="firearmQualExpiry">
                    <TextInput id="firearmQualExpiry" type="date" value={formData.firearmQualExpiry || ""} onChange={(v) => setField("firearmQualExpiry", v)} />
                  </Field>
                </>
              )}
              {pt === "contractor" && (
                <>
                  <Separator />
                  <p className="text-sm font-medium">Contractor Tax Information</p>
                  <Field label="Tax ID / EIN (or SSN for sole proprietors)" id="contractorTaxId">
                    <TextInput id="contractorTaxId" value={formData.contractorTaxId || ""} onChange={(v) => setField("contractorTaxId", v)} placeholder="XX-XXXXXXX" />
                  </Field>
                  <Field label="Business Name (if applicable)" id="contractorBizName">
                    <TextInput id="contractorBizName" value={formData.contractorBizName || ""} onChange={(v) => setField("contractorBizName", v)} placeholder="LLC / DBA name" />
                  </Field>
                </>
              )}
              <div className="mt-4 bg-muted/40 rounded-md p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Required Document Uploads</p>
                <p>
                  After submitting this packet, you must provide the following documents to your employer
                  within 5 business days (per 37 TAC §35.111):
                </p>
                <ul className="list-disc pl-4 mt-2 space-y-0.5">
                  <li>Current DPS Pocket Card (original)</li>
                  <li>Color photograph (min. 2×2 inches)</li>
                  <li>IdentoGO fingerprint submission receipt</li>
                  {(pt === "armed" || pt === "ppo") && <li>Current firearm qualification certificate (valid within 90 days)</li>}
                  {pt === "armed" && <li>Psychological evaluation report (MMPI or equivalent)</li>}
                  {pt === "ppo" && <li>PPO training completion certificate</li>}
                  <li>Applicable training certificates (Level II: 30-hr; Level III: 45-hr)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Emergency Contact ─────────────────────────────────────── */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Section 5 — Emergency Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Full Name" id="ecName" required>
                  <TextInput id="ecName" value={formData.ecName || ""} onChange={(v) => setField("ecName", v)} placeholder="John Smith" required />
                </Field>
                <Field label="Relationship" id="ecRelationship">
                  <TextInput id="ecRelationship" value={formData.ecRelationship || ""} onChange={(v) => setField("ecRelationship", v)} placeholder="Spouse, Parent, etc." />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Primary Phone" id="ecPhone" required>
                  <TextInput id="ecPhone" type="tel" value={formData.ecPhone || ""} onChange={(v) => setField("ecPhone", v)} placeholder="(555) 000-0000" required />
                </Field>
                <Field label="Alternate Phone" id="ecAltPhone">
                  <TextInput id="ecAltPhone" type="tel" value={formData.ecAltPhone || ""} onChange={(v) => setField("ecAltPhone", v)} placeholder="(555) 000-0001" />
                </Field>
              </div>
              <Field label="Contact Address" id="ecAddress">
                <TextInput id="ecAddress" value={formData.ecAddress || ""} onChange={(v) => setField("ecAddress", v)} placeholder="123 Oak St, Houston, TX 77002" />
              </Field>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Known Medical Conditions / Allergies (Optional)</p>
                <p className="text-xs text-muted-foreground mb-3">
                  This information is used only in emergency situations and will be treated as confidential medical information.
                </p>
                <Field label="Medical Conditions or Allergies" id="medicalNotes">
                  <TextInput id="medicalNotes" value={formData.medicalNotes || ""} onChange={(v) => setField("medicalNotes", v)} placeholder="e.g., penicillin allergy, insulin-dependent diabetic" />
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: Policy Acknowledgments ───────────────────────────────── */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Section 6 — Policy Acknowledgments
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Please read each policy and check the box to initial your acknowledgment and agreement.
                You must initial all sections before proceeding to sign.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {allInitials.map(({ key, label }) => (
                <InitialBlock
                  key={key}
                  id={key}
                  label={label}
                  checked={!!sectionInitials[key]}
                  onChange={(v) => setInitial(key, v)}
                />
              ))}
              {!allInitialed && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2 mt-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Please initial all sections above before continuing.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: Signature ─────────────────────────────────────────────── */}
        {step === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pen className="w-5 h-5" />
                Section 7 — Electronic Signature & Certification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-muted/40 rounded-md p-4 text-sm space-y-2">
                <p className="font-medium">Certification Statement</p>
                <p className="text-sm text-muted-foreground">
                  By signing below, I certify under penalty of perjury that:
                </p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>All information provided in this packet is true and complete to the best of my knowledge.</li>
                  <li>I have read, understand, and agree to all policies and acknowledgments initialed above.</li>
                  <li>I understand that falsification of any information may result in immediate termination and may constitute criminal fraud.</li>
                  <li>This electronic signature constitutes my legal signature and is binding pursuant to the Texas E-Sign Act (Tex. Bus. & Com. Code §322) and the federal ESIGN Act (15 U.S.C. §7001).</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Printed Full Name" id="printedName" required>
                  <TextInput
                    id="printedName"
                    value={formData.printedName || `${formData.firstName || ""} ${formData.lastName || ""}`.trim()}
                    onChange={(v) => setField("printedName", v)}
                    placeholder="Jane Smith"
                    required
                  />
                </Field>
                <Field label="Date" id="signatureDate">
                  <Input
                    id="signatureDate"
                    data-testid="input-signatureDate"
                    type="date"
                    value={formData.signatureDate || new Date().toISOString().split("T")[0]}
                    onChange={(e) => setField("signatureDate", e.target.value)}
                  />
                </Field>
              </div>
              <div>
                <Label className="text-sm mb-2 block">
                  Draw Your Signature <span className="text-destructive">*</span>
                </Label>
                <SignatureCanvas onChange={setSignatureData} />
              </div>
              {!allInitialed && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  You must go back and initial all policy sections before signing.
                </div>
              )}
              <Button
                className="w-full"
                size="lg"
                data-testid="button-submit-packet"
                disabled={!canSubmit || submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? "Submitting…" : "Submit & Sign Packet"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Your IP address, timestamp, and signature are recorded as a verifiable audit trail of this acknowledgment.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={step === 0}
            data-testid="button-prev-step"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button onClick={goNext} data-testid="button-next-step">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {/* Legal footer */}
        <div className="text-xs text-muted-foreground text-center space-y-1 pt-4">
          <p>This packet is processed and stored securely in compliance with Texas and federal law.</p>
          <p>Texas Private Security Act · Occupations Code Chapter 1702 · 37 TAC Part 1, Chapter 35</p>
        </div>
      </div>
    </div>
  );
}
