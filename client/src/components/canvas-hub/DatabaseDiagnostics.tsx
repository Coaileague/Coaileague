"use client"

/**
 * Database Diagnostics Component - Canvas Hub Integration
 * 
 * Fortune 500-grade database parity scanner UI with 7-step process visualization.
 * Integrates with Universal Canvas Hub for real-time diagnostics display.
 * 
 * 7-Step Orchestration Pattern:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 */

import * as React from "react"
import { useState, useCallback } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { apiRequest, queryClient } from "@/lib/queryClient"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileResponsiveSheet, NavigationSheetSection } from "./MobileResponsiveSheet"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Wrench,
  Play,
  Loader2,
  Table2,
  Columns,
  Zap,
  Clock,
  Shield,
} from "lucide-react"

// 7-Step Process Configuration
const PROCESS_STEPS = [
  { key: 'TRIGGER', label: 'Trigger', icon: Play, description: 'Initiate scan' },
  { key: 'FETCH', label: 'Fetch', icon: Database, description: 'Retrieve schema' },
  { key: 'VALIDATE', label: 'Validate', icon: Shield, description: 'Compare schemas' },
  { key: 'PROCESS', label: 'Process', icon: Columns, description: 'Analyze differences' },
  { key: 'MUTATE', label: 'Mutate', icon: Wrench, description: 'Prepare fixes' },
  { key: 'CONFIRM', label: 'Confirm', icon: CheckCircle2, description: 'Validate fixes' },
  { key: 'NOTIFY', label: 'Notify', icon: Zap, description: 'Complete' },
] as const

type StepKey = typeof PROCESS_STEPS[number]['key']

interface StepHistory {
  step: StepKey
  timestamp: string
  duration: number
  status: 'success' | 'failed' | 'skipped'
  message?: string
}

interface TableInfo {
  tableName: string
  exists: boolean
  missingColumns: string[]
  extraColumns: string[]
}

interface ParityScanResult {
  timestamp: string
  totalTables: number
  missingTables: string[]
  tablesWithIssues: TableInfo[]
  allTablesHealthy: boolean
  fixSqlStatements: string[]
  currentStep: StepKey
  stepHistory: StepHistory[]
}

interface AutoFixResult {
  success: boolean
  statementsExecuted: number
  errors: string[]
  fixedIssues: string[]
}

interface DatabaseDiagnosticsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}

function StepProgressIndicator({ 
  currentStep, 
  stepHistory 
}: { 
  currentStep: StepKey
  stepHistory: StepHistory[] 
}) {
  const getStepStatus = (stepKey: StepKey) => {
    const historyEntry = stepHistory.find(h => h.step === stepKey)
    if (!historyEntry) return 'pending'
    return historyEntry.status
  }

  const currentStepIndex = PROCESS_STEPS.findIndex(s => s.key === currentStep)

  return (
    <div className="flex flex-wrap gap-1 sm:gap-2 p-2 bg-muted/30 rounded-lg">
      {PROCESS_STEPS.map((step, index) => {
        const status = getStepStatus(step.key)
        const isActive = index === currentStepIndex
        const isPast = index < currentStepIndex
        const Icon = step.icon

        return (
          <div
            key={step.key}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md transition-all",
              "text-[10px] sm:text-xs font-medium",
              isActive && "bg-primary text-primary-foreground animate-pulse",
              isPast && status === 'success' && "bg-green-500/20 text-green-600 dark:text-green-400",
              isPast && status === 'failed' && "bg-destructive/20 text-destructive",
              !isActive && !isPast && "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">{step.label}</span>
            <span className="sm:hidden">{index + 1}</span>
          </div>
        )
      })}
    </div>
  )
}

