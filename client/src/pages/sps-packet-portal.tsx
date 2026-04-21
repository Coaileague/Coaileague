import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Shield, CheckCircle, ChevronRight, ChevronLeft, Pen, Eraser,
  AlertTriangle, FileText, Lock, User, Briefcase, CreditCard, 
  MapPin, Landmark, Signature, Scale, Package, Upload, Info
} from "lucide-react";
import type { SpsDocument } from "@shared/schema/domains/sps";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtendedSpsDocument extends SpsDocument {
  workspaceCompanyName?: string | null;
  workspaceLicenseNumber?: string | null;
}

// ── SignaturePad ──────────────────────────────────────────────────────────────

function SignaturePad({ 
  value, 
  onChange, 
  typeValue, 
  onTypeChange,
  label = "Sign here" 
}: { 
  value: string | null; 
  onChange: (data: string | null) => void;
  typeValue: string;
  onTypeChange: (v: string) => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [useType, setUseType] = useState(false);
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
    ctx.strokeStyle = "#2563EB"; // primary blue
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  };

  const stop = () => {
    if (!drawing) return;
    setDrawing(false);
    onChange(canvasRef.current!.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setUseType(!useType)}
          className="text-xs h-7"
          data-testid="button-toggle-signature-type"
        >
          {useType ? "Draw instead" : "Type instead"}
        </Button>
      </div>

      {useType ? (
        <Input
          value={typeValue}
          onChange={(e) => onTypeChange(e.target.value)}
          placeholder="Type your legal name"
          className="text-xl italic font-serif h-12 border-2 border-primary/20 focus-visible:ring-primary"
          style={{ fontFamily: "'Dancing Script', cursive" }}
          data-testid="input-typed-signature"
        />
      ) : (
        <div className="border-2 border-dashed rounded-md bg-card dark:bg-slate-900 relative overflow-hidden h-32">
          <canvas
            ref={canvasRef}
            width={600}
            height={128}
            className="w-full h-full touch-none cursor-crosshair"
            data-testid="canvas-signature"
            onMouseDown={start}
            onMouseMove={draw}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchMove={draw}
            onTouchEnd={stop}
          />
          {!value && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-slate-300 text-sm select-none">Draw your signature</span>
            </div>
          )}
        </div>
      )}
      
      {!useType && (
        <Button size="sm" variant="outline" onClick={clear} data-testid="button-clear-signature" className="h-7 text-xs">
          <Eraser className="w-3 h-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

// ── Field Helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ 
  number, 
  title, 
  complete 
}: { 
  number: number; 
  title: string; 
  complete?: boolean 
}) {
  return (
    <div className="bg-[#2563EB] text-white p-4 rounded-t-lg flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="bg-card text-[#2563EB] w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm">
          {number}
        </span>
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      {complete && (
        <Badge className="bg-[#16a34a] hover:bg-[#16a34a] border-none text-white gap-1 px-2 py-0.5">
          <CheckCircle className="w-3 h-3" /> Complete
        </Badge>
      )}
    </div>
  );
}

function FormField({ 
  label, 
  required, 
  error, 
  children 
}: { 
  label: string; 
  required?: boolean; 
  error?: boolean; 
  children: React.ReactNode 
}) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-sm ${error ? "text-destructive" : ""}`}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpsPacketPortal() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [signatures, setSignatures] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submittedOk, setSubmittedOk] = useState(false);

  // Load Document
  const { data: doc, isLoading, error } = useQuery<SpsDocument>({
    queryKey: ["/api/public/sps", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/sps/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Document not found or expired");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  // Sync initial data
  useEffect(() => {
    if (doc) {
      setFormData(doc.formData || {});
      setSignatures(doc.signatures || {});
    }
  }, [doc]);

  // Auto-save mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", `/api/public/sps/${token}`, data),
  });

  // Auto-save interval (2 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (token && !submittedOk) {
        saveMutation.mutate({ formData, signatures });
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [token, formData, signatures, submittedOk]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/sps/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formData,
          signatures,
          completionTimestamp: new Date().toISOString()
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submission failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSubmittedOk(true);
      toast({
        title: "Packet Submitted",
        description: `Your documents have been processed successfully. Ref: ${data.documentNumber}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const updateField = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [field]: value
      }
    }));
  };

  const updateSignature = (fieldId: string, data: string | null) => {
    setSignatures(prev => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] || {}),
        svgData: data,
        timestamp: new Date().toISOString(),
      }
    }));
  };

  const updateTypedSignature = (fieldId: string, text: string) => {
    setSignatures(prev => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] || {}),
        typed: text,
        timestamp: new Date().toISOString(),
      }
    }));
  };

  const validateStep = (currentStep: number) => {
    const newErrors: string[] = [];
    const data = formData[`section${currentStep}`] || {};

    if (currentStep === 1) {
      if (!data.dob) newErrors.push("dob");
      if (!data.pob) newErrors.push("pob");
      if (!data.address) newErrors.push("address");
      if (!data.phone) newErrors.push("phone");
      if (!data.email) newErrors.push("email");
    } else if (currentStep === 2) {
      if (!data.position) newErrors.push("position");
      if (!data.site) newErrors.push("site");
      if (!data.uniformSize) newErrors.push("uniformSize");
    } else if (currentStep === 3) {
      if (!data.licenseNumber) newErrors.push("licenseNumber");
      if (!data.licenseType) newErrors.push("licenseType");
      if (!data.licenseExpiry) newErrors.push("licenseExpiry");
    } else if (currentStep === 4) {
      if (!data.ssn4 || data.ssn4.length < 4) newErrors.push("ssn4");
      if (!data.filingStatus) newErrors.push("filingStatus");
    } else if (currentStep === 5) {
      if (!data.citizenshipStatus) newErrors.push("citizenshipStatus");
    } else if (currentStep === 6) {
      if (!data.bankName) newErrors.push("bankName");
      if (!data.routingNumber) newErrors.push("routingNumber");
      if (!data.accountNumber) newErrors.push("accountNumber");
      if (!data.accountType) newErrors.push("accountType");
    } else if (currentStep === 7) {
      if (!signatures.offerLetter?.svgData && !signatures.offerLetter?.typed) newErrors.push("sig_offerLetter");
    } else if (currentStep === 8) {
      if (!data.handbookAck) newErrors.push("handbookAck");
      if (!signatures.handbookAck?.svgData && !signatures.handbookAck?.typed) newErrors.push("sig_handbookAck");
    } else if (currentStep === 9) {
      if (!signatures.drugPolicy?.svgData && !signatures.drugPolicy?.typed) newErrors.push("sig_drugPolicy");
    } else if (currentStep === 10) {
      if (!data.typedName) newErrors.push("typedName");
      if (!signatures.responsibility?.svgData && !signatures.responsibility?.typed) newErrors.push("sig_responsibility");
    } else if (currentStep === 11) {
      if (!data.uniformInitial_shirt) newErrors.push("uniformInitial_shirt");
      if (!data.uniformInitial_pants) newErrors.push("uniformInitial_pants");
      if (!data.uniformInitial_belt) newErrors.push("uniformInitial_belt");
      if (!data.uniformInitial_badge) newErrors.push("uniformInitial_badge");
      if (!data.uniformInitial_cap) newErrors.push("uniformInitial_cap");
      if (!data.deductionAuth) newErrors.push("deductionAuth");
      if (!signatures.uniformReceipt?.svgData && !signatures.uniformReceipt?.typed) newErrors.push("sig_uniformReceipt");
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(s => Math.min(s + 1, 12));
      window.scrollTo(0, 0);
      saveMutation.mutate({ formData, signatures });
    } else {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields marked in red.",
        variant: "destructive"
      });
    }
  };

  const prevStep = () => {
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo(0, 0);
  };

  const handleFileUpload = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFiles(prev => ({ ...prev, [key]: file }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/20 p-8 flex flex-col items-center gap-4">
        <Skeleton className="h-12 w-full max-w-3xl" />
        <Skeleton className="h-[400px] w-full max-w-3xl" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Document Error</h2>
            <p className="text-muted-foreground">{error?.message || "This link is no longer valid or the document has expired."}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submittedOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-12 pb-12 text-center space-y-6">
            <div className="bg-[#16a34a]/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-[#16a34a]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold">Submission Complete</h2>
              <p className="text-muted-foreground">Thank you, {doc.recipientName}. Your onboarding packet has been successfully submitted and sealed.</p>
            </div>
            <div className="bg-muted p-4 rounded-md text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Document Number:</span>
                <span className="font-mono font-bold">{doc.documentNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed At:</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">SEALED</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">
              A copy has been sent to your email and stored in your Document Safe.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const orgName = (doc as ExtendedSpsDocument).workspaceCompanyName || "Your Employer";
  const licenseNum = (doc as ExtendedSpsDocument).workspaceLicenseNumber;

  const s1 = formData.section1 || {};
  const s2 = formData.section2 || {};
  const s3 = formData.section3 || {};
  const s4 = formData.section4 || {};
  const s5 = formData.section5 || {};
  const s6 = formData.section6 || {};
  const s7 = formData.section7 || {};
  const s8 = formData.section8 || {};
  const s9 = formData.section9 || {};
  const s10 = formData.section10 || {};
  const s11 = formData.section11 || {};

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Top Progress Bar */}
      <div className="bg-card dark:bg-slate-950 border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#2563EB]" />
              <h1 className="font-bold text-lg hidden sm:block">Employee Onboarding Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Step {step} of 12</p>
                <p className="text-sm font-bold text-[#2563EB]">Section Progress</p>
              </div>
              <div className="w-32 h-2.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#2563EB] transition-all duration-500 ease-out" 
                  style={{ width: `${(step / 12) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
        {/* Section 1: Identity */}
        {step === 1 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={1} title="Identity & Contact Information" complete={validateStep(1)} />
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Full Name">
                  <Input value={doc.recipientName} readOnly className="bg-muted cursor-not-allowed" />
                </FormField>
                <FormField label="Date of Birth" required error={errors.includes("dob")}>
                  <Input 
                    type="date" 
                    value={s1.dob || ""} 
                    onChange={(e) => updateField("section1", "dob", e.target.value)}
                    data-testid="input-dob"
                  />
                </FormField>
              </div>
              <FormField label="Place of Birth" required error={errors.includes("pob")}>
                <Input 
                  placeholder="City, State, Country" 
                  value={s1.pob || ""} 
                  onChange={(e) => updateField("section1", "pob", e.target.value)}
                  data-testid="input-pob"
                />
              </FormField>
              <FormField label="Residential Address" required error={errors.includes("address")}>
                <Input 
                  placeholder="Street, City, State, ZIP" 
                  value={s1.address || ""} 
                  onChange={(e) => updateField("section1", "address", e.target.value)}
                  data-testid="input-address"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Phone Number" required error={errors.includes("phone")}>
                  <Input 
                    placeholder="(555) 000-0000" 
                    value={s1.phone || ""} 
                    onChange={(e) => updateField("section1", "phone", e.target.value)}
                    data-testid="input-phone"
                  />
                </FormField>
                <FormField label="Email Address" required error={errors.includes("email")}>
                  <Input 
                    type="email" 
                    placeholder="name@example.com" 
                    value={s1.email || ""} 
                    onChange={(e) => updateField("section1", "email", e.target.value)}
                    data-testid="input-email"
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 2: Assignment */}
        {step === 2 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={2} title="Employment Assignment" complete={validateStep(2)} />
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Hire Date">
                  <Input value={doc.hireDate || "Not Set"} readOnly className="bg-muted cursor-not-allowed" />
                </FormField>
                <FormField label="Pay Rate ($/hr)">
                  <Input value={`$${doc.payRate || "0.00"}`} readOnly className="bg-muted cursor-not-allowed" />
                </FormField>
              </div>
              <FormField label="Position" required error={errors.includes("position")}>
                <Select value={s2.position || ""} onValueChange={(v) => updateField("section2", "position", v)}>
                  <SelectTrigger data-testid="select-position">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="security_officer">Security Officer</SelectItem>
                    <SelectItem value="supervisor">Site Supervisor</SelectItem>
                    <SelectItem value="patrol">Mobile Patrol Officer</SelectItem>
                    <SelectItem value="ppo">Personal Protection Officer</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Assignment Site" required error={errors.includes("site")}>
                  <Input 
                    placeholder="Client Site Name" 
                    value={s2.site || ""} 
                    onChange={(e) => updateField("section2", "site", e.target.value)}
                    data-testid="input-site"
                  />
                </FormField>
                <FormField label="Uniform Size" required error={errors.includes("uniformSize")}>
                  <Select value={s2.uniformSize || ""} onValueChange={(v) => updateField("section2", "uniformSize", v)}>
                    <SelectTrigger data-testid="select-uniform-size">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XS">XS</SelectItem>
                      <SelectItem value="S">S</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="XL">XL</SelectItem>
                      <SelectItem value="XXL">XXL</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              <FormField label="Site Address">
                <Input 
                  placeholder="Address of primary assignment" 
                  value={s2.siteAddress || ""} 
                  onChange={(e) => updateField("section2", "siteAddress", e.target.value)}
                  data-testid="input-site-address"
                />
              </FormField>
            </CardContent>
          </Card>
        )}

        {/* Section 3: License */}
        {step === 3 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={3} title="Security Licensing" complete={validateStep(3)} />
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Guard Card Number" required error={errors.includes("licenseNumber")}>
                  <Input 
                    placeholder="Registration #" 
                    value={s3.licenseNumber || ""} 
                    onChange={(e) => updateField("section3", "licenseNumber", e.target.value)}
                    data-testid="input-license-number"
                  />
                </FormField>
                <FormField label="License Type" required error={errors.includes("licenseType")}>
                  <Select value={s3.licenseType || ""} onValueChange={(v) => updateField("section3", "licenseType", v)}>
                    <SelectTrigger data-testid="select-license-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unarmed">Unarmed / Non-Commissioned</SelectItem>
                      <SelectItem value="commissioned">Commissioned (Armed)</SelectItem>
                      <SelectItem value="ppo">Personal Protection (PPO)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              <FormField label="Expiration Date" required error={errors.includes("licenseExpiry")}>
                <Input 
                  type="date" 
                  value={s3.licenseExpiry || ""} 
                  onChange={(e) => updateField("section3", "licenseExpiry", e.target.value)}
                  data-testid="input-license-expiry"
                />
              </FormField>
              <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                <Checkbox 
                  id="tops" 
                  checked={s3.topsSync === true} 
                  onCheckedChange={(v) => updateField("section3", "topsSync", v)}
                  data-testid="checkbox-tops"
                />
                <Label htmlFor="tops" className="text-sm cursor-pointer">
                  My registration is active in the TX DPS TOPS portal
                </Label>
              </div>

              {(s3.licenseType === 'unarmed' || s3.licenseType === 'non_commissioned') && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-md flex gap-3">
                  <Info className="w-5 h-5 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">
                    <strong>Notice:</strong> Non-commissioned officer — weapon-related certifications and psych evaluations are not required for this registration level.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 4: W-4 */}
        {step === 4 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={4} title="Federal Tax Withholding (W-4)" complete={validateStep(4)} />
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Employer EIN">
                  <Input value="84-4563658" readOnly className="bg-muted cursor-not-allowed" />
                </FormField>
                <FormField label="Social Security Number (Last 4)" required error={errors.includes("ssn4")}>
                  <Input 
                    placeholder="XXXX" 
                    maxLength={4} 
                    value={s4.ssn4 || ""} 
                    onChange={(e) => updateField("section4", "ssn4", e.target.value)}
                    data-testid="input-ssn4"
                  />
                </FormField>
              </div>
              <FormField label="Filing Status" required error={errors.includes("filingStatus")}>
                <Select value={s4.filingStatus || ""} onValueChange={(v) => updateField("section4", "filingStatus", v)}>
                  <SelectTrigger data-testid="select-filing-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single or Married Filing Separately</SelectItem>
                    <SelectItem value="married">Married Filing Jointly</SelectItem>
                    <SelectItem value="head">Head of Household</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Dependent Claims ($)">
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={s4.dependents || ""} 
                    onChange={(e) => updateField("section4", "dependents", e.target.value)}
                    data-testid="input-dependents"
                  />
                </FormField>
                <FormField label="Extra Withholding ($)">
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={s4.extraWithholding || ""} 
                    onChange={(e) => updateField("section4", "extraWithholding", e.target.value)}
                    data-testid="input-extra-withholding"
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 5: I-9 */}
        {step === 5 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={5} title="Employment Eligibility (I-9)" complete={validateStep(5)} />
            <CardContent className="p-6 space-y-4">
              <FormField label="Citizenship Status" required error={errors.includes("citizenshipStatus")}>
                <Select value={s5.citizenshipStatus || ""} onValueChange={(v) => updateField("section5", "citizenshipStatus", v)}>
                  <SelectTrigger data-testid="select-citizenship">
                    <SelectValue placeholder="Select your status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="citizen">A citizen of the United States</SelectItem>
                    <SelectItem value="noncitizen_national">A noncitizen national of the United States</SelectItem>
                    <SelectItem value="permanent_resident">A lawful permanent resident</SelectItem>
                    <SelectItem value="alien">An alien authorized to work</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <div className="space-y-3">
                <p className="text-sm font-semibold">Required Verification Documents (Select one for scan/upload):</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    "U.S. Passport or U.S. Passport Card",
                    "Permanent Resident Card or Alien Registration Receipt Card",
                    "Foreign Passport with I-551 Stamp",
                    "Driver's License AND Social Security Card",
                    "Voter's Registration Card AND Birth Certificate"
                  ].map((doc, idx) => (
                    <div key={idx} className="flex items-center space-x-2 text-sm p-2 border rounded-md hover:bg-muted/30 transition-colors">
                      <Checkbox id={`doc-${idx}`} />
                      <Label htmlFor={`doc-${idx}`} className="cursor-pointer">{doc}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 6: Direct Deposit */}
        {step === 6 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={6} title="Direct Deposit Authorization" complete={validateStep(6)} />
            <CardContent className="p-6 space-y-4">
              <FormField label="Bank Name" required error={errors.includes("bankName")}>
                <Input 
                  placeholder="e.g. Chase, Wells Fargo" 
                  value={s6.bankName || ""} 
                  onChange={(e) => updateField("section6", "bankName", e.target.value)}
                  data-testid="input-bank-name"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Routing Number" required error={errors.includes("routingNumber")}>
                  <Input 
                    placeholder="9 digits" 
                    maxLength={9} 
                    value={s6.routingNumber || ""} 
                    onChange={(e) => updateField("section6", "routingNumber", e.target.value)}
                    data-testid="input-routing"
                  />
                </FormField>
                <FormField label="Account Number" required error={errors.includes("accountNumber")}>
                  <Input 
                    placeholder="Account number" 
                    value={s6.accountNumber || ""} 
                    onChange={(e) => updateField("section6", "accountNumber", e.target.value)}
                    data-testid="input-account"
                  />
                </FormField>
              </div>
              <FormField label="Account Type" required error={errors.includes("accountType")}>
                <Select value={s6.accountType || ""} onValueChange={(v) => updateField("section6", "accountType", v)}>
                  <SelectTrigger data-testid="select-account-type">
                    <SelectValue placeholder="Checking or Savings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </CardContent>
          </Card>
        )}

        {/* Section 7: Offer Letter */}
        {step === 7 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={7} title="Offer of Employment" complete={validateStep(7)} />
            <CardContent className="p-6 space-y-6">
              <div className="bg-card border p-6 text-sm space-y-4 shadow-inner overflow-y-auto max-h-[400px]">
                <div className="text-center font-bold text-lg mb-4">EMPLOYMENT OFFER & TERMS</div>
                <p><strong>Position:</strong> {doc.position || "Security Officer"}</p>
                <p><strong>Pay Rate:</strong> ${doc.payRate || "0.00"} per hour</p>
                <p><strong>Start Date:</strong> {doc.hireDate || "TBD"}</p>
                
                <p className="font-bold">Probationary Period:</p>
                <p>
                  Employment with {orgName} is subject to a ninety (90) day probationary period. 
                  During this time, your performance, attendance, and adherence to company SOPs will be closely evaluated. 
                  Successful completion of this period does not alter the at-will nature of your employment.
                </p>

                <p>
                  By signing below, you acknowledge the terms of this offer and confirm your intent to join {orgName} as an at-will employee.
                </p>
              </div>

              <SignaturePad 
                value={signatures.offerLetter?.svgData || null}
                onChange={(data) => updateSignature("offerLetter", data)}
                typeValue={signatures.offerLetter?.typed || ""}
                onTypeChange={(v) => updateTypedSignature("offerLetter", v)}
                label="Offer Letter Signature"
              />
              {errors.includes("sig_offerLetter") && <p className="text-xs text-destructive">Signature is required</p>}
            </CardContent>
          </Card>
        )}

        {/* Section 8: Handbook */}
        {step === 8 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={8} title="Handbook Acknowledgment" complete={validateStep(8)} />
            <CardContent className="p-6 space-y-6">
              <div className="bg-muted/30 border p-4 rounded-md text-sm space-y-3">
                <h4 className="font-bold border-b pb-2">Employee Handbook &amp; Standard Operating Procedures (SOP)</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Punctuality is mandatory; lateness exceeding 5 minutes must be reported.</li>
                  <li>Full uniform compliance is required at all times on site.</li>
                  <li>Daily Activity Reports (DAR) must be submitted via the CoAIleague portal before end of shift.</li>
                  <li>No personal cell phone use except during authorized breaks.</li>
                  <li>Adherence to all client-specific post orders is required.</li>
                </ul>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="handbook" 
                  checked={s8.handbookAck === true}
                  onCheckedChange={(v) => updateField("section8", "handbookAck", v)}
                  data-testid="checkbox-handbook"
                />
                <Label htmlFor="handbook" className="text-sm font-medium cursor-pointer">
                  I have read and understand the Employee Handbook and SOPs.
                </Label>
              </div>

              <SignaturePad 
                value={signatures.handbookAck?.svgData || null}
                onChange={(data) => updateSignature("handbookAck", data)}
                typeValue={signatures.handbookAck?.typed || ""}
                onTypeChange={(v) => updateTypedSignature("handbookAck", v)}
                label="Handbook Acknowledgment"
              />
              {errors.includes("sig_handbookAck") && <p className="text-xs text-destructive">Signature is required</p>}
            </CardContent>
          </Card>
        )}

        {/* Section 9: Drug-Free */}
        {step === 9 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={9} title="Drug-Free Workplace Policy" complete={validateStep(9)} />
            <CardContent className="p-6 space-y-6">
              <div className="bg-card border p-6 text-sm italic">
                "{orgName} maintains a zero-tolerance policy for illegal drug use. 
                Employees may be subject to pre-employment, random, post-accident, and reasonable-suspicion testing. 
                A positive test result or refusal to test is grounds for immediate termination."
              </div>

              <SignaturePad 
                value={signatures.drugPolicy?.svgData || null}
                onChange={(data) => updateSignature("drugPolicy", data)}
                typeValue={signatures.drugPolicy?.typed || ""}
                onTypeChange={(v) => updateTypedSignature("drugPolicy", v)}
                label="Policy Acknowledgment Signature"
              />
              {errors.includes("sig_drugPolicy") && <p className="text-xs text-destructive">Signature is required</p>}
            </CardContent>
          </Card>
        )}

        {/* Section 10: Liability */}
        {step === 10 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={10} title="Employee Responsibility & Liability" complete={validateStep(10)} />
            <CardContent className="p-6 space-y-6">
              <div className="bg-red-50/50 border border-red-100 p-6 text-sm text-red-900 leading-relaxed rounded-md">
                <strong>Legal Disclaimer:</strong> I acknowledge that as a security professional, I may be placed in positions of trust. 
                I agree to hold the company harmless for any liability resulting from my willful misconduct or violation of established security protocols. 
                I further acknowledge that any equipment provided to me is the property of the company and must be returned in good condition. 
                I understand that I am personally responsible for maintaining the confidentiality of client data and site information.
              </div>

              <FormField label="Type your full name to acknowledge" required error={errors.includes("typedName")}>
                <Input 
                  placeholder="Legal Name" 
                  value={s10.typedName || ""} 
                  onChange={(e) => updateField("section10", "typedName", e.target.value)}
                  data-testid="input-liability-name"
                />
              </FormField>

              <SignaturePad 
                value={signatures.responsibility?.svgData || null}
                onChange={(data) => updateSignature("responsibility", data)}
                typeValue={signatures.responsibility?.typed || ""}
                onTypeChange={(v) => updateTypedSignature("responsibility", v)}
                label="Official Signature"
              />
              {errors.includes("sig_responsibility") && <p className="text-xs text-destructive">Signature is required</p>}
            </CardContent>
          </Card>
        )}

        {/* Section 11: Uniform */}
        {step === 11 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={11} title="Uniform Receipt & Deduction Authorization" complete={validateStep(11)} />
            <CardContent className="p-6 space-y-6">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-left">Item Description</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Initials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      { key: "shirt", label: "Duty Shirt (Embroidered)" },
                      { key: "pants", label: "Tactical Duty Pants" },
                      { key: "belt", label: "Nylon Duty Belt" },
                      { key: "badge", label: "Security Officer Badge" },
                      { key: "cap", label: "Branded Cap" }
                    ].map(item => (
                      <tr key={item.key} className={errors.includes(`uniformInitial_${item.key}`) ? "bg-red-50" : ""}>
                        <td className="p-3 font-medium">{item.label}</td>
                        <td className="p-3 text-center">x1</td>
                        <td className="p-3 text-right">
                          <Input 
                            className="w-16 h-8 text-center ml-auto" 
                            maxLength={3} 
                            placeholder="Init"
                            value={s11[`uniformInitial_${item.key}`] || ""}
                            onChange={(e) => updateField("section11", `uniformInitial_${item.key}`, e.target.value.toUpperCase())}
                            data-testid={`input-uniform-${item.key}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <Checkbox 
                  id="deduction" 
                  className="mt-1"
                  checked={s11.deductionAuth === true}
                  onCheckedChange={(v) => updateField("section11", "deductionAuth", v)}
                  data-testid="checkbox-deduction"
                />
                <Label htmlFor="deduction" className="text-sm font-medium leading-relaxed cursor-pointer">
                  I authorize a one-time deduction of <strong>$50.00</strong> from my final paycheck if the above items are not returned 
                  in serviceable condition upon termination of my employment.
                </Label>
              </div>

              <SignaturePad 
                value={signatures.uniformReceipt?.svgData || null}
                onChange={(data) => updateSignature("uniformReceipt", data)}
                typeValue={signatures.uniformReceipt?.typed || ""}
                onTypeChange={(v) => updateTypedSignature("uniformReceipt", v)}
                label="Uniform Receipt Signature"
              />
              {errors.includes("sig_uniformReceipt") && <p className="text-xs text-destructive">Signature is required</p>}
            </CardContent>
          </Card>
        )}

        {/* Section 12: Uploads */}
        {step === 12 && (
          <Card className="border-none shadow-lg">
            <SectionHeader number={12} title="Document Verification Uploads" complete={true} />
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: "idFront", label: "Government ID (Front)" },
                  { key: "idBack", label: "Government ID (Back)" },
                  { key: "guardFront", label: "Guard Card (Front)" },
                  { key: "guardBack", label: "Guard Card (Back)" },
                  { key: "ssnCard", label: "Social Security Card" },
                  { key: "trainingCert", label: "Training Certificate" }
                ].map(item => (
                  <div key={item.key} className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">{item.label}</Label>
                    <div className="relative">
                      <Input 
                        type="file" 
                        className="hidden" 
                        id={`file-${item.key}`}
                        onChange={(e) => handleFileUpload(item.key, e)}
                        accept="image/*,.pdf"
                        data-testid={`input-file-${item.key}`}
                      />
                      <Label 
                        htmlFor={`file-${item.key}`}
                        className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 h-32 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        {files[item.key] ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle className="w-8 h-8 text-[#16a34a]" />
                            <span className="text-xs font-medium text-center truncate max-w-[150px]">{files[item.key]?.name}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Click to upload</span>
                          </div>
                        )}
                      </Label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 p-4 rounded-md border border-blue-100 flex gap-3">
                <Info className="w-5 h-5 text-[#2563EB] shrink-0" />
                <p className="text-sm text-blue-900">
                  Almost finished! Please review your information one last time. By clicking "Final Submit", you are legally signing the entire onboarding packet.
                </p>
              </div>

              <Button 
                className="w-full h-12 text-lg bg-[#16a34a] hover:bg-[#15803d] font-bold"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                data-testid="button-final-submit"
              >
                {submitMutation.isPending ? "Submitting..." : "Final Submit & Seal Packet"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation Controls */}
        <div className="flex items-center justify-between pt-4">
          <Button 
            variant="outline" 
            onClick={prevStep} 
            disabled={step === 1 || submitMutation.isPending}
            className="w-32"
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          {step < 12 && (
            <Button 
              onClick={nextStep} 
              disabled={submitMutation.isPending}
              className="bg-[#2563EB] hover:bg-[#1d4ed8] w-32"
              data-testid="button-next"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </main>

      {/* Footer Legal */}
      <footer className="bg-card dark:bg-slate-950 border-t py-6">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Document Execution Engine — Powered by Trinity AI
          </p>
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed max-w-lg mx-auto">
            This document is legally binding per the applicable Uniform Electronic Transactions Act. 
            Your IP address, browser fingerprint, and precise timestamp are being recorded for identity verification. 
            {orgName}{licenseNum ? ` | LIC# ${licenseNum}` : ""}
          </p>
        </div>
      </footer>
    </div>
  );
}
