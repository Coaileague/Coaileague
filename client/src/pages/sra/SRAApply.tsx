import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Shield, ChevronLeft, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","GU","VI","AS","MP",
  "FM","MH","PW"
];

export default function SRAApply() {
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    badgeNumber: "",
    fullLegalName: "",
    regulatoryBody: "",
    stateCode: "",
    governmentEmail: "",
    password: "",
    confirmPassword: "",
    authorizationLetterUrl: "",
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const applyMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/sra/auth/apply", data),
    onSuccess: async (res) => {
      const json = await res.json();
      if (!json.success) { setError(json.error || "Application failed."); return; }
      setSubmitted(true);
    },
    onError: () => setError("Submission failed. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.badgeNumber || !form.fullLegalName || !form.regulatoryBody || !form.stateCode || !form.governmentEmail || !form.password) {
      setError("All required fields must be filled.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    applyMutation.mutate(form);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0f1e3d] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-lg shadow-2xl p-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-[#1a3a6b] mb-2">Application Submitted</h2>
            <p className="text-gray-600 text-sm mb-6">
              Your application has been received. A CoAIleague administrator will review your credentials within 1-2 business days.
              You will receive confirmation at your government email once your account is verified.
            </p>
            <p className="text-gray-500 text-xs mb-4">
              After verification, you will receive TOTP setup instructions to configure your authenticator app.
            </p>
            <Button
              data-testid="button-back-to-login"
              onClick={() => setLocation("/regulatory-audit/login")}
              className="w-full bg-[#1a3a6b] text-white"
            >
              Return to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1e3d] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#d4aa3b] rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#0f1e3d]" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white">Apply for SRA Portal Access</h1>
          <p className="text-blue-300 text-sm mt-1">State Regulatory Auditor — Partner Portal</p>
        </div>

        <div className="bg-white rounded-lg shadow-2xl p-8">
          <button
            onClick={() => setLocation("/regulatory-audit/login")}
            className="flex items-center gap-1 text-[#1a3a6b] text-sm mb-5 hover:underline"
          >
            <ChevronLeft className="w-4 h-4" /> Back to login
          </button>

          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-6">
            <p className="text-amber-800 text-xs font-semibold uppercase mb-1">Important Notice</p>
            <p className="text-amber-700 text-xs">
              This portal is restricted to authorized state regulatory personnel only.
              False applications may be subject to criminal penalties under applicable law.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-gray-700 text-sm font-medium">Badge / ID Number *</Label>
                <Input
                  data-testid="input-badge-number"
                  value={form.badgeNumber}
                  onChange={set("badgeNumber")}
                  placeholder="TX-REG-12345"
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-700 text-sm font-medium">State *</Label>
                <select
                  data-testid="select-state-code"
                  value={form.stateCode}
                  onChange={set("stateCode")}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]"
                >
                  <option value="">Select state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-gray-700 text-sm font-medium">Full Legal Name *</Label>
              <Input
                data-testid="input-full-name"
                value={form.fullLegalName}
                onChange={set("fullLegalName")}
                placeholder="As it appears on government ID"
                className="border-gray-300"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-gray-700 text-sm font-medium">Regulatory Body / Agency *</Label>
              <Input
                data-testid="input-regulatory-body"
                value={form.regulatoryBody}
                onChange={set("regulatoryBody")}
                placeholder="e.g., TX Department of Public Safety - PSB"
                className="border-gray-300"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-gray-700 text-sm font-medium">Government Email *</Label>
              <Input
                data-testid="input-government-email"
                type="email"
                value={form.governmentEmail}
                onChange={set("governmentEmail")}
                placeholder="badge@agency.gov"
                className="border-gray-300"
              />
              <p className="text-gray-400 text-xs">Must be your official government-issued email address (.gov domain)</p>
            </div>

            <div className="space-y-1">
              <Label className="text-gray-700 text-sm font-medium">Authorization Letter URL</Label>
              <Input
                data-testid="input-auth-letter"
                type="url"
                value={form.authorizationLetterUrl}
                onChange={set("authorizationLetterUrl")}
                placeholder="https://... (optional but recommended)"
                className="border-gray-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-gray-700 text-sm font-medium">Password *</Label>
                <Input
                  data-testid="input-password"
                  type="password"
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Min. 12 characters"
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-700 text-sm font-medium">Confirm Password *</Label>
                <Input
                  data-testid="input-confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  placeholder="Repeat password"
                  className="border-gray-300"
                />
              </div>
            </div>

            <Button
              data-testid="button-submit-application"
              type="submit"
              className="w-full bg-[#1a3a6b] text-white mt-2"
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </div>

        <p className="text-center text-blue-400/50 text-xs mt-4">
          Secure Government Partner Portal
        </p>
      </div>
    </div>
  );
}
