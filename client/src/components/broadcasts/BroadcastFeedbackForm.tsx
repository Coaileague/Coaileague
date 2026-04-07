/**
 * Broadcast Feedback Form
 * Modal form for submitting feedback in response to a feedback_request broadcast
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Loader2, Send, Lightbulb, Bug, MessageSquare, ThumbsUp, HelpCircle } from 'lucide-react';
import { useSubmitBroadcastFeedback } from '@/hooks/useBroadcasts';
import { cn } from '@/lib/utils';
import type { FeedbackType } from '@shared/types/broadcasts';

// ============================================
// FORM SCHEMA
// ============================================

const feedbackFormSchema = z.object({
  feedbackType: z.enum(['idea', 'bug', 'complaint', 'praise', 'general']),
  subject: z.string().optional(),
  content: z.string().min(10, 'Please provide at least 10 characters of feedback'),
  category: z.string().optional(),
  allowFollowup: z.boolean(),
  contactMethod: z.enum(['email', 'in_app', 'phone']).optional(),
});

type FeedbackFormData = z.infer<typeof feedbackFormSchema>;

// ============================================
// FEEDBACK TYPE OPTIONS
// ============================================

const FEEDBACK_TYPES: Array<{
  value: FeedbackType;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}> = [
  {
    value: 'idea',
    label: 'Feature Idea',
    icon: <Lightbulb className="h-5 w-5" />,
    description: 'Suggest a new feature or improvement',
    color: 'bg-amber-100 text-amber-600 border-amber-200',
  },
  {
    value: 'bug',
    label: 'Bug Report',
    icon: <Bug className="h-5 w-5" />,
    description: 'Report something that isn\'t working',
    color: 'bg-red-100 text-red-600 border-red-200',
  },
  {
    value: 'praise',
    label: 'Praise',
    icon: <ThumbsUp className="h-5 w-5" />,
    description: 'Share what you love about the app',
    color: 'bg-green-100 text-green-600 border-green-200',
  },
  {
    value: 'general',
    label: 'General Feedback',
    icon: <MessageSquare className="h-5 w-5" />,
    description: 'Any other thoughts or comments',
    color: 'bg-blue-100 text-blue-600 border-blue-200',
  },
];

const CATEGORY_OPTIONS = [
  { value: 'scheduling', label: 'Scheduling' },
  { value: 'time_tracking', label: 'Time & Attendance' },
  { value: 'communication', label: 'Communication' },
  { value: 'mobile_app', label: 'Mobile App' },
  { value: 'reporting', label: 'Reports & Analytics' },
  { value: 'billing', label: 'Billing & Payments' },
  { value: 'other', label: 'Other' },
];

// ============================================
// MAIN COMPONENT
// ============================================

interface BroadcastFeedbackFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  broadcastId: string;
  feedbackType?: FeedbackType;
}

export function BroadcastFeedbackForm({
  open,
  onOpenChange,
  broadcastId,
  feedbackType = 'general',
}: BroadcastFeedbackFormProps) {
  const submitFeedback = useSubmitBroadcastFeedback();

  const form = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      feedbackType,
      subject: '',
      content: '',
      category: '',
      allowFollowup: true,
      contactMethod: 'in_app',
    },
  });

  const watchFeedbackType = form.watch('feedbackType');
  const watchAllowFollowup = form.watch('allowFollowup');

  const onSubmit = async (data: FeedbackFormData) => {
    try {
      await submitFeedback.mutateAsync({
        broadcastId,
        feedbackType: data.feedbackType,
        subject: data.subject,
        content: data.content,
        category: data.category,
        allowFollowup: data.allowFollowup,
        contactMethod: data.allowFollowup ? data.contactMethod : undefined,
      });
      onOpenChange(false);
      form.reset();
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="default">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Share Your Feedback
          </UniversalModalTitle>
          <UniversalModalDescription>
            Your feedback helps us improve. Thank you for taking the time!
          </UniversalModalDescription>
        </UniversalModalHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Feedback Type Selection */}
          <div className="space-y-2">
            <Label>What type of feedback?</Label>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => form.setValue('feedbackType', type.value)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                    watchFeedbackType === type.value
                      ? cn(type.color, "ring-2 ring-offset-1")
                      : "border-border hover:border-primary/50 bg-background"
                  )}
                >
                  <span className={cn(
                    "p-1.5 rounded-md",
                    watchFeedbackType === type.value ? "" : "bg-muted"
                  )}>
                    {type.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{type.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category (Optional)</Label>
            <Select
              value={form.watch('category') || ''}
              onValueChange={(v) => form.setValue('category', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject (for bugs) */}
          {watchFeedbackType === 'bug' && (
            <div className="space-y-2">
              <Label htmlFor="subject">Brief Description</Label>
              <Input
                id="subject"
                placeholder="e.g. Schedule doesn't load on mobile"
                {...form.register('subject')}
              />
            </div>
          )}

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">
              {watchFeedbackType === 'idea' && 'Describe your idea'}
              {watchFeedbackType === 'bug' && 'Steps to reproduce / What happened'}
              {watchFeedbackType === 'praise' && 'What do you love?'}
              {watchFeedbackType === 'complaint' && 'What went wrong?'}
              {watchFeedbackType === 'general' && 'Your feedback'}
            </Label>
            <Textarea
              id="content"
              placeholder={
                watchFeedbackType === 'idea'
                  ? "I think it would be great if..."
                  : watchFeedbackType === 'bug'
                  ? "1. I went to...\n2. I clicked on...\n3. Then this happened..."
                  : "Share your thoughts..."
              }
              rows={5}
              {...form.register('content')}
            />
            {form.formState.errors.content && (
              <p className="text-xs text-red-500">{form.formState.errors.content.message}</p>
            )}
          </div>

          {/* Follow-up Preference */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="allowFollowup" className="font-medium">Allow follow-up</Label>
                <p className="text-xs text-muted-foreground">
                  We may reach out for more details
                </p>
              </div>
              <Switch
                id="allowFollowup"
                checked={watchAllowFollowup}
                onCheckedChange={(checked) => form.setValue('allowFollowup', checked)}
              />
            </div>

            {watchAllowFollowup && (
              <div className="space-y-2">
                <Label>Preferred contact method</Label>
                <Select
                  value={form.watch('contactMethod') || 'in_app'}
                  onValueChange={(v) => form.setValue('contactMethod', v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">In-App Message</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone Call</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <UniversalModalFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitFeedback.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitFeedback.isPending}
            >
              {submitFeedback.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Feedback
                </>
              )}
            </Button>
          </UniversalModalFooter>
        </form>
      </UniversalModalContent>
    </UniversalModal>
  );
}

export default BroadcastFeedbackForm;
