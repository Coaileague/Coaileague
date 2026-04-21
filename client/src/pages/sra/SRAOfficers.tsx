import { useQuery } from "@tanstack/react-query";
import { Users, CheckCircle, XCircle, AlertTriangle, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import SRAPortalLayout from "./SRAPortalLayout";

function sraFetch(path: string) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  }).then(r => r.json());
}

function CompliancePill({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> {label}
    </span>
  );
}

export default function SRAOfficers() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/sra/data/officers"],
    queryFn: () => sraFetch("/api/sra/data/officers"),
  });

  const officers: any[] = data?.data || [];
  const stateReq = data?.stateRequirements;

  const now = new Date();
  const filtered = officers.filter(o => {
    const name = `${o.firstName} ${o.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase()) || (o.guardCardNumber || "").toLowerCase().includes(search.toLowerCase());
  });

  const expiredCount = officers.filter(o => o.guardCardExpiryDate && new Date(o.guardCardExpiryDate) < now).length;
  const expiringCount = officers.filter(o => {
    if (!o.guardCardExpiryDate) return false;
    const exp = new Date(o.guardCardExpiryDate);
    const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return exp > now && exp < in90;
  }).length;

  return (
    <SRAPortalLayout activeRoute="/regulatory-audit/portal/officers">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Officer Roster</h1>
          <p className="text-gray-500 text-sm mt-1">Active licensed security officers on file for the audited organization.</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Officers", value: officers.length, icon: Users, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Armed", value: officers.filter(o => o.isArmed).length, icon: Shield, color: "text-indigo-700", bg: "bg-indigo-50" },
            { label: "Expired Credentials", value: expiredCount, icon: XCircle, color: "text-red-700", bg: "bg-red-50" },
            { label: "Expiring Soon (90d)", value: expiringCount, icon: AlertTriangle, color: "text-amber-700", bg: "bg-amber-50" },
          ].map(s => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className={`w-7 h-7 ${s.bg} rounded flex items-center justify-center`}>
                      <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                    </div>
                    <span className="text-xl font-bold text-gray-900">{s.value}</span>
                  </div>
                  <p className="text-gray-500 text-xs">{s.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {stateReq && (
          <Card className="mb-5 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 flex flex-wrap gap-4 text-sm text-blue-800">
              <span>State Requirements:</span>
              {stateReq.requiredTrainingHours && <span>Training: <strong>{stateReq.requiredTrainingHours}h</strong></span>}
              {stateReq.licenseRenewalPeriodMonths && <span>License Renewal: <strong>Every {stateReq.licenseRenewalPeriodMonths} months</strong></span>}
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="mb-4">
          <Input
            data-testid="input-officer-search"
            placeholder="Search by name or card number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1a3a6b]">
              Officers ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading roster...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No officers found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Name</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Role</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Guard Card</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Expires</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Credentials</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Armed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((officer: any) => {
                      const expired = officer.guardCardExpiryDate && new Date(officer.guardCardExpiryDate) < now;
                      const expiringSoon = officer.guardCardExpiryDate && !expired && new Date(officer.guardCardExpiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                      return (
                        <tr
                          key={officer.id}
                          data-testid={`officer-row-${officer.id}`}
                          className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{officer.fullLegalName || `${officer.firstName} ${officer.lastName}`}</p>
                              <p className="text-gray-400 text-xs">{officer.email || "—"}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{officer.position || officer.role || "—"}</td>
                          <td className="px-4 py-3 font-mono text-gray-700 text-xs">{officer.guardCardNumber || "—"}</td>
                          <td className="px-4 py-3">
                            {officer.guardCardExpiryDate ? (
                              <span className={`text-xs font-medium ${expired ? "text-red-600" : expiringSoon ? "text-amber-600" : "text-green-600"}`}>
                                {new Date(officer.guardCardExpiryDate).toLocaleDateString()}
                                {expired && " (EXPIRED)"}
                                {expiringSoon && " (soon)"}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">Not on file</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <CompliancePill ok={!!officer.guardCardVerified} label="Guard Card" />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {officer.isArmed ? (
                              <Badge className="bg-indigo-100 text-indigo-700 text-xs">Armed</Badge>
                            ) : (
                              <span className="text-gray-400 text-xs">Unarmed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SRAPortalLayout>
  );
}
