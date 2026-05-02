/**
 * MobileDocumentSafeSheet — mobile-first browser for the document vault.
 *
 * Replaces the desktop <Table> pattern with a touch-friendly sheet that:
 *   - opens as a full-height bottom sheet (h-[100dvh]) honoring iOS safe area
 *   - has a sticky search header that filters by title/number/tag
 *   - lists docs as tap-friendly rows (≥44px) with category + Document #
 *   - on tap, opens an action sheet with View / Download / Share buttons
 *   - falls back to a friendly empty state ("No documents yet" / "No matches")
 *
 * Backed by the same /api/document-vault endpoints + /preview, /download
 * hardened streams. Officer scope is enforced server-side, so this view
 * is safe for both employees (their docs) and managers (the full safe).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Search,
  Download,
  Eye,
  Share2,
  Inbox,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface VaultDoc {
  id: string;
  title: string;
  documentNumber: string | null;
  category: string | null;
  fileUrl: string;
  fileSizeBytes: number | null;
  isSigned: boolean;
  createdAt: string;
}

interface VaultListResponse {
  items: VaultDoc[];
  total: number;
}

interface MobileDocumentSafeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filter category — when present only that category is shown. */
  category?: string;
  /** Title shown in the sheet header (defaults to "Document Safe"). */
  title?: string;
}

const PAGE_SIZE = 50;

export function MobileDocumentSafeSheet({
  open,
  onOpenChange,
  category,
  title = "Document Safe",
}: MobileDocumentSafeSheetProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VaultDoc | null>(null);

  const queryKey = useMemo(
    () => [
      "/api/document-vault",
      {
        search: search || null,
        category: category || null,
        limit: PAGE_SIZE,
        offset: 0,
      },
    ],
    [search, category],
  );

  const { data, isLoading, isError } = useQuery<VaultListResponse>({
    queryKey,
    enabled: open,
  });

  const items = data?.items ?? [];

  const openPreview = (doc: VaultDoc) => {
    window.open(`/api/document-vault/${doc.id}/preview`, "_blank", "noopener,noreferrer");
  };

  const openDownload = (doc: VaultDoc) => {
    const a = document.createElement("a");
    a.href = `/api/document-vault/${doc.id}/download`;
    a.rel = "noopener noreferrer";
    a.click();
  };

  const openShare = async (doc: VaultDoc) => {
    const url = `${window.location.origin}/api/document-vault/${doc.id}/preview`;
    const label = doc.documentNumber || doc.title;
    if (typeof navigator !== "undefined" && (navigator as Record<string, unknown>).share) {
      try {
        await (navigator as Record<string, unknown>).share({ title: doc.title, text: label, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      // Light haptic on mobile so the user knows the copy succeeded
      if ("vibrate" in navigator) navigator.vibrate(8);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] flex flex-col p-0 gap-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              placeholder="Search by title, document #, or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
              data-testid="mobile-doc-safe-search"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground" data-testid="mobile-doc-safe-loading">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading documents…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-destructive" data-testid="mobile-doc-safe-error">
              <span className="text-sm">Could not load documents.</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground" data-testid="mobile-doc-safe-empty">
              <Inbox className="w-8 h-8 opacity-60" />
              <span className="text-sm">{search ? "No matches" : "No documents yet"}</span>
            </div>
          ) : (
            <ul className="divide-y divide-border" data-testid="mobile-doc-safe-list">
              {items.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(doc)}
                    className="w-full text-left px-4 py-3 active:bg-muted/40 transition-colors"
                    style={{ minHeight: 56 }}
                    data-testid={`mobile-doc-safe-row-${doc.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate text-sm">{doc.title}</span>
                          {doc.isSigned && (
                            <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400 text-[9px] py-0 h-4 shrink-0">
                              Signed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {doc.documentNumber && (
                            <span className="font-mono truncate">{doc.documentNumber}</span>
                          )}
                          {doc.category && (
                            <span className="capitalize">· {doc.category}</span>
                          )}
                          <span>· {format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Inline action sheet for the selected doc */}
        {selected && (
          <div
            className="absolute inset-x-0 bottom-0 bg-background border-t border-border p-4 space-y-2 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            data-testid="mobile-doc-safe-actions"
          >
            <div className="flex items-start justify-between gap-3 pb-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selected.title}</p>
                {selected.documentNumber && (
                  <p className="text-xs font-mono text-muted-foreground">{selected.documentNumber}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-muted-foreground px-2 py-1"
                data-testid="mobile-doc-safe-action-close"
              >
                Close
              </button>
            </div>
            <Button
              type="button"
              variant="default"
              className="w-full justify-start"
              onClick={() => openPreview(selected)}
              data-testid="mobile-doc-safe-action-view"
            >
              <Eye className="w-4 h-4 mr-2" />
              View PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => openDownload(selected)}
              data-testid="mobile-doc-safe-action-download"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => openShare(selected)}
              data-testid="mobile-doc-safe-action-share"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share / Copy link
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
