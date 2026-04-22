import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "resent">("loading");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setError("No verification token found.");
      return;
    }

    apiRequest("POST", "/api/auth/verify-email", { token })
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) {
          setStatus("success");
          setTimeout(() => setLocation("/login?verified=true"), 2500);
        } else {
          setStatus("error");
          setError(json.message || "Verification failed. The link may have expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Network error. Please try again.");
      });
  }, [setLocation]);

  const resend = async () => {
    const email = new URLSearchParams(window.location.search).get("email") || "";
    await apiRequest("POST", "/api/auth/resend-verification", { email });
    setStatus("resent");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-2xl font-bold text-foreground">CoAIleague</div>

        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Verifying your email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-semibold">Email Verified!</h1>
            <p className="text-muted-foreground">Redirecting you to sign in…</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold">Verification Failed</h1>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={resend} variant="outline" className="gap-2">
              <Mail className="w-4 h-4" /> Resend verification email
            </Button>
          </>
        )}

        {status === "resent" && (
          <>
            <Mail className="w-12 h-12 text-blue-500 mx-auto" />
            <h1 className="text-xl font-semibold">Email Sent</h1>
            <p className="text-muted-foreground">Check your inbox for a new verification link.</p>
          </>
        )}
      </div>
    </div>
  );
}
