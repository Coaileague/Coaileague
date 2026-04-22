import { useState } from "react";
import { SEO } from "@/components/seo";
import { CONTACTS, DOMAINS } from "@shared/platformConfig";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, ShieldCheck, Bell, Clock, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { Link } from "wouter";

export default function SmsConsent() {
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Basic US phone validation
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11 || (digits.length === 11 && !digits.startsWith("1"))) {
      setPhoneError("Please enter a valid U.S. mobile phone number.");
      return;
    }
    setPhoneError("");
    if (agreed && phone) {
      setSubmitted(true);
    }
  };

  const messageTypes = [
    { icon: Bell, label: "Shift Assignments", desc: "New shift offers and assignment confirmations" },
    { icon: Clock, label: "Schedule Reminders", desc: "Upcoming shift reminders and schedule changes" },
    { icon: CheckCircle2, label: "Clock-In / Clock-Out", desc: "Time recording reminders" },
    { icon: AlertTriangle, label: "Safety Alerts", desc: "Emergency and urgent site notifications" },
    { icon: MessageSquare, label: "Coverage Requests", desc: "Open shift fill requests — reply YES to accept" },
    { icon: FileText, label: "Account Notifications", desc: "Payroll confirmations and compliance reminders" },
  ];

  return (
    <>
      <SEO
        title="SMS Opt-In | CoAIleague Workforce Alerts"
        description="Opt in to receive recurring automated CoAIleague Workforce Alert text messages — shift reminders, schedule changes, safety alerts, and account notifications for security staff. Reply STOP to opt out at any time."
        canonical={`${DOMAINS.app}/sms-consent`}
      />
      <div className="min-h-screen bg-background flex flex-col">
        <UniversalHeader variant="public" />

        <div className="mx-auto max-w-2xl w-full px-4 pt-24 pb-16 sm:px-6 flex-1">

          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">SMS Program</p>
            <h1 className="text-3xl font-bold text-foreground mb-3">
              CoAIleague Workforce Alerts
            </h1>
            <p className="text-muted-foreground">
              Opt in to receive recurring automated text message notifications from CoAIleague
              for workforce management purposes. Security staff use this program to receive
              shift updates, safety alerts, and account notifications from their employer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            {messageTypes.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-xs text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6">
              {submitted ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <ShieldCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
                  <p className="font-semibold text-foreground">You are opted in to SMS Workforce Alerts</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    You will receive recurring automated text messages at {phone}.
                    Reply <strong>STOP</strong> at any time to cancel. Reply <strong>HELP</strong> for help.
                    Message and data rates may apply.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">

                  <div className="space-y-1.5">
                    <Label htmlFor="mobile-number" className="text-sm font-medium">
                      Mobile Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="mobile-number"
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
                      data-testid="input-sms-phone"
                      required
                      className={phoneError ? "border-destructive" : ""}
                    />
                    {phoneError && (
                      <p className="text-xs text-destructive mt-1">{phoneError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      U.S. mobile numbers only.
                    </p>
                  </div>

                  <div className="rounded-md border-2 border-border bg-muted/30 p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="sms-opt-in"
                        checked={agreed}
                        onCheckedChange={(v) => setAgreed(v === true)}
                        data-testid="checkbox-sms-consent"
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="sms-opt-in"
                        className="text-sm leading-relaxed text-foreground cursor-pointer"
                      >
                        By checking this box, I consent to receive{" "}
                        <strong>recurring automated text message (SMS) notifications</strong>{" "}
                        from <strong>CoAIleague</strong> at the mobile number I provided above.
                        Messages include: shift assignments, schedule reminders, clock-in/out alerts,
                        open shift coverage requests, safety alerts, and account notifications sent
                        on behalf of my employer organization.{" "}
                        <strong>Message frequency varies</strong> — up to 10 messages per week
                        during active scheduling periods.{" "}
                        <strong>Message and data rates may apply.</strong>{" "}
                        Reply <strong>STOP</strong> to cancel at any time.
                        Reply <strong>HELP</strong> for help.
                        See{" "}
                        <Link href="/sms-terms" className="underline text-foreground">
                          SMS Terms
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="underline text-foreground">
                          Privacy Policy
                        </Link>.
                        <span className="block mt-2 text-muted-foreground text-xs font-normal">
                          Consent is not a condition of purchase, employment, or use of the platform.
                        </span>
                      </Label>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={!agreed || !phone}
                    data-testid="button-sms-submit"
                    className="w-full"
                  >
                    Opt In to SMS Workforce Alerts
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    You can opt out at any time by replying <strong>STOP</strong> to any message,
                    or by updating your notification settings in the CoAIleague app.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 rounded-md border border-border bg-muted/20 p-5 space-y-3 text-sm">
            <p className="font-semibold text-foreground">Program Summary</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <div><span className="font-medium text-foreground">Program name:</span><br />CoAIleague Workforce Alerts</div>
              <div><span className="font-medium text-foreground">Sender:</span><br />CoAIleague, Inc.</div>
              <div><span className="font-medium text-foreground">Message type:</span><br />Recurring automated</div>
              <div><span className="font-medium text-foreground">Frequency:</span><br />Up to 10 msgs/week</div>
              <div><span className="font-medium text-foreground">Number type:</span><br />Toll-free SMS / 10DLC</div>
              <div><span className="font-medium text-foreground">Supported carriers:</span><br />All major U.S. carriers</div>
              <div><span className="font-medium text-foreground">Opt-out:</span><br />Reply STOP</div>
              <div><span className="font-medium text-foreground">Help:</span><br />Reply HELP or {CONTACTS.support}</div>
            </div>
            <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground text-xs">Company Contact &amp; Address</p>
              <p>CoAIleague, Inc. &bull; {CONTACTS.support}</p>
              <p>For written correspondence: CoAIleague, Inc. — contact us at {CONTACTS.support}</p>
              <p className="mt-1">
                Consent is not a condition of any purchase, employment, or use of the platform.
                Standard message and data rates from your carrier may apply.
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            CoAIleague, Inc. &bull; Workforce Management for Security Companies
            &bull;{" "}
            <Link href="/sms-terms" className="underline hover:text-foreground">SMS Terms</Link>
            {" "}&bull;{" "}
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
            {" "}&bull;{" "}
            <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Trinity™ is a proprietary trademark of CoAIleague, Inc. &copy; {new Date().getFullYear()} CoAIleague, Inc. All rights reserved.
          </p>
        </div>

        <Footer variant="light" />
      </div>
    </>
  );
}
