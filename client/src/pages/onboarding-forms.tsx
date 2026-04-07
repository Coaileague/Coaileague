import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, ChevronRight, ChevronLeft, Save, Send, Upload,
  AlertCircle, FileText, Shield, Banknote, UserCheck, IdCard, Pen, X,
  RotateCcw, Info, Lock, Check
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface W4Data {
  firstName: string; middleName: string; lastName: string;
  ssn4: string; dob: string;
  address: string; city: string; state: string; zip: string;
  filingStatus: string; additionalWithholding: string;
  claimExempt: boolean; multipleJobs: boolean; dependentsAmount: string;
  otherIncome: string; deductions: string;
}

interface I9Data {
  citizenshipStatus: string;
  documentListType: string;
  listADocType: string; listADocNumber: string; listAExpiry: string; listAIssuer: string;
  listBDocType: string; listBDocNumber: string; listBExpiry: string; listBIssuer: string;
  listCDocType: string; listCDocNumber: string; listCExpiry: string; listCIssuer: string;
  preparer: string; preparerAddress: string;
}

interface DirectDepositData {
  bankName: string; accountType: string;
  routingNumber: string; accountNumber: string; confirmAccountNumber: string;
  depositPercent: string;
}

interface OfferLetterData {
  readConfirmed: boolean; termsAccepted: boolean; atWillConfirmed: boolean;
  arbitrationAccepted: boolean;
  startDate: string; position: string; compensation: string;
}

interface DocumentsData {
  // Government-issued photo ID (I-9 List B/A)
  idFront: string; idBack: string; secondaryDoc: string;
  idFrontName: string; idBackName: string; secondaryDocName: string;
  // Guard card / PSB license (security industry requirement)
  guardCardNumber: string;
  guardCardIssueDate: string;
  guardCardExpiryDate: string;
  licenseType: string; // 'level2_unarmed' | 'level3_armed' | 'level4_ppo'
  guardCardScan: string;
  guardCardScanName: string;
  // State-issued ID (separate scans for both sides)
  stateIdFront: string;
  stateIdFrontName: string;
  stateIdBack: string;
  stateIdBackName: string;
  // Social Security Card
  socialSecurityCard: string;
  socialSecurityCardName: string;
  // Pay classification — drives W-4 vs W-9 routing
  compliancePayType: string; // 'w2' | '1099'
}

interface SignatureData {
  fullName: string; signedAt: string;
  drawDataUrl: string; signatureType: "typed" | "drawn";
}

interface FormPacket {
  w4: W4Data; i9: I9Data; directDeposit: DirectDepositData;
  offerLetter: OfferLetterData; documents: DocumentsData;
  currentStep: number;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_PACKET: FormPacket = {
  w4: {
    firstName: "", middleName: "", lastName: "", ssn4: "", dob: "",
    address: "", city: "", state: "", zip: "",
    filingStatus: "", additionalWithholding: "", claimExempt: false,
    multipleJobs: false, dependentsAmount: "", otherIncome: "", deductions: "",
  },
  i9: {
    citizenshipStatus: "", documentListType: "list-a",
    listADocType: "", listADocNumber: "", listAExpiry: "", listAIssuer: "",
    listBDocType: "", listBDocNumber: "", listBExpiry: "", listBIssuer: "",
    listCDocType: "", listCDocNumber: "", listCExpiry: "", listCIssuer: "",
    preparer: "", preparerAddress: "",
  },
  directDeposit: {
    bankName: "", accountType: "", routingNumber: "", accountNumber: "",
    confirmAccountNumber: "", depositPercent: "100",
  },
  offerLetter: {
    readConfirmed: false, termsAccepted: false, atWillConfirmed: false,
    arbitrationAccepted: false, startDate: "", position: "", compensation: "",
  },
  documents: {
    idFront: "", idBack: "", secondaryDoc: "",
    idFrontName: "", idBackName: "", secondaryDocName: "",
    guardCardNumber: "", guardCardIssueDate: "", guardCardExpiryDate: "",
    licenseType: "", guardCardScan: "", guardCardScanName: "",
    stateIdFront: "", stateIdFrontName: "", stateIdBack: "", stateIdBackName: "",
    socialSecurityCard: "", socialSecurityCardName: "",
    compliancePayType: "w2",
  },
  currentStep: 0,
};

const INITIAL_SIG: SignatureData = {
  fullName: "", signedAt: "", drawDataUrl: "", signatureType: "typed",
};

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: "w4",           icon: FileText,   label: "Tax Withholding (W-4)",      short: "W-4" },
  { id: "i9",           icon: Shield,     label: "Work Authorization (I-9)",    short: "I-9" },
  { id: "directDeposit",icon: Banknote,   label: "Direct Deposit",             short: "Direct Deposit" },
  { id: "offerLetter",  icon: UserCheck,  label: "Employment Agreement",       short: "Offer Letter" },
  { id: "documents",    icon: IdCard,     label: "Identity Documents",         short: "Documents" },
];

// ─── Required field checker ───────────────────────────────────────────────────

function isStepComplete(step: number, packet: FormPacket, sig: SignatureData): boolean {
  switch (step) {
    case 0: {
      const w = packet.w4;
      return !!(w.firstName && w.lastName && w.ssn4?.length === 4 && w.dob && w.address && w.city && w.state && w.zip && w.filingStatus);
    }
    case 1: {
      const i = packet.i9;
      if (!i.citizenshipStatus) return false;
      if (i.documentListType === "list-a") return !!(i.listADocType && i.listADocNumber);
      return !!(i.listBDocType && i.listBDocNumber && i.listCDocType && i.listCDocNumber);
    }
    case 2: {
      const d = packet.directDeposit;
      return !!(d.bankName && d.accountType && d.routingNumber?.length === 9 && d.accountNumber && d.accountNumber === d.confirmAccountNumber);
    }
    case 3: {
      const o = packet.offerLetter;
      return !!(o.readConfirmed && o.termsAccepted && o.atWillConfirmed);
    }
    case 4: {
      const d = packet.documents;
      // Guard card number + expiry required; at least one ID document required
      return !!(d.idFront && d.guardCardNumber && d.guardCardExpiryDate && d.licenseType);
    }
    default: return false;
  }
}

