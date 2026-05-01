import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText, Pen, CheckCircle, Shield, Clock, AlertTriangle,
  Calendar, Type, Hash, ChevronRight, Download, Eraser, ChevronDown,
  ArrowRight, Play, Lock
} from "lucide-react";
import { format } from "date-fns";
import type { PlacedField, SignatureFieldType } from "@/components/PDFFieldPlacer";

interface SigDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  signatureFields?: PlacedField[];
}

interface SigRequest {
  id: string;
  documentId: string;
  signerName: string;
  signerEmail: string;
  status: string;
  message?: string;
  createdAt: string;
  signedAt?: string;
}

interface VerifyResponse {
  success: boolean;
  data: {
    signature: SigRequest;
    document: SigDocument;
  };
}

const FIELD_TYPE_CONFIG: Record<SignatureFieldType, { label: string; icon: typeof Pen; description: string }> = {
  signature: { label: "Signature", icon: Pen, description: "Draw or type your full signature" },
  initial: { label: "Initial", icon: Hash, description: "Enter your initials" },
  date: { label: "Date", icon: Calendar, description: "Date of signing" },
  text: { label: "Text", icon: Type, description: "Enter required text" },
};

function PdfViewer({ filePath, fileName }: { filePath: string; fileName: string }) {
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        if (iframe) {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc || iframeDoc.body?.innerHTML === "") {
            setIframeError(true);
          }
        }
      } catch (_e) {
        setIframeError(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [filePath]);

  if (iframeError) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 gap-4 text-center bg-muted/30 rounded-b-md" data-testid="pdf-fallback">
        <FileText className="w-10 h-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Preview not supported on this browser</p>
          <p className="text-xs text-muted-foreground mt-0.5">Tap the button below to open the document</p>
        </div>
        <a href={filePath} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-open-pdf">
            <Download className="w-4 h-4" />
            Open PDF
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative w-full bg-muted rounded-b-md overflow-hidden"
      style={{ height: "min(65vh, 600px)", minHeight: 300 }}
    >
      <iframe
        ref={iframeRef}
        src={filePath}
        className="w-full h-full border-0"
        title={fileName}
        data-testid="iframe-pdf-preview"
        onError={() => setIframeError(true)}
      />
    </div>
  );
}

function SignatureCanvas({ onSignatureChange }: { onSignatureChange: (data: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    initCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => { initCanvas(); });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [initCanvas]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (canvas) onSignatureChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange("");
  };

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed rounded-md bg-card" style={{ height: 190 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none rounded-md"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          data-testid="canvas-signature-draw"
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-muted-foreground text-sm">Draw your signature here</p>
          </div>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={clear} data-testid="button-clear-draw">
        <Eraser className="w-3 h-3 mr-1" /> Clear
      </Button>
    </div>
  );
}

interface FieldEntry {
  field: PlacedField;
  value: string;
  completed: boolean;
}

