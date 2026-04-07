/**
 * CanonicalIdBadge — Phase 57 Universal Identification System
 *
 * Displays a human-readable canonical ID (EMP-ACM-00034, CLT-ACM-00891, etc.)
 * with a copy-to-clipboard button. Used on all entity profile/detail pages.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CanonicalIdBadgeProps {
  /** The canonical ID string, e.g. "EMP-ACM-00034" */
  id: string | null | undefined;
  /** Optional label prefix shown to the left, e.g. "Officer ID" */
  label?: string;
  /** Extra class names for the outer wrapper */
  className?: string;
  /** Size variant — default or sm */
  size?: "default" | "sm";
}

const PREFIX_COLORS: Record<string, string> = {
  "ORG-": "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  "CLT-": "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "EMP-": "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  "USR-": "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  "SHF-": "bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  "CLK-": "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  "DOC-": "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  "INV-": "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  "TKT-": "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

function colorForId(id: string): string {
  for (const prefix of Object.keys(PREFIX_COLORS)) {
    if (id.toUpperCase().startsWith(prefix)) return PREFIX_COLORS[prefix];
  }
  return "bg-muted text-muted-foreground border-border";
}

export function CanonicalIdBadge({ id, label, className, size = "default" }: CanonicalIdBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!id) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const colorClass = colorForId(id);
  const textSize = size === "sm" ? "text-xs" : "text-xs font-medium";

  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid={`canonical-id-badge-${id}`}
    >
      {label && (
        <span className="text-xs text-muted-foreground select-none">{label}</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            data-testid="button-copy-canonical-id"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 transition-opacity hover:opacity-80 active:opacity-60 cursor-pointer select-none",
              colorClass,
              textSize,
            )}
            aria-label={`Copy ID: ${id}`}
          >
            <span className="font-mono tracking-wide">{id}</span>
            {copied
              ? <Check className="w-3 h-3 shrink-0" />
              : <Copy className="w-3 h-3 shrink-0 opacity-60" />
            }
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {copied ? "Copied!" : `Click to copy ${id}`}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
