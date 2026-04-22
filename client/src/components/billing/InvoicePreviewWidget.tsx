import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";

interface InvoicePreviewItem {
  description: string;
  amountCents: number;
  quantity?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  type?: string;
  priceId?: string;
  metadata?: Record<string, string>;
}

interface InvoicePreviewResponse {
  pendingItems: InvoicePreviewItem[];
  totalCents: number;
  subtotalCents?: number;
  taxCents?: number;
  nextPaymentDate?: string | null;
  currency?: string;
  message?: string;
}

const OWNER_ROLES = new Set(["org_owner", "co_owner"]);

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function InvoicePreviewWidget() {
  const { workspaceRole, isPlatformStaff } = useWorkspaceAccess();
  const canSee = OWNER_ROLES.has(workspaceRole || "") || isPlatformStaff;

  const { data: preview, isLoading } = useQuery<InvoicePreviewResponse>({
    queryKey: ["/api/billing/invoice-preview"],
    enabled: canSee,
    staleTime: 5 * 60 * 1000,
  });

  if (!canSee) return null;

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <p className="font-semibold text-sm">Pending Invoice Items</p>
        </div>
        <p className="text-sm text-muted-foreground">Loading pending charges…</p>
      </div>
    );
  }

  const items = preview?.pendingItems ?? [];
  const totalCents = preview?.totalCents ?? 0;
  const nextPaymentFormatted = formatDate(preview?.nextPaymentDate);

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-3" data-testid="invoice-preview-widget">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <p className="font-semibold text-sm">Pending Invoice Items</p>
        </div>
        {nextPaymentFormatted && (
          <span className="text-xs text-muted-foreground">Due {nextPaymentFormatted}</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {preview?.message || "No pending charges."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate max-w-[70%]" title={item.description}>
                {item.description}
              </span>
              <span className="font-medium tabular-nums">{formatCents(item.amountCents)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm font-semibold border-t border-border pt-1.5 mt-1.5">
            <span>Estimated Total</span>
            <span className="tabular-nums">{formatCents(totalCents)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvoicePreviewWidget;
