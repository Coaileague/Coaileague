import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { useToast } from "@/hooks/use-toast";
import { Pen, Hash, Calendar, Type, Trash2, Save, MousePointer, Move, Info } from "lucide-react";

export type SignatureFieldType = "signature" | "initial" | "date" | "text";

export interface PlacedField {
  id: string;
  page: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  type: SignatureFieldType;
  recipientIndex: number;
  label?: string;
}

const FIELD_CONFIG: Record<SignatureFieldType, { label: string; icon: typeof Pen; color: string; bgColor: string; defaultW: number; defaultH: number }> = {
  signature: { label: "Sign Here", icon: Pen, color: "border-blue-500 text-blue-700 dark:text-blue-300", bgColor: "bg-blue-50 dark:bg-blue-950/40", defaultW: 18, defaultH: 5 },
  initial: { label: "Initial", icon: Hash, color: "border-purple-500 text-purple-700 dark:text-purple-300", bgColor: "bg-purple-50 dark:bg-purple-950/40", defaultW: 8, defaultH: 4 },
  date: { label: "Date", icon: Calendar, color: "border-green-500 text-green-700 dark:text-green-300", bgColor: "bg-green-50 dark:bg-green-950/40", defaultW: 12, defaultH: 4 },
  text: { label: "Text Field", icon: Type, color: "border-orange-500 text-orange-700 dark:text-orange-300", bgColor: "bg-orange-50 dark:bg-orange-950/40", defaultW: 18, defaultH: 4 },
};

const RECIPIENT_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ef4444"];

function nanoid6() {
  return Math.random().toString(36).slice(2, 8);
}

