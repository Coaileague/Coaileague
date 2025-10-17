/**
 * Help Command Panel - Animated support command directory
 * All platform and chatroom commands organized by category
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare, Users, Shield, Zap, Settings, AlertCircle, 
  UserPlus, Lock, Unlock, UserX, RefreshCw, Bell, Flag,
  Eye, EyeOff, Volume2, VolumeX, UserCog, FileText,
  CheckCircle, XCircle, ArrowRight, Sparkles, Copy
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface CommandItem {
  command: string;
  description: string;
  usage: string;
  icon: any;
  category: string;
  staffOnly?: boolean;
  requiresAdmin?: boolean;
}

const COMMANDS: CommandItem[] = [
  // Chat Commands
  { command: '/intro', description: 'AI introduces you to customer', usage: '/intro', icon: Sparkles, category: 'chat', staffOnly: true },
  { command: '/welcome', description: 'Send welcome message', usage: '/welcome [name]', icon: MessageSquare, category: 'chat', staffOnly: true },
  { command: '/details', description: 'Request more details', usage: '/details', icon: FileText, category: 'chat', staffOnly: true },
  { command: '/screenshot', description: 'Request screenshot', usage: '/screenshot', icon: Eye, category: 'chat', staffOnly: true },
  
  // User Management
  { command: '/spectate', description: 'Put user on hold (silence)', usage: '/spectate <user>', icon: EyeOff, category: 'user', staffOnly: true },
  { command: '/release', description: 'Release user from hold', usage: '/release <user>', icon: Eye, category: 'user', staffOnly: true },
  { command: '/mute', description: 'Mute user temporarily', usage: '/mute <user>', icon: VolumeX, category: 'user', staffOnly: true },
  { command: '/unmute', description: 'Unmute user', usage: '/unmute <user>', icon: Volume2, category: 'user', staffOnly: true },
  { command: '/kick', description: 'Remove user from chat', usage: '/kick <user> [reason]', icon: UserX, category: 'user', staffOnly: true },
  
  // Account Support
  { command: '/auth', description: 'Request user authentication', usage: '/auth', icon: Lock, category: 'account', staffOnly: true },
  { command: '/verify', description: 'Verify user identity', usage: '/verify <user>', icon: CheckCircle, category: 'account', staffOnly: true },
  { command: '/resetpass', description: 'Send password reset', usage: '/resetpass <email>', icon: RefreshCw, category: 'account', staffOnly: true },
  { command: '/checkaccount', description: 'Check account status', usage: '/checkaccount <user>', icon: UserCog, category: 'account', staffOnly: true },
  
  // Ticket Management
  { command: '/escalate', description: 'Escalate to higher support', usage: '/escalate [reason]', icon: ArrowRight, category: 'ticket', staffOnly: true },
  { command: '/resolved', description: 'Mark ticket resolved', usage: '/resolved', icon: CheckCircle, category: 'ticket', staffOnly: true },
  { command: '/close', description: 'Close conversation/ticket', usage: '/close [reason]', icon: XCircle, category: 'ticket', staffOnly: true },
  { command: '/assign', description: 'Assign to staff member', usage: '/assign <staff>', icon: UserPlus, category: 'ticket', staffOnly: true },
  { command: '/transfer', description: 'Transfer to another agent', usage: '/transfer <staff>', icon: ArrowRight, category: 'ticket', staffOnly: true },
  
  // System Commands
  { command: '/room', description: 'Change room status', usage: '/room <open|closed|maintenance>', icon: Settings, category: 'system', staffOnly: true, requiresAdmin: true },
  { command: '/banner', description: 'Manage announcement banners', usage: '/banner <add|remove|list>', icon: Bell, category: 'system', staffOnly: true },
  { command: '/broadcast', description: 'Send system announcement', usage: '/broadcast <message>', icon: Bell, category: 'system', staffOnly: true, requiresAdmin: true },
  
  // User Commands
  { command: '/help', description: 'Show available commands', usage: '/help', icon: AlertCircle, category: 'info' },
  { command: '/queue', description: 'Check your queue position', usage: '/queue', icon: Users, category: 'info' },
  { command: '/info', description: 'View account information', usage: '/info', icon: FileText, category: 'info' },
];

const CATEGORIES = [
  { id: 'chat', name: 'Chat Commands', icon: MessageSquare, color: 'blue' },
  { id: 'user', name: 'User Management', icon: Users, color: 'purple' },
  { id: 'account', name: 'Account Support', icon: UserCog, color: 'green' },
  { id: 'ticket', name: 'Ticket Management', icon: Flag, color: 'orange' },
  { id: 'system', name: 'System Commands', icon: Settings, color: 'red' },
  { id: 'info', name: 'User Commands', icon: AlertCircle, color: 'slate' },
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredCommands = COMMANDS.filter(cmd => {
    // Filter by permissions
    if (cmd.staffOnly && !isStaff) return false;
    if (cmd.requiresAdmin && !isAdmin) return false;
    // Filter by category if selected
    if (selectedCategory && cmd.category !== selectedCategory) return false;
    return true;
  });

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast({
      title: "Copied!",
      description: `${command} copied to clipboard`,
    });
  };

  const handleExecute = (command: string) => {
    if (onExecuteCommand) {
      onExecuteCommand(command);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] p-0 animate-in fade-in-0 zoom-in-95">
        <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm animate-pulse">
              <AlertCircle className="w-6 h-6" />
            </div>
            Command Center
          </DialogTitle>
          <p className="text-sm text-blue-100 mt-2">
            All platform and chatroom commands organized for quick access
          </p>
        </DialogHeader>

        <div className="flex gap-4 p-6 pt-4">
          {/* Category Filters */}
          <div className="w-48 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase mb-3">Categories</p>
            <Button
              variant={selectedCategory === null ? "default" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setSelectedCategory(null)}
              data-testid="category-all"
            >
              <Zap className="w-4 h-4" />
              All Commands
            </Button>
            {CATEGORIES.map((cat) => {
              const count = COMMANDS.filter(cmd => {
                if (cmd.category !== cat.id) return false;
                if (cmd.staffOnly && !isStaff) return false;
                if (cmd.requiresAdmin && !isAdmin) return false;
                return true;
              }).length;
              
              if (count === 0) return null;
              
              return (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "default" : "ghost"}
                  className="w-full justify-start gap-2"
                  onClick={() => setSelectedCategory(cat.id)}
                  data-testid={`category-${cat.id}`}
                >
                  <cat.icon className="w-4 h-4" />
                  {cat.name}
                  <Badge variant="secondary" className="ml-auto">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          {/* Commands Grid */}
          <ScrollArea className="flex-1 h-[500px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-4">
              {filteredCommands.map((cmd) => (
                <Card key={cmd.command} className="overflow-hidden hover-elevate transition-all">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <cmd.icon className="w-4 h-4 text-blue-600" />
                      <code className="text-sm font-mono">{cmd.command}</code>
                      {cmd.staffOnly && (
                        <Badge variant="secondary" className="text-xs ml-auto">
                          Staff
                        </Badge>
                      )}
                      {cmd.requiresAdmin && (
                        <Badge variant="destructive" className="text-xs ml-auto">
                          Admin
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {cmd.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 p-2 rounded font-mono">
                      {cmd.usage}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyCommand(cmd.usage)}
                        className="flex-1"
                        data-testid={`copy-${cmd.command}`}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                      {isStaff && (
                        <Button
                          size="sm"
                          onClick={() => handleExecute(cmd.command)}
                          className="flex-1"
                          data-testid={`execute-${cmd.command}`}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Execute
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="p-4 border-t bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
          <p className="text-xs text-slate-500">
            💡 Click Execute to use a command instantly, or Copy to paste it manually
          </p>
          <Button variant="outline" onClick={onClose} data-testid="button-close-help">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
