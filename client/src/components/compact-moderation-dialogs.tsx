/**
 * Compact Moderation Dialogs - Small, branded confirmation dialogs
 * For moderation actions like kick, mute, warn with reason input
 */

import { useState } from "react";
import { AutoForceAFLogo } from "@/components/autoforce-af-logo";
import { AlertTriangle, UserX, VolumeX, MessageCircleWarning, Ban } from "lucide-react";

interface CompactModerationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  type: 'kick' | 'mute' | 'warn' | 'hold';
  username: string;
}

export function CompactModerationDialog({
  open,
  onClose,
  onConfirm,
  type,
  username
}: CompactModerationDialogProps) {
  const [reason, setReason] = useState("");
  const [step, setStep] = useState(1);

  if (!open) return null;

  const config = {
    kick: {
      icon: UserX,
      title: "Remove from Chat?",
      subtitle: "This will disconnect them immediately",
      color: "text-red-600",
      bgColor: "bg-red-50 dark:bg-red-900/10"
    },
    mute: {
      icon: VolumeX,
      title: "Mute User?",
      subtitle: "They won't be able to send messages",
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-900/10"
    },
    warn: {
      icon: MessageCircleWarning,
      title: "Issue Warning?",
      subtitle: "Send a formal warning message",
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-900/10"
    },
    hold: {
      icon: Ban,
      title: "Put on Hold?",
      subtitle: "Silence user temporarily",
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-900/10"
    }
  };

  const cfg = config[type];
  const Icon = cfg.icon;

  const handleConfirm = () => {
    if (step === 1) {
      setStep(2);
    } else {
      onConfirm(reason || "No reason provided");
      setReason("");
      setStep(1);
      onClose();
    }
  };

  const handleCancel = () => {
    setReason("");
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 animate-in fade-in">
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl border-2 border-slate-300 dark:border-slate-600 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200"
        data-testid={`compact-${type}-dialog`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="flex-shrink-0">
            <AutoForceAFLogo size="sm" variant="icon" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {step === 1 ? cfg.title : "Select Reason"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {step === 1 ? `${username} • ${cfg.subtitle}` : "Required for moderation log"}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {step === 1 ? (
            <div className={`${cfg.bgColor} rounded-lg p-4 flex items-start gap-3`}>
              <AlertTriangle className={`w-5 h-5 ${cfg.color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${cfg.color} mb-1`}>
                  Are you sure you want to {type} {username}?
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {type === 'kick' && "This will immediately disconnect them from the support session. You'll be asked to provide a reason on the next screen."}
                  {type === 'mute' && "They won't be able to send messages until unmuted. You'll provide a reason on the next screen."}
                  {type === 'warn' && "A formal warning will be recorded in their account. You'll provide details on the next screen."}
                  {type === 'hold' && "User will be silenced temporarily. You'll provide a reason on the next screen."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason for action *
                </label>
                <div className="space-y-1.5">
                  {[
                    'Violation of terms',
                    'Abusive language',
                    'Spam or advertising',
                    'Inappropriate behavior',
                    'Other (specify below)'
                  ].map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={`w-full text-left px-3 py-2 text-xs rounded border transition-colors ${
                        reason === r
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                      }`}
                      data-testid={`reason-${r.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              
              {reason === 'Other (specify below)' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Custom reason
                  </label>
                  <textarea
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    placeholder="Describe the reason..."
                    rows={2}
                    onChange={(e) => setReason(e.target.value)}
                    data-testid="input-custom-reason"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
            data-testid="button-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={step === 2 && !reason.trim()}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              type === 'kick' || type === 'mute'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            data-testid="button-next"
          >
            {step === 1 ? 'Next: Select Reason' : `Confirm ${type}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Quick reason dialog - even more compact for quick actions
interface QuickReasonDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  username: string;
}

export function QuickReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  username
}: QuickReasonDialogProps) {
  const [reason, setReason] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-in fade-in">
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4"
        data-testid="quick-reason-dialog"
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{username}</p>
        </div>

        <div className="px-4 py-3">
          <textarea
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            placeholder="Enter reason or notes..."
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            data-testid="input-reason"
          />
        </div>

        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
            data-testid="button-cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(reason || "No reason provided");
              setReason("");
              onClose();
            }}
            disabled={!reason.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            data-testid="button-confirm"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
