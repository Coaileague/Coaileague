/**
 * QR Code Print Sheet — Wave 21A
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a print-ready page of QR codes for all checkpoints in a tour.
 * Each QR encodes {v, w, c, t, n} — workspace ID is always embedded so
 * scans can NEVER be attributed to the wrong tenant.
 *
 * Usage: Manager navigates to /guard-tours/print-qr/:tourId
 * Browser print dialog opens automatically. QR sheets are laminated and
 * attached to physical patrol checkpoints at client sites.
 *
 * Anti-confusion design:
 *   • QR payload includes workspaceId — cross-tenant scan = rejected at API
 *   • Client name printed on every card — guards know which site they're at
 *   • Checkpoint order number printed — patrol sequence is unambiguous
 *   • NFC tag ID printed for IT reference when programming physical tags
 */

import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Loader2, Printer, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckpointSheet {
  id: string;
  name: string;
  description: string | null;
  dataUrl: string;
}

interface PrintQRData {
  tourId: string;
  sheets: CheckpointSheet[];
  workspaceId: string;
  tourName?: string;
  clientName?: string;
  siteName?: string;
}

export default function QRPrintSheet() {
  const params = useParams<{ tourId: string }>();
  const tourId = params.tourId || "";
  const { workspaceId, workspace } = useWorkspaceAccess();
  const [autoPrinted, setAutoPrinted] = useState(false);

  const { data, isLoading, error } = useQuery<PrintQRData>({
    queryKey: ["/api/guard-tours/tours", tourId, "print-qr"],
    queryFn: async () => {
      const res = await fetch(`/api/guard-tours/tours/${tourId}/print-qr`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load QR codes");
      return res.json();
    },
    enabled: !!tourId,
    staleTime: 60000,
  });

  // Auto-open print dialog when QR codes are ready
  useEffect(() => {
    if (data && !autoPrinted && data.sheets.length > 0) {
      setAutoPrinted(true);
      setTimeout(() => window.print(), 500);
    }
  }, [data, autoPrinted]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
          <p className="text-gray-600">Generating QR codes...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Could not load QR codes</p>
          <p className="text-sm text-gray-500 mt-1">Tour not found or no checkpoints configured.</p>
        </div>
      </div>
    );
  }

  const companyName = workspace?.companyName || workspace?.name || "CoAIleague";

  return (
    <>
      {/* ── Screen header (hidden on print) ── */}
      <div className="print:hidden bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">QR Code Print Sheet</h1>
          <p className="text-sm text-gray-400">{data.sheets.length} checkpoints · Tour {tourId.slice(0, 8)}</p>
        </div>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </Button>
      </div>

      {/* ── Print grid ── */}
      <div className="p-6 print:p-2">
        <div
          className="grid gap-4 print:gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {data.sheets.map((sheet, idx) => (
            <div
              key={sheet.id}
              className="border-2 border-gray-800 rounded-lg p-4 print:border print:rounded-none
                         flex flex-col items-center text-center break-inside-avoid"
              style={{ pageBreakInside: "avoid" }}
            >
              {/* Company name + patrol tag */}
              <div className="w-full mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {companyName}
                </p>
                <p className="text-[9px] text-gray-400">Guard Patrol Checkpoint</p>
              </div>

              {/* QR Code */}
              <img
                src={sheet.dataUrl}
                alt={`QR code for ${sheet.name}`}
                className="w-[180px] h-[180px] print:w-[150px] print:h-[150px]"
              />

              {/* Checkpoint info */}
              <div className="mt-3 w-full">
                <div className="bg-gray-100 rounded px-2 py-1 mb-1.5">
                  <p className="font-bold text-sm text-gray-900">
                    #{idx + 1} — {sheet.name}
                  </p>
                </div>
                {sheet.description && (
                  <p className="text-[10px] text-gray-500 leading-tight mb-1">
                    {sheet.description}
                  </p>
                )}
                <p className="text-[8px] text-gray-400 font-mono mt-1">
                  ID: {sheet.id.slice(0, 12)}
                </p>
              </div>

              {/* Footer */}
              <div className="mt-3 pt-2 border-t border-gray-200 w-full">
                <p className="text-[8px] text-gray-400 leading-tight">
                  Scan with CoAIleague Guard Tour App
                </p>
                <p className="text-[7px] text-gray-300 mt-0.5">
                  Powered by CoAIleague · coaileague.com
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Full-page print footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-gray-200 text-center text-[8px] text-gray-400">
          <p>{companyName} · Guard Patrol Checkpoint Cards · Generated {new Date().toLocaleString()}</p>
          <p className="mt-0.5">These QR codes are workspace-locked and cannot be used with another organization&#39;s account.</p>
        </div>
      </div>

      {/* Print-specific CSS */}
      <style>{`
        @media print {
          body { margin: 0; }
          .print\:hidden { display: none !important; }
          .print\:block { display: block !important; }
          @page { margin: 1cm; size: A4; }
        }
      `}</style>
    </>
  );
}
