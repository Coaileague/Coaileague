/**
 * Enhanced Loading System - Usage Examples
 * 
 * This file demonstrates how to use the new enhanced loading system
 * across different scenarios in CoAIleague
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UniversalTransitionOverlay } from "@/components/universal-transition-overlay";
import { useEnhancedLoading, simulateProgress } from "@/hooks/useEnhancedLoading";
import { 
  Calendar, FileText, DollarSign, Mail, 
  BarChart3, Upload, LogOut 
} from "lucide-react";

export function EnhancedLoadingExamples() {
  const loading = useEnhancedLoading();

  // Example 1: Schedule Publishing
  const handlePublishSchedule = async () => {
    loading.showScheduleLoading();

    // Simulate progress through stages
    const stages = [
      { progress: 20, message: "Validating shift assignments...", submessage: "Checking for conflicts and availability" },
      { progress: 40, message: "Optimizing schedule...", submessage: "AI Brain balancing workload distribution" },
      { progress: 60, message: "Generating notifications...", submessage: "Preparing employee alerts" },
      { progress: 80, message: "Publishing to workspace...", submessage: "Syncing across all devices" },
      { progress: 95, message: "Finalizing...", submessage: "Almost done!" },
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      loading.updateProgress(stage.progress, stage.message, stage.submessage);
    }

    loading.setSuccess("Schedule Published!", "All employees have been notified");
    setTimeout(() => loading.hideLoading(), 2000);
  };

  // Example 2: Invoice Generation
  const handleGenerateInvoices = async () => {
    loading.showInvoiceLoading();

    const stages = [
      { progress: 15, message: "Collecting timesheet data...", submessage: "Gathering billable hours from all shifts" },
      { progress: 35, message: "Calculating costs...", submessage: "Computing labor costs and markup" },
      { progress: 55, message: "Generating invoice documents...", submessage: "Creating PDFs for each client" },
      { progress: 75, message: "Preparing for delivery...", submessage: "Formatting and organizing invoices" },
      { progress: 90, message: "Finalizing...", submessage: "Quality check in progress" },
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      loading.updateProgress(stage.progress, stage.message, stage.submessage);
    }

    loading.setSuccess("Invoices Generated!", "15 invoices created successfully");
    setTimeout(() => loading.hideLoading(), 2000);
  };

  // Example 3: Payroll Processing
  const handleProcessPayroll = async () => {
    loading.showPayrollLoading();

    const stages = [
      { progress: 10, message: "Calculating gross wages...", submessage: "Processing hours worked and overtime" },
      { progress: 25, message: "Computing tax withholdings...", submessage: "Federal, state, and local taxes" },
      { progress: 45, message: "Applying deductions...", submessage: "Benefits, 401k, and other deductions" },
      { progress: 65, message: "Generating paychecks...", submessage: "Creating pay stubs for all employees" },
      { progress: 85, message: "Syncing with accounting...", submessage: "Updating QuickBooks and Gusto" },
      { progress: 95, message: "Finalizing payroll...", submessage: "Preparing for distribution" },
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      loading.updateProgress(stage.progress, stage.message, stage.submessage);
    }

    loading.setSuccess("Payroll Processed!", "42 employees paid successfully");
    setTimeout(() => loading.hideLoading(), 2000);
  };

  // Example 4: Email Campaign
  const handleSendEmails = async () => {
    loading.showEmailLoading();

    const stages = [
      { progress: 20, message: "Preparing recipient list...", submessage: "Filtering active employees" },
      { progress: 40, message: "Personalizing messages...", submessage: "Customizing content for each recipient" },
      { progress: 60, message: "Sending emails...", submessage: "25 of 100 sent" },
      { progress: 80, message: "Sending emails...", submessage: "75 of 100 sent" },
      { progress: 95, message: "Completing delivery...", submessage: "99 of 100 sent" },
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 800));
      loading.updateProgress(stage.progress, stage.message, stage.submessage);
    }

    loading.setSuccess("Emails Sent!", "100 notifications delivered successfully");
    setTimeout(() => loading.hideLoading(), 2000);
  };

  // Example 5: Analytics Generation
  const handleGenerateAnalytics = async () => {
    loading.showAnalyticsLoading();

    const stages = [
      { progress: 15, message: "Collecting data...", submessage: "Aggregating from all sources" },
      { progress: 35, message: "AI Brain analyzing trends...", submessage: "Identifying patterns and insights" },
      { progress: 60, message: "Generating visualizations...", submessage: "Creating charts and graphs" },
      { progress: 85, message: "Compiling report...", submessage: "Formatting executive summary" },
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      loading.updateProgress(stage.progress, stage.message, stage.submessage);
    }

    loading.setSuccess("Analytics Ready!", "Comprehensive insights generated");
    setTimeout(() => loading.hideLoading(), 2000);
  };

  // Example 6: File Upload
  const handleFileUpload = async () => {
    loading.showUploadLoading();

    // Simulate file upload with progress
    const cleanup = simulateProgress(
      (progress) => {
        loading.updateProgress(
          progress,
          "Uploading Files...",
          `${Math.round(progress)}% complete - 5.2 MB of 8.3 MB`
        );
      },
      4000
    );

    await new Promise(resolve => setTimeout(resolve, 4500));
    cleanup();

    loading.updateProgress(100, "Upload Complete!", "Files transferred successfully");
    setTimeout(() => {
      loading.setSuccess("Files Uploaded!", "12 documents added to cloud storage");
    }, 500);
    setTimeout(() => loading.hideLoading(), 2500);
  };

  // Example 7: Simulated Login Failure (Security Denial)
  const handleSimulateSecurityDenial = async () => {
    loading.showLoading({
      scenario: "login",
      animationType: "waves",
      initialMessage: "Authenticating...",
      initialSubmessage: "Verifying your credentials"
    });

    await new Promise(resolve => setTimeout(resolve, 1500));
    loading.updateProgress(25, "Verifying subscription...", "Checking organization status");

    await new Promise(resolve => setTimeout(resolve, 1500));
    loading.updateProgress(50, "Running security scan...", "AI Brain analyzing login patterns");

    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate security threat detection
    loading.setDenied(
      "Security Alert Detected",
      "Unusual activity detected. Access denied. Please contact support if you believe this is an error."
    );

    setTimeout(() => loading.hideLoading(), 5000);
  };

  return (
    <>
      <UniversalTransitionOverlay
        isVisible={loading.loadingState.isVisible}
        status={loading.loadingState.status}
        animationType={loading.loadingState.animationType}
        scenario={loading.loadingState.scenario}
        message={loading.loadingState.message}
        submessage={loading.loadingState.submessage}
        progress={loading.loadingState.progress}
        onDenied={loading.hideLoading}
      />

      <div className="container mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Enhanced Loading System Examples</h1>
          <p className="text-muted-foreground">
            Demonstrating 10 professional loading animations with real validation and progress tracking
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-green-500" />
                Schedule Publishing
              </CardTitle>
              <CardDescription>
                Orbit animation with AI optimization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handlePublishSchedule} className="w-full">
                Publish Schedule
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-500" />
                Invoice Generation
              </CardTitle>
              <CardDescription>
                Pulse animation with cost calculation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleGenerateInvoices} className="w-full">
                Generate Invoices
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Payroll Processing
              </CardTitle>
              <CardDescription>
                Progress bar with detailed stages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleProcessPayroll} className="w-full">
                Process Payroll
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-sky-500" />
                Email Campaign
              </CardTitle>
              <CardDescription>
                Dots animation with batch progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleSendEmails} className="w-full">
                Send Emails
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Analytics Generation
              </CardTitle>
              <CardDescription>
                Gradient animation with AI insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleGenerateAnalytics} className="w-full">
                Generate Analytics
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-500" />
                File Upload
              </CardTitle>
              <CardDescription>
                Ripple animation with transfer progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleFileUpload} className="w-full">
                Upload Files
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <LogOut className="w-5 h-5" />
                Security Denial Demo
              </CardTitle>
              <CardDescription>
                Simulates AI Brain detecting unusual activity and denying access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleSimulateSecurityDenial} variant="destructive" className="w-full">
                Simulate Security Denial
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
