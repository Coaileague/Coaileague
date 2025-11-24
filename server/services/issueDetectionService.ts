/**
 * Issue Detection Service
 * Identifies data quality issues, anomalies, and migration problems
 * Uses dynamic guardrails configuration for rule-based detection
 */

import aiBrainConfig from "@shared/config/aiBrainGuardrails";
import { notificationEngine } from "./universalNotificationEngine";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface DetectedIssue {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  affectedFields: string[];
  suggestedAction: string;
  detectedAt: Date;
  requiresApproval: boolean;
}

export interface IssueDetectionResult {
  documentId: string;
  documentType: string;
  issues: DetectedIssue[];
  overallSeverity: "clear" | "warning" | "critical";
  recommendedAction: string;
}

export class IssueDetectionService {
  /**
   * Analyze extracted document data for issues
   */
  async detectIssues(
    workspaceId: string,
    documentType: string,
    extractedData: Record<string, any>,
    documentId?: string
  ): Promise<IssueDetectionResult> {
    const issues: DetectedIssue[] = [];

    // Get applicable rules for this document type
    const rules = aiBrainConfig.getIssueDetectionRules(documentType);

    // Check each rule against extracted data
    for (const rule of rules) {
      const ruleMatches = this.evaluateRule(rule, extractedData);

      if (ruleMatches) {
        issues.push({
          id: `issue_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: rule.id,
          severity: rule.severity,
          title: rule.name,
          description: rule.description,
          affectedFields: this.findAffectedFields(rule, extractedData),
          suggestedAction: rule.suggestedAction,
          detectedAt: new Date(),
          requiresApproval: rule.severity === "critical",
        });
      }
    }

    // Determine overall severity
    let overallSeverity: "clear" | "warning" | "critical" = "clear";
    if (issues.some((i) => i.severity === "critical")) {
      overallSeverity = "critical";
    } else if (issues.some((i) => i.severity === "warning")) {
      overallSeverity = "warning";
    }

    // Generate recommended action
    const recommendedAction = this.generateRecommendedAction(issues, overallSeverity);

    // Notify if issues found
    if (issues.length > 0 && overallSeverity !== "clear") {
      await notificationEngine.sendNotification({
        workspaceId,
        type: "issue_detected",
        title: `${overallSeverity.toUpperCase()}: ${issues.length} issues detected`,
        message: issues.map((i) => `${i.title}: ${i.description}`).join("\n"),
        metadata: {
          documentId,
          documentType,
          issues,
          overallSeverity,
        },
        severity: overallSeverity === "critical" ? "critical" : "warning",
      });
    }

    return {
      documentId: documentId || `doc_${Date.now()}`,
      documentType,
      issues,
      overallSeverity,
      recommendedAction,
    };
  }

  /**
   * Evaluate a single rule against data
   */
  private evaluateRule(rule: any, data: Record<string, any>): boolean {
    return rule.conditions.some((condition: any) => {
      const fieldValue = data[condition.field];

      switch (condition.operator) {
        case "equals":
          return fieldValue === condition.value;
        case "contains":
          return String(fieldValue).includes(String(condition.value));
        case "greaterThan":
          return Number(fieldValue) > Number(condition.value);
        case "lessThan":
          return Number(fieldValue) < Number(condition.value);
        case "missingField":
          return fieldValue === undefined || fieldValue === null || fieldValue === "";
        case "malformed":
          return !this.isValidFormat(condition.field, fieldValue);
        default:
          return false;
      }
    });
  }

  /**
   * Validate field format
   */
  private isValidFormat(fieldName: string, value: any): boolean {
    if (value === null || value === undefined) return false;

    const formatRules: Record<string, RegExp> = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\d\-\+\(\)\s]+$/,
      date: /^\d{4}-\d{2}-\d{2}$/,
      amount: /^\d+(\.\d{2})?$/,
      zip: /^\d{5}(-\d{4})?$/,
    };

    const matchingRule = Object.entries(formatRules).find(([key]) =>
      fieldName.toLowerCase().includes(key)
    );

    if (matchingRule) {
      return matchingRule[1].test(String(value));
    }

    return true; // Unknown format, assume valid
  }

  /**
   * Find which fields have issues
   */
  private findAffectedFields(rule: any, data: Record<string, any>): string[] {
    return rule.conditions
      .map((condition: any) => {
        const fieldValue = data[condition.field];
        if (condition.operator === "missingField" && (fieldValue === undefined || fieldValue === null)) {
          return condition.field;
        }
        if (condition.operator === "malformed" && !this.isValidFormat(condition.field, fieldValue)) {
          return condition.field;
        }
        return null;
      })
      .filter((f: string | null) => f !== null);
  }

  /**
   * Generate recommended action based on issues
   */
  private generateRecommendedAction(
    issues: DetectedIssue[],
    severity: "clear" | "warning" | "critical"
  ): string {
    if (severity === "clear") {
      return "Data quality is good. Safe to proceed with import.";
    }

    if (severity === "critical") {
      return "CRITICAL ISSUES FOUND: Manual review required before proceeding. Contact administrator.";
    }

    const actions = issues.map((i) => `• ${i.suggestedAction}`).join("\n");
    return `Please review and address the following issues:\n${actions}`;
  }

  /**
   * Use AI to enhance issue detection
   */
  async analyzeWithAI(
    workspaceId: string,
    documentType: string,
    extractedData: Record<string, any>,
    documentId?: string
  ): Promise<IssueDetectionResult> {
    const baseResult = await this.detectIssues(workspaceId, documentType, extractedData, documentId);

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `
        Analyze this extracted ${documentType} data for potential issues or anomalies that might indicate data quality problems:
        
        Data: ${JSON.stringify(extractedData, null, 2)}
        
        Return JSON with format: {
          additionalIssues: [
            { type: string, severity: "warning"|"critical", description: string, suggestedAction: string }
          ],
          dataQualityScore: number (0-100),
          overallAssessment: string
        }
      `;

      const response = await model.generateContent(prompt);
      const responseText = response.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiAnalysis = JSON.parse(jsonMatch[0]);

        // Add AI-detected issues
        if (aiAnalysis.additionalIssues) {
          for (const aiIssue of aiAnalysis.additionalIssues) {
            baseResult.issues.push({
              id: `ai_issue_${Date.now()}`,
              type: aiIssue.type,
              severity: aiIssue.severity,
              title: `AI Detected: ${aiIssue.type}`,
              description: aiIssue.description,
              affectedFields: [],
              suggestedAction: aiIssue.suggestedAction,
              detectedAt: new Date(),
              requiresApproval: aiIssue.severity === "critical",
            });
          }

          // Update overall severity
          if (aiAnalysis.additionalIssues.some((i: any) => i.severity === "critical")) {
            baseResult.overallSeverity = "critical";
          }
        }
      }
    } catch (error: any) {
      console.log("AI analysis skipped (optional enhancement):", error.message);
    }

    return baseResult;
  }
}

export const issueDetectionService = new IssueDetectionService();
