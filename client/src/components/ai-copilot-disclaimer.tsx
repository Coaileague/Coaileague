/**
 * AI COPILOT DISCLAIMER COMPONENT
 * ================================
 * Critical legal and trust messaging for CoAIleague's automation features.
 * 
 * Key messaging:
 * - "Copilot Automation" NOT "Fully Automated" 
 * - AI makes errors - human approval required
 * - 99% automation / 1% human oversight pattern
 * - Trinity learns and improves with confidence scoring
 */

import { AlertTriangle, Bot, CheckCircle2, Shield, TrendingUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AICopilotDisclaimerProps {
  variant?: "banner" | "card" | "inline" | "onboarding";
  showConfidence?: boolean;
  confidenceScore?: number;
}

export function AICopilotDisclaimer({ 
  variant = "banner",
  showConfidence = false,
  confidenceScore = 0,
}: AICopilotDisclaimerProps) {
  if (variant === "banner") {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          Copilot Automation
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          Trinity AI assists with automation but requires human approval for all actions. 
          Your designated approver reviews and confirms before any changes take effect.
        </AlertDescription>
      </Alert>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3 w-3" />
        <span>AI-assisted • Human approval required</span>
        {showConfidence && confidenceScore > 0 && (
          <Badge variant="secondary" className="text-xs">
            {Math.round(confidenceScore * 100)}% confident
          </Badge>
        )}
      </div>
    );
  }

  if (variant === "onboarding") {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-amber-800 dark:text-amber-200">
              Important: AI Copilot Automation
            </CardTitle>
          </div>
          <CardDescription className="text-amber-700 dark:text-amber-300">
            Please read before enabling automation features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-amber-800 dark:text-amber-200">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Bot className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Trinity AI is a Copilot, Not Autopilot</p>
                <p className="text-sm opacity-80">
                  AI technology can make errors. All automated actions require human review 
                  and approval before taking effect.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Designated Approver Required</p>
                <p className="text-sm opacity-80">
                  Your organization must assign a manager or owner to review and approve 
                  all AI-generated recommendations before they execute.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Trinity Learns & Improves</p>
                <p className="text-sm opacity-80">
                  Our confidence scoring system tracks accuracy and improves over time. 
                  You'll see confidence levels for every recommendation.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">99% Automation, 1% Human Oversight</p>
                <p className="text-sm opacity-80">
                  Trinity handles the heavy lifting while your team maintains control. 
                  This keeps your organization safe and compliant.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">AI Copilot Automation</CardTitle>
          </div>
          {showConfidence && confidenceScore > 0 && (
            <Badge 
              variant={confidenceScore >= 0.9 ? "default" : confidenceScore >= 0.7 ? "secondary" : "outline"}
              className="text-xs"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              {Math.round(confidenceScore * 100)}% confident
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>
          Trinity AI assists with automation but <strong>requires human approval</strong> for 
          all actions. AI can make errors - your designated approver reviews everything.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Shield className="h-4 w-4 text-green-600" />
          <span className="text-green-700 dark:text-green-400 text-xs font-medium">
            99% Automation • 1% Human Oversight
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConfidenceIndicator({ score, size = "sm" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const percentage = Math.round(score * 100);
  const colorClass = 
    percentage >= 90 ? "text-green-600 bg-green-100 dark:bg-green-900/30" :
    percentage >= 70 ? "text-blue-600 bg-blue-100 dark:bg-blue-900/30" :
    percentage >= 50 ? "text-amber-600 bg-amber-100 dark:bg-amber-900/30" :
    "text-red-600 bg-red-100 dark:bg-red-900/30";

  const sizeClass = 
    size === "lg" ? "text-base px-3 py-1.5" :
    size === "md" ? "text-sm px-2 py-1" :
    "text-xs px-1.5 py-0.5";

  return (
    <span 
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colorClass} ${sizeClass}`}
      data-testid="confidence-indicator"
    >
      <TrendingUp className={size === "lg" ? "h-4 w-4" : size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {percentage}% confident
    </span>
  );
}

export function ApprovalRequiredBadge() {
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3 mr-1" />
      Approval Required
    </Badge>
  );
}
