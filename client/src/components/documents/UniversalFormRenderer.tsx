/**
 * UniversalFormRenderer
 * ======================
 * Renders ANY template from the canonical registry.
 * Section-by-section wizard, auto-save draft, restore banner, GPS capture,
 * Trinity validation on submit.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ChevronLeft, ChevronRight, CheckCircle, Save, Clock, AlertCircle,
  FileText, Loader2, RotateCcw, Send
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Field components ──────────────────────────────────────────────────────────
import { SignatureField } from "./fields/SignatureField";
import { InitialsField } from "./fields/InitialsField";
import { AcknowledgmentField } from "./fields/AcknowledgmentField";
import { GpsStampField, type GpsData } from "./fields/GpsStampField";
import { SSNField } from "./fields/SSNField";
import { AddressBlock, type AddressValue } from "./fields/AddressBlock";
import { TextField } from "./fields/TextField";
import { SelectField } from "./fields/SelectField";
import { VerificationStamp, buildVerificationData } from "./fields/VerificationStamp";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  helpText?: string;
  mobileFullWidth: boolean;
  sensitiveData: boolean;
  defaultValue?: string;
  maxLength?: number;
  validationPattern?: string;
}

interface TemplateSection {
  id: string;
  title: string;
  order: number;
  description?: string;
  fields: TemplateField[];
  requiresAcknowledgment: boolean;
  acknowledgmentText?: string;
  requiresInitials: boolean;
  requiresSignature: boolean;
  scrollToReadRequired?: boolean;
  legalText?: string;
}

interface DocumentTemplate {
  id: string;
  title: string;
  version: string;
  category: string;
  description: string;
  sections: TemplateSection[];
  requiresSignature: boolean;
  requiresGpsCapture: boolean;
  allowSaveForLater: boolean;
  estimatedMinutes: number;
}

interface UniversalFormRendererProps {
  templateId: string;
  onComplete?: (submissionId: string) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

// ── Upload field (inline, no external dependency) ─────────────────────────────

function UploadField({
  id,
  label,
  required,
  value,
  onChange,
  error,
  disabled,
  helpText,
}: {
  id: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange: (b64: string | null) => void;
  error?: string;
  disabled?: boolean;
  helpText?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1.5" data-testid={`field-upload-${id}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div
        className="border border-dashed border-border rounded-md p-4 text-center cursor-pointer hover-elevate transition-colors"
        onClick={() => !disabled && fileRef.current?.click()}
        data-testid={`upload-zone-${id}`}
      >
        {fileName || value ? (
          <div className="flex items-center justify-center gap-2 text-sm text-foreground">
            <FileText className="w-4 h-4 text-green-600" />
            <span className="truncate max-w-[200px]">{fileName ?? "Uploaded"}</span>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onChange(null); setFileName(null); }}
                data-testid={`button-clear-upload-${id}`}
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <FileText className="w-6 h-6 mx-auto mb-1 opacity-50" />
            Tap to upload {required ? "(required)" : "(optional)"}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        onChange={handleFile}
        disabled={disabled}
        data-testid={`input-file-${id}`}
      />
      {helpText && !error && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Date field ────────────────────────────────────────────────────────────────

function DateField({
  id,
  label,
  required,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5 w-full" data-testid={`field-date-${id}`}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={id}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn("min-h-[48px] sm:min-h-9", error && "border-destructive")}
        data-testid={`input-date-${id}`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Checkbox field ────────────────────────────────────────────────────────────

function CheckboxFieldComponent({
  id,
  label,
  required,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  required?: boolean;
  value?: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5" data-testid={`field-checkbox-${id}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={!!value}
          onCheckedChange={(checked) => onChange(!!checked)}
          disabled={disabled}
          className="mt-0.5 min-w-[18px]"
          data-testid={`checkbox-${id}`}
        />
        <Label htmlFor={id} className="text-sm leading-relaxed cursor-pointer">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Number field ──────────────────────────────────────────────────────────────

function NumberFieldComponent({
  id,
  label,
  required,
  value,
  onChange,
  error,
  disabled,
  helpText,
}: {
  id: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  helpText?: string;
}) {
  return (
    <div className="space-y-1.5 w-full" data-testid={`field-number-${id}`}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        placeholder="0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn("min-h-[48px] sm:min-h-9", error && "border-destructive")}
        data-testid={`input-number-${id}`}
      />
      {helpText && !error && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── FieldRenderer ─────────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled,
}: {
  field: TemplateField;
  value: any;
  onChange: (v) => void;
  error?: string;
  disabled?: boolean;
}) {
  const common = { id: field.id, label: field.label, required: field.required, error, disabled };

  switch (field.type) {
    case "signature":
      return <SignatureField {...common} value={value} onChange={onChange} />;
    case "initials":
      return <InitialsField {...common} value={value} onChange={onChange} />;
    case "ssn":
    case "masked_number":
      return <SSNField {...common} value={value ?? ""} onChange={onChange} lastFourOnly={field.type === "ssn" && field.label.toLowerCase().includes("last 4")} />;
    case "address_block":
      return <AddressBlock {...common} value={value} onChange={onChange} />;
    case "select":
      return <SelectField {...common} options={field.options ?? []} value={value ?? ""} onChange={onChange} placeholder={field.placeholder} />;
    case "upload":
      return <UploadField {...common} value={value} onChange={onChange} helpText={field.helpText} />;
    case "date":
      return <DateField {...common} value={value ?? ""} onChange={onChange} />;
    case "checkbox":
      return <CheckboxFieldComponent {...common} value={!!value} onChange={onChange} />;
    case "number":
      return <NumberFieldComponent {...common} value={value ?? ""} onChange={onChange} helpText={field.helpText} />;
    case "textarea":
      return <TextField {...common} type="textarea" value={value ?? ""} onChange={onChange} placeholder={field.placeholder} helpText={field.helpText} maxLength={field.maxLength} />;
    case "text":
    case "email":
    case "phone":
    default:
      return <TextField {...common} type={field.type as any} value={value ?? ""} onChange={onChange} placeholder={field.placeholder} helpText={field.helpText} maxLength={field.maxLength} />;
  }
}

// ── Section Renderer ──────────────────────────────────────────────────────────

function SectionRenderer({
  section,
  formData,
  onFieldChange,
  errors,
  disabled,
}: {
  section: TemplateSection;
  formData: Record<string, any>;
  onFieldChange: (id: string, value: any) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const ackKey = `__ack_${section.id}`;

  return (
    <div className="space-y-6" data-testid={`section-${section.id}`}>
      {section.description && (
        <p className="text-sm text-muted-foreground">{section.description}</p>
      )}

      {/* Acknowledgment / legal text at top of section (before fields) if legalText present */}
      {section.requiresAcknowledgment && section.legalText && (
        <AcknowledgmentField
          id={`${section.id}-ack`}
          legalText={section.legalText}
          acknowledgmentText={section.acknowledgmentText ?? ""}
          requireScrollToRead={section.scrollToReadRequired ?? false}
          value={!!formData[ackKey]}
          onChange={(v) => onFieldChange(ackKey, v)}
          error={errors[ackKey]}
          disabled={disabled}
        />
      )}

      {/* Fields */}
      <div className="space-y-5">
        {section.fields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={formData[field.id]}
            onChange={(v) => onFieldChange(field.id, v)}
            error={errors[field.id]}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Acknowledgment below fields (if no legalText — just the checkbox) */}
      {section.requiresAcknowledgment && !section.legalText && section.acknowledgmentText && (
        <AcknowledgmentField
          id={`${section.id}-ack`}
          legalText=""
          acknowledgmentText={section.acknowledgmentText}
          requireScrollToRead={false}
          value={!!formData[ackKey]}
          onChange={(v) => onFieldChange(ackKey, v)}
          error={errors[ackKey]}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function UniversalFormRenderer({
  templateId,
  onComplete,
  onCancel,
  readOnly = false,
}: UniversalFormRendererProps) {
  const { toast } = useToast();
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [gpsData, setGpsData] = useState<GpsData | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch template ──────────────────────────────────────────────────────────
  const { data: templateData, isLoading: templateLoading, isError: templateError } = useQuery<{ template: DocumentTemplate }>({
    queryKey: [`/api/document-forms/templates/${templateId}`],
    retry: 2,
  });

  const template = templateData?.template;

  // ── Load draft ──────────────────────────────────────────────────────────────
  const { data: draftData, isLoading: draftLoading } = useQuery<{ draft: any }>({
    queryKey: [`/api/document-forms/draft/${templateId}`],
    enabled: !!template && !readOnly,
    retry: false,
  });

  useEffect(() => {
    if (draftData?.draft) {
      const saved = draftData.draft.formData ?? {};
      const sectionIdx = saved.__currentSectionIndex ?? 0;
      const { __currentSectionIndex: _idx, __templateId: _tid, __savedAt, ...restData } = saved;
      setFormData(restData);
      setCurrentSectionIdx(sectionIdx);
      setHasDraft(true);
      setDraftSavedAt(__savedAt ?? null);
    }
  }, [draftData]);

  // ── Auto-save draft ─────────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/document-forms/draft", {
        templateId,
        formData: data,
        currentSectionIndex: currentSectionIdx,
      });
      return res.json();
    },
    onSuccess: (result) => {
      setDraftSavedAt(result.savedAt);
    },
  });

  const triggerSave = useCallback(() => {
    if (!template || readOnly || Object.keys(formData).length === 0) return;
    saveDraftMutation.mutate(formData);
  }, [template, readOnly, formData, currentSectionIdx]);

  useEffect(() => {
    if (!template || readOnly) return;
    autoSaveTimerRef.current = setInterval(triggerSave, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [template, readOnly, triggerSave]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async (payload: { formData: Record<string, any>; gpsData: GpsData | null }) => {
      const res = await apiRequest("POST", "/api/document-forms/submit", {
        templateId,
        formData: payload.formData,
        gpsData: payload.gpsData ?? undefined,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        setSubmitted(true);
        setSubmissionId(result.submissionId);
        onComplete?.(result.submissionId);
        toast({ title: "Document Submitted", description: "Your document has been submitted successfully." });
      } else {
        toast({ title: "Submission Error", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: async (err) => {
      let msg = "Submission failed";
      try {
        const j = await err.response?.json?.();
        if (j?.validation?.errors?.length) {
          const fieldErrors: Record<string, string> = {};
          for (const e of j.validation.errors) {
            fieldErrors[e.field] = e.message;
          }
          setErrors(fieldErrors);
          const sectionIdx = findSectionWithError(template!, fieldErrors);
          if (sectionIdx >= 0) setCurrentSectionIdx(sectionIdx);
          msg = `Please fix ${j.validation.errors.length} validation error(s) before submitting.`;
        } else {
          msg = j?.error ?? msg;
        }
      } catch { /* ignore */ }
      toast({ title: "Validation Error", description: msg, variant: "destructive" });
    },
  });

  // ── Field change ────────────────────────────────────────────────────────────
  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => { const n = { ...prev }; delete n[fieldId]; return n; });
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const sections = template?.sections ?? [];
  const totalSections = sections.length;
  const isFirst = currentSectionIdx === 0;
  const isLast = currentSectionIdx === totalSections - 1;
  const progress = totalSections > 0 ? Math.round(((currentSectionIdx) / totalSections) * 100) : 0;

  const goNext = () => {
    if (currentSectionIdx < totalSections - 1) {
      setCurrentSectionIdx((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goPrev = () => {
    if (currentSectionIdx > 0) {
      setCurrentSectionIdx((i) => i - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = () => {
    submitMutation.mutate({ formData, gpsData });
  };

  const handleManualSave = () => {
    triggerSave();
    toast({ title: "Draft Saved", description: "Your progress has been saved." });
  };

  // ── Loading/error states ────────────────────────────────────────────────────
  if (templateLoading || draftLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20" data-testid="form-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading document...</p>
      </div>
    );
  }

  if (templateError || !template) {
    return (
      <Card className="p-8 text-center" data-testid="form-error">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive opacity-60" />
        <p className="font-semibold mb-1">Template not found</p>
        <p className="text-sm text-muted-foreground">The document template could not be loaded.</p>
      </Card>
    );
  }

  // ── Success state ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center max-w-md mx-auto" data-testid="form-success">
        <CheckCircle className="w-16 h-16 text-green-600" />
        <div>
          <h2 className="text-xl font-semibold mb-2">Document Submitted</h2>
          <p className="text-muted-foreground text-sm mb-1">Your document has been submitted successfully.</p>
          {submissionId && (
            <p className="text-xs text-muted-foreground font-mono">Reference: {submissionId}</p>
          )}
        </div>
        <VerificationStamp
          data={buildVerificationData({ gpsData: gpsData, documentId: submissionId ?? undefined })}
        />
        {onCancel && (
          <Button variant="outline" onClick={onCancel} data-testid="button-close-after-submit">
            Close
          </Button>
        )}
      </div>
    );
  }

  const currentSection = sections[currentSectionIdx];

  return (
    <div className="flex flex-col min-h-0" data-testid={`document-form-${templateId}`}>

      {/* Draft restore banner */}
      {hasDraft && !readOnly && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-sm" data-testid="banner-draft-restore">
          <Save className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="flex-1 text-amber-800 dark:text-amber-200">
            Draft restored
            {draftSavedAt && ` — saved ${format(new Date(draftSavedAt), "MMM d 'at' h:mm a")}`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setFormData({}); setCurrentSectionIdx(0); setHasDraft(false); }}
            data-testid="button-discard-draft"
          >
            Start over
          </Button>
        </div>
      )}

      {/* Header: progress + section name */}
      <div className="px-4 sm:px-6 py-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-base font-semibold" data-testid="form-title">{template.title}</h1>
            <p className="text-xs text-muted-foreground">v{template.version} · ~{template.estimatedMinutes} min</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs" data-testid="badge-section-progress">
              {currentSectionIdx + 1} / {totalSections}
            </Badge>
            {draftSavedAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-auto-saved">
                <Clock className="w-3 h-3" />
                Saved
              </span>
            )}
          </div>
        </div>
        <Progress value={progress} className="h-1.5" data-testid="form-progress" />

        {/* Section tabs — compact pill list */}
        <div className="flex gap-1 flex-wrap" data-testid="section-tabs">
          {sections.map((sec, idx) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => !readOnly && setCurrentSectionIdx(idx)}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border transition-colors",
                idx === currentSectionIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : idx < currentSectionIdx
                  ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700"
                  : "border-border text-muted-foreground"
              )}
              data-testid={`tab-section-${idx}`}
            >
              {idx < currentSectionIdx && <CheckCircle className="w-2.5 h-2.5 inline mr-0.5" />}
              {sec.title}
            </button>
          ))}
        </div>
      </div>

      {/* GPS capture (auto, silent) */}
      {template.requiresGpsCapture && (
        <div className="px-4 sm:px-6 pt-3 hidden" aria-hidden="true">
          <GpsStampField id="form-gps" value={gpsData} onChange={setGpsData} autoCapture />
        </div>
      )}

      {/* Section content */}
      <div className="flex-1 px-4 sm:px-6 py-6 overflow-y-auto pb-32">
        {currentSection && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg font-semibold mb-1" data-testid="section-title">
              {currentSection.title}
            </h2>

            {Object.keys(errors).length > 0 && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2" data-testid="form-errors-summary">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-0.5">Please fix the following errors:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {Object.values(errors).slice(0, 6).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {Object.values(errors).length > 6 && (
                      <li>...and {Object.values(errors).length - 6} more</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            <SectionRenderer
              section={currentSection}
              formData={formData}
              onFieldChange={handleFieldChange}
              errors={errors}
              disabled={readOnly}
            />
          </div>
        )}
      </div>

      {/* Fixed bottom navigation bar */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border px-4 sm:px-6 py-3 flex items-center justify-between gap-3" data-testid="form-nav-bar">
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                data-testid="button-prev-section"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
            {template.allowSaveForLater && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleManualSave}
                disabled={saveDraftMutation.isPending}
                data-testid="button-save-draft"
              >
                {saveDraftMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1" />
                )}
                Save
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onCancel && (
              <Button type="button" variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-form">
                Cancel
              </Button>
            )}
            {isLast ? (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                data-testid="button-submit-form"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {submitMutation.isPending ? "Submitting..." : "Submit Document"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={goNext}
                data-testid="button-next-section"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper: find section that has a validation error ─────────────────────────

function findSectionWithError(template: DocumentTemplate, errors: Record<string, string>): number {
  const errorFieldIds = new Set(Object.keys(errors));
  for (let i = 0; i < template.sections.length; i++) {
    const section = template.sections[i];
    for (const field of section.fields) {
      if (errorFieldIds.has(field.id)) return i;
    }
    if (errorFieldIds.has(`__ack_${section.id}`)) return i;
  }
  return -1;
}
