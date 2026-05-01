import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function CoAuditorLogin() {
  const [, setLocation] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auditor/login", { email, password });
      const body = await res.json();
      if (!body.ok) { setError(body.error || "Login failed"); setSubmitting(false); return; }
      setLocation("/co-auditor/dashboard");
    } catch (e: unknown) {
      setError(e?.message || "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="max-w-md w-full bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <CardTitle>Auditor sign-in</CardTitle>
          </div>
          <CardDescription className="text-slate-400">
            Use your regulatory email and the password you set when you claimed your account.
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
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-500">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Sign in
          </Button>
          <p className="text-xs text-slate-500 pt-2">
            If your account is past its 90-day re-authentication window, please email your regulatory office to request a new audit invitation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
