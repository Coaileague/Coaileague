import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useServiceHealth } from '@/contexts/ServiceHealthContext';
import { useToast } from '@/hooks/use-toast';
import type { ServiceIncidentReportPayload } from '@shared/healthTypes';
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react';

// ============================================================================
// SERVICE FAILURE DIALOG
// ============================================================================
// User-friendly error reporting interface with screenshot upload
// Features:
// - Auto-detects failing service from error context
// - Optional user description for context
// - Screenshot upload for visual debugging
// - Automatic service health refresh after report

interface ServiceFailureDialogProps {
  error: Error | null;
  isOpen: boolean;
  onClose: () => void;
  onReset?: () => void;
}

export function ServiceFailureDialog({ error, isOpen, onClose, onReset }: ServiceFailureDialogProps) {
  // Always call hooks unconditionally (React rules)
  // Context will throw if provider missing, so dialog should only be used when provider is mounted
  const { reportIncident, isReportingIncident, healthSummary } = useServiceHealth();
  
  const { toast } = useToast();
  
  const [userMessage, setUserMessage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  // Detect service from sessionStorage or error
  const [detectedService, setDetectedService] = useState<string>('database');

  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens to allow multiple submissions
      setReportSubmitted(false);
      setUserMessage('');
      setScreenshot(null);
      
      // Try to load error details from sessionStorage
      try {
        const storedError = sessionStorage.getItem('lastError');
        if (storedError) {
          const parsed = JSON.parse(storedError);
          setDetectedService(parsed.serviceKey || 'database');
        }
      } catch (e) {
        console.error('Failed to parse stored error:', e);
      }
    }
  }, [isOpen]);

  // Get service details from health summary (with null safety)
  const failedService = healthSummary?.services?.find((s: any) => s.service === detectedService);
  const serviceName = failedService?.service.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 
    detectedService.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'Screenshot must be smaller than 5MB',
        });
        return;
      }
      setScreenshot(file);
    }
  };

  const handleSubmitReport = async () => {
    try {
      const payload: ServiceIncidentReportPayload = {
        serviceKey: detectedService as any,
        errorType: 'unknown',
        userMessage: userMessage || undefined,
        errorMessage: error?.message,
        stackTrace: error?.stack,
        metadata: {
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        },
      };

      await reportIncident(payload, screenshot || undefined);
      
      setReportSubmitted(true);
      toast({
        title: 'Report submitted',
        description: 'Thank you for reporting this issue. Our team will investigate.',
      });

      // Auto-close after success
      setTimeout(() => {
        onClose();
        if (onReset) onReset();
      }, 2000);
    } catch (reportError: any) {
      console.error('Failed to submit incident report:', reportError);
      toast({
        variant: 'destructive',
        title: 'Failed to submit report',
        description: reportError.message || 'Please try again later',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" data-testid="dialog-service-failure">
        {!reportSubmitted ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" data-testid="icon-alert" />
                </div>
                <DialogTitle data-testid="dialog-title">Service Issue Detected</DialogTitle>
              </div>
              <DialogDescription data-testid="dialog-description">
                We've detected an issue with <strong>{serviceName}</strong>. Help us fix it by providing more details below.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Error Details */}
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground" data-testid="text-error-message">
                  {error?.message || 'An unexpected error occurred'}
                </p>
              </div>

              {/* User Description */}
              <div className="space-y-2">
                <Label htmlFor="user-message">What were you trying to do? (Optional)</Label>
                <Textarea
                  id="user-message"
                  placeholder="e.g., I was trying to save a client record when the error occurred..."
                  value={userMessage}
                  onChange={(e) => setUserMessage(e.target.value)}
                  rows={3}
                  data-testid="textarea-user-message"
                />
              </div>

              {/* Screenshot Upload */}
              <div className="space-y-2">
                <Label htmlFor="screenshot">Screenshot (Optional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="screenshot"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleScreenshotChange}
                    className="hidden"
                    data-testid="input-screenshot"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('screenshot')?.click()}
                    data-testid="button-upload-screenshot"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {screenshot ? 'Change Screenshot' : 'Upload Screenshot'}
                  </Button>
                  {screenshot && (
                    <span className="text-sm text-muted-foreground" data-testid="text-screenshot-name">
                      {screenshot.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={onReset || onClose}
                disabled={isReportingIncident}
                data-testid="button-skip-report"
              >
                Skip Report
              </Button>
              <Button
                onClick={handleSubmitReport}
                disabled={isReportingIncident}
                data-testid="button-submit-report"
              >
                {isReportingIncident ? 'Submitting...' : 'Submit Report'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-500" data-testid="icon-success" />
                </div>
                <DialogTitle data-testid="dialog-title-success">Report Submitted</DialogTitle>
              </div>
              <DialogDescription data-testid="dialog-description-success">
                Thank you for helping us improve CoAIleague. Our team will investigate this issue.
              </DialogDescription>
            </DialogHeader>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
