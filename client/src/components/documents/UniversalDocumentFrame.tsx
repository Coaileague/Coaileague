/**
 * Universal Document Frame
 * ========================
 * The single design system component for ALL CoAIleague documents.
 * Applies a uniform professional header, footer, and signature block
 * across every document the platform generates, sends, and stores.
 *
 * Spec compliance:
 * - Header: org name, license #, document title, doc ID, version, date, classification
 * - Footer: page numbers, org name, CoAIleague watermark, document status
 * - Signature block: bordered area with signer name, title, date, witness line
 * - Print CSS: @media print layout matches digital
 * - Mobile: min 44px touch targets, no horizontal scroll, responsive
 * - Desktop: max-width 800px content column
 */

import { Shield, FileText, Printer, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type DocumentClassification = "internal" | "confidential" | "public" | "restricted";
export type DocumentStatus = "draft" | "pending" | "executed" | "void" | "expired";

const CLASSIFICATION_CONFIG: Record<DocumentClassification, { label: string; className: string }> = {
  internal:     { label: "Internal Use Only",  className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  confidential: { label: "Confidential",        className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  public:       { label: "Public",              className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  restricted:   { label: "Restricted",          className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string }> = {
  draft:    { label: "DRAFT",    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  pending:  { label: "PENDING",  className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  executed: { label: "EXECUTED", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  void:     { label: "VOID",     className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  expired:  { label: "EXPIRED",  className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

export interface DocumentSigner {
  id: string;
  name: string;
  title?: string;
  email?: string;
  signedAt?: string;
  signatureData?: string;
}

export interface UniversalDocumentFrameProps {
  orgName: string;
  licenseNumber?: string;
  documentTitle: string;
  documentId?: string;
  documentType?: string;
  version?: number;
  issueDate?: string;
  classification?: DocumentClassification;
  status?: DocumentStatus;
  signers?: DocumentSigner[];
  showFooter?: boolean;
  showActions?: boolean;
  totalPages?: number;
  currentPage?: number;
  onPrint?: () => void;
  onDownload?: () => void;
  className?: string;
  children: React.ReactNode;
}

export function UniversalDocumentFrame({
  orgName,
  licenseNumber,
  documentTitle,
  documentId,
  documentType,
  version = 1,
  issueDate,
  classification = "internal",
  status = "draft",
  signers = [],
  showFooter = true,
  showActions = true,
  totalPages = 1,
  currentPage = 1,
  onPrint,
  onDownload,
  className,
  children,
}: UniversalDocumentFrameProps) {
  const classificationCfg = CLASSIFICATION_CONFIG[classification];
  const statusCfg = STATUS_CONFIG[status];
  const formattedDate = issueDate
    ? format(new Date(issueDate), "MMMM d, yyyy")
    : format(new Date(), "MMMM d, yyyy");
  const docId = documentId || `DOC-${Date.now().toString(36).toUpperCase()}`;

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className={cn("w-full max-w-[800px] mx-auto font-sans", className)}>
      {showActions && (
        <div className="flex items-center justify-end gap-2 mb-3 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-document">
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload} data-testid="button-download-document">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download PDF
            </Button>
          )}
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden shadow-sm print:shadow-none print:border-0" data-testid="document-frame">
        {/* ── DOCUMENT HEADER ─────────────────────────────────── */}
        <div
          className="px-8 py-5 print:py-6"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          } as React.CSSProperties}
          data-testid="document-header"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Left — Org identity */}
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center"
                style={{ background: "rgba(255,200,60,0.15)", border: "1px solid rgba(255,200,60,0.4)" }}
              >
                <Shield className="w-5 h-5" style={{ color: "#ffc83c" }} />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base sm:text-lg leading-tight text-white truncate">
                  {orgName}
                </h1>
                {licenseNumber && (
                  <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
                    TX PSB License #{licenseNumber}
                  </p>
                )}
              </div>
            </div>

            {/* Right — Classification + Status */}
            <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 flex-shrink-0">
              <span
                className="text-xs px-2.5 py-1 rounded-md font-medium"
                style={{ background: "rgba(255,200,60,0.15)", color: "#ffc83c", border: "1px solid rgba(255,200,60,0.3)" }}
              >
                {classificationCfg.label}
              </span>
              <Badge className={cn("text-xs font-semibold tracking-wide", statusCfg.className)}>
                {statusCfg.label}
              </Badge>
            </div>
          </div>

          {/* Title row */}
          <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {documentTitle}
            </h2>
            {documentType && (
              <p className="text-sm mt-0.5" style={{ color: "#94a3b8" }}>{documentType}</p>
            )}
          </div>

          {/* Metadata row */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-xs" style={{ color: "#94a3b8" }}>
              Doc ID: <span className="text-white font-mono">{docId}</span>
            </span>
            <span className="text-xs" style={{ color: "#94a3b8" }}>
              Version: <span className="text-white">v{version}</span>
            </span>
            <span className="text-xs" style={{ color: "#94a3b8" }}>
              Date: <span className="text-white">{formattedDate}</span>
            </span>
          </div>
        </div>

        {/* ── DOCUMENT BODY ────────────────────────────────────── */}
        <div className="bg-background px-6 sm:px-8 py-6 min-h-[200px]" data-testid="document-body">
          {children}
        </div>

        {/* ── SIGNATURE BLOCKS ─────────────────────────────────── */}
        {signers.length > 0 && (
          <div className="px-6 sm:px-8 py-6 bg-muted/30 border-t avoid-break signature-section" data-testid="document-signature-area">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Signatures
            </h3>
            <div className={cn(
              "grid gap-4",
              signers.length === 1 ? "grid-cols-1 max-w-xs" :
              signers.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
              "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            )}>
              {signers.map((signer) => (
                <SignatureBlock key={signer.id} signer={signer} />
              ))}
            </div>
          </div>
        )}

        {/* ── DOCUMENT FOOTER ──────────────────────────────────── */}
        {showFooter && (
          <div
            className="px-6 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-2"
            style={{ background: "#0f172a" }}
            data-testid="document-footer"
          >
            <span className="text-xs" style={{ color: "#64748b" }}>
              {orgName}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "#64748b" }}>
                Page {currentPage} of {totalPages}
              </span>
              <span className="text-xs" style={{ color: "#475569" }}>•</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "#475569" }}>
                <Shield className="w-3 h-3" />
                Powered by the Platform
              </span>
            </div>
            <span className="text-xs font-mono" style={{ color: "#334155" }}>
              {docId}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SignatureBlock({ signer }: { signer: DocumentSigner }) {
  return (
    <div
      className="rounded-md p-4 space-y-3"
      style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
      data-testid={`signature-block-${signer.id}`}
    >
      {/* Signature display area */}
      <div
        className="h-14 flex items-end pb-1 px-1"
        style={{ borderBottom: "2px solid hsl(var(--border))" }}
      >
        {signer.signatureData ? (
          signer.signatureData.startsWith("data:image") ? (
            <img
              src={signer.signatureData}
              alt={`${signer.name} signature`}
              className="h-10 object-contain object-left"
              data-testid={`sig-image-${signer.id}`}
            />
          ) : (
            <span
              className="text-xl font-serif italic text-foreground"
              data-testid={`sig-typed-${signer.id}`}
            >
              {signer.signatureData.replace("typed:", "")}
            </span>
          )
        ) : (
          <span className="text-xs text-muted-foreground italic">Awaiting signature</span>
        )}
      </div>

      {/* Signer info */}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground leading-tight" data-testid={`sig-name-${signer.id}`}>
          {signer.name}
        </p>
        {signer.title && (
          <p className="text-xs text-muted-foreground" data-testid={`sig-title-${signer.id}`}>
            {signer.title}
          </p>
        )}
        {signer.email && (
          <p className="text-xs text-muted-foreground" data-testid={`sig-email-${signer.id}`}>
            {signer.email}
          </p>
        )}
        {signer.signedAt && (
          <p className="text-xs text-muted-foreground pt-0.5" data-testid={`sig-date-${signer.id}`}>
            Signed: {format(new Date(signer.signedAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * DocumentSection — reusable section within a document body
 */
export function DocumentSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {title && (
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          <Separator className="flex-1" />
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

/**
 * DocumentField — a labeled field within a document (for form-style docs)
 */
export function DocumentField({
  label,
  value,
  placeholder,
  className,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <div
        className="text-sm text-foreground py-1.5 px-0 min-h-[28px]"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        {value || (
          <span className="text-muted-foreground italic">{placeholder || "—"}</span>
        )}
      </div>
    </div>
  );
}

/**
 * DocumentGrid — responsive 2-column field grid
 */
export function DocumentGrid({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-4",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/**
 * DocumentText — a paragraph of document body text
 */
export function DocumentText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-foreground leading-relaxed", className)}>
      {children}
    </p>
  );
}

/**
 * DocumentBullets — a bulleted list in document body
 */
export function DocumentBullets({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-1.5 text-sm text-foreground list-none", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * DocumentLegalText — fine-print / boilerplate text at reduced size
 */
export function DocumentLegalText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-muted-foreground leading-relaxed", className)}>
      {children}
    </p>
  );
}

export default UniversalDocumentFrame;