interface PDFFieldPlacerProps {
  docId: string;
  docName: string;
  pdfUrl: string;
  initialFields?: PlacedField[];
  recipientCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PDFFieldPlacer({
  docId,
  docName,
  pdfUrl,
  initialFields = [],
  recipientCount = 1,
  open,
  onOpenChange,
}: PDFFieldPlacerProps) {
  const { toast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<PlacedField[]>(initialFields);
  const [selectedType, setSelectedType] = useState<SignatureFieldType | null>("signature");
  const [selectedRecipient, setSelectedRecipient] = useState(0);
  const [mode, setMode] = useState<"place" | "view">("place");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const saveFields = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/documents/${docId}/signature-fields`, { signatureFields: fields }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Field positions saved", description: `${fields.length} field(s) saved to ${docName}` });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "place" || !selectedType || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const cfg = FIELD_CONFIG[selectedType];
    const newField: PlacedField = {
      id: nanoid6(),
      page: 1,
      xPct: Math.max(0, Math.min(100 - cfg.defaultW, xPct - cfg.defaultW / 2)),
      yPct: Math.max(0, Math.min(100 - cfg.defaultH, yPct - cfg.defaultH / 2)),
      widthPct: cfg.defaultW,
      heightPct: cfg.defaultH,
      type: selectedType,
      recipientIndex: selectedRecipient,
      label: cfg.label,
    };
    setFields(prev => [...prev, newField]);
    setSelectedFieldId(newField.id);
  }, [mode, selectedType, selectedRecipient]);

  function deleteField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  }

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0">
        <UniversalModalHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <UniversalModalTitle className="text-base">Place Signature Fields — {docName}</UniversalModalTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center border rounded-md overflow-hidden">
                <Button size="sm" variant={mode === "place" ? "default" : "ghost"} className="rounded-none text-xs" onClick={() => setMode("place")} data-testid="button-mode-place">
                  <MousePointer className="w-3 h-3 mr-1" />Place
                </Button>
                <Button size="sm" variant={mode === "view" ? "default" : "ghost"} className="rounded-none text-xs" onClick={() => setMode("view")} data-testid="button-mode-view">
                  <Move className="w-3 h-3 mr-1" />View
                </Button>
              </div>
              <Badge variant="outline" className="text-xs">{fields.length} field{fields.length !== 1 ? "s" : ""}</Badge>
            </div>
          </div>
        </UniversalModalHeader>

        <div className="flex flex-1 min-h-0">
          {/* Left palette */}
          <div className="w-52 border-r flex-shrink-0 flex flex-col gap-3 p-3 overflow-y-auto bg-muted/20">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Field Types</p>
              <div className="space-y-1.5">
                {(Object.entries(FIELD_CONFIG) as [SignatureFieldType, typeof FIELD_CONFIG[SignatureFieldType]][]).map(([type, cfg]) => {
                  const Icon = cfg.icon;
                  const active = selectedType === type && mode === "place";
                  return (
                    <button
                      key={type}
                      data-testid={`field-type-${type}`}
                      className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-xs border transition-all ${active ? `${cfg.bgColor} ${cfg.color} border-current font-medium` : "border-transparent hover:bg-muted"}`}
                      onClick={() => { setSelectedType(type); setMode("place"); }}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Recipient</p>
              <div className="space-y-1">
                {Array.from({ length: Math.max(1, recipientCount) }, (_, i) => (
                  <button key={i} onClick={() => setSelectedRecipient(i)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs border transition-all ${selectedRecipient === i ? "border-current font-medium" : "border-transparent hover:bg-muted"}`}
                    style={selectedRecipient === i ? { borderColor: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length], color: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] } : {}}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }} />
                    Recipient {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {fields.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Placed Fields</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {fields.map(f => {
                    const cfg = FIELD_CONFIG[f.type];
                    const Icon = cfg.icon;
                    return (
                      <div key={f.id} className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-xs border ${selectedFieldId === f.id ? cfg.color + " border-current " + cfg.bgColor : "border-muted"}`}
                        onClick={() => setSelectedFieldId(f.id === selectedFieldId ? null : f.id)}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{cfg.label}</span>
                          <span style={{ color: RECIPIENT_COLORS[f.recipientIndex % RECIPIENT_COLORS.length] }} className="font-bold">R{f.recipientIndex + 1}</span>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteField(f.id); }} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-auto rounded-md bg-muted/50 border p-2 text-[10px] text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1 font-medium"><Info className="w-3 h-3" /> How to use</div>
              <p>1. Pick a field type above</p>
              <p>2. Click anywhere on the PDF to place it</p>
              <p>3. Switch to "View" to scroll without placing</p>
              <p>4. Save when done</p>
            </div>
          </div>

          {/* PDF + overlay */}
          <div className="flex-1 min-w-0 relative overflow-auto bg-gray-100 dark:bg-gray-900">
            <div className="relative min-h-full">
              <embed
                src={pdfUrl + "#toolbar=1&navpanes=0"}
                type="application/pdf"
                className="w-full h-full min-h-[600px]"
                style={{ pointerEvents: mode === "view" ? "auto" : "none" }}
              />
              {/* Click overlay */}
              <div
                ref={overlayRef}
                className={`absolute inset-0 ${mode === "place" ? "cursor-crosshair" : "pointer-events-none"}`}
                onClick={handleOverlayClick}
                data-testid="pdf-overlay"
              >
                {/* Field markers */}
                {fields.map(f => {
                  const cfg = FIELD_CONFIG[f.type];
                  const Icon = cfg.icon;
                  const rColor = RECIPIENT_COLORS[f.recipientIndex % RECIPIENT_COLORS.length];
                  const isSelected = selectedFieldId === f.id;
                  return (
                    <div
                      key={f.id}
                      data-testid={`placed-field-${f.id}`}
                      className={`absolute border rounded-sm flex items-center gap-1 px-1 overflow-hidden select-none transition-shadow text-xs font-medium ${isSelected ? "ring-2 ring-offset-1" : ""}`}
                      style={{
                        left: `${f.xPct}%`,
                        top: `${f.yPct}%`,
                        width: `${f.widthPct}%`,
                        height: `${f.heightPct}%`,
                        borderColor: rColor,
                        background: rColor + "20",
                        color: rColor,
                        ringColor: rColor,
                        pointerEvents: "auto",
                      }}
                      onClick={e => { e.stopPropagation(); setSelectedFieldId(f.id === selectedFieldId ? null : f.id); }}
                    >
                      <Icon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{cfg.label}</span>
                      {isSelected && (
                        <button
                          className="ml-auto shrink-0 opacity-80 hover:opacity-100"
                          onClick={e => { e.stopPropagation(); deleteField(f.id); }}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <UniversalModalFooter className="px-4 py-3 border-t flex-shrink-0">
          <div className="flex items-center gap-2 w-full flex-wrap">
            <p className="text-xs text-muted-foreground flex-1">
              {mode === "place" && selectedType
                ? `Click on the PDF to place a "${FIELD_CONFIG[selectedType].label}" field for Recipient ${selectedRecipient + 1}`
                : `${fields.length} field${fields.length !== 1 ? "s" : ""} placed — switch to Place mode to add more`}
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button data-testid="button-save-fields" onClick={() => saveFields.mutate()} disabled={saveFields.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveFields.isPending ? "Saving…" : `Save ${fields.length} field${fields.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}
