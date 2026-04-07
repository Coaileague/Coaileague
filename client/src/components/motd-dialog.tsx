/**
 * MOTD (Message of the Day) Dialog
 * Shows important announcements that require acknowledgment before entering chat
 * Editable by support staff
 * 
 * Uses canvas hub ResponsiveDialog for proper layer coordination and sizing
 */

import { ResponsiveDialog } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrinityLogo } from "@/components/trinity-logo";
import {
  Bell, AlertCircle, Info, Sparkles, Zap, Heart, Star, CheckCircle
} from "lucide-react";

import { useState } from "react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface MotdMessage {
  id: string;
  title: string;
  content: string;
  backgroundColor?: string;
  textColor?: string;
  iconName?: string;
  requiresAcknowledgment?: boolean;
}

interface MotdDialogProps {
  open: boolean;
  message: MotdMessage | null;
  onAcknowledge: () => void;
  onClose?: () => void;
}

// Icon mapping
const iconMap: Record<string, any> = {
  bell: Bell,
  alert: AlertCircle,
  info: Info,
  sparkles: Sparkles,
  zap: Zap,
  heart: Heart,
  star: Star,
  check: CheckCircle,
};

export function MotdDialog({ 
  open, 
  message, 
  onAcknowledge,
  onClose 
}: MotdDialogProps) {
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  if (!message) return null;

  const IconComponent = iconMap[message.iconName || 'bell'] || Bell;
  const bgColor = message.backgroundColor || '#1e3a8a';
  const textColor = message.textColor || '#ffffff';

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);
    await onAcknowledge();
    setIsAcknowledging(false);
  };

  // Build title with logo and icon
  const titleElement = (
    <div className="flex items-start gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center">
          <TrinityLogo size={24} />
        </div>
        <div 
          className="p-3 rounded-lg backdrop-blur-sm animate-pulse"
          style={{ backgroundColor: `${textColor}20` }}
        >
          <IconComponent className="w-8 h-8" style={{ color: textColor }} />
        </div>
      </div>
      <div className="flex-1">
        <span className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
          {message.title}
          <Badge 
            className="border"
            style={{ 
              backgroundColor: `${textColor}20`,
              color: textColor,
              borderColor: `${textColor}30`
            }}
          >
            {PLATFORM_NAME}
          </Badge>
        </span>
        <p className="text-sm mt-2 opacity-90" style={{ color: textColor }}>
          Message of the Day - Please read before continuing
        </p>
      </div>
    </div>
  );

  // Build footer with acknowledgment button
  const footerElement = (
    <div className="flex items-center justify-between w-full gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/50">
          {message.requiresAcknowledgment ? '⚠️ Acknowledgment Required' : 'ℹ️ Information'}
        </Badge>
      </div>
      <div className="flex gap-3">
        {!message.requiresAcknowledgment && onClose && (
          <Button 
            variant="outline" 
            onClick={onClose}
            className="bg-slate-700 border-slate-600 text-white"
            data-testid="button-skip-motd"
          >
            Skip
          </Button>
        )}
        <Button 
          onClick={handleAcknowledge}
          disabled={isAcknowledging}
          className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-semibold gap-2"
          data-testid="button-acknowledge-motd"
        >
          <CheckCircle className="w-4 h-4" />
          {isAcknowledging ? 'Processing...' : 'I Acknowledge - Enter Chat'}
        </Button>
      </div>
    </div>
  );

  // Handle close - prevent closing if acknowledgment required
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && message.requiresAcknowledgment) {
      return; // Don't allow closing
    }
    onClose?.();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={titleElement}
      description="Please read and acknowledge this message before continuing"
      footer={footerElement}
      size="xl"
      contentClassName="bg-slate-900 border border-blue-500/50 p-0 overflow-hidden"
    >
      {/* Content */}
      <div className="p-6 sm:p-8 bg-slate-800/50">
        <div 
          className="prose prose-invert max-w-none text-slate-200"
        >
          <div className="text-base leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
