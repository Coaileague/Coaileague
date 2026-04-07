import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Shield, Lock, Eye, EyeOff, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";

type LoginStep = "credentials" | "totp";

export default function SRALogin() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [governmentEmail, setGovernmentEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountId, setAccountId] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [auditPeriodStart, setAuditPeriodStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [auditPeriodEnd, setAuditPeriodEnd] = useState(() => new Date().toISOString().split("T")[0]);

  const loginMutation = useMutation({
    mutationFn: (data: { governmentEmail: string; password: string }) =>
      apiRequest("POST", "/api/sra/auth/login", data),
    onSuccess: async (res) => {
      const json = await res.json();
      if (!json.success) { setError(json.error || "Login failed."); return; }
      setAccountId(json.accountId);
      setStateCode(json.stateCode);
      setError("");
      setStep("totp");
    },
    onError: () => setError("Connection failed. Please try again."),
  });

  const totpMutation = useMutation({
    mutationFn: (data: { accountId: string; totpCode: string; workspaceId: string; auditPeriodStart: string; auditPeriodEnd: string }) =>
      apiRequest("POST", "/api/sra/auth/verify-totp", data),
    onSuccess: async (res) => {
      const json = await res.json();
      if (!json.success) { setError(json.error || "Invalid code."); return; }
      localStorage.setItem("sra_session_token", json.sessionToken);
      localStorage.setItem("sra_session_id", json.sessionId);
      localStorage.setItem("sra_account", JSON.stringify(json.account));
      setLocation("/regulatory-audit/portal");
    },
    onError: () => setError("Verification failed. Please try again."),
  });

  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!governmentEmail || !password) { setError("All fields required."); return; }
    loginMutation.mutate({ governmentEmail, password });
  };

  const handleTotp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!totpCode) { setError("Enter your authenticator code."); return; }
    totpMutation.mutate({ accountId, totpCode, workspaceId, auditPeriodStart, auditPeriodEnd });
  };

  return (
    <div className="min-h-screen bg-[#0f1e3d] flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-[#d4aa3b] rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-[#0f1e3d]" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">State Regulatory Auditor</h1>
          <p className="text-blue-300 text-sm mt-1">Partner Portal — Restricted Access</p>
          <p className="text-blue-400/60 text-xs mt-1">Powered by CoAIleague</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          {/* Step indicator */}
          <div className="bg-[#1a3a6b] px-6 py-3 flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "credentials" ? "bg-[#d4aa3b] text-[#0f1e3d]" : "bg-green-500 text-white"}`}>
              {step === "totp" ? "✓" : "1"}
            </div>
            <div className="h-px flex-1 bg-blue-600" />
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "totp" ? "bg-[#d4aa3b] text-[#0f1e3d]" : "bg-blue-800 text-blue-400"}`}>
              2
            </div>
            <span className="text-blue-200 text-xs ml-2">
              {step === "credentials" ? "Credentials" : "Authentication Code"}
            </span>
          </div>

          <div className="p-8">
            {error && (
              <Alert className="mb-4 border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {step === "credentials" ? (
              <form onSubmit={handleCredentials} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-[#1a3a6b] mb-1">Government Credentials</h2>
                  <p className="text-gray-500 text-sm">Enter your official government email and password.</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-gray-700 text-sm font-medium">Government Email</Label>
                  <Input
                    id="email"
                    data-testid="input-government-email"
                    type="email"
                    placeholder="badge@agency.gov"
                    value={governmentEmail}
                    onChange={e => setGovernmentEmail(e.target.value)}
                    className="border-gray-300"
                    autoComplete="username"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="password" className="text-gray-700 text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      data-testid="input-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="border-gray-300 pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="workspace" className="text-gray-700 text-sm font-medium">Organization Workspace ID</Label>
                  <Input
                    id="workspace"
                    data-testid="input-workspace-id"
                    type="text"
                    placeholder="Organization's workspace ID"
                    value={workspaceId}
                    onChange={e => setWorkspaceId(e.target.value)}
                    className="border-gray-300"
                  />
                  <p className="text-gray-400 text-xs">Provided in the audit authorization notice.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-gray-700 text-sm font-medium">Audit Period Start</Label>
                    <Input
                      data-testid="input-audit-start"
                      type="date"
                      value={auditPeriodStart}
                      onChange={e => setAuditPeriodStart(e.target.value)}
                      className="border-gray-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-gray-700 text-sm font-medium">Audit Period End</Label>
                    <Input
                      data-testid="input-audit-end"
                      type="date"
                      value={auditPeriodEnd}
                      onChange={e => setAuditPeriodEnd(e.target.value)}
                      className="border-gray-300"
                    />
                  </div>
                </div>

                <Button
                  data-testid="button-login"
                  type="submit"
                  className="w-full bg-[#1a3a6b] hover:bg-[#1a3a6b] text-white"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Verifying..." : (
                    <span className="flex items-center gap-2">Continue <ChevronRight className="w-4 h-4" /></span>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setLocation("/regulatory-audit/apply")}
                    className="text-[#1a3a6b] text-sm hover:underline"
                  >
                    Apply for SRA access
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleTotp} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-[#1a3a6b] mb-1">Two-Factor Authentication</h2>
                  <p className="text-gray-500 text-sm">Open your authenticator app and enter the 6-digit code for the SRA Portal.</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3">
                  <p className="text-blue-700 text-sm font-medium">Signing in as:</p>
                  <p className="text-blue-600 text-sm">{governmentEmail}</p>
                  {stateCode && <p className="text-blue-500 text-xs mt-1">State: {stateCode}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="totp" className="text-gray-700 text-sm font-medium">Authenticator Code</Label>
                  <Input
                    id="totp"
                    data-testid="input-totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9\s]{6,8}"
                    maxLength={8}
                    placeholder="000 000"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\s/g, ""))}
                    className="border-gray-300 text-center text-2xl tracking-widest font-mono"
                    autoFocus
                  />
                </div>

                <Button
                  data-testid="button-verify-totp"
                  type="submit"
                  className="w-full bg-[#1a3a6b] text-white"
                  disabled={totpMutation.isPending}
                >
                  {totpMutation.isPending ? "Verifying..." : (
                    <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> Access Audit Portal</span>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                  className="w-full text-gray-500 text-sm hover:text-gray-700"
                >
                  Back to credentials
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-blue-400/50 text-xs mt-6">
          Unauthorized access is a violation of federal law.<br />
          All activity is logged and monitored.
        </p>
      </div>
    </div>
  );
}
