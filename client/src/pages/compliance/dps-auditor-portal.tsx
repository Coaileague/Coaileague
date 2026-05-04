/**
 * Texas DPS Auditor Portal — Wave 20
 * ─────────────────────────────────────────────────────────────────────────────
 * Completely isolated from the main app. No sidebar, no nav, no admin links.
 * Accessed via /dps-portal/:token — zero-trust, read-only sandbox.
 *
 * Exhibits mirror Texas DPS Chapter 1702 audit requirements:
 *   Exhibit A — Active Roster & License Status (Level II/III/IV)
 *   Exhibit B — Use of Force & Firearm Discharge Reports
 *   Exhibit C — Armed Post Shift Logs (Proof of Presence)
 *
 * Data is redacted server-side: no billing rates, no internal notes, no SSNs.
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Shield, FileText, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Token stored in URL param — no cookie, no session, no CoAIleague auth
const BASE_URL = "/api/regulatory";

async function portalFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Auditor-Token": token,
      "Content-Type": "application/json",
    },
    credentials: "omit", // explicitly no cookies
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Officer {
  id: string;
  firstName: string;
  lastName: string;
  guardCardNumber: string | null;
  guardCardExpiryDate: string | null;
  guardCardStatus: string | null;
  licenseType: string | null;
  isArmed: boolean;
  armedLicenseVerified: boolean;
}

interface UoFIncident {
  id: string;
  incidentNumber: string | null;
  title: string;
  incidentType: string;
  severity: string;
  createdAt: string;
  polishedDescription: string | null;
  siteName?: string;
}

interface ShiftLog {
  id: string;
  employeeName: string;
  siteName: string;
  startTime: string;
  endTime: string | null;
  isArmedPost: boolean;
  guardCardNumber: string | null;
  status: string;
}

interface PortalMeta {
  workspaceName: string;
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyUrl?: string;
  governingLaw?: string;
  portalLabel: string;
  generatedAt: string;
  expiresAt: string;
  uofRequirement?: string;
  shiftLogRequirement?: string;
  licenseRequirement?: string;
  licenseTypes?: Array<{ code: string; name: string; armedAllowed: boolean }>;
}

// ── License helpers ────────────────────────────────────────────────────────────

function licenseLabel(
  type: string | null,
  licenseTypes?: Array<{ code: string; name: string }>
): string {
  if (!type) return "Unknown";
  // Look up from state config first
  const found = licenseTypes?.find(lt => lt.code === type);
  if (found) return found.name;
  // Human-readable fallback (replace underscores)
  return type.replace(/_/g, " ").replace(/\w/g, c => c.toUpperCase());
}

function licenseStatusBadge(officer: Officer) {
  if (!officer.guardCardNumber) {
    return <Badge variant="destructive" className="text-[10px]">Missing</Badge>;
  }
  if (officer.guardCardStatus === "active" || officer.armedLicenseVerified) {
    return <Badge className="text-[10px] bg-green-600">Active</Badge>;
  }
  if (officer.guardCardStatus === "expired_hard_block") {
    return <Badge variant="destructive" className="text-[10px]">Expired</Badge>;
  }
  const expiry = officer.guardCardExpiryDate ? new Date(officer.guardCardExpiryDate) : null;
  if (expiry && expiry < new Date()) {
    return <Badge variant="destructive" className="text-[10px]">Expired {expiry.toLocaleDateString()}</Badge>;
  }
  if (expiry) {
    const days = Math.floor((expiry.getTime() - Date.now()) / 86400000);
    if (days <= 30) {
      return <Badge className="text-[10px] bg-yellow-500 text-black">Expires in {days}d</Badge>;
    }
    return <Badge className="text-[10px] bg-green-600">Valid to {expiry.toLocaleDateString()}</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">Unverified</Badge>;
}

// ── Main Portal ────────────────────────────────────────────────────────────────

export default function DPSAuditorPortal() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [activeTab, setActiveTab] = useState("exhibit-a");

  const { data: meta, isLoading: metaLoading, error: metaError } = useQuery<PortalMeta>({
    queryKey: ["dps-portal-meta", token],
    queryFn: () => portalFetch<PortalMeta>(`/auditor-portal/${token}/meta`, token),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: officersData, isPending: officersLoading } = useQuery<{ officers: Officer[] }>({
    queryKey: ["dps-portal-officers", token],
    queryFn: () => portalFetch<{ officers: Officer[] }>(`/auditor-portal/${token}/officers`, token),
    enabled: !!token && !metaError,
    staleTime: 60000,
  });

  const { data: uofData, isPending: uofLoading } = useQuery<{ incidents: UoFIncident[] }>({
    queryKey: ["dps-portal-uof", token],
    queryFn: () => portalFetch<{ incidents: UoFIncident[] }>(`/auditor-portal/${token}/use-of-force`, token),
    enabled: !!token && !metaError,
    staleTime: 60000,
  });

  const { data: shiftsData, isPending: shiftsLoading } = useQuery<{ shifts: ShiftLog[] }>({
    queryKey: ["dps-portal-shifts", token],
    queryFn: () => portalFetch<{ shifts: ShiftLog[] }>(`/auditor-portal/${token}/armed-shifts`, token),
    enabled: !!token && !metaError,
    staleTime: 60000,
  });

  // ── Invalid / expired token ────────────────────────────────────────────────
  if (metaError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Portal Link Invalid or Expired</h1>
          <p className="text-gray-400 text-sm">
            This audit portal link has expired or is no longer valid. Contact the security company to generate a new link.
          </p>
        </div>
      </div>
    );
  }

  if (metaLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Loading audit portal...</p>
        </div>
      </div>
    );
  }

  const officers = officersData?.officers || [];
  const incidents = uofData?.incidents || [];
  const shifts = shiftsData?.shifts || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header — no nav, no links to main app ── */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-900/60 border border-blue-700/40 flex items-center justify-center">
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Texas DPS Regulatory Audit Portal</h1>
              <p className="text-[10px] text-gray-400">
                {meta?.workspaceName} · Chapter 1702 Compliance · Read-Only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="text-[10px] bg-green-900/40 text-green-400 border-green-700/40">
              🔒 Secure Read-Only Session
            </Badge>
            <span className="text-[10px] text-gray-500">
              Expires {meta?.expiresAt ? new Date(meta.expiresAt).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* ── Portal metadata strip ── */}
        <div className="bg-blue-950/30 border border-blue-900/30 rounded-xl p-4 mb-6 text-sm">
          <div className="flex flex-wrap gap-6 text-gray-300">
            <div><span className="text-gray-500 text-xs uppercase tracking-wide">Entity</span><br/><span className="font-semibold">{meta?.workspaceName}</span></div>
            <div><span className="text-gray-500 text-xs uppercase tracking-wide">Regulatory Body</span><br/><span className="font-semibold">Texas DPS — Private Security Bureau</span></div>
            <div><span className="text-gray-500 text-xs uppercase tracking-wide">Governing Law</span><br/><span className="font-semibold">Texas Occupations Code Chapter 1702</span></div>
            <div><span className="text-gray-500 text-xs uppercase tracking-wide">Report Generated</span><br/><span className="font-semibold">{meta?.generatedAt ? new Date(meta.generatedAt).toLocaleString() : "—"}</span></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-3">
            This portal contains official compliance records for regulatory audit purposes only.
            Financial data, internal notes, and compensation information are excluded.
            All data is read-only. Unauthorized access or disclosure is prohibited.
          </p>
        </div>

        {/* ── Exhibits ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-900 border border-gray-800 mb-6 w-full justify-start">
            <TabsTrigger value="exhibit-a" className="data-[state=active]:bg-blue-900/40 data-[state=active]:text-blue-300" data-testid="tab-exhibit-a">
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Exhibit A — Roster & Licenses
            </TabsTrigger>
            <TabsTrigger value="exhibit-b" className="data-[state=active]:bg-red-900/40 data-[state=active]:text-red-300" data-testid="tab-exhibit-b">
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              Exhibit B — Use of Force Reports
            </TabsTrigger>
            <TabsTrigger value="exhibit-c" className="data-[state=active]:bg-purple-900/40 data-[state=active]:text-purple-300" data-testid="tab-exhibit-c">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Exhibit C — Armed Post Shift Logs
            </TabsTrigger>
          </TabsList>

          {/* ── EXHIBIT A: Active Roster & License Status ── */}
          <TabsContent value="exhibit-a">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white">Exhibit A — Active Guard Roster & License Status</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Texas DPS Chapter 1702 — Level II/III/IV license verification
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  {officers.length} active officers
                </div>
              </div>
              {officersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400 mr-2" />
                  <span className="text-gray-400 text-sm">Loading roster...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Officer Name</TableHead>
                      <TableHead className="text-gray-400">Guard Card #</TableHead>
                      <TableHead className="text-gray-400">License Classification</TableHead>
                      <TableHead className="text-gray-400">License Status</TableHead>
                      <TableHead className="text-gray-400">Armed</TableHead>
                      <TableHead className="text-gray-400">Expiry Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {officers.map(officer => (
                      <TableRow key={officer.id} className="border-gray-800 hover:bg-gray-800/30">
                        <TableCell className="font-medium text-white">
                          {officer.firstName} {officer.lastName}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-gray-300">
                          {officer.guardCardNumber || <span className="text-red-400 text-xs">MISSING</span>}
                        </TableCell>
                        <TableCell className="text-gray-300 text-sm">
                          {licenseLabel(officer.licenseType)}
                        </TableCell>
                        <TableCell>{licenseStatusBadge(officer)}</TableCell>
                        <TableCell>
                          {officer.isArmed
                            ? <span className="text-xs text-orange-400 font-semibold">● Armed</span>
                            : <span className="text-xs text-gray-500">Unarmed</span>}
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">
                          {officer.guardCardExpiryDate
                            ? new Date(officer.guardCardExpiryDate).toLocaleDateString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {officers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                          No active officers found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* ── EXHIBIT B: Use of Force Reports ── */}
          <TabsContent value="exhibit-b">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="font-bold text-white">Exhibit B — Use of Force & Firearm Discharge Reports</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Texas DPS — Required reporting per §1702.208. All incidents involving physical force, weapons drawn, or firearm discharge.
                </p>
              </div>
              {uofLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-red-400 mr-2" />
                  <span className="text-gray-400 text-sm">Loading UoF reports...</span>
                </div>
              ) : incidents.length === 0 ? (
                <div className="flex items-center justify-center py-12 flex-col gap-2">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <p className="text-gray-400 text-sm">No Use of Force incidents on record for the audit period.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Incident #</TableHead>
                      <TableHead className="text-gray-400">Date</TableHead>
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Severity</TableHead>
                      <TableHead className="text-gray-400">Report Status</TableHead>
                      <TableHead className="text-gray-400">Title</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.map(inc => (
                      <TableRow key={inc.id} className="border-gray-800 hover:bg-gray-800/30">
                        <TableCell className="font-mono text-sm text-gray-300">
                          {inc.incidentNumber || inc.id.slice(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell className="text-gray-300 text-sm">
                          {new Date(inc.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-red-800 text-red-300">
                            {inc.incidentType.replace(/_/g, " ").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px]",
                            inc.severity === "critical" ? "bg-red-700" :
                            inc.severity === "high" ? "bg-orange-700" :
                            "bg-yellow-700 text-black"
                          )}>
                            {inc.severity.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inc.polishedDescription
                            ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Filed</span>
                            : <span className="text-xs text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3"/>Pending</span>}
                        </TableCell>
                        <TableCell className="text-gray-300 text-sm max-w-[300px] truncate">
                          {inc.title}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* ── EXHIBIT C: Armed Post Shift Logs ── */}
          <TabsContent value="exhibit-c">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="font-bold text-white">Exhibit C — Armed Post Shift Logs (Proof of Presence)</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Texas DPS — Officer scheduling records for armed posts. Verifies license was current during service.
                </p>
              </div>
              {shiftsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400 mr-2" />
                  <span className="text-gray-400 text-sm">Loading shift logs...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Officer</TableHead>
                      <TableHead className="text-gray-400">Guard Card #</TableHead>
                      <TableHead className="text-gray-400">Site</TableHead>
                      <TableHead className="text-gray-400">Date / Start</TableHead>
                      <TableHead className="text-gray-400">End</TableHead>
                      <TableHead className="text-gray-400">Post Type</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map(shift => (
                      <TableRow key={shift.id} className="border-gray-800 hover:bg-gray-800/30">
                        <TableCell className="font-medium text-white text-sm">
                          {shift.employeeName}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-300">
                          {shift.guardCardNumber || <span className="text-red-400">MISSING</span>}
                        </TableCell>
                        <TableCell className="text-gray-300 text-sm">{shift.siteName}</TableCell>
                        <TableCell className="text-gray-300 text-sm">
                          {new Date(shift.startTime).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-gray-300 text-sm">
                          {shift.endTime ? new Date(shift.endTime).toLocaleString() : "In progress"}
                        </TableCell>
                        <TableCell>
                          {shift.isArmedPost
                            ? <Badge className="text-[10px] bg-orange-800 border-orange-700">Armed Post</Badge>
                            : <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400">Unarmed</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px]",
                            shift.status === "completed" ? "bg-green-800" :
                            shift.status === "active" ? "bg-blue-800" :
                            "bg-gray-700"
                          )}>
                            {shift.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {shifts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                          No armed post shift records in the audit window
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Footer ── */}
        <div className="mt-8 pt-6 border-t border-gray-800 text-center text-[10px] text-gray-600">
          <p>CoAIleague Regulatory Compliance Platform · Texas DPS Chapter 1702 Audit Portal</p>
          <p className="mt-1">This report is generated from live data and reflects current records at time of access. For questions contact the licensed security company directly.</p>
          <p className="mt-1">🔒 This session is read-only and audit-logged. All access is recorded.</p>
        </div>
      </main>
    </div>
  );
}
