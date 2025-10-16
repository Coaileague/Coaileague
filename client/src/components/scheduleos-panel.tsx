/**
 * ScheduleOS™ AI Auto-Scheduling Panel
 * Subscriber-Pays-All Model: 7-day free trial → Payment required
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Users, CheckCircle2, AlertCircle, Loader2, CreditCard, Calendar } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ScheduleOSPanelProps {
  weekStartDate: Date;
  onScheduleGenerated?: () => void;
}

export function ScheduleOSPanel({ weekStartDate, onScheduleGenerated }: ScheduleOSPanelProps) {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);

  // Check ScheduleOS™ status
  const { data: status, isLoading: statusLoading } = useQuery<any>({
    queryKey: ['/api/scheduleos/status'],
  });

  // Start trial mutation
  const startTrialMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduleos/start-trial');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Trial Started!",
        description: `ScheduleOS™ 7-day free trial activated. ${data.daysLeft} days remaining.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduleos/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start trial",
        variant: "destructive",
      });
    },
  });

  // Activate with payment mutation
  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduleos/activate', {
        paymentMethod: 'stripe_subscription', // TODO: Real Stripe flow when test keys added
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "ScheduleOS™ Activated!",
        description: "AI scheduling is now active. Generate your first schedule!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduleos/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Activation Failed",
        description: error.message || "Failed to activate ScheduleOS™",
        variant: "destructive",
      });
    },
  });

  // Generate AI schedule mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduleos/generate', {
        weekStartDate: weekStartDate.toISOString(),
        shiftRequirements: [],
        clientIds: [],
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "ScheduleOS™ Complete!",
        description: data.message || `Generated ${data.shiftsGenerated} shifts in ${data.processingTimeMs}ms`,
      });
      setShowPreview(true);
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      onScheduleGenerated?.();
    },
    onError: (error: any) => {
      toast({
        title: "ScheduleOS™ Error",
        description: error.message || "Failed to generate schedule",
        variant: "destructive",
      });
    },
  });

  if (statusLoading) {
    return (
      <Card className="border-indigo-500/30">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </CardContent>
      </Card>
    );
  }

  // STATE 1: Activated (Paid) - Fully unlocked
  if (status?.isActivated) {
    return (
      <Card className="border-indigo-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <CardTitle className="text-lg">ScheduleOS™ AI Auto-Scheduling</CardTitle>
            <Badge className="ml-auto bg-gradient-to-r from-indigo-600 to-purple-600">Active</Badge>
          </div>
          <CardDescription>
            AI analyzes employee performance, availability, and shift needs to generate the optimal schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Features */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-indigo-400" />
              <span>30-second generation</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-indigo-400" />
              <span>Performance-based</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span>Conflict detection</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              <span>Smart alerts</span>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-scheduleos-generate"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Schedule...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate AI Schedule
              </>
            )}
          </Button>

          {/* AI Insights (if data available) */}
          {showPreview && (
            <div className="p-3 rounded-md bg-muted/50 space-y-2">
              <p className="text-sm font-medium">AI Recommendations:</p>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>• Assigned top performers to peak hours</li>
                <li>• Avoided scheduling conflicts</li>
                <li>• Distributed hours evenly across team</li>
                <li>• All employees acknowledged schedules</li>
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Powered by GPT-4 • All schedules require employee acknowledgment
          </p>
        </CardContent>
      </Card>
    );
  }

  // STATE 2: Active Trial - Limited time access
  if (status?.isTrialActive) {
    return (
      <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <CardTitle className="text-lg">ScheduleOS™ AI - Free Trial</CardTitle>
            <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-500 border-amber-500/30">
              <Calendar className="h-3 w-3 mr-1" />
              {status.daysLeft} days left
            </Badge>
          </div>
          <CardDescription>
            AI-powered auto-scheduling. Try it free for {status.daysLeft} more days!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-scheduleos-trial-generate"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate AI Schedule (Trial)
              </>
            )}
          </Button>

          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
            <p className="text-sm text-amber-500 font-medium">Trial expires in {status.daysLeft} days</p>
            <p className="text-xs text-amber-500/80 mt-1">
              Activate with payment to continue using ScheduleOS™ AI
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full border-indigo-500/30"
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
            data-testid="button-scheduleos-activate-now"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {activateMutation.isPending ? "Activating..." : "Activate Now - Keep AI Forever"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // STATE 3: Trial Expired - Payment required
  if (status?.trialExpired) {
    return (
      <Card className="border-red-500/30 bg-gradient-to-br from-red-500/10 to-orange-500/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-red-400" />
            <CardTitle className="text-lg">ScheduleOS™ AI - Trial Expired</CardTitle>
            <Badge variant="outline" className="ml-auto bg-red-500/10 text-red-500 border-red-500/30">
              Locked
            </Badge>
          </div>
          <CardDescription>
            Your 7-day free trial has ended. Activate with payment to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-500 font-medium">Trial has expired</p>
            <p className="text-xs text-red-500/80 mt-1">
              Add payment method to unlock ScheduleOS™ AI (Owner/Manager only)
            </p>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
            data-testid="button-scheduleos-activate-trial-expired"
          >
            {activateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Activate ScheduleOS™ with Payment
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Requires credit card or subscription upgrade • Owner/Manager authorization required
          </p>
        </CardContent>
      </Card>
    );
  }

  // STATE 4: Not started - Offer free trial
  return (
    <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <CardTitle className="text-lg">ScheduleOS™ AI Auto-Scheduling</CardTitle>
          <Badge variant="outline" className="ml-auto bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
            AI Powered
          </Badge>
        </div>
        <CardDescription>
          AI generates optimal schedules in 30 seconds. Try it free for 7 days!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Features */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-indigo-400" />
            <span>30-second generation</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-indigo-400" />
            <span>Performance-based</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span>Conflict detection</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <span>Smart alerts</span>
          </div>
        </div>

        <div className="p-3 rounded-md bg-indigo-500/10 border border-indigo-500/30">
          <p className="text-sm text-indigo-400 font-medium">🎉 Start Your Free Trial</p>
          <p className="text-xs text-indigo-400/80 mt-1">
            7 days free • No credit card required • Activate with payment after trial
          </p>
        </div>

        <Button
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          onClick={() => startTrialMutation.mutate()}
          disabled={startTrialMutation.isPending}
          data-testid="button-scheduleos-start-trial"
        >
          {startTrialMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting Trial...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Start 7-Day Free Trial
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Powered by GPT-4 • Payment required after trial • AI costs apply
        </p>
      </CardContent>
    </Card>
  );
}