// ─── Required label component ─────────────────────────────────────────────────

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> {msg}
    </p>
  );
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

function SignaturePad({ sig, onChange }: { sig: SignatureData; onChange: (s: SignatureData) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
  };

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#ffc83c";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
  }, []);

  const endDraw = useCallback(() => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    onChange({ ...sig, drawDataUrl: dataUrl, signatureType: "drawn", signedAt: new Date().toISOString() });
  }, [sig, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", endDraw);
    return () => {
      canvas.removeEventListener("mousedown", startDraw);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", endDraw);
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", endDraw);
    };
  }, [startDraw, draw, endDraw]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange({ ...sig, drawDataUrl: "", signatureType: "drawn", signedAt: "" });
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={sig.signatureType}
        onValueChange={(v) => onChange({ ...sig, signatureType: v as "typed" | "drawn" })}
      >
        <TabsList className="mb-2">
          <TabsTrigger value="typed" data-testid="sig-tab-type"><Pen className="w-4 h-4 mr-1" />Type</TabsTrigger>
          <TabsTrigger value="drawn" data-testid="sig-tab-draw"><Pen className="w-4 h-4 mr-1" />Draw</TabsTrigger>
        </TabsList>

        <TabsContent value="typed">
          <div className="space-y-2">
            <Label>Full Legal Name<Req /></Label>
            <Input
              data-testid="input-sig-name"
              placeholder="Type your full legal name"
              value={sig.fullName}
              onChange={(e) => onChange({ ...sig, fullName: e.target.value, signedAt: new Date().toISOString(), signatureType: "typed" })}
              className="font-serif text-lg"
            />
            {sig.fullName && (
              <div className="border rounded-md p-4 bg-muted/30 mt-2">
                <p className="text-xs text-muted-foreground mb-1">Signature preview</p>
                <p className="font-serif text-2xl text-primary italic">{sig.fullName}</p>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Signed electronically — {new Date().toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="drawn">
          <div className="space-y-2">
            <Label>Draw your signature<Req /></Label>
            <div className="relative border rounded-md bg-muted/10 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={500}
                height={150}
                className="w-full touch-none cursor-crosshair"
                data-testid="canvas-signature"
                style={{ maxHeight: 150 }}
              />
              {!sig.drawDataUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-muted-foreground text-sm">Sign here with your mouse or finger</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={clearCanvas} data-testid="button-clear-sig">
                <RotateCcw className="w-3 h-3 mr-1" /> Clear
              </Button>
              {sig.drawDataUrl && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Signature captured
                </p>
              )}
            </div>
            <div className="mt-2">
              <Label>Full Legal Name<Req /></Label>
              <Input
                data-testid="input-sig-name-drawn"
                placeholder="Type your full legal name"
                value={sig.fullName}
                onChange={(e) => onChange({ ...sig, fullName: e.target.value, signedAt: new Date().toISOString() })}
                className="mt-1"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          By signing, you certify that the information provided is accurate and complete to the best of your knowledge.
          This electronic signature has the same legal effect as a handwritten signature.
        </span>
      </div>
    </div>
  );
}

// ─── File Upload Component ────────────────────────────────────────────────────

function FileUploadField({
  label, required, value, fileName, onChange, testId,
}: {
  label: string; required?: boolean;
  value: string; fileName: string;
  onChange: (dataUrl: string, name: string) => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      onChange(e.target?.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-1">
      <Label>{label}{required && <Req />}</Label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          value ? "bg-green-500/5 border-green-500/40" : ""
        )}
        onClick={() => inputRef.current?.click()}
        data-testid={testId}
      >
        {value ? (
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div className="text-left">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 truncate max-w-[200px]">{fileName}</p>
              <p className="text-xs text-muted-foreground">Click to replace</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-2"
              onClick={(e) => { e.stopPropagation(); onChange("", ""); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Click or drag & drop to upload</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF — max 10 MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
    </div>
  );
}

// ─── Step forms ───────────────────────────────────────────────────────────────

function W4Form({ data, onChange, errors, onBlur }: {
  data: W4Data;
  onChange: (d: Partial<W4Data>) => void;
  errors: Record<string, string>;
  onBlur: (field: string, val: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Employee's Withholding Certificate</h3>
        <p className="text-sm text-muted-foreground">
          Complete this form to inform your employer how much federal income tax to withhold from your pay.
          See the IRS W-4 instructions for full details.
        </p>
      </div>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Step 1 — Personal Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>First Name<Req /></Label>
            <Input data-testid="input-w4-first-name" value={data.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              onBlur={(e) => onBlur("w4.firstName", e.target.value)}
              placeholder="First name" />
            <FieldError msg={errors["w4.firstName"]} />
          </div>
          <div className="space-y-1">
            <Label>Middle Initial</Label>
            <Input data-testid="input-w4-middle" value={data.middleName}
              onChange={(e) => onChange({ middleName: e.target.value })}
              placeholder="M.I." maxLength={1} />
          </div>
          <div className="space-y-1">
            <Label>Last Name<Req /></Label>
            <Input data-testid="input-w4-last-name" value={data.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              onBlur={(e) => onBlur("w4.lastName", e.target.value)}
              placeholder="Last name" />
            <FieldError msg={errors["w4.lastName"]} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Social Security Number — Last 4 Digits<Req /></Label>
            <Input data-testid="input-w4-ssn4" value={data.ssn4}
              onChange={(e) => onChange({ ssn4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              onBlur={(e) => onBlur("w4.ssn4", e.target.value)}
              placeholder="••••" maxLength={4} type="password"
              className="tracking-widest" />
            <p className="text-xs text-muted-foreground">Only the last 4 digits are required for verification</p>
            <FieldError msg={errors["w4.ssn4"]} />
          </div>
          <div className="space-y-1">
            <Label>Date of Birth<Req /></Label>
            <Input data-testid="input-w4-dob" value={data.dob} type="date"
              onChange={(e) => onChange({ dob: e.target.value })}
              onBlur={(e) => onBlur("w4.dob", e.target.value)} />
            <FieldError msg={errors["w4.dob"]} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Home Address (Street, Apt/Unit)<Req /></Label>
          <Input data-testid="input-w4-address" value={data.address}
            onChange={(e) => onChange({ address: e.target.value })}
            onBlur={(e) => onBlur("w4.address", e.target.value)}
            placeholder="123 Main St, Apt 4B" />
          <FieldError msg={errors["w4.address"]} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 sm:col-span-1 space-y-1">
            <Label>City<Req /></Label>
            <Input data-testid="input-w4-city" value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
              onBlur={(e) => onBlur("w4.city", e.target.value)}
              placeholder="City" />
            <FieldError msg={errors["w4.city"]} />
          </div>
          <div className="space-y-1">
            <Label>State<Req /></Label>
            <Select value={data.state} onValueChange={(v) => onChange({ state: v })}>
              <SelectTrigger data-testid="select-w4-state">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError msg={errors["w4.state"]} />
          </div>
          <div className="space-y-1">
            <Label>ZIP Code<Req /></Label>
            <Input data-testid="input-w4-zip" value={data.zip}
              onChange={(e) => onChange({ zip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
              onBlur={(e) => onBlur("w4.zip", e.target.value)}
              placeholder="00000" maxLength={5} />
            <FieldError msg={errors["w4.zip"]} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Filing Status<Req /></Label>
          <RadioGroup value={data.filingStatus} onValueChange={(v) => onChange({ filingStatus: v })} className="flex flex-wrap gap-4">
            {[
              { value: "single", label: "Single or Married Filing Separately" },
              { value: "married", label: "Married Filing Jointly" },
              { value: "hoh", label: "Head of Household" },
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2">
                <RadioGroupItem value={opt.value} id={`filing-${opt.value}`} data-testid={`radio-filing-${opt.value}`} />
                <Label htmlFor={`filing-${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
          <FieldError msg={errors["w4.filingStatus"]} />
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Step 2 — Multiple Jobs (Optional)</h4>
        <div className="flex items-start space-x-3 rounded-md border p-3">
          <Checkbox id="multipleJobs" checked={data.multipleJobs}
            onCheckedChange={(c) => onChange({ multipleJobs: !!c })}
            data-testid="checkbox-multiple-jobs" />
          <Label htmlFor="multipleJobs" className="font-normal cursor-pointer leading-snug">
            Check here if you (or your spouse) have multiple jobs at the same time. See IRS W-4 Step 2 instructions.
          </Label>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Step 3 — Dependents (Optional)</h4>
        <div className="space-y-1">
          <Label>Total Dependents Amount ($)</Label>
          <Input data-testid="input-w4-dependents" value={data.dependentsAmount}
            onChange={(e) => onChange({ dependentsAmount: e.target.value })}
            placeholder="0.00" type="number" min="0" />
          <p className="text-xs text-muted-foreground">Qualifying children under 17 × $2,000 + other dependents × $500</p>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Step 4 — Other Adjustments (Optional)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Other Income ($)</Label>
            <Input data-testid="input-w4-other-income" value={data.otherIncome}
              onChange={(e) => onChange({ otherIncome: e.target.value })}
              placeholder="0.00" type="number" min="0" />
          </div>
          <div className="space-y-1">
            <Label>Deductions ($)</Label>
            <Input data-testid="input-w4-deductions" value={data.deductions}
              onChange={(e) => onChange({ deductions: e.target.value })}
              placeholder="0.00" type="number" min="0" />
          </div>
          <div className="space-y-1">
            <Label>Additional Withholding per Period ($)</Label>
            <Input data-testid="input-w4-extra-withholding" value={data.additionalWithholding}
              onChange={(e) => onChange({ additionalWithholding: e.target.value })}
              placeholder="0.00" type="number" min="0" />
          </div>
        </div>
        <div className="flex items-start space-x-3 rounded-md border p-3">
          <Checkbox id="claimExempt" checked={data.claimExempt}
            onCheckedChange={(c) => onChange({ claimExempt: !!c })}
            data-testid="checkbox-exempt" />
          <Label htmlFor="claimExempt" className="font-normal cursor-pointer leading-snug">
            I claim exemption from withholding. I had no federal income tax liability last year and expect none this year.
          </Label>
        </div>
      </section>
    </div>
  );
}

function I9Form({ data, onChange, errors, onBlur }: {
  data: I9Data;
  onChange: (d: Partial<I9Data>) => void;
  errors: Record<string, string>;
  onBlur: (field: string, val: string) => void;
}) {
  const isListA = data.documentListType === "list-a";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Employment Eligibility Verification</h3>
        <p className="text-sm text-muted-foreground">
          Federal law requires employers to verify identity and work authorization.
          Complete Section 1 before your first day of employment.
        </p>
      </div>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Section 1 — Employee Information</h4>
        <div className="space-y-2">
          <Label>Citizenship / Immigration Status<Req /></Label>
          <RadioGroup value={data.citizenshipStatus} onValueChange={(v) => onChange({ citizenshipStatus: v })} className="space-y-2">
            {[
              { value: "us_citizen", label: "A citizen of the United States" },
              { value: "us_national", label: "A noncitizen national of the United States" },
              { value: "lawful_permanent_resident", label: "A lawful permanent resident" },
              { value: "alien_authorized", label: "An alien authorized to work (until expiration, if applicable)" },
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 rounded-md border p-3">
                <RadioGroupItem value={opt.value} id={`status-${opt.value}`} data-testid={`radio-i9-${opt.value}`} />
                <Label htmlFor={`status-${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
          <FieldError msg={errors["i9.citizenshipStatus"]} />
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Section 2 — Document Verification</h4>
        <div className="flex items-start gap-2 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Provide either <strong>one List A document</strong> (establishes both identity and employment authorization)
            OR <strong>one List B document</strong> (identity) AND <strong>one List C document</strong> (authorization).
          </span>
        </div>

        <RadioGroup value={data.documentListType} onValueChange={(v) => onChange({ documentListType: v })} className="flex gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="list-a" id="doc-list-a" data-testid="radio-list-a" />
            <Label htmlFor="doc-list-a" className="font-normal cursor-pointer">List A only</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="list-bc" id="doc-list-bc" data-testid="radio-list-bc" />
            <Label htmlFor="doc-list-bc" className="font-normal cursor-pointer">List B + List C</Label>
          </div>
        </RadioGroup>

        {isListA ? (
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase">List A Document</p>
            <div className="space-y-1">
              <Label>Document Type<Req /></Label>
              <Select value={data.listADocType} onValueChange={(v) => onChange({ listADocType: v })}>
                <SelectTrigger data-testid="select-list-a-type">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us_passport">U.S. Passport</SelectItem>
                  <SelectItem value="us_passport_card">U.S. Passport Card</SelectItem>
                  <SelectItem value="perm_resident_card">Permanent Resident Card (I-551)</SelectItem>
                  <SelectItem value="foreign_passport_i94">Foreign Passport with I-94</SelectItem>
                  <SelectItem value="employment_auth_doc">Employment Authorization Document (I-766)</SelectItem>
                  <SelectItem value="other_list_a">Other List A Document</SelectItem>
                </SelectContent>
              </Select>
              <FieldError msg={errors["i9.listADocType"]} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Document Number<Req /></Label>
                <Input data-testid="input-list-a-number" value={data.listADocNumber}
                  onChange={(e) => onChange({ listADocNumber: e.target.value })}
                  onBlur={(e) => onBlur("i9.listADocNumber", e.target.value)}
                  placeholder="Document #" />
                <FieldError msg={errors["i9.listADocNumber"]} />
              </div>
              <div className="space-y-1">
                <Label>Expiration Date</Label>
                <Input data-testid="input-list-a-expiry" value={data.listAExpiry} type="date"
                  onChange={(e) => onChange({ listAExpiry: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Issuing Authority</Label>
                <Input data-testid="input-list-a-issuer" value={data.listAIssuer}
                  onChange={(e) => onChange({ listAIssuer: e.target.value })}
                  placeholder="e.g. U.S. State Dept." />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase">List B — Identity Document</p>
              <div className="space-y-1">
                <Label>Document Type<Req /></Label>
                <Select value={data.listBDocType} onValueChange={(v) => onChange({ listBDocType: v })}>
                  <SelectTrigger data-testid="select-list-b-type">
                    <SelectValue placeholder="Select List B document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drivers_license">Driver's License</SelectItem>
                    <SelectItem value="state_id">State-Issued ID Card</SelectItem>
                    <SelectItem value="school_id">School ID with Photo</SelectItem>
                    <SelectItem value="military_id">Military ID Card</SelectItem>
                    <SelectItem value="other_list_b">Other List B Document</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError msg={errors["i9.listBDocType"]} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Document Number<Req /></Label>
                  <Input data-testid="input-list-b-number" value={data.listBDocNumber}
                    onChange={(e) => onChange({ listBDocNumber: e.target.value })}
                    onBlur={(e) => onBlur("i9.listBDocNumber", e.target.value)}
                    placeholder="Document #" />
                  <FieldError msg={errors["i9.listBDocNumber"]} />
                </div>
                <div className="space-y-1">
                  <Label>Expiration Date</Label>
                  <Input data-testid="input-list-b-expiry" value={data.listBExpiry} type="date"
                    onChange={(e) => onChange({ listBExpiry: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Issuing State/Authority</Label>
                  <Input data-testid="input-list-b-issuer" value={data.listBIssuer}
                    onChange={(e) => onChange({ listBIssuer: e.target.value })}
                    placeholder="e.g. CA DMV" />
                </div>
              </div>
            </div>
            <div className="rounded-md border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase">List C — Work Authorization Document</p>
              <div className="space-y-1">
                <Label>Document Type<Req /></Label>
                <Select value={data.listCDocType} onValueChange={(v) => onChange({ listCDocType: v })}>
                  <SelectTrigger data-testid="select-list-c-type">
                    <SelectValue placeholder="Select List C document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="social_security">Social Security Card (unrestricted)</SelectItem>
                    <SelectItem value="birth_certificate">Certified U.S. Birth Certificate</SelectItem>
                    <SelectItem value="us_citizen_id">U.S. Citizen ID Card (I-197)</SelectItem>
                    <SelectItem value="native_american">Native American Tribal Document</SelectItem>
                    <SelectItem value="other_list_c">Other List C Document</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError msg={errors["i9.listCDocType"]} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Document Number<Req /></Label>
                  <Input data-testid="input-list-c-number" value={data.listCDocNumber}
                    onChange={(e) => onChange({ listCDocNumber: e.target.value })}
                    onBlur={(e) => onBlur("i9.listCDocNumber", e.target.value)}
                    placeholder="Document #" />
                  <FieldError msg={errors["i9.listCDocNumber"]} />
                </div>
                <div className="space-y-1">
                  <Label>Expiration Date</Label>
                  <Input data-testid="input-list-c-expiry" value={data.listCExpiry} type="date"
                    onChange={(e) => onChange({ listCExpiry: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Issuing Authority</Label>
                  <Input data-testid="input-list-c-issuer" value={data.listCIssuer}
                    onChange={(e) => onChange({ listCIssuer: e.target.value })}
                    placeholder="e.g. SSA" />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DirectDepositForm({ data, onChange, errors, onBlur }: {
  data: DirectDepositData;
  onChange: (d: Partial<DirectDepositData>) => void;
  errors: Record<string, string>;
  onBlur: (field: string, val: string) => void;
}) {
  const routingValid = data.routingNumber.length === 9 && /^\d{9}$/.test(data.routingNumber);
  const accountsMatch = data.accountNumber === data.confirmAccountNumber && data.accountNumber.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Direct Deposit Authorization</h3>
        <p className="text-sm text-muted-foreground">
          Authorize us to electronically deposit your wages into your bank account. Your information is encrypted and stored securely.
        </p>
      </div>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Bank Account Information</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Bank / Financial Institution Name<Req /></Label>
            <Input data-testid="input-dd-bank-name" value={data.bankName}
              onChange={(e) => onChange({ bankName: e.target.value })}
              onBlur={(e) => onBlur("dd.bankName", e.target.value)}
              placeholder="e.g. Chase, Bank of America" />
            <FieldError msg={errors["dd.bankName"]} />
          </div>
          <div className="space-y-1">
            <Label>Account Type<Req /></Label>
            <RadioGroup value={data.accountType} onValueChange={(v) => onChange({ accountType: v })} className="flex gap-4 pt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="checking" id="acct-checking" data-testid="radio-checking" />
                <Label htmlFor="acct-checking" className="font-normal cursor-pointer">Checking</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="savings" id="acct-savings" data-testid="radio-savings" />
                <Label htmlFor="acct-savings" className="font-normal cursor-pointer">Savings</Label>
              </div>
            </RadioGroup>
            <FieldError msg={errors["dd.accountType"]} />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Routing Number<Req /></Label>
          <div className="relative">
            <Input data-testid="input-dd-routing" value={data.routingNumber}
              onChange={(e) => onChange({ routingNumber: e.target.value.replace(/\D/g, "").slice(0, 9) })}
              onBlur={(e) => onBlur("dd.routingNumber", e.target.value)}
              placeholder="9-digit routing number" maxLength={9} />
            {data.routingNumber.length > 0 && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                {routingValid
                  ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                  : <AlertCircle className="w-4 h-4 text-red-500" />}
              </div>
            )}
          </div>
          {data.routingNumber.length > 0 && !routingValid && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Routing number must be exactly 9 digits
            </p>
          )}
          <FieldError msg={errors["dd.routingNumber"]} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Account Number<Req /></Label>
            <Input data-testid="input-dd-account" value={data.accountNumber}
              onChange={(e) => onChange({ accountNumber: e.target.value.replace(/\D/g, "") })}
              onBlur={(e) => onBlur("dd.accountNumber", e.target.value)}
              placeholder="Account number" type="password" />
            <FieldError msg={errors["dd.accountNumber"]} />
          </div>
          <div className="space-y-1">
            <Label>Confirm Account Number<Req /></Label>
            <div className="relative">
              <Input data-testid="input-dd-account-confirm" value={data.confirmAccountNumber}
                onChange={(e) => onChange({ confirmAccountNumber: e.target.value.replace(/\D/g, "") })}
                onBlur={(e) => onBlur("dd.confirmAccountNumber", e.target.value)}
                placeholder="Re-enter account number" />
              {data.confirmAccountNumber.length > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {accountsMatch
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
              )}
            </div>
            {data.confirmAccountNumber.length > 0 && !accountsMatch && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Account numbers do not match
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Deposit Percentage (%)</Label>
          <Input data-testid="input-dd-percent" value={data.depositPercent}
            onChange={(e) => onChange({ depositPercent: e.target.value })}
            placeholder="100" type="number" min="1" max="100" />
          <p className="text-xs text-muted-foreground">Enter 100 to deposit your entire paycheck to this account</p>
        </div>

        <div className="flex items-start gap-2 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Your banking information is encrypted with AES-256 and never stored in plain text.
            We use this information solely to process your payroll via ACH transfer.
          </span>
        </div>
      </section>
    </div>
  );
}

function OfferLetterForm({ data, onChange, employeeName }: {
  data: OfferLetterData;
  onChange: (d: Partial<OfferLetterData>) => void;
  employeeName?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Employment Agreement</h3>
        <p className="text-sm text-muted-foreground">
          Please read the following employment agreement carefully before accepting.
        </p>
      </div>

      <div className="rounded-md border bg-muted/10 p-6 space-y-4 text-sm leading-relaxed max-h-80 overflow-y-auto">
        <p className="font-semibold text-base">EMPLOYMENT OFFER LETTER & AGREEMENT</p>
        <p>
          Dear {employeeName || "Team Member"},
        </p>
        <p>
          We are pleased to offer you employment with Acme Security Services ("Company").
          This letter outlines the terms and conditions of your employment.
        </p>
        <p><strong>Position:</strong> Security Officer / Guard</p>
        <p><strong>Start Date:</strong> As agreed upon between you and your supervisor</p>
        <p><strong>Compensation:</strong> As outlined in your assignment details, including applicable overtime per federal and state law</p>
        <p>
          <strong>At-Will Employment:</strong> Your employment with the Company is at-will, meaning either you or the Company
          may terminate the employment relationship at any time, with or without cause, and with or without notice,
          subject to applicable law.
        </p>
        <p>
          <strong>Confidentiality:</strong> As a condition of employment, you agree to maintain the confidentiality
          of all proprietary information, client data, and security protocols encountered during your employment.
        </p>
        <p>
          <strong>Code of Conduct:</strong> You agree to comply with all Company policies, including but not limited to
          the Employee Handbook, Code of Conduct, and any site-specific requirements.
        </p>
        <p>
          <strong>Background Check:</strong> This offer is contingent upon successful completion of a background
          screening and any required licensing verifications.
        </p>
        <p>
          <strong>Dispute Resolution:</strong> Any disputes arising from this agreement shall be resolved through
          binding arbitration in accordance with the American Arbitration Association rules.
        </p>
        <p>
          We look forward to welcoming you to the team. If you have any questions, please contact HR.
        </p>
        <p className="font-semibold">Acme Security Services — Human Resources</p>
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">Acknowledgments</h4>

        {[
          {
            key: "readConfirmed" as keyof OfferLetterData,
            label: "I have read and understood the offer letter above",
            testId: "checkbox-read-confirmed",
            required: true,
          },
          {
            key: "termsAccepted" as keyof OfferLetterData,
            label: "I accept the terms and conditions of this employment offer",
            testId: "checkbox-terms-accepted",
            required: true,
          },
          {
            key: "atWillConfirmed" as keyof OfferLetterData,
            label: "I understand and agree to the at-will nature of my employment",
            testId: "checkbox-atwill",
            required: true,
          },
          {
            key: "arbitrationAccepted" as keyof OfferLetterData,
            label: "I agree to the dispute resolution / arbitration clause",
            testId: "checkbox-arbitration",
            required: false,
          },
        ].map(({ key, label, testId, required }) => (
          <div key={key} className="flex items-start space-x-3 rounded-md border p-3">
            <Checkbox
              id={key}
              checked={!!data[key]}
              onCheckedChange={(c) => onChange({ [key]: !!c } as any)}
              data-testid={testId}
            />
            <Label htmlFor={key} className="font-normal cursor-pointer leading-snug">
              {label}{required && <Req />}
            </Label>
          </div>
        ))}
      </section>
    </div>
  );
}

function DocumentsForm({ data, onChange }: {
  data: DocumentsData;
  onChange: (d: Partial<DocumentsData>) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Security License &amp; Identity Documents</h3>
        <p className="text-sm text-muted-foreground">
          Upload clear, legible photos or scans of all required documents.
          California security regulations require a valid guard card on file before your first shift.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-3 text-xs">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span className="text-foreground">
          Your documents are encrypted and stored in a secure compliance vault. They are used solely for
          identity verification, I-9 compliance, and California Guard Card verification.
        </span>
      </div>

      {/* Guard Card / PSB License — REQUIRED */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
          Guard Card / PSB License (Required)
        </h4>

        <div className="space-y-1">
          <Label>License Classification<span className="text-red-500 ml-0.5">*</span></Label>
          <Select value={data.licenseType} onValueChange={(v) => onChange({ licenseType: v })}>
            <SelectTrigger data-testid="select-license-type">
              <SelectValue placeholder="Select license type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="level2_unarmed">Level II — Unarmed Guard</SelectItem>
              <SelectItem value="level3_armed">Level III — Armed Guard</SelectItem>
              <SelectItem value="level4_ppo">Level IV — Personal Protection Officer (PPO)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Guard Card Number<span className="text-red-500 ml-0.5">*</span></Label>
            <Input
              data-testid="input-guard-card-number"
              value={data.guardCardNumber}
              onChange={(e) => onChange({ guardCardNumber: e.target.value })}
              placeholder="e.g. G-XXXXXXXX"
            />
          </div>
          <div className="space-y-1">
            <Label>Issue Date</Label>
            <Input
              data-testid="input-guard-card-issue-date"
              type="date"
              value={data.guardCardIssueDate}
              onChange={(e) => onChange({ guardCardIssueDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Expiry Date<span className="text-red-500 ml-0.5">*</span></Label>
            <Input
              data-testid="input-guard-card-expiry"
              type="date"
              value={data.guardCardExpiryDate}
              onChange={(e) => onChange({ guardCardExpiryDate: e.target.value })}
            />
          </div>
        </div>

        <FileUploadField
          label="Guard Card Scan (Front)"
          value={data.guardCardScan}
          fileName={data.guardCardScanName}
          onChange={(v, n) => onChange({ guardCardScan: v, guardCardScanName: n })}
          testId="upload-guard-card"
        />
      </section>

      {/* State-Issued Photo ID — Separate from I-9 already captured */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
          State-Issued Photo ID (Driver's License or State ID)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FileUploadField
            label="State ID — Front"
            required
            value={data.stateIdFront}
            fileName={data.stateIdFrontName}
            onChange={(v, n) => onChange({ stateIdFront: v, stateIdFrontName: n })}
            testId="upload-state-id-front"
          />
          <FileUploadField
            label="State ID — Back"
            value={data.stateIdBack}
            fileName={data.stateIdBackName}
            onChange={(v, n) => onChange({ stateIdBack: v, stateIdBackName: n })}
            testId="upload-state-id-back"
          />
        </div>
      </section>

      {/* Social Security Card */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
          Social Security Card
        </h4>
        <FileUploadField
          label="Social Security Card (Front)"
          value={data.socialSecurityCard}
          fileName={data.socialSecurityCardName}
          onChange={(v, n) => onChange({ socialSecurityCard: v, socialSecurityCardName: n })}
          testId="upload-ssn-card"
        />
        <p className="text-xs text-muted-foreground">
          Only the card face is required. Do not photograph the back. Stored encrypted and never transmitted externally.
        </p>
      </section>

      {/* Employment Classification — drives W-4 vs W-9 */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
          Employment Classification
        </h4>
        <div className="space-y-1">
          <Label>Pay Classification<span className="text-red-500 ml-0.5">*</span></Label>
          <p className="text-xs text-muted-foreground mb-2">
            This determines your tax form routing. Most officers are W-2 employees.
            Select 1099 only if you are an independent contractor arrangement.
          </p>
          <RadioGroup
            value={data.compliancePayType}
            onValueChange={(v) => onChange({ compliancePayType: v })}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="w2" id="pay-w2" data-testid="radio-pay-w2" />
              <Label htmlFor="pay-w2" className="font-normal cursor-pointer">W-2 Employee</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="1099" id="pay-1099" data-testid="radio-pay-1099" />
              <Label htmlFor="pay-1099" className="font-normal cursor-pointer">1099 Independent Contractor</Label>
            </div>
          </RadioGroup>
        </div>
      </section>

      {/* Government-Issued Photo ID — for I-9 */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
          Government-Issued Photo ID (for I-9 verification)
        </h4>
        <FileUploadField
          label="Government ID — Front"
          required
          value={data.idFront}
          fileName={data.idFrontName}
          onChange={(v, n) => onChange({ idFront: v, idFrontName: n })}
          testId="upload-id-front"
        />
        <FileUploadField
          label="Government ID — Back"
          value={data.idBack}
          fileName={data.idBackName}
          onChange={(v, n) => onChange({ idBack: v, idBackName: n })}
          testId="upload-id-back"
        />
        <FileUploadField
          label="Secondary Document (Optional)"
          value={data.secondaryDoc}
          fileName={data.secondaryDocName}
          onChange={(v, n) => onChange({ secondaryDoc: v, secondaryDocName: n })}
          testId="upload-secondary-doc"
        />
        <p className="text-xs text-muted-foreground">
          Acceptable: Driver's license, U.S. passport, military ID, permanent resident card
        </p>
      </section>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function OnboardingFormsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [packet, setPacket] = useState<FormPacket>(INITIAL_PACKET);
  const [sig, setSig] = useState<SignatureData>(INITIAL_SIG);
  const [currentStep, setCurrentStep] = useState(0);
  const [touchedSteps, setTouchedSteps] = useState<Set<number>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: draftData, isLoading: loadingDraft } = useQuery<any>({
    queryKey: ["/api/onboarding-forms/draft"],
    retry: false,
  });

  useEffect(() => {
    if (draftData?.draft) {
      const d = draftData.draft;
      if (d.formData) {
        const { currentStep: savedStep, ...rest } = d.formData;
        setPacket((prev) => ({ ...prev, ...rest }));
        if (typeof savedStep === "number") setCurrentStep(savedStep);
      }
      if (d.signatureData) setSig(d.signatureData);
      if (d.status === "completed") setSubmitted(true);
    }
  }, [draftData]);

  const saveDraftMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/onboarding-forms/save-draft", data),
    onSuccess: () => {
      toast({ title: "Progress saved", description: "You can safely close this window and continue later." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save your progress. Please try again.", variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/onboarding-forms/submit", data),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding-forms/draft"] });
      toast({ title: "Submitted successfully!", description: "Your onboarding packet has been received." });
    },
    onError: () => {
      toast({ title: "Submission failed", description: "Please check all required fields and try again.", variant: "destructive" });
    },
  });

  const updateW4 = (d: Partial<W4Data>) => setPacket((prev) => ({ ...prev, w4: { ...prev.w4, ...d } }));
  const updateI9 = (d: Partial<I9Data>) => setPacket((prev) => ({ ...prev, i9: { ...prev.i9, ...d } }));
  const updateDD = (d: Partial<DirectDepositData>) => setPacket((prev) => ({ ...prev, directDeposit: { ...prev.directDeposit, ...d } }));
  const updateOffer = (d: Partial<OfferLetterData>) => setPacket((prev) => ({ ...prev, offerLetter: { ...prev.offerLetter, ...d } }));
  const updateDocs = (d: Partial<DocumentsData>) => setPacket((prev) => ({ ...prev, documents: { ...prev.documents, ...d } }));

  const handleBlur = (field: string, val: string) => {
    if (!val || val.trim() === "") {
      setFieldErrors((prev) => ({ ...prev, [field]: "This field is required" }));
    } else {
      setFieldErrors((prev) => { const e = { ...prev }; delete e[field]; return e; });
    }
  };

  const handleSaveForLater = () => {
    saveDraftMutation.mutate({
      formData: packet,
      signatureData: sig,
      documents: null,
      currentStep,
    });
  };

  const handleNext = () => {
    setTouchedSteps((prev) => new Set([...prev, currentStep]));
    if (!isStepComplete(currentStep, packet, sig)) {
      toast({ title: "Required fields missing", description: "Please complete all required fields before continuing.", variant: "destructive" });
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const allComplete = STEPS.every((_, i) => isStepComplete(i, packet, sig));
  const sigValid = !!(sig.fullName && (sig.signatureType === "typed" || sig.drawDataUrl));

  const handleSubmit = () => {
    if (!allComplete) {
      toast({ title: "Incomplete forms", description: "Please complete all steps before submitting.", variant: "destructive" });
      return;
    }
    if (!sigValid) {
      toast({ title: "Signature required", description: "Please provide your electronic signature before submitting.", variant: "destructive" });
      return;
    }
    submitMutation.mutate({
      formData: packet,
      signatureData: sig,
      documents: {
        // Government-issued photo ID (I-9)
        idFront: packet.documents.idFrontName || null,
        idBack: packet.documents.idBackName || null,
        secondaryDoc: packet.documents.secondaryDocName || null,
        // Guard card / PSB license
        guardCardNumber: packet.documents.guardCardNumber || null,
        guardCardIssueDate: packet.documents.guardCardIssueDate || null,
        guardCardExpiryDate: packet.documents.guardCardExpiryDate || null,
        licenseType: packet.documents.licenseType || null,
        guardCardScan: packet.documents.guardCardScanName || null,
        // State ID
        stateIdFront: packet.documents.stateIdFrontName || null,
        stateIdBack: packet.documents.stateIdBackName || null,
        // Social Security Card
        socialSecurityCard: packet.documents.socialSecurityCardName || null,
        // Pay classification
        compliancePayType: packet.documents.compliancePayType || 'w2',
      },
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Onboarding Complete!</h1>
          <p className="text-muted-foreground">
            Your employment paperwork has been submitted successfully. Your HR team will review your documents and be in touch shortly.
          </p>
          <div className="rounded-md bg-muted/30 p-4 text-left space-y-2 text-sm">
            <p className="font-medium">What happens next:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>HR will verify your identity documents within 1–2 business days</li>
              <li>You'll receive a confirmation email once your paperwork is approved</li>
              <li>Direct deposit setup will be processed for your next pay cycle</li>
              <li>Your W-4 will be submitted to payroll for the correct withholding</li>
            </ul>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Lock className="w-3 h-3 mr-1" />
            Submission recorded with digital signature on {new Date().toLocaleDateString()}
          </Badge>
        </div>
      </div>
    );
  }

  if (loadingDraft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading your forms...</p>
        </div>
      </div>
    );
  }

  const completedCount = STEPS.filter((_, i) => isStepComplete(i, packet, sig)).length;
  const progressPct = Math.round((completedCount / STEPS.length) * 100);
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top header ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-sm text-foreground">Employee Onboarding Packet</h1>
              <p className="text-xs text-muted-foreground">{completedCount} of {STEPS.length} forms complete</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveForLater}
              disabled={saveDraftMutation.isPending}
              data-testid="button-save-for-later">
              <Save className="w-4 h-4 mr-1" />
              {saveDraftMutation.isPending ? "Saving..." : "Save for Later"}
            </Button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="max-w-5xl mx-auto mt-2">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-5xl mx-auto w-full gap-0 sm:gap-6 px-0 sm:px-4 py-4">

        {/* ── Step sidebar ──────────────────────────────────────────── */}
        <aside className="hidden sm:flex flex-col w-56 shrink-0">
          <div className="sticky top-24 z-10 space-y-1">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const complete = isStepComplete(idx, packet, sig);
              const active = idx === currentStep;
              const touched = touchedSteps.has(idx);
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(idx)}
                  data-testid={`step-nav-${step.id}`}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors hover-elevate",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border",
                    complete ? "bg-green-500 border-green-500 text-white" :
                      active ? "border-primary text-primary" :
                        "border-muted-foreground/40 text-muted-foreground"
                  )}>
                    {complete ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-xs font-medium truncate", active && "text-primary")}>
                      {step.label}
                    </p>
                    {touched && !complete && (
                      <p className="text-xs text-red-500 flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" /> Incomplete
                      </p>
                    )}
                    {complete && (
                      <p className="text-xs text-green-600">Complete</p>
                    )}
                  </div>
                </button>
              );
            })}

            {/* All-complete summary */}
            {allComplete && (
              <div className="mt-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 space-y-1">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All forms complete
                </p>
                <p className="text-xs text-muted-foreground">Sign and submit below</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Mobile step indicator ──────────────────────────────────── */}
        <div className="sm:hidden px-4 pb-2 w-full">
          <div className="flex items-center justify-between overflow-x-auto gap-2 pb-1">
            {STEPS.map((step, idx) => {
              const complete = isStepComplete(idx, packet, sig);
              const active = idx === currentStep;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(idx)}
                  className={cn(
                    "flex flex-col items-center gap-1 shrink-0",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                  data-testid={`step-mobile-${step.id}`}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                    complete ? "bg-green-500 border-green-500 text-white" :
                      active ? "border-primary text-primary" :
                        "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {complete ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <span className="text-[10px] text-center w-12 leading-tight">{step.short}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main form area ─────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-4 sm:px-0 space-y-6">
          <div className="rounded-md border bg-card p-6">
            {/* Step label */}
            <div className="flex items-center gap-2 mb-6">
              {(() => {
                const Icon = STEPS[currentStep].icon;
                return <Icon className="w-5 h-5 text-primary" />;
              })()}
              <h2 className="font-semibold text-foreground">{STEPS[currentStep].label}</h2>
              <Badge variant="secondary" className="ml-auto text-xs">Step {currentStep + 1} of {STEPS.length}</Badge>
            </div>

            {/* Form content */}
            {currentStep === 0 && (
              <W4Form data={packet.w4} onChange={updateW4} errors={fieldErrors} onBlur={handleBlur} />
            )}
            {currentStep === 1 && (
              <I9Form data={packet.i9} onChange={updateI9} errors={fieldErrors} onBlur={handleBlur} />
            )}
            {currentStep === 2 && (
              <DirectDepositForm data={packet.directDeposit} onChange={updateDD} errors={fieldErrors} onBlur={handleBlur} />
            )}
            {currentStep === 3 && (
              <OfferLetterForm data={packet.offerLetter} onChange={updateOffer} />
            )}
            {currentStep === 4 && (
              <DocumentsForm data={packet.documents} onChange={updateDocs} />
            )}

            {/* Required field note */}
            <p className="text-xs text-muted-foreground mt-6">
              Fields marked <span className="text-red-500">*</span> are required
            </p>
          </div>

          {/* ── Signature + Submit on last step ─────────────────────── */}
          {isLastStep && (
            <div className="rounded-md border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Pen className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Electronic Signature</h2>
                {!allComplete && (
                  <Badge variant="destructive" className="ml-auto text-xs">Complete all steps first</Badge>
                )}
              </div>

              {!allComplete ? (
                <div className="rounded-md border-2 border-dashed border-muted-foreground/30 p-6 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Complete all {STEPS.length} forms before signing</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {STEPS.map((step, i) => (
                      <Badge
                        key={step.id}
                        variant={isStepComplete(i, packet, sig) ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {isStepComplete(i, packet, sig) ? <Check className="w-3 h-3 mr-1" /> : <Circle className="w-3 h-3 mr-1" />}
                        {step.short}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <SignaturePad sig={sig} onChange={setSig} />
              )}

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!allComplete || !sigValid || submitMutation.isPending}
                data-testid="button-submit-packet"
              >
                {submitMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Onboarding Packet
                  </>
                )}
              </Button>
              {!sigValid && allComplete && (
                <p className="text-xs text-red-500 text-center flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Signature is required to submit
                </p>
              )}
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pb-8">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
              data-testid="button-back"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveForLater}
                disabled={saveDraftMutation.isPending}
                data-testid="button-save-progress"
              >
                <Save className="w-4 h-4 mr-1" />
                {saveDraftMutation.isPending ? "Saving..." : "Save Progress"}
              </Button>

              {!isLastStep && (
                <Button onClick={handleNext} data-testid="button-continue">
                  Continue <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
