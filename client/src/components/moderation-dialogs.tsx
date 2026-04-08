import { useState } from "react";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from "@/components/ui/universal-modal";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { AlertTriangle, UserX, Clock, MessageSquareOff, Mail } from "lucide-react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface KickDialogProps {
  open: boolean;
  userName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function KickDialog({ open, userName, onConfirm, onCancel }: KickDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedReason, setSelectedReason] = useState("not_cooperating");
  const [customReason, setCustomReason] = useState("");

  const kickReasons = [
    { value: "cursing", label: "Cursing / Profanity", icon: MessageSquareOff },
    { value: "abusive", label: "Abusive Behavior", icon: AlertTriangle },
    { value: "not_cooperating", label: "Not Willing to Cooperate for Assistance", icon: UserX },
    { value: "frozen", label: "Frozen / Lagged Out (Needs Release)", icon: Clock },
    { value: "spam", label: "Spam / Flooding Chat", icon: MessageSquareOff },
    { value: "custom", label: "Other (Specify Below)", icon: AlertTriangle },
  ];

  const handleConfirmKick = () => {
    let finalReason = "";
    const reasonObj = kickReasons.find(r => r.value === selectedReason);
    
    if (selectedReason === "custom") {
      finalReason = customReason || "Policy violation";
    } else {
      finalReason = reasonObj?.label || "Policy violation";
    }
    
    onConfirm(finalReason);
    // Reset for next time
    setStep(1);
    setSelectedReason("not_cooperating");
    setCustomReason("");
  };

  const handleCancel = () => {
    onCancel();
    // Reset for next time
    setStep(1);
    setSelectedReason("not_cooperating");
    setCustomReason("");
  };

  return (
    <UniversalModal open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()} size="md" className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-300 dark:border-slate-700">
        <UniversalModalHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <TrinityLogo size={24} />
            </div>
            <div className="flex-1">
              <UniversalModalTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {step === 1 ? "Remove User from Chat?" : "Select Reason for Removal"}
              </UniversalModalTitle>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {PLATFORM_NAME}™ Support • Moderation Action
              </p>
            </div>
          </div>
        </UniversalModalHeader>

        {step === 1 ? (
          <>
            <UniversalModalDescription className="text-sm text-slate-700 dark:text-slate-300 py-2">
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-200">
                    Are you sure you want to remove <strong>{userName}</strong> from the chat?
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    This will immediately disconnect them from the support session. You'll be asked to provide a reason on the next screen.
                  </p>
                </div>
              </div>
            </UniversalModalDescription>

            <UniversalModalFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="border-slate-300 dark:border-slate-700"
                data-testid="button-cancel-kick"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                className="bg-gradient-to-r from-slate-700 to-slate-900 text-white"
                data-testid="button-next-kick"
              >
                Next: Select Reason
              </Button>
            </UniversalModalFooter>
          </>
        ) : (
          <>
            <div className="py-2 space-y-4">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Select the reason for removing <strong className="text-slate-900 dark:text-slate-100">{userName}</strong>:
              </div>
              
              <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
                <div className="space-y-2">
                  {kickReasons.map((reason) => {
                    const Icon = reason.icon;
                    return (
                      <div
                        key={reason.value}
                        className={`
                          flex items-center space-x-3 p-3 rounded-md border cursor-pointer
                          transition-all
                          ${selectedReason === reason.value 
                            ? 'border-slate-600 dark:border-slate-400 bg-slate-100 dark:bg-slate-800' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                          }
                        `}
                        onClick={() => setSelectedReason(reason.value)}
                      >
                        <RadioGroupItem value={reason.value} id={reason.value} data-testid={`radio-reason-${reason.value}`} />
                        <Icon className={`w-4 h-4 ${selectedReason === reason.value ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`} />
                        <Label 
                          htmlFor={reason.value} 
                          className="flex-1 cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100"
                        >
                          {reason.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </RadioGroup>

              {selectedReason === "custom" && (
                <div className="mt-3">
                  <Label htmlFor="custom-reason" className="text-sm text-slate-700 dark:text-slate-300">
                    Specify Reason:
                  </Label>
                  <Textarea
                    id="custom-reason"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter the reason for removal..."
                    className="mt-2 text-sm"
                    rows={3}
                    data-testid="textarea-custom-reason"
                  />
                </div>
              )}
            </div>

            <UniversalModalFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="border-slate-300 dark:border-slate-700"
                data-testid="button-back-kick"
              >
                Back
              </Button>
              <Button
                onClick={handleConfirmKick}
                disabled={selectedReason === "custom" && !customReason.trim()}
                className="bg-gradient-to-r from-red-600 to-red-700 text-white"
                data-testid="button-confirm-kick"
              >
                <UserX className="w-4 h-4 mr-2" />
                Remove User
              </Button>
            </UniversalModalFooter>
          </>
        )}
    </UniversalModal>
  );
}

interface SilenceDialogProps {
  open: boolean;
  userName: string;
  onConfirm: (duration: string, reason: string) => void;
  onCancel: () => void;
}

export function SilenceDialog({ open, userName, onConfirm, onCancel }: SilenceDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [duration, setDuration] = useState("5");
  const [selectedReason, setSelectedReason] = useState("disruptive");
  const [customReason, setCustomReason] = useState("");

  const silenceReasons = [
    { value: "disruptive", label: "Disruptive Behavior" },
    { value: "spam", label: "Spam / Flooding" },
    { value: "cooldown", label: "Needs Time to Cool Down" },
    { value: "custom", label: "Other (Specify Below)" },
  ];

  const handleConfirmSilence = () => {
    let finalReason = "";
    const reasonObj = silenceReasons.find(r => r.value === selectedReason);
    
    if (selectedReason === "custom") {
      finalReason = customReason || "Chat violation";
    } else {
      finalReason = reasonObj?.label || "Chat violation";
    }
    
    onConfirm(duration, finalReason);
    // Reset
    setStep(1);
    setDuration("5");
    setSelectedReason("disruptive");
    setCustomReason("");
  };

  const handleCancel = () => {
    onCancel();
    setStep(1);
    setDuration("5");
    setSelectedReason("disruptive");
    setCustomReason("");
  };

  return (
    <UniversalModal open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()} size="md" className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-300 dark:border-slate-700">
        <UniversalModalHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <TrinityLogo size={24} />
            </div>
            <div className="flex-1">
              <UniversalModalTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {step === 1 ? "Silence User?" : "Select Reason"}
              </UniversalModalTitle>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {PLATFORM_NAME}™ Support • Moderation Action
              </p>
            </div>
          </div>
        </UniversalModalHeader>

        {step === 1 ? (
          <>
            <div className="py-2 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Temporarily silence <strong>{userName}</strong> from sending messages.
              </p>
              
              <div>
                <Label htmlFor="duration" className="text-sm text-slate-700 dark:text-slate-300">
                  Duration (minutes):
                </Label>
                <div className="flex gap-2 mt-2">
                  {["1", "5", "10", "30", "60"].map((min) => (
                    <Button
                      key={min}
                      variant={duration === min ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDuration(min)}
                      className={duration === min ? "bg-slate-700" : ""}
                      data-testid={`button-duration-${min}`}
                    >
                      {min}m
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <UniversalModalFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-silence">
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                className="bg-gradient-to-r from-slate-700 to-slate-900"
                data-testid="button-next-silence"
              >
                Next: Select Reason
              </Button>
            </UniversalModalFooter>
          </>
        ) : (
          <>
            <div className="py-2 space-y-4">
              <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
                <div className="space-y-2">
                  {silenceReasons.map((reason) => (
                    <div
                      key={reason.value}
                      className={`
                        flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-all
                        ${selectedReason === reason.value 
                          ? 'border-slate-600 bg-slate-100 dark:bg-slate-800' 
                          : 'border-slate-200 dark:border-slate-700'
                        }
                      `}
                      onClick={() => setSelectedReason(reason.value)}
                    >
                      <RadioGroupItem value={reason.value} id={`silence-${reason.value}`} />
                      <Label htmlFor={`silence-${reason.value}`} className="flex-1 cursor-pointer">
                        {reason.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>

              {selectedReason === "custom" && (
                <Textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Enter reason..."
                  rows={2}
                />
              )}
            </div>

            <UniversalModalFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-silence">
                Back
              </Button>
              <Button
                onClick={handleConfirmSilence}
                className="bg-gradient-to-r from-blue-600 to-blue-700"
                data-testid="button-confirm-silence"
              >
                Silence for {duration}m
              </Button>
            </UniversalModalFooter>
          </>
        )}
    </UniversalModal>
  );
}

// ─── Reset Email Dialog ───────────────────────────────────────────────────────

interface ResetEmailDialogProps {
  open: boolean;
  userName: string;
  onConfirm: (newEmail: string) => void;
  onCancel: () => void;
}

export function ResetEmailDialog({ open, userName, onConfirm, onCancel }: ResetEmailDialogProps) {
  const [email, setEmail] = useState("");

  const handleConfirm = () => {
    if (email.trim()) {
      onConfirm(email.trim());
      setEmail("");
    }
  };

  const handleCancel = () => {
    setEmail("");
    onCancel();
  };

  return (
    <UniversalModal open={open} onOpenChange={isOpen => !isOpen && handleCancel()}>
      <UniversalModalContent>
        <UniversalModalHeader>
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-blue-500" />
            <div>
              <UniversalModalTitle>Reset Email Address</UniversalModalTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Support Action • {userName}</p>
            </div>
          </div>
        </UniversalModalHeader>
        <UniversalModalDescription className="text-sm">
          Enter the new email address for <strong>{userName}</strong>. A verification link will be sent to the new address.
        </UniversalModalDescription>
        <div className="py-4 space-y-2">
          <Label htmlFor="reset-email-input">New Email Address</Label>
          <Input
            id="reset-email-input"
            type="email"
            placeholder="newaddress@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConfirm()}
            autoFocus
            data-testid="input-reset-email"
          />
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!email.trim() || !email.includes("@")}
            data-testid="button-confirm-reset-email"
          >
            Reset Email
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// ─── Report Issue Dialog ──────────────────────────────────────────────────────

interface ReportIssueDialogProps {
  open: boolean;
  targetName: string;
  onConfirm: (issue: string) => void;
  onCancel: () => void;
}

export function ReportIssueDialog({ open, targetName, onConfirm, onCancel }: ReportIssueDialogProps) {
  const [issue, setIssue] = useState("");

  const handleConfirm = () => {
    if (issue.trim()) {
      onConfirm(issue.trim());
      setIssue("");
    }
  };

  const handleCancel = () => {
    setIssue("");
    onCancel();
  };

  return (
    <UniversalModal open={open} onOpenChange={isOpen => !isOpen && handleCancel()}>
      <UniversalModalContent>
        <UniversalModalHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <div>
              <UniversalModalTitle>Report Issue</UniversalModalTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Support Action • {targetName}</p>
            </div>
          </div>
        </UniversalModalHeader>
        <UniversalModalDescription className="text-sm">
          Briefly describe the issue with <strong>{targetName}</strong>. This will be sent to platform support.
        </UniversalModalDescription>
        <div className="py-4 space-y-2">
          <Label htmlFor="report-issue-input">Issue Description</Label>
          <Textarea
            id="report-issue-input"
            placeholder="Describe the issue..."
            value={issue}
            onChange={e => setIssue(e.target.value)}
            rows={3}
            autoFocus
            data-testid="input-report-issue"
          />
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!issue.trim()}
            data-testid="button-confirm-report-issue"
          >
            Submit Report
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}
