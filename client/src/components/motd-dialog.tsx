/**
 * MOTD (Message of the Day) Dialog
 * Shows important announcements that require acknowledgment before entering chat
 * Editable by support staff
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AutoForceLogo } from "@/components/autoforce-logo";
import {
  Bell, AlertCircle, Info, Sparkles, Zap, Heart, Star, CheckCircle, X
} from "lucide-react";
import { useState } from "react";

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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-3xl p-0 bg-slate-900 border-2 border-blue-500/50 overflow-hidden"
        onPointerDownOutside={(e) => {
          if (message.requiresAcknowledgment) {
            e.preventDefault(); // Prevent closing if acknowledgment required
          }
        }}
        onEscapeKeyDown={(e) => {
          if (message.requiresAcknowledgment) {
            e.preventDefault(); // Prevent ESC close if acknowledgment required
          }
        }}
      >
        {/* Header with Logo and Close */}
        <DialogHeader 
          className="relative p-6 pb-4 border-b-2"
          style={{ 
            backgroundColor: bgColor,
            borderColor: `${textColor}40`
          }}
        >
          {!message.requiresAcknowledgment && onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20"
              style={{ color: textColor }}
              data-testid="button-close-motd"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          
          <div className="flex items-start gap-4">
            {/* Logo and Icon */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center">
                <AutoForceLogo size="sm" variant="icon" />
              </div>
              <div 
                className="p-3 rounded-lg backdrop-blur-sm animate-pulse"
                style={{ backgroundColor: `${textColor}20` }}
              >
                <IconComponent className="w-8 h-8" style={{ color: textColor }} />
              </div>
            </div>

            {/* Title */}
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
                {message.title}
                <Badge 
                  className="border"
                  style={{ 
                    backgroundColor: `${textColor}20`,
                    color: textColor,
                    borderColor: `${textColor}30`
                  }}
                >
                  WorkforceOS
                </Badge>
              </DialogTitle>
              <p className="text-sm mt-2 opacity-90" style={{ color: textColor }}>
                Message of the Day - Please read before continuing
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-8 bg-slate-800/50">
          <div 
            className="prose prose-invert max-w-none"
            style={{ color: '#e2e8f0' }}
          >
            <div className="text-base leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 border-t-2 border-slate-700 bg-slate-900/80">
          <div className="flex items-center justify-between w-full gap-4">
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
                  className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                  data-testid="button-skip-motd"
                >
                  Skip
                </Button>
              )}
              <Button 
                onClick={handleAcknowledge}
                disabled={isAcknowledging}
                className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold gap-2"
                data-testid="button-acknowledge-motd"
              >
                <CheckCircle className="w-4 h-4" />
                {isAcknowledging ? 'Processing...' : 'I Acknowledge - Enter Chat'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
