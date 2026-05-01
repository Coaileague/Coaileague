import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function CoAuditorClaim() {
  const [, setLocation] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const token = new URLSearchParams(window.location.search).get("token") || "";

  async function submit() {
    setError(null);
    if (!token) { setError("Missing invite token. Please use the full link from your email."); return; }
    if (password.length < 10) { setError("Password must be at least 10 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auditor/claim", { token, password, phone, fullName });
      const body = await res.json();
      if (!body.ok) { setError(body.error || "Failed to claim invite"); setSubmitting(false); return; }
      setLocation("/co-auditor/dashboard");
    } catch (e: unknown) {
      setError(e?.message || "Failed to claim invite");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="max-w-md w-full bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <CardTitle>Claim your auditor account</CardTitle>
          </div>
          <CardDescription className="text-slate-400">
            Set a password and confirm your callback phone. Your audit window is read-and-print only and lasts 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-950/40 border border-red-900 text-red-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>
          <div>
            <Label htmlFor="phone">Callback phone (optional)</Label>
            <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} className="bg-slate-800 border-slate-700" placeholder="+1 555 123 4567" />
          </div>
          <div>
            <Label htmlFor="password">Password (min 10 chars)</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-500">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Claim account
          </Button>

          <p className="text-xs text-slate-500 pt-2">
            Auditor accounts must re-authenticate every 90 days. After 30 days your audit auto-closes; you can extend it from the dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