export default function DocumentSigningPortal({ token }: { token: string }) {
  const { toast } = useToast();
  const [signatureTab, setSignatureTab] = useState("draw");
  const [typedSignature, setTypedSignature] = useState("");
  const [drawnSignature, setDrawnSignature] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [fieldEntries, setFieldEntries] = useState<FieldEntry[]>([]);
  const [signed, setSigned] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data, isLoading, error } = useQuery<VerifyResponse>({
    queryKey: ["/api/documents/external/verify", token],
    queryFn: async () => {
      const res = await fetch(`/api/documents/external/verify/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Invalid or expired signing link");
      }
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (!data?.data?.document?.signatureFields) return;
    const fields = data.data.document.signatureFields || [];
    setFieldEntries(fields.map(f => ({
      field: f,
      value: f.type === "date" ? format(new Date(), "MM/dd/yyyy") : "",
      completed: f.type === "date",
    })));
  }, [data]);

  const signMutation = useMutation({
    mutationFn: async () => {
      const sig = signatureTab === "draw" ? drawnSignature : `typed:${typedSignature}`;
      const type = signatureTab === "draw" ? "drawn" : "typed";
      const res = await fetch(`/api/documents/external/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData: sig, signatureType: type }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Signing failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSigned(true);
    },
    onError: (err) => {
      toast({ title: "Signing failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSign = () => {
    if (!consentChecked) {
      toast({ title: "Consent required", description: "Please agree to the electronic signature terms.", variant: "destructive" });
      return;
    }
    const sig = signatureTab === "draw" ? drawnSignature : typedSignature;
    if (!sig) {
      toast({ title: "Signature required", description: signatureTab === "draw" ? "Please draw your signature." : "Please type your signature.", variant: "destructive" });
      return;
    }
    const hasFields = fieldEntries.length > 0;
    if (hasFields) {
      const incomplete = fieldEntries.filter(e => !e.completed && e.field.type !== "date");
      if (incomplete.length > 0) {
        toast({ title: "Complete all fields", description: `${incomplete.length} field(s) still need to be filled.`, variant: "destructive" });
        return;
      }
    }
    signMutation.mutate();
  };

  const updateFieldValue = (fieldId: string, value: string) => {
    setFieldEntries(prev => prev.map(e =>
      e.field.id === fieldId ? { ...e, value, completed: value.trim().length > 0 } : e
    ));
  };

  // Guided mode: go to next incomplete field
  const goToNextField = useCallback(() => {
    const incompleteFields = fieldEntries.filter(e => !e.completed);
    if (incompleteFields.length === 0) {
      setGuidedMode(false);
      return;
    }
    // If there's an active field, find the next one after it
    const currentIdx = activeFieldId ? fieldEntries.findIndex(e => e.field.id === activeFieldId) : -1;
    const nextIncomplete = fieldEntries.find((e, idx) => !e.completed && idx > currentIdx)
      || incompleteFields[0];
    setActiveFieldId(nextIncomplete.field.id);
    // Scroll to it
    setTimeout(() => {
      const el = fieldRefs.current[nextIncomplete.field.id];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, [fieldEntries, activeFieldId]);

  const startGuidedFlow = () => {
    setGuidedMode(true);
    setActiveFieldId(null);
    setTimeout(() => goToNextField(), 10);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <h2 className="font-semibold text-lg">Link Invalid or Expired</h2>
              <p className="text-muted-foreground text-sm mt-1">
                This signing link is invalid or has already been used. Please contact the sender for a new link.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { signature: sigRequest, document: doc } = data.data;

  if (signed || sigRequest.status === "signed" || sigRequest.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-9 h-9 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="font-semibold text-xl">Document Signed Successfully</h2>
              <p className="text-muted-foreground text-sm mt-1">
                You have signed <strong>{doc.fileName}</strong>. A confirmation will be sent to {sigRequest.signerEmail}.
              </p>
            </div>
            <Separator />
            <div className="text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Signer</span>
                <span className="font-medium">{sigRequest.signerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Executed</Badge>
              </div>
            </div>
            {doc.filePath && (
              <a href={doc.filePath} download target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full gap-2" data-testid="button-download-signed">
                  <Download className="w-4 h-4" /> Download Copy
                </Button>
              </a>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
              <Lock className="w-3 h-3" />
              <span>Secured with SHA-256 integrity hash. Audit trail preserved.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasFields = fieldEntries.length > 0;
  const completedCount = fieldEntries.filter(e => e.completed).length;
  const totalRequired = fieldEntries.filter(e => e.field.type !== "date").length;
  const completedRequired = fieldEntries.filter(e => e.completed && e.field.type !== "date").length;
  const progressPct = hasFields ? Math.round((completedCount / fieldEntries.length) * 100) : 0;
  const incompleteCount = fieldEntries.filter(e => !e.completed).length;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{doc.fileName}</p>
              <p className="text-xs text-muted-foreground">Sent to {sigRequest.signerEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasFields && incompleteCount > 0 && (
              <Button
                size="sm"
                onClick={guidedMode ? goToNextField : startGuidedFlow}
                className="gap-1.5"
                data-testid="button-next-field"
              >
                {guidedMode ? (
                  <><ArrowRight className="w-3.5 h-3.5" /> Next Field</>
                ) : (
                  <><Play className="w-3.5 h-3.5" /> Start Signing</>
                )}
              </Button>
            )}
            {hasFields && incompleteCount === 0 && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1">
                <CheckCircle className="w-3 h-3" /> All fields complete
              </Badge>
            )}
            {!hasFields && (
              <Badge variant="outline">
                <Clock className="w-3 h-3 mr-1" />
                Awaiting Signature
              </Badge>
            )}
          </div>
        </div>
        {/* Progress bar — only when fields exist */}
        {hasFields && (
          <div className="border-t px-4 py-2 bg-background">
            <div className="max-w-5xl mx-auto flex items-center gap-3">
              <Progress value={progressPct} className="flex-1 h-1.5" />
              <span className="text-xs text-muted-foreground shrink-0">
                {completedCount}/{fieldEntries.length} fields
              </span>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {sigRequest.message && (
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-sm text-muted-foreground italic">"{sigRequest.message}"</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column: document + fields */}
          <div className="lg:col-span-3 space-y-4">
            {/* Document viewer */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Document
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {doc.filePath ? (
                  <PdfViewer filePath={doc.filePath} fileName={doc.fileName} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                    <FileText className="w-12 h-12" />
                    <p className="text-sm">Document preview not available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Required fields */}
            {hasFields && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">Required Fields</CardTitle>
                    <div className="flex items-center gap-2">
                      {incompleteCount > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          {incompleteCount} remaining
                        </span>
                      )}
                      <Badge
                        variant={completedCount === fieldEntries.length ? "default" : "outline"}
                        className={completedCount === fieldEntries.length ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                      >
                        {completedCount}/{fieldEntries.length} complete
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fieldEntries.map((entry, idx) => {
                    const cfg = FIELD_TYPE_CONFIG[entry.field.type];
                    const Icon = cfg.icon;
                    const isActive = activeFieldId === entry.field.id;
                    const isComplete = entry.completed;
                    const isRequired = entry.field.type !== "date";

                    return (
                      <div
                        key={entry.field.id}
                        ref={el => { fieldRefs.current[entry.field.id] = el; }}
                        className={['border-2 rounded-md p-3 space-y-2 transition-all cursor-pointer', isComplete
                            ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                            : isActive
                              ? "border-amber-400 dark:border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm"
                              : isRequired
                                ? "border-amber-200 dark:border-amber-800 hover-elevate"
                                : "hover-elevate"].join(' ')}
                        onClick={() => setActiveFieldId(isActive ? null : entry.field.id)}
                        data-testid={`field-item-${entry.field.id}`}
                      >
                        <div className="flex items-center gap-2">
                          {/* Field number badge */}
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isComplete
                              ? "bg-green-500 text-white"
                              : isActive
                                ? "bg-amber-500 text-white"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {isComplete ? <CheckCircle className="w-3 h-3" /> : idx + 1}
                          </div>
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isComplete ? "text-green-600 dark:text-green-400" : isActive ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
                          <span className="text-sm font-medium flex-1 min-w-0 truncate">
                            {entry.field.label || cfg.label}
                          </span>
                          {isRequired && !isComplete && (
                            <span className="text-destructive text-xs shrink-0">Required</span>
                          )}
                          {isComplete ? (
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isActive ? "rotate-180" : ""}`} />
                          )}
                        </div>

                        {/* Completed value preview */}
                        {isComplete && !isActive && entry.field.type !== "signature" && (
                          <p className="text-xs text-muted-foreground pl-8 truncate">{entry.value}</p>
                        )}
                        {isComplete && !isActive && entry.field.type === "signature" && (
                          <p className="text-xs text-green-600 dark:text-green-400 pl-8 font-medium">Signature captured</p>
                        )}

                        {/* Field input — expanded when active */}
                        {isActive && (
                          <div className="pt-1 pl-1">
                            {entry.field.type === "signature" && (
                              <div className="space-y-2">
                                <Tabs value={signatureTab} onValueChange={setSignatureTab}>
                                  <TabsList className="h-8">
                                    <TabsTrigger value="draw" className="text-xs">Draw</TabsTrigger>
                                    <TabsTrigger value="type" className="text-xs">Type</TabsTrigger>
                                  </TabsList>
                                  <TabsContent value="draw" className="mt-2">
                                    <SignatureCanvas onSignatureChange={(data) => {
                                      setDrawnSignature(data);
                                      updateFieldValue(entry.field.id, data);
                                    }} />
                                  </TabsContent>
                                  <TabsContent value="type" className="mt-2">
                                    <Input
                                      placeholder="Type your full legal name"
                                      value={typedSignature}
                                      onChange={(e) => {
                                        setTypedSignature(e.target.value);
                                        updateFieldValue(entry.field.id, e.target.value);
                                      }}
                                      className="font-serif text-lg"
                                      data-testid="input-typed-signature"
                                    />
                                    {typedSignature && (
                                      <div className="border rounded-md py-2 px-3 bg-muted/30 text-center mt-2">
                                        <span className="text-xl font-serif italic">{typedSignature}</span>
                                      </div>
                                    )}
                                  </TabsContent>
                                </Tabs>
                              </div>
                            )}

                            {entry.field.type === "initial" && (
                              <Input
                                placeholder="Your initials (e.g., J.D.)"
                                value={entry.value}
                                onChange={(e) => updateFieldValue(entry.field.id, e.target.value)}
                                maxLength={8}
                                data-testid={`input-initial-${entry.field.id}`}
                              />
                            )}

                            {entry.field.type === "date" && (
                              <div className="flex items-center gap-2 py-1">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{entry.value}</span>
                                <span className="text-xs text-muted-foreground">(auto-filled)</span>
                              </div>
                            )}

                            {entry.field.type === "text" && (
                              <Input
                                placeholder={entry.field.label || "Enter text"}
                                value={entry.value}
                                onChange={(e) => updateFieldValue(entry.field.id, e.target.value)}
                                data-testid={`input-text-${entry.field.id}`}
                              />
                            )}

                            {/* Next field button inside each active field */}
                            {guidedMode && (
                              <div className="pt-2 flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={goToNextField}
                                  className="gap-1.5 text-xs"
                                  data-testid="button-next-inline"
                                >
                                  Next <ArrowRight className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column: signature + sign button */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {hasFields ? "Final Signature" : "Your Signature"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasFields && (
                  <Tabs value={signatureTab} onValueChange={setSignatureTab}>
                    <TabsList className="w-full">
                      <TabsTrigger value="draw" className="flex-1" data-testid="tab-draw">Draw</TabsTrigger>
                      <TabsTrigger value="type" className="flex-1" data-testid="tab-type">Type</TabsTrigger>
                    </TabsList>
                    <TabsContent value="draw" className="mt-3">
                      <SignatureCanvas onSignatureChange={setDrawnSignature} />
                    </TabsContent>
                    <TabsContent value="type" className="mt-3">
                      <div className="space-y-2">
                        <Input
                          placeholder="Type your full legal name"
                          value={typedSignature}
                          onChange={(e) => setTypedSignature(e.target.value)}
                          className="font-serif text-lg"
                          data-testid="input-typed-signature-main"
                        />
                        {typedSignature && (
                          <div className="border rounded-md py-3 px-4 bg-muted/30 text-center">
                            <span className="text-2xl font-serif italic">{typedSignature}</span>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                )}

                {hasFields && (
                  <div className="text-sm text-muted-foreground p-3 rounded-md bg-muted/40">
                    Your signature captured in the fields above will be applied to all signature positions.
                  </div>
                )}

                <Separator />

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 accent-primary"
                    data-testid="checkbox-consent"
                    style={{ width: 18, height: 18, minWidth: 18 }}
                  />
                  <Label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    I agree that my electronic signature is the legal equivalent of my manual signature and I consent to be legally bound by this document.
                  </Label>
                </div>

                <Button
                  className="w-full"
                  onClick={handleSign}
                  disabled={
                    signMutation.isPending ||
                    !consentChecked ||
                    (hasFields && incompleteCount > 0)
                  }
                  data-testid="button-sign-document"
                >
                  {signMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Signing...
                    </>
                  ) : hasFields && incompleteCount > 0 ? (
                    <>
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      {incompleteCount} field{incompleteCount !== 1 ? "s" : ""} remaining
                    </>
                  ) : (
                    <>
                      <Pen className="w-4 h-4 mr-2" />
                      Sign Document
                    </>
                  )}
                </Button>

                {hasFields && incompleteCount > 0 && (
                  <Button
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={guidedMode ? goToNextField : startGuidedFlow}
                    data-testid="button-guided-start"
                  >
                    {guidedMode
                      ? <><ArrowRight className="w-4 h-4" /> Go to Next Field</>
                      : <><Play className="w-4 h-4" /> Start Guided Flow</>
                    }
                  </Button>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Shield className="w-3 h-3 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    256-bit encryption. IP address and timestamp logged for legal compliance.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-3 px-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Details</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">File</span>
                    <span className="font-medium text-right truncate max-w-[60%]">{doc.fileName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Recipient</span>
                    <span className="font-medium">{sigRequest.signerName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Sent</span>
                    <span className="font-medium">{format(new Date(sigRequest.createdAt), "MMM d, yyyy")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
