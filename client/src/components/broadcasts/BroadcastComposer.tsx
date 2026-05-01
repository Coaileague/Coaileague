/**
 * Broadcast Composer
 * Form for creating and sending broadcasts to org employees or platform users
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, Users, UserCheck, Building2, Shield, MapPin, Calendar,
  AlertTriangle, Megaphone, Sparkles, MessageSquare, FileText, PartyPopper,
  Loader2, X, Plus
} from 'lucide-react';
import { useCreateBroadcast, useCreatePlatformBroadcast } from '@/hooks/useBroadcasts';
import { useEmployees } from '@/hooks/useEmployees';
import { cn } from '@/lib/utils';
import type { 
  BroadcastType, 
  BroadcastPriority, 
  BroadcastTargetType, 
  BroadcastActionType,
  CreateBroadcastRequest,
  BROADCAST_TYPE_CONFIG,
  BROADCAST_PRIORITY_CONFIG,
} from '@shared/types/broadcasts';

// ============================================
// FORM SCHEMA
// ============================================

const broadcastFormSchema = z.object({
  type: z.enum(['announcement', 'alert', 'system_notice', 'feature_release', 'feedback_request', 'policy_update', 'celebration']),
  priority: z.enum(['critical', 'high', 'normal', 'low']),
  title: z.string().min(1, 'Title is required').max(255),
  message: z.string().min(1, 'Message is required'),
  targetType: z.enum(['all_org', 'individuals', 'team', 'department', 'role', 'site']),
  targetEmployeeIds: z.array(z.string()).optional(),
  targetRoles: z.array(z.string()).optional(),
  actionType: z.enum(['none', 'link', 'acknowledge', 'feedback_form']),
  actionUrl: z.string().optional(),
  actionLabel: z.string().optional(),
  feedbackFormType: z.enum(['idea', 'bug', 'general']).optional(),
  expiresAt: z.string().optional(),
  isDraft: z.boolean().optional(),
});

type BroadcastFormData = z.infer<typeof broadcastFormSchema>;

// ============================================
// TYPE OPTIONS
// ============================================

const BROADCAST_TYPES: Array<{ value: BroadcastType; label: string; icon: string; description: string }> = [
  { value: 'announcement', label: 'Announcement', icon: '📢', description: 'General news and updates' },
  { value: 'alert', label: 'Alert', icon: '🚨', description: 'Urgent/important notices' },
  { value: 'policy_update', label: 'Policy Update', icon: '📜', description: 'Rules and compliance changes' },
  { value: 'feature_release', label: 'New Feature', icon: '✨', description: 'Product updates and releases' },
  { value: 'feedback_request', label: 'Feedback Request', icon: '💬', description: 'Request input from team' },
  { value: 'celebration', label: 'Celebration', icon: '🎉', description: 'Holidays, milestones, kudos' },
];

const PRIORITY_OPTIONS: Array<{ value: BroadcastPriority; label: string; color: string }> = [
  { value: 'critical', label: 'Critical (Must Acknowledge)', color: 'text-red-600' },
  { value: 'high', label: 'High Priority', color: 'text-orange-600' },
  { value: 'normal', label: 'Normal', color: 'text-blue-600' },
  { value: 'low', label: 'Low (Informational)', color: 'text-muted-foreground' },
];

const TARGET_OPTIONS: Array<{ value: BroadcastTargetType; label: string; icon: React.ReactNode }> = [
  { value: 'all_org', label: 'All Employees', icon: <Users className="h-4 w-4" /> },
  { value: 'individuals', label: 'Select Individuals', icon: <UserCheck className="h-4 w-4" /> },
  { value: 'role', label: 'By Role', icon: <Shield className="h-4 w-4" /> },
  { value: 'department', label: 'By Department', icon: <Building2 className="h-4 w-4" /> },
  { value: 'site', label: 'By Site/Location', icon: <MapPin className="h-4 w-4" /> },
];

const ROLE_OPTIONS = [
  { value: 'officer', label: 'Security Officers' },
  { value: 'supervisor', label: 'Supervisors' },
  { value: 'manager', label: 'Managers' },
  { value: 'admin', label: 'Admins' },
];

// ============================================
// MAIN COMPONENT
// ============================================

interface BroadcastComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPlatformLevel?: boolean;
}

export function BroadcastComposer({ open, onOpenChange, isPlatformLevel = false }: BroadcastComposerProps) {
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  
  const createBroadcast = useCreateBroadcast();
  const createPlatformBroadcast = useCreatePlatformBroadcast();
  const { employees } = useEmployees();

  const form = useForm<BroadcastFormData>({
    resolver: zodResolver(broadcastFormSchema),
    defaultValues: {
      type: 'announcement',
      priority: 'normal',
      title: '',
      message: '',
      targetType: 'all_org',
      actionType: 'none',
      isDraft: false,
    },
  });

  const watchType = form.watch('type');
  const watchTargetType = form.watch('targetType');
  const watchActionType = form.watch('actionType');
  const watchPriority = form.watch('priority');

  const onSubmit = async (data: BroadcastFormData) => {
    // Build target config
    let targetConfig: any = { type: data.targetType };
    
    if (data.targetType === 'individuals') {
      targetConfig.employeeIds = selectedEmployees;
    } else if (data.targetType === 'role') {
      targetConfig.roles = selectedRoles;
    }

    // Build action config
    let actionConfig: any = { type: data.actionType };
    
    if (data.actionType === 'link') {
      actionConfig.url = data.actionUrl;
      actionConfig.label = data.actionLabel || 'Learn More';
    } else if (data.actionType === 'feedback_form') {
      actionConfig.formType = data.feedbackFormType || 'general';
    } else if (data.actionType === 'acknowledge') {
      actionConfig.buttonLabel = 'I Acknowledge';
    }

    const request: CreateBroadcastRequest = {
      type: data.type,
      priority: data.priority,
      title: data.title,
      message: data.message,
      targetType: isPlatformLevel ? 'all_platform' : data.targetType,
      targetConfig,
      actionType: data.actionType,
      actionConfig,
      expiresAt: data.expiresAt,
      isDraft: data.isDraft,
    };

    try {
      if (isPlatformLevel) {
        await createPlatformBroadcast.mutateAsync(request);
      } else {
        await createBroadcast.mutateAsync(request);
      }
      onOpenChange(false);
      form.reset();
      setSelectedEmployees([]);
      setSelectedRoles([]);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isSubmitting = createBroadcast.isPending || createPlatformBroadcast.isPending;

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-lg flex flex-col" data-testid="dialog-broadcast-composer">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {isPlatformLevel ? 'Platform Broadcast' : 'Send Broadcast'}
          </UniversalModalTitle>
        </UniversalModalHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 pb-4">
              
              {/* Type Selection */}
              <div className="space-y-2">
                <Label>Broadcast Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BROADCAST_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => form.setValue('type', type.value)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                        watchType === type.value
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <span className="text-xl">{type.icon}</span>
                      <div>
                        <div className="text-sm font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={watchPriority}
                  onValueChange={(v) => form.setValue('priority', v as BroadcastPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className={opt.color}>{opt.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {watchPriority === 'critical' && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Recipients must acknowledge and cannot dismiss
                  </p>
                )}
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter broadcast title..."
                  {...form.register('title')}
                />
                {form.formState.errors.title && (
                  <p className="text-xs text-red-500">{form.formState.errors.title.message}</p>
                )}
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Write your message..."
                  rows={4}
                  {...form.register('message')}
                />
                {form.formState.errors.message && (
                  <p className="text-xs text-red-500">{form.formState.errors.message.message}</p>
                )}
              </div>

              {/* Target Selection (only for org-level) */}
              {!isPlatformLevel && (
                <div className="space-y-2">
                  <Label>Send To</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {TARGET_OPTIONS.map(target => (
                      <button
                        key={target.value}
                        type="button"
                        onClick={() => form.setValue('targetType', target.value)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                          watchTargetType === target.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {target.icon}
                        <span className="text-sm font-medium">{target.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Individual Selection */}
                  {watchTargetType === 'individuals' && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                      <Label className="text-xs">Select Employees</Label>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedEmployees.map(id => {
                          const emp = employees.find(e => e.id === id);
                          return (
                            <Badge key={id} variant="secondary" className="gap-1">
                              {emp?.firstName} {emp?.lastName}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => setSelectedEmployees(prev => prev.filter(e => e !== id))}
                              />
                            </Badge>
                          );
                        })}
                        <Select
                          onValueChange={(v) => {
                            if (!selectedEmployees.includes(v)) {
                              setSelectedEmployees(prev => [...prev, v]);
                            }
                          }}
                        >
                          <SelectTrigger className="w-auto h-7">
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </SelectTrigger>
                          <SelectContent>
                            {employees
                              .filter(e => !selectedEmployees.includes(e.id))
                              .map(emp => (
                                <SelectItem key={emp.id} value={emp.id}>
                                  {emp.firstName} {emp.lastName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Role Selection */}
                  {watchTargetType === 'role' && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                      <Label className="text-xs">Select Roles</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map(role => (
                          <button
                            key={role.value}
                            type="button"
                            onClick={() => {
                              if (selectedRoles.includes(role.value)) {
                                setSelectedRoles(prev => prev.filter(r => r !== role.value));
                              } else {
                                setSelectedRoles(prev => [...prev, role.value]);
                              }
                            }}
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium transition-all",
                              selectedRoles.includes(role.value)
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted hover:bg-muted/80"
                            )}
                          >
                            {role.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Type */}
              <div className="space-y-2">
                <Label>Action Button</Label>
                <Select
                  value={watchActionType}
                  onValueChange={(v) => form.setValue('actionType', v as BroadcastActionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No action button</SelectItem>
                    <SelectItem value="acknowledge">Require Acknowledgment</SelectItem>
                    <SelectItem value="feedback_form">Request Feedback</SelectItem>
                    <SelectItem value="link">Link to URL</SelectItem>
                  </SelectContent>
                </Select>

                {/* Link Config */}
                {watchActionType === 'link' && (
                  <div className="mt-2 space-y-2">
                    <Input
                      placeholder="https://..."
                      {...form.register('actionUrl')}
                    />
                    <Input
                      placeholder="Button label (e.g. Learn More)"
                      {...form.register('actionLabel')}
                    />
                  </div>
                )}

                {/* Feedback Form Config */}
                {watchActionType === 'feedback_form' && (
                  <div className="mt-2">
                    <Select
                      value={form.watch('feedbackFormType') || 'general'}
                      onValueChange={(v) => form.setValue('feedbackFormType', v as any)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Feedback type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="idea">Feature Ideas</SelectItem>
                        <SelectItem value="bug">Bug Reports</SelectItem>
                        <SelectItem value="general">General Feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Expiration */}
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires (Optional)</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  {...form.register('expiresAt')}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for no expiration
                </p>
              </div>

            </div>
          </ScrollArea>

          <div className="flex gap-2 pt-3 border-t shrink-0 bg-background px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                form.setValue('isDraft', true);
                form.handleSubmit(onSubmit)();
              }}
              disabled={isSubmitting}
            >
              Save Draft
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Broadcast
                </>
              )}
            </Button>
          </div>
        </form>
      </UniversalModalContent>
    </UniversalModal>
  );
}
