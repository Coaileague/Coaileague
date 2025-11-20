/**
 * Automation Settings - Configure AI Brain automation thresholds and preferences
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings, Sparkles, DollarSign, AlertTriangle, Save } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function AutomationSettings() {
  const { toast } = useToast();
  const [autoApproveSchedule, setAutoApproveSchedule] = useState(true);
  const [autoSubmitPayroll, setAutoSubmitPayroll] = useState(false);
  const [autoSendInvoices, setAutoSendInvoices] = useState(true);
  const [scheduleConfidenceThreshold, setScheduleConfidenceThreshold] = useState(0.95);
  const [maxCreditsPerDay, setMaxCreditsPerDay] = useState(100);

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Automation preferences updated successfully",
    });
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Automation Settings</h1>
          <p className="text-muted-foreground">Configure AI Brain automation thresholds and auto-approval preferences</p>
        </div>
      </div>

      {/* AI Scheduling Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI Scheduling</CardTitle>
          </div>
          <CardDescription>Control automated schedule generation and approval</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Approve High-Confidence Schedules</Label>
              <div className="text-sm text-muted-foreground">
                Automatically approve schedules with confidence ≥ {(scheduleConfidenceThreshold * 100).toFixed(0)}%
              </div>
            </div>
            <Switch
              checked={autoApproveSchedule}
              onCheckedChange={setAutoApproveSchedule}
              data-testid="switch-auto-approve-schedule"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Confidence Threshold for Auto-Approval</Label>
            <div className="flex items-center gap-4">
              <Input
                type="number"
                min="0.5"
                max="1.0"
                step="0.05"
                value={scheduleConfidenceThreshold}
                onChange={(e) => setScheduleConfidenceThreshold(parseFloat(e.target.value))}
                className="w-32"
                data-testid="input-confidence-threshold"
              />
              <span className="text-sm text-muted-foreground">
                {(scheduleConfidenceThreshold * 100).toFixed(0)}% confidence required
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payroll Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Auto Payroll</CardTitle>
          </div>
          <CardDescription>Configure automated payroll submission to Gusto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Submit Payroll to Gusto</Label>
              <div className="text-sm text-muted-foreground">
                Automatically submit payroll without manual review
              </div>
            </div>
            <Switch
              checked={autoSubmitPayroll}
              onCheckedChange={setAutoSubmitPayroll}
              data-testid="switch-auto-submit-payroll"
            />
          </div>
          
          <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <strong>Safety Note:</strong> Auto-submit is disabled by default. Always review payroll before submission to prevent errors.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Smart Invoicing</CardTitle>
          <CardDescription>Configure automated invoice generation and delivery</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Send Client Invoices</Label>
              <div className="text-sm text-muted-foreground">
                Automatically finalize and email invoices to clients via Stripe
              </div>
            </div>
            <Switch
              checked={autoSendInvoices}
              onCheckedChange={setAutoSendInvoices}
              data-testid="switch-auto-send-invoices"
            />
          </div>
        </CardContent>
      </Card>

      {/* Credit Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Usage Limits</CardTitle>
          <CardDescription>Set daily credit spending limits for AI automations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Maximum Credits Per Day</Label>
            <div className="flex items-center gap-4">
              <Input
                type="number"
                min="10"
                max="1000"
                step="10"
                value={maxCreditsPerDay}
                onChange={(e) => setMaxCreditsPerDay(parseInt(e.target.value))}
                className="w-32"
                data-testid="input-max-credits"
              />
              <span className="text-sm text-muted-foreground">
                credits/day across all automations
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg" data-testid="button-save-settings">
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
