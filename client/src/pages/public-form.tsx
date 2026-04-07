import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Clock, Shield, Eye, EyeOff, Lock } from "lucide-react";
import { SignatureField } from "@/components/documents/fields/SignatureField";
import { SiCodefactor } from "react-icons/si";

interface FormField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  order: number;
  options?: string[];
  placeholder?: string;
  readOnly?: boolean;
  helpText?: string;
  rows?: number;
}

interface PublicFormData {
  invitationId: string;
  token: string;
  formId: string;
  title: string;
  description?: string;
  fields: FormField[];
  requiresAuth: boolean;
  requiresSignature: boolean;
  signatureLabel: string;
  successMessage: string;
  expiresAt: string;
  prePopulatedData: Record<string, any>;
  sentToName?: string;
  branding?: { logoUrl?: string; primaryColor?: string; companyName?: string };
  alreadySubmitted?: boolean;
}

export default function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const [formData, setFormData] = useState<PublicFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [ssnVisible, setSsnVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) return;
    fetch(`/api/forms/public/${token}`)
      .then((res) => {
        if (!res.ok) return res.json().then((e) => Promise.reject(e.error || "Form not found"));
        return res.json();
      })
      .then((data: PublicFormData) => {
        if (data.alreadySubmitted) {
          setSubmitted(true);
          setSuccessMessage("This form has already been submitted. Thank you!");
          return;
        }
        setFormData(data);

        if (data.prePopulatedData && Object.keys(data.prePopulatedData).length > 0) {
          const pre: Record<string, any> = {};
          const pd = data.prePopulatedData;
          for (const field of data.fields) {
            const candidates = [
              field.id,
              field.id.replace(/_/g, ""),
              field.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
            ];
            for (const key of candidates) {
              if (pd[key] !== undefined && pd[key] !== null) {
                pre[field.id] = pd[key];
                break;
              }
            }
            if (field.id === "full_name" && !pre[field.id] && (pd.firstName || pd.lastName)) {
              pre[field.id] = `${pd.firstName || ""} ${pd.lastName || ""}`.trim();
            }
            if (field.id === "name" && !pre[field.id] && pd.full_name) pre[field.id] = pd.full_name;
            if (field.id === "email" && !pre[field.id] && pd.email) pre[field.id] = pd.email;
            if (field.id === "phone" && !pre[field.id] && pd.phone) pre[field.id] = pd.phone;
            if (field.id === "position" && !pre[field.id] && pd.position) pre[field.id] = pd.position;
          }
          setFieldValues(pre);
        }
      })
      .catch((err) => setError(typeof err === "string" ? err : "This form link is not valid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  const updateField = useCallback((fieldId: string, value: any) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    setValidationErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });
  }, []);

  function validate(): boolean {
    if (!formData) return false;
    const errors: Record<string, string> = {};

    for (const field of formData.fields) {
      if (field.type === "display") continue;
      const val = fieldValues[field.id];
      const isEmpty = val === undefined || val === null || (typeof val === "string" && val.trim().length === 0);

      if (field.required && isEmpty) {
        errors[field.id] = `${field.label} is required`;
      }
      if (field.type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[field.id] = "Please enter a valid email address";
      }
      if (field.type === "ssn" && val && !/^\d{3}-?\d{2}-?\d{4}$/.test(val.replace(/\s/g, ""))) {
        errors[field.id] = "Please enter a valid SSN (XXX-XX-XXXX)";
      }
    }

    if (formData.requiresSignature && !signature) {
      errors["__signature__"] = `${formData.signatureLabel || "Signature"} is required`;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !formData) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/forms/public/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: fieldValues,
          signatureData: signature || null,
          signatureType: signature ? "drawn" : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || result.message || "Submission failed");
      setSubmitted(true);
      setSuccessMessage(result.message || formData.successMessage);
    } catch (err: any) {
      setError(err.message || "Failed to submit form. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: FormField) {
    const val = fieldValues[field.id] ?? "";
    const err = validationErrors[field.id];
    const isReadOnly = field.readOnly || false;
    const isPreFilled = isReadOnly || (formData?.prePopulatedData && fieldValues[field.id] !== undefined && fieldValues[field.id] !== "");

    if (field.type === "display") {
      return (
        <div key={field.id} className="space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{field.label}</p>
          <div
            className="px-3 py-2 rounded-md bg-muted/40 text-sm font-medium border border-border/50 break-words"
            data-testid={`display-${field.id}`}
          >
            {val || <span className="text-muted-foreground italic">—</span>}
          </div>
        </div>
      );
    }

    const inputClass = `w-full ${err ? "border-destructive" : ""} ${isReadOnly ? "bg-muted/30 cursor-not-allowed" : ""}`;

    return (
      <div key={field.id} className="space-y-1.5">
        {field.type !== "checkbox" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Label htmlFor={field.id} className={`text-sm ${err ? "text-destructive" : ""}`}>
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {isPreFilled && field.type !== "display" && (
              <Badge variant="secondary" className="text-[10px] py-0 h-4 gap-1 px-1.5 shrink-0">
                <Lock className="w-2.5 h-2.5" />
                Pre-filled
              </Badge>
            )}
          </div>
        )}

        {(field.type === "text" || field.type === "email" || field.type === "phone" || field.type === "date") && (
          <Input
            id={field.id}
            data-testid={`input-${field.id}`}
            type={field.type === "phone" ? "tel" : field.type}
            value={val}
            onChange={(e) => !isReadOnly && updateField(field.id, e.target.value)}
            placeholder={field.placeholder || ""}
            readOnly={isReadOnly}
            className={inputClass}
          />
        )}

        {field.type === "textarea" && (
          <Textarea
            id={field.id}
            data-testid={`input-${field.id}`}
            value={val}
            onChange={(e) => !isReadOnly && updateField(field.id, e.target.value)}
            placeholder={field.placeholder || ""}
            rows={field.rows || 4}
            readOnly={isReadOnly}
            className={inputClass}
          />
        )}

        {field.type === "number" && (
          <Input
            id={field.id}
            data-testid={`input-${field.id}`}
            type="number"
            value={val}
            onChange={(e) => !isReadOnly && updateField(field.id, e.target.value)}
            placeholder={field.placeholder || ""}
            readOnly={isReadOnly}
            className={inputClass}
          />
        )}

        {field.type === "currency" && (
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
            <Input
              id={field.id}
              data-testid={`input-${field.id}`}
              type="number"
              step="0.01"
              min="0"
              value={val}
              onChange={(e) => !isReadOnly && updateField(field.id, e.target.value)}
              placeholder={field.placeholder || "0.00"}
              readOnly={isReadOnly}
              className={`pl-7 ${inputClass}`}
            />
          </div>
        )}

        {field.type === "ssn" && (
          <div className="space-y-1 w-full">
            <div className="relative">
              <Input
                id={field.id}
                data-testid={`input-${field.id}`}
                type={ssnVisible[field.id] ? "text" : "password"}
                value={val}
                onChange={(e) => updateField(field.id, e.target.value)}
                placeholder="XXX-XX-XXXX"
                maxLength={11}
                className={`pr-10 ${inputClass}`}
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSsnVisible((prev) => ({ ...prev, [field.id]: !prev[field.id] }))}
                data-testid={`button-toggle-ssn-${field.id}`}
              >
                {ssnVisible[field.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Your SSN is encrypted and transmitted securely</p>
          </div>
        )}

        {field.type === "select" && field.options && (
          <Select value={val} onValueChange={(v) => !isReadOnly && updateField(field.id, v)} disabled={isReadOnly}>
            <SelectTrigger data-testid={`select-${field.id}`} className={`w-full ${err ? "border-destructive" : ""}`}>
              <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {field.type === "radio" && field.options && (
          <RadioGroup
            value={val}
            onValueChange={(v) => !isReadOnly && updateField(field.id, v)}
            data-testid={`radio-${field.id}`}
            className="space-y-1.5"
          >
            {field.options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${field.id}-${opt}`} disabled={isReadOnly} />
                <Label htmlFor={`${field.id}-${opt}`} className="font-normal cursor-pointer text-sm">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {field.type === "checkbox" && (
          <div className="flex items-start gap-2.5">
            <Checkbox
              id={field.id}
              data-testid={`checkbox-${field.id}`}
              checked={!!val}
              onCheckedChange={(v) => !isReadOnly && updateField(field.id, !!v)}
              disabled={isReadOnly}
              className="mt-0.5 shrink-0"
            />
            <label htmlFor={field.id} className={`text-sm leading-snug cursor-pointer ${err ? "text-destructive" : ""}`}>
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </label>
          </div>
        )}

        {field.helpText && field.type !== "checkbox" && (
          <p className="text-xs text-muted-foreground leading-snug">{field.helpText}</p>
        )}

        {err && (
          <p className="text-xs text-destructive leading-snug" data-testid={`error-${field.id}`}>{err}</p>
        )}
      </div>
    );
  }

  const sortedFields = formData?.fields?.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) ?? [];
  const nonCheckboxFields = sortedFields.filter((f) => f.type !== "checkbox");
  const checkboxFields = sortedFields.filter((f) => f.type === "checkbox");

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading form...</p>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────────
  if (error && !formData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm mx-auto border rounded-md p-6 space-y-4 text-center bg-card">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-base font-semibold">Form Unavailable</h2>
          <p className="text-muted-foreground text-sm leading-snug">{error}</p>
          <p className="text-xs text-muted-foreground">
            Contact the organization that sent this link for assistance.
          </p>
        </div>
      </div>
    );
  }

  // ─── Success ──────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm mx-auto border rounded-md p-6 space-y-4 text-center bg-card">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <h2 className="text-lg font-semibold">Submitted!</h2>
          <p className="text-muted-foreground text-sm leading-snug">{successMessage}</p>
          <Badge variant="secondary" className="gap-1 mx-auto">
            <Shield className="w-3 h-3" />
            Secured by CoAIleague
          </Badge>
        </div>
      </div>
    );
  }

  if (!formData) return null;

  // ─── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3 sm:px-4">
      <div className="w-full max-w-xl mx-auto space-y-4">

        {/* Branding */}
        <div className="flex items-center gap-2 justify-center">
          <div className="w-5 h-5 bg-primary rounded-sm flex items-center justify-center shrink-0">
            <SiCodefactor className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="text-xs font-medium text-muted-foreground truncate">
            {formData.branding?.companyName
              ? `${formData.branding.companyName} — Secure Form`
              : "CoAIleague Secure Form"}
          </span>
        </div>

        {/* Card */}
        <div className="bg-card border rounded-md overflow-hidden">

          {/* Card Header */}
          <div className="px-4 pt-4 pb-3 sm:px-5 border-b space-y-1">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h1 className="text-base font-semibold leading-snug break-words flex-1 min-w-0" data-testid="form-title">
                {formData.title}
              </h1>
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                <Clock className="w-3 h-3 shrink-0" />
                <span>Exp. {new Date(formData.expiresAt).toLocaleDateString()}</span>
              </div>
            </div>
            {formData.description && (
              <p className="text-sm text-muted-foreground leading-snug">{formData.description}</p>
            )}
            {formData.sentToName && (
              <p className="text-xs text-muted-foreground">
                Prepared for: <span className="font-medium">{formData.sentToName}</span>
              </p>
            )}
          </div>

          {/* Card Body */}
          <form onSubmit={handleSubmit} className="px-4 py-4 sm:px-5 space-y-4">

            {/* All non-checkbox fields */}
            {nonCheckboxFields.map(renderField)}

            {/* Signature block */}
            {formData.requiresSignature && (
              <div className="space-y-2 pt-2 border-t">
                <SignatureField
                  id="form-signature"
                  label={formData.signatureLabel || "Your Signature"}
                  required
                  value={signature}
                  onChange={(data) => {
                    setSignature(data);
                    if (data) {
                      setValidationErrors((prev) => {
                        const u = { ...prev };
                        delete u["__signature__"];
                        return u;
                      });
                    }
                  }}
                  error={validationErrors["__signature__"]}
                />
                <p className="text-xs text-muted-foreground flex items-start gap-1 leading-snug">
                  <Shield className="w-3 h-3 shrink-0 mt-0.5" />
                  By signing, you agree this is your legal electronic signature per the ESIGN Act and UETA.
                </p>
              </div>
            )}

            {/* Checkbox fields */}
            {checkboxFields.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                {checkboxFields.map(renderField)}
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="break-words">{error}</span>
              </div>
            )}

            {/* Submit row */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3 shrink-0" />
                This form is encrypted and secure
              </p>
              <Button
                type="submit"
                data-testid="button-submit-form"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting ? "Submitting..." : "Submit Form"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
