import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Shield, Phone, KeyRound, Loader2, AlertTriangle, Trash2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Override {
  id: string;
  employee_id: string;
  from_phone: string;
  granted_by: string;
  granted_by_role: string;
  reason: string | null;
  expires_at: string;
  employee_first?: string;
  employee_last?: string;
}

interface AllowlistEntry {
  id: string;
  email: string;
  full_name: string | null;
  agency_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AdminSecurity() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Override form
  const [employeeId, setEmployeeId] = useState("");
  const [fromPhone, setFromPhone] = useState("");
  const [supEmpNum, setSupEmpNum] = useState("");
  const [supPin, setSupPin] = useState("");
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");

  // Allowlist form
  const [alEmail, setAlEmail] = useState("");
  const [alName, setAlName] = useState("");
  const [alAgency, setAlAgency] = useState("");
  const [alNotes, setAlNotes] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [oRes, aRes] = await Promise.all([
        apiRequest("GET", "/api/security-admin/overrides", undefined),
        apiRequest("GET", "/api/security-admin/auditor-allowlist", undefined),
      ]);
      const oBody = await oRes.json();
      const aBody = await aRes.json();
      if (oBody.ok) setOverrides(oBody.overrides || []);
      if (aBody.ok) setAllowlist(aBody.entries || []);
    } catch (e: unknown) { setError(e?.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function grant() {
    setError(null);
    if (!employeeId || !fromPhone || !supEmpNum || !supPin) {
      setError("All override fields are required."); return;
    }
    const r = await apiRequest("POST", "/api/security-admin/overrides", {
      employeeId, fromPhone, supervisorEmployeeNumber: supEmpNum, supervisorPin: supPin,
      hours: parseInt(hours, 10) || 24, reason,
    });
    const body = await r.json();
    if (!body.ok) { setError(body.error); return; }
    setEmployeeId(""); setFromPhone(""); setSupEmpNum(""); setSupPin(""); setReason("");
    load();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this override now?")) return;
    await apiRequest("DELETE", `/api/security-admin/overrides/${id}`, undefined);
    load();
  }

  async function addAllow() {
    setError(null);
    if (!alEmail) { setError("Email required"); return; }
    const r = await apiRequest("POST", "/api/security-admin/auditor-allowlist", {
      email: alEmail, fullName: alName, agencyName: alAgency, notes: alNotes,
    });
    const body = await r.json();
    if (!body.ok) { setError(body.error); return; }
    setAlEmail(""); setAlName(""); setAlAgency(""); setAlNotes("");
    load();
  }

  async function removeAllow(email: string) {
    if (!confirm(`Remove ${email} from the allow-list?`)) return;
    await apiRequest("DELETE", `/api/security-admin/auditor-allowlist/${encodeURIComponent(email)}`, undefined);
    load();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center gap-2">
          <Shield className="w-7 h-7 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-bold">Security &amp; Compliance Admin</h1>
            <p className="text-slate-400 text-sm">Trinity break-glass overrides + auditor allow-list</p>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-950/40 border border-red-900 text-red-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Break-glass overrides */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Break-glass phone override</CardTitle>
            <CardDescription className="text-slate-400">
              Lets an officer use SMS / voice from a non-listed phone (e.g., broken device). Requires a supervisor's clock-in PIN.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Employee ID</Label>
                <Input value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Temporary phone (with country code)</Label>
                <Input value={fromPhone} onChange={e => setFromPhone(e.target.value)} className="bg-slate-800 border-slate-700" placeholder="+15551234567" />
              </div>
              <div>
                <Label>Supervisor employee #</Label>
                <Input value={supEmpNum} onChange={e => setSupEmpNum(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Supervisor 6-digit PIN</Label>
                <Input value={supPin} onChange={e => setSupPin(e.target.value)} type="password" className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Hours (default 24, max 168)</Label>
                <Input value={hours} onChange={e => setHours(e.target.value)} type="number" min={1} max={168} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <Button onClick={grant} className="bg-emerald-600 hover:bg-emerald-500">
              <Plus className="w-4 h-4 mr-2" /> Grant override
            </Button>
          </CardContent>
        </Card>

        {/* Active overrides */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Phone className="w-5 h-5" /> Active overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : overrides.length === 0 ? (
              <p className="text-slate-400">No active overrides.</p>
            ) : (
              <div className="space-y-2">
                {overrides.map(o => (
                  <div key={o.id} className="flex items-center justify-between border border-slate-800 rounded-lg p-3">
                    <div>
                      <div className="font-semibold">{o.employee_first} {o.employee_last}</div>
                      <div className="text-sm text-slate-400">{o.from_phone} · expires {new Date(o.expires_at).toLocaleString()}</div>
                      {o.reason && <div className="text-xs text-slate-500 mt-1">"{o.reason}"</div>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revoke(o.id)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auditor allow-list */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Auditor allow-list</CardTitle>
            <CardDescription className="text-slate-400">
              Whitelist named regulatory contacts whose email may not match the global .gov / .state. heuristic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={alEmail} onChange={e => setAlEmail(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Full name</Label>
                <Input value={alName} onChange={e => setAlName(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Agency</Label>
                <Input value={alAgency} onChange={e => setAlAgency(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={alNotes} onChange={e => setAlNotes(e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <Button onClick={addAllow} className="bg-emerald-600 hover:bg-emerald-500">
              <Plus className="w-4 h-4 mr-2" /> Add to allow-list
            </Button>

            <div className="pt-3">
              {allowlist.length === 0 ? (
                <p className="text-slate-400 text-sm">No allow-listed auditors yet.</p>
              ) : (
                <div className="space-y-2">
                  {allowlist.map(e => (
                    <div key={e.id} className="flex items-center justify-between border border-slate-800 rounded-lg p-3">
                      <div>
                        <div className="font-semibold">{e.email}</div>
                        <div className="text-sm text-slate-400">{e.full_name || '—'} {e.agency_name ? `· ${e.agency_name}` : ''}</div>
                        {e.notes && <div className="text-xs text-slate-500 mt-1">"{e.notes}"</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={e.is_active ? 'bg-emerald-700' : 'bg-slate-700'}>{e.is_active ? 'active' : 'inactive'}</Badge>
                        {e.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => removeAllow(e.email)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
