/**
 * Help Command Panel - Grid-based command center with AutoForce™ branding
 * Each command is a visual box with logo, controls, and actions
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import {
  MessageSquare, Users, Shield, Zap, Settings, AlertCircle, 
  UserPlus, Lock, Unlock, UserX, RefreshCw, Bell, Flag,
  Eye, EyeOff, Volume2, VolumeX, UserCog, FileText,
  CheckCircle, XCircle, ArrowRight, Sparkles, X, Save, Play
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface CommandItem {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  action: string;
  staffOnly?: boolean;
  requiresAdmin?: boolean;
}

const COMMAND_BOXES: CommandItem[] = [
  // Chat & Support
  { id: 'welcome', name: 'Welcome', description: 'Greet new users', icon: MessageSquare, color: 'from-blue-500 to-blue-600', action: '/welcome', staffOnly: true },
  { id: 'ai-intro', name: 'AI Intro', description: 'AI Brain greeting', icon: Sparkles, color: 'from-violet-500 to-purple-600', action: '/intro', staffOnly: true },
  { id: 'details', name: 'Request Details', description: 'Ask for more info', icon: FileText, color: 'from-blue-500 to-blue-600', action: '/details', staffOnly: true },
  { id: 'screenshot', name: 'Screenshot', description: 'Request screenshot', icon: Eye, color: 'from-primary to-accent', action: '/screenshot', staffOnly: true },
  
  // User Management
  { id: 'spectate', name: 'Hold User', description: 'Put on hold (silence)', icon: EyeOff, color: 'from-blue-500 to-blue-600', action: '/spectate', staffOnly: true },
  { id: 'release', name: 'Release Hold', description: 'Release from hold', icon: Eye, color: 'from-primary to-accent', action: '/release', staffOnly: true },
  { id: 'mute', name: 'Mute', description: 'Mute user', icon: VolumeX, color: 'from-red-500 to-red-600', action: '/mute', staffOnly: true },
  { id: 'kick', name: 'Kick User', description: 'Remove from chat', icon: UserX, color: 'from-rose-500 to-rose-600', action: '/kick', staffOnly: true },
  
  // Account Support
  { id: 'auth', name: 'Authenticate', description: 'Verify identity', icon: Lock, color: 'from-indigo-500 to-indigo-600', action: '/auth', staffOnly: true },
  { id: 'resetpass', name: 'Reset Password', description: 'Send reset link', icon: RefreshCw, color: 'from-orange-500 to-orange-600', action: '/resetpass', staffOnly: true },
  { id: 'checkaccount', name: 'Check Account', description: 'View account status', icon: UserCog, color: 'from-blue-500 to-blue-600', action: '/checkaccount', staffOnly: true },
  
  // Ticket Management
  { id: 'escalate', name: 'Escalate', description: 'Higher support tier', icon: ArrowRight, color: 'from-pink-500 to-pink-600', action: '/escalate', staffOnly: true },
  { id: 'resolved', name: 'Resolved', description: 'Mark as resolved', icon: CheckCircle, color: 'from-lime-500 to-lime-600', action: '/resolved', staffOnly: true },
  { id: 'close', name: 'Close Ticket', description: 'Close conversation', icon: XCircle, color: 'from-slate-500 to-slate-600', action: '/close', staffOnly: true },
  
  // System (Admin)
  { id: 'room', name: 'Room Status', description: 'Change room status', icon: Settings, color: 'from-purple-600 to-purple-700', action: '/room', staffOnly: true, requiresAdmin: true },
  { id: 'banner', name: 'Manage Banner', description: 'Edit announcements', icon: Bell, color: 'from-fuchsia-500 to-fuchsia-600', action: '/banner', staffOnly: true },
  
  // User Commands
  { id: 'help', name: 'Help', description: 'Show this panel', icon: AlertCircle, color: 'from-gray-500 to-gray-600', action: '/help' },
  { id: 'queue', name: 'Queue Position', description: 'Check your position', icon: Users, color: 'from-sky-500 to-sky-600', action: '/queue' },
  { id: 'info', name: 'My Account', description: 'View account info', icon: FileText, color: 'from-blue-400 to-blue-500', action: '/info' },
];

interface HelpCommandPanelProps {
  open: boolean;
  onClose: () => void;
  isStaff?: boolean;
  isAdmin?: boolean;
  onExecuteCommand?: (command: string) => void;
}

export function HelpCommandPanel({ 
  open, 
  onClose, 
  isStaff = false, 
  isAdmin = false,
  onExecuteCommand 
}: HelpCommandPanelProps) {
  const { toast } = useToast();

  const filteredCommands = COMMAND_BOXES.filter(cmd => {
    if (cmd.staffOnly && !isStaff) return false;
    if (cmd.requiresAdmin && !isAdmin) return false;
    return true;
  });

  const handleExecute = (cmd: CommandItem) => {
    if (onExecuteCommand) {
      onExecuteCommand(cmd.action);
      toast({
        title: "Command Executed",
        description: `${cmd.name} command sent`,
      });
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-blue-500/30">
        {/* Header with Logo and Close */}
        <DialogHeader className="relative p-6 pb-4 flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-700 border-b-2 border-blue-400/50">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white"
            data-testid="button-close-help"
          >
            <X className="w-4 h-4" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <AnimatedAutoForceLogo size="sm" variant="icon" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
                Command Center
                <Badge className="bg-white/20 text-white border-white/30">
                  AI Brain
                </Badge>
              </DialogTitle>
              <p className="text-sm text-blue-100 mt-1">
                Click any command box to execute - Quick access to all support tools
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Command Grid */}
        <ScrollArea className="flex-1 p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="relative group"
              >
                {/* Command Box Card */}
                <div className="relative overflow-hidden rounded-xl border-2 border-slate-600/50 bg-slate-800/50 backdrop-blur-sm transition-all hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-1">
                  {/* Logo Badge */}
                  <div className="absolute top-2 left-2 z-10 scale-50">
                    <AnimatedAutoForceLogo size="sm" variant="icon" className="opacity-50" />
                  </div>
                  
                  {/* Close X (decorative) */}
                  <div className="absolute top-2 right-2 z-10 opacity-30 group-hover:opacity-50 transition-opacity">
                    <div className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center">
                      <X className="w-2.5 h-2.5 text-slate-400" />
                    </div>
                  </div>

                  {/* Gradient Header */}
                  <div className={`h-20 bg-gradient-to-br ${cmd.color} flex items-center justify-center relative`}>
                    <cmd.icon className="w-10 h-10 text-white drop-shadow-lg" />
                    {cmd.staffOnly && (
                      <Badge className="absolute top-2 left-1/2 -translate-x-1/2 text-xs bg-black/30 text-white border-white/30">
                        Staff
                      </Badge>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-3 space-y-2">
                    <h3 className="font-bold text-white text-sm truncate">
                      {cmd.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 min-h-[2rem]">
                      {cmd.description}
                    </p>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-1.5 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white"
                        onClick={() => handleExecute(cmd)}
                        data-testid={`execute-${cmd.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs bg-blue-900/30 border-blue-700/50 text-blue-300 hover:bg-blue-800/50 hover:text-white"
                        onClick={() => {
                          navigator.clipboard.writeText(cmd.action);
                          toast({ title: "Copied!", description: `${cmd.action} copied` });
                        }}
                        data-testid={`copy-${cmd.id}`}
                      >
                        <Save className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                    </div>

                    {/* Command Code */}
                    <div className="bg-black/30 rounded px-2 py-1 mt-2">
                      <code className="text-xs text-blue-400 font-mono">
                        {cmd.action}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t-2 border-slate-700 bg-slate-900/80 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/50">
              {filteredCommands.length} Commands
            </Badge>
            <p className="text-xs text-slate-400">
              💡 Click "Run" to execute instantly or "Copy" to use manually
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={onClose}
            className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
          >
            Exit Panel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