function ScanResultCard({ result }: { result: ParityScanResult }) {
  const isMobile = useIsMobile()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {result.allTablesHealthy ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Healthy
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Issues Found
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {result.totalTables} tables scanned
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(result.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <StepProgressIndicator 
        currentStep={result.currentStep} 
        stepHistory={result.stepHistory} 
      />

      {result.missingTables.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs flex items-center gap-1 text-destructive">
              <Table2 className="h-3 w-3" />
              Missing Tables ({result.missingTables.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="flex flex-wrap gap-1">
              {result.missingTables.slice(0, isMobile ? 5 : 10).map(table => (
                <Badge key={table} variant="outline" className="text-[10px]">
                  {table}
                </Badge>
              ))}
              {result.missingTables.length > (isMobile ? 5 : 10) && (
                <Badge variant="secondary" className="text-[10px]">
                  +{result.missingTables.length - (isMobile ? 5 : 10)} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result.tablesWithIssues.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Columns className="h-3 w-3" />
              Column Issues ({result.tablesWithIssues.length} tables)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3 space-y-2">
            {result.tablesWithIssues.slice(0, 5).map(table => (
              <div key={table.tableName} className="text-xs">
                <span className="font-medium">{table.tableName}:</span>
                <span className="text-muted-foreground ml-1">
                  {table.missingColumns.join(', ')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.fixSqlStatements.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              Fix Statements ({result.fixSqlStatements.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <ScrollArea className="h-24 sm:h-32">
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">
                {result.fixSqlStatements.join('\n\n')}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function DatabaseDiagnostics({
  open,
  onOpenChange,
  className,
}: DatabaseDiagnosticsProps) {
  const isMobile = useIsMobile()
  const [lastScanResult, setLastScanResult] = useState<ParityScanResult | null>(null)
  const [lastFixResult, setLastFixResult] = useState<AutoFixResult | null>(null)

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/admin/database-parity/scan')
      return response.json()
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setLastScanResult(data.data)
      }
    },
  })

  const quickFixMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/database-parity/quick-fix', {})
      return response.json()
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setLastFixResult(data.data)
        scanMutation.mutate()
      }
    },
  })

  const autoFixMutation = useMutation({
    mutationFn: async (fixStatements: string[]) => {
      const response = await apiRequest('POST', '/api/admin/database-parity/auto-fix', { fixStatements })
      return response.json()
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setLastFixResult(data.data)
        scanMutation.mutate()
      }
    },
  })

  const handleScan = useCallback(() => {
    setLastFixResult(null)
    scanMutation.mutate()
  }, [scanMutation])

  const handleQuickFix = useCallback(() => {
    quickFixMutation.mutate()
  }, [quickFixMutation])

  const handleAutoFix = useCallback(() => {
    if (lastScanResult?.fixSqlStatements.length) {
      autoFixMutation.mutate(lastScanResult.fixSqlStatements)
    }
  }, [autoFixMutation, lastScanResult])

  const isScanning = scanMutation.isPending
  const isFixing = quickFixMutation.isPending || autoFixMutation.isPending

  const content = (
    <div className={cn("space-y-4 p-4", className)}>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={handleScan}
          disabled={isScanning || isFixing}
          className="flex-1"
          data-testid="button-scan-database"
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Scan Database
        </Button>
        
        <Button
          onClick={handleQuickFix}
          disabled={isScanning || isFixing}
          variant="outline"
          className="flex-1"
          data-testid="button-quick-fix"
        >
          {isFixing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Quick Fix
        </Button>
      </div>

      {lastScanResult && (
        <>
          <Separator />
          <ScanResultCard result={lastScanResult} />
          
          {lastScanResult.fixSqlStatements.length > 0 && (
            <Button
              onClick={handleAutoFix}
              disabled={isScanning || isFixing}
              variant="destructive"
              className="w-full"
              data-testid="button-auto-fix"
            >
              {isFixing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4 mr-2" />
              )}
              Apply All Fixes ({lastScanResult.fixSqlStatements.length})
            </Button>
          )}
        </>
      )}

      {lastFixResult && (
        <>
          <Separator />
          <Card className={lastFixResult.success ? "border-green-500/50" : "border-destructive/50"}>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs flex items-center gap-1">
                {lastFixResult.success ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-destructive" />
                )}
                Fix Result
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3 text-xs">
              <div>Executed: {lastFixResult.statementsExecuted} statements</div>
              {lastFixResult.errors.length > 0 && (
                <div className="text-destructive mt-1">
                  Errors: {lastFixResult.errors.length}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {scanMutation.error && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 px-3">
            <div className="text-xs text-destructive flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              {(scanMutation.error as Error).message || 'Scan failed'}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <MobileResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Database Diagnostics"
        titleIcon={<Database className="h-4 w-4 text-cyan-500" />}
        subtitle="Scan and fix database schema issues"
        side="bottom"
        maxHeight="85vh"
      >
        {content}
      </MobileResponsiveSheet>
    )
  }

  return (
    <MobileResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Database Diagnostics"
      titleIcon={<Database className="h-4 w-4 text-cyan-500" />}
      subtitle="Scan and fix database schema parity issues"
      side="right"
      contentClassName="w-[400px] max-w-[90vw]"
    >
      {content}
    </MobileResponsiveSheet>
  )
}

export default DatabaseDiagnostics
