/**
 * Tutorial Manager Panel - Account support macros and procedures
 * Organized tutorials for common account-related support tasks
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  BookOpen, RefreshCw, Lock, Unlock, UserX, UserCheck,
  Mail, Key, Shield, AlertCircle, CheckCircle, Copy,
  Play, Search, ChevronRight
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Tutorial {
  id: string;
  title: string;
  category: 'account' | 'security' | 'password' | 'access' | 'verification';
  icon: any;
  steps: string[];
  commands?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

interface TutorialManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialManagerPanel({ isOpen, onClose }: TutorialManagerPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const { toast } = useToast();

  const tutorials: Tutorial[] = [
    // Password & Security
    {
      id: 'reset-password',
      title: 'Reset User Password',
      category: 'password',
      icon: RefreshCw,
      difficulty: 'easy',
      steps: [
        'Verify user identity (email + security question)',
        'Click "Reset Password" in user profile',
        'Generate temporary password or send reset link',
        'Instruct user to change password on first login',
        'Log action in audit trail'
      ],
      commands: ['/resetpass [email]', 'User will receive reset link via email']
    },
    {
      id: 'unlock-account',
      title: 'Unlock Locked Account',
      category: 'access',
      icon: Unlock,
      difficulty: 'easy',
      steps: [
        'Verify account is locked (check status indicator)',
        'Confirm user identity via email/phone',
        'Review lock reason (failed login attempts, admin action)',
        'Click "Unlock Account" button',
        'Reset failed login counter',
        'Notify user account is unlocked'
      ],
      commands: ['/unlock [email]', 'Account will be immediately unlocked']
    },
    {
      id: 'suspend-account',
      title: 'Suspend Account (Violation)',
      category: 'access',
      icon: UserX,
      difficulty: 'medium',
      steps: [
        'Document violation reason (required)',
        'Navigate to user account management',
        'Select "Suspend Account"',
        'Enter suspension reason and duration',
        'Confirm suspension action',
        'Send suspension notification email to user',
        'Log action with timestamp and admin ID'
      ],
      commands: ['/suspend [email] [reason]', 'Requires approval from manager']
    },
    {
      id: 'restore-account',
      title: 'Restore Suspended Account',
      category: 'access',
      icon: UserCheck,
      difficulty: 'easy',
      steps: [
        'Verify suspension has been reviewed',
        'Confirm restoration is approved',
        'Click "Restore Account" in user profile',
        'Remove suspension flags',
        'Send restoration confirmation email',
        'Update audit log with restoration'
      ],
      commands: ['/restore [email]', 'Account access will be restored']
    },
    // Email & Verification
    {
      id: 'verify-email',
      title: 'Manually Verify Email',
      category: 'verification',
      icon: Mail,
      difficulty: 'easy',
      steps: [
        'Confirm user has access to email (ask for code)',
        'Navigate to verification panel',
        'Mark email as verified',
        'Remove "unverified" badge from account',
        'Log manual verification with reason'
      ],
      commands: ['/verify [email]', 'Email will be marked as verified']
    },
    {
      id: 'change-email',
      title: 'Change Account Email',
      category: 'account',
      icon: Mail,
      difficulty: 'medium',
      steps: [
        'Verify current user identity (2-factor preferred)',
        'Get new email address from user',
        'Check if new email is already in system',
        'Send verification to new email address',
        'User confirms new email',
        'Update account email',
        'Send confirmation to both old and new emails'
      ]
    },
    // Security
    {
      id: 'enable-2fa',
      title: 'Enable Two-Factor Auth',
      category: 'security',
      icon: Shield,
      difficulty: 'medium',
      steps: [
        'Navigate to user security settings',
        'Click "Enable 2FA"',
        'Show QR code to user (or send via email)',
        'User scans with authenticator app',
        'User enters 6-digit verification code',
        'Save backup codes',
        'Enable 2FA on account',
        'Notify user via email'
      ]
    },
    {
      id: 'disable-2fa',
      title: 'Disable Two-Factor Auth',
      category: 'security',
      icon: Shield,
      difficulty: 'hard',
      steps: [
        'CRITICAL: Verify user identity thoroughly',
        'Ask security questions + ID verification',
        'Document reason for disabling 2FA',
        'Get manager approval (required)',
        'Disable 2FA in security settings',
        'Invalidate backup codes',
        'Force password change on next login',
        'Log action with full audit trail'
      ],
      commands: ['Requires manager approval', 'High-risk action - verify carefully']
    },
    // Access Management
    {
      id: 'reset-mfa',
      title: 'Reset MFA Device',
      category: 'security',
      icon: Key,
      difficulty: 'medium',
      steps: [
        'User confirms lost access to MFA device',
        'Verify identity via backup method',
        'Clear existing MFA registration',
        'Guide user to re-register new device',
        'Generate new backup codes',
        'Test new MFA setup before completion'
      ]
    },
    {
      id: 'account-recovery',
      title: 'Full Account Recovery',
      category: 'account',
      icon: AlertCircle,
      difficulty: 'hard',
      steps: [
        'Gather all available user verification info',
        'Contact via alternate communication method',
        'Verify identity through multiple factors',
        'Document recovery reason thoroughly',
        'Reset credentials step-by-step',
        'Re-verify email and phone',
        'Set temporary password',
        'Require password + security question change',
        'Enable account monitoring for 48 hours'
      ]
    }
  ];

  const filteredTutorials = tutorials.filter(tutorial =>
    tutorial.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tutorial.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryColor = (category: Tutorial['category']) => {
    const colors = {
      account: 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100',
      security: 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100',
      password: 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100',
      access: 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100',
      verification: 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100'
    };
    return colors[category];
  };

  const getDifficultyColor = (difficulty: Tutorial['difficulty']) => {
    const colors = {
      easy: 'text-primary dark:text-primary',
      medium: 'text-blue-600 dark:text-blue-400',
      hard: 'text-red-600 dark:text-red-400'
    };
    return colors[difficulty];
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast({
      title: "Copied to clipboard",
      description: command,
    });
  };

  return (
    <UniversalModal open={isOpen} onOpenChange={onClose}>
      <UniversalModalContent size="full" className="max-h-[90vh] overflow-hidden">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            Support Tutorials & Macros
          </UniversalModalTitle>
          <UniversalModalDescription>
            Step-by-step guides for account management and support operations
          </UniversalModalDescription>
        </UniversalModalHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tutorials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-tutorials"
          />
        </div>

        <div className="grid grid-cols-12 gap-4 h-[550px]">
          {/* Tutorial List */}
          <div className="col-span-5">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-2">
                {filteredTutorials.map((tutorial) => (
                  <button
                    key={tutorial.id}
                    onClick={() => setSelectedTutorial(tutorial)}
                    className={`w-full text-left p-3 rounded-lg border transition-all hover-elevate active-elevate-2 ${
                      selectedTutorial?.id === tutorial.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                    data-testid={`tutorial-${tutorial.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <tutorial.icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm mb-1">{tutorial.title}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[10px] px-1.5 py-0 ${getCategoryColor(tutorial.category)}`}>
                            {tutorial.category}
                          </Badge>
                          <span className={`text-xs font-medium ${getDifficultyColor(tutorial.difficulty)}`}>
                            {tutorial.difficulty}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Tutorial Details */}
          <div className="col-span-7">
            {selectedTutorial ? (
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <selectedTutorial.icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{selectedTutorial.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge className={`text-[10px] ${getCategoryColor(selectedTutorial.category)}`}>
                          {selectedTutorial.category}
                        </Badge>
                        <span className={`text-xs font-bold ${getDifficultyColor(selectedTutorial.difficulty)}`}>
                          {selectedTutorial.difficulty.toUpperCase()}
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[380px] pr-4">
                    {/* Steps */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Procedure Steps
                      </h4>
                      {selectedTutorial.steps.map((step, index) => (
                        <div key={index} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">
                            {index + 1}
                          </div>
                          <p className="text-sm flex-1 pt-0.5">{step}</p>
                        </div>
                      ))}
                    </div>

                    {/* Commands */}
                    {selectedTutorial.commands && selectedTutorial.commands.length > 0 && (
                      <div className="mt-6 space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Quick Commands
                        </h4>
                        {selectedTutorial.commands.map((command, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800"
                          >
                            <code className="flex-1 text-xs font-mono text-blue-600">
                              {command}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyCommand(command)}
                              className="h-6 px-2"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Execute Button */}
                    <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <Button className="w-full" data-testid="button-execute-tutorial">
                        <Play className="w-4 h-4 mr-2" />
                        Start Tutorial Workflow
                      </Button>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                <div className="text-center text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a tutorial to view steps</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-muted-foreground">
            {filteredTutorials.length} tutorials available
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}
