import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrinityLogo } from "@/components/trinity-logo";
import {
  Upload,
  FileSpreadsheet,
  Brain,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LearnedPattern {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  frequency: number;
  avgDuration: number;
  commonPositions: string[];
}

interface ImportResult {
  success: boolean;
  message: string;
  shiftsImported: number;
  patternsLearned: number;
  patterns: LearnedPattern[];
  errors: string[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleUploadPanel() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState("12h");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("learnPatterns", "true");
      formData.append("createShifts", "false");
      formData.append("dateFormat", dateFormat);
      formData.append("timeFormat", timeFormat);

      const res = await fetch("/api/trinity/import-schedule", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }

      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (result) => {
      setImportResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({
        title: "Schedule Analyzed",
        description: `Learned ${result.patternsLearned} patterns from ${result.shiftsImported} shifts`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      const validExtensions = [".csv", ".xls", ".xlsx"];
      const hasValidExtension = validExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (!validTypes.includes(file.type) && !hasValidExtension) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a CSV or Excel file (.csv, .xls, .xlsx)",
          variant: "destructive",
        });
        return;
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          title: "File Too Large",
          description: "Maximum file size is 10MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setImportResult(null);
    }
  };

  if (isCollapsed) {
    return (
      <button
        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors rounded-md"
        onClick={() => setIsCollapsed(false)}
        data-testid="btn-expand-upload-panel"
      >
        <Upload className="h-4 w-4" />
        <span>Upload Past Schedules</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          Pattern Learning
        </Badge>
      </button>
    );
  }

  return (
    <Card className="border-purple-500/20" data-testid="schedule-upload-panel">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrinityLogo size={16} />
            <span className="text-sm font-medium">Teach Trinity Your Patterns</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsCollapsed(true)}
            data-testid="btn-collapse-upload-panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Upload past schedules so Trinity can learn your scheduling patterns,
          preferred employee-client matches, and shift timing preferences.
        </p>

        <div
          className={cn(
            "border-2 border-dashed rounded-md p-4 text-center transition-colors cursor-pointer",
            selectedFile
              ? "border-purple-500/50 bg-purple-500/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/40"
          )}
          onClick={() => fileInputRef.current?.click()}
          data-testid="upload-dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-file-upload"
          />
          {selectedFile ? (
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <Badge variant="secondary" className="text-[10px]">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </Badge>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="h-6 w-6 mx-auto text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Drop a CSV or Excel file here
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Supports GetSling, WhenIWork, and custom formats
              </p>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="flex gap-2">
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger className="flex-1 h-8 text-xs" data-testid="select-date-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeFormat} onValueChange={setTimeFormat}>
              <SelectTrigger className="w-24 h-8 text-xs" data-testid="select-time-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12h</SelectItem>
                <SelectItem value="24h">24h</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedFile && (
          <Button
            className="w-full"
            size="sm"
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending}
            data-testid="btn-analyze-schedule"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing Patterns...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Analyze Schedule
              </>
            )}
          </Button>
        )}

        {uploadMutation.isPending && (
          <div className="space-y-1">
            <Progress value={65} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground text-center">
              Trinity is learning your scheduling patterns...
            </p>
          </div>
        )}

        {importResult && (
          <div className="space-y-2">
            <div
              className={cn(
                "p-2.5 rounded-md border flex items-start gap-2",
                importResult.success
                  ? "bg-green-500/5 border-green-500/30"
                  : "bg-red-500/5 border-red-500/30"
              )}
            >
              {importResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-xs font-medium">{importResult.message}</p>
                {importResult.errors.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {importResult.errors.length} warning(s) during import
                  </p>
                )}
              </div>
            </div>

            {importResult.patterns.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-xs font-medium">
                    Patterns Learned ({importResult.patternsLearned})
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {importResult.patterns.slice(0, 5).map((pattern, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-muted-foreground flex items-center gap-2 px-2 py-1 bg-muted/30 rounded"
                      data-testid={`pattern-item-${i}`}
                    >
                      <Badge variant="secondary" className="text-[9px] px-1.5">
                        {DAY_NAMES[pattern.dayOfWeek]}
                      </Badge>
                      <span>
                        {pattern.startHour}:00-{pattern.endHour}:00
                      </span>
                      <span className="text-muted-foreground/60">
                        ({pattern.frequency}x)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-1 border-t">
          <div className="flex items-start gap-2 p-2 bg-amber-500/5 rounded border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
              Uploaded schedules are used only for pattern learning.
              All AI-generated schedules still require human verification before publishing.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
