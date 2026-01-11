import { useState } from "react";
import { Upload, FileText, Image, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ExtractedShift {
  employeeName: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  position?: string;
  location?: string;
  notes?: string;
  confidence: number;
}

interface MigrationResponse {
  shifts: ExtractedShift[];
  patterns: {
    discovered: string[];
    softConstraints: string[];
  };
  summary: string;
  extractionConfidence: number;
  warnings?: string[];
}

export function ScheduleMigrationDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceApp, setSourceApp] = useState<string>("Other");
  const [migrationResult, setMigrationResult] = useState<MigrationResponse | null>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation<MigrationResponse, Error, File>({
    mutationFn: async (fileToUpload: File) => {
      // Convert file to base64
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result as string;
          // Strip data URI prefix
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToUpload);
      });

      const response = await apiRequest("POST", "/api/ai-scheduling/migrate-schedule", {
        fileData,
        mimeType: fileToUpload.type,
        sourceApp,
      });
      return response.json() as Promise<MigrationResponse>;
    },
    onSuccess: (data: MigrationResponse) => {
      setMigrationResult(data);
      toast({
        title: `✅ Extracted ${data.shifts.length} Shifts`,
        description: `Extraction confidence: ${data.extractionConfidence}%`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Migration Failed",
        description: error.message || "Failed to extract schedule data",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!migrationResult) throw new Error("No migration result to import");
      
      const response = await apiRequest("POST", "/api/ai-scheduling/import-migrated-shifts", {
        extractedShifts: migrationResult.shifts,
        sourceApp,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      const hasErrors = data.errors && data.errors.length > 0;
      const successCount = data.shiftsCreated;
      const totalCount = data.shiftsTotal || successCount;
      
      if (hasErrors) {
        toast({
          title: `⚠️ Partial Import (${successCount}/${totalCount})`,
          description: `${successCount} shifts imported successfully. ${data.errors.length} shifts had validation errors.`,
        });
      } else {
        toast({
          title: "✅ Import Complete",
          description: `Created ${successCount} shifts in CoAIleague`,
        });
      }
      
      setOpen(false);
      handleReset();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Import Failed",
        description: error.message || "Failed to import shifts",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
      if (!allowedTypes.includes(selectedFile.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload PNG, JPEG, or PDF files only",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setMigrationResult(null);
    }
  };

  const handleUpload = () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file first",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleReset = () => {
    setFile(null);
    setMigrationResult(null);
    setSourceApp("Other");
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "bg-green-600 dark:bg-green-700";
    if (confidence >= 0.7) return "bg-amber-600 dark:bg-amber-700";
    return "bg-red-600 dark:bg-red-700";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          data-testid="button-open-migration"
        >
          <Upload className="h-4 w-4" />
          Import from Deputy/WhenIWork
        </Button>
      </DialogTrigger>

      <DialogContent size="full" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" style={{ color: "#3b82f6" }} />
            Schedule Migration - Smart AI
          </DialogTitle>
          <DialogDescription>
            Upload a PDF or screenshot from Deputy, WhenIWork, GetSling, or any other scheduling app.
            Our AI will extract shifts and learn scheduling patterns automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!migrationResult ? (
            <>
              {/* Source App Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Source App</label>
                <div className="flex gap-2">
                  {['Deputy', 'WhenIWork', 'GetSling', 'Other'].map((app) => (
                    <Button
                      key={app}
                      variant={sourceApp === app ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSourceApp(app)}
                      data-testid={`button-source-${app.toLowerCase()}`}
                    >
                      {app}
                    </Button>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload Schedule</label>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    type="file"
                    id="schedule-file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="input-schedule-file"
                  />
                  <label
                    htmlFor="schedule-file"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    {file ? (
                      <>
                        {file.type === 'application/pdf' ? (
                          <FileText className="h-12 w-12 text-primary" />
                        ) : (
                          <Image className="h-12 w-12 text-primary" />
                        )}
                        <span className="text-sm font-medium">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 text-muted-foreground" />
                        <span className="text-sm font-medium">Click to upload</span>
                        <span className="text-xs text-muted-foreground">
                          PNG, JPEG, or PDF (Max 10MB)
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-migration"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!file || uploadMutation.isPending}
                  data-testid="button-start-migration"
                >
                  {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {uploadMutation.isPending ? "Extracting..." : "Extract Schedule"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Migration Results */}
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Extraction Confidence</span>
                    <Badge className={getConfidenceColor(migrationResult.extractionConfidence / 100)}>
                      {migrationResult.extractionConfidence}%
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{migrationResult.summary}</p>
                </div>

                {/* Warnings */}
                {migrationResult.warnings && migrationResult.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-600 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Warnings</span>
                    </div>
                    <ul className="text-sm text-amber-600 dark:text-amber-300 space-y-1">
                      {migrationResult.warnings.map((warning, i) => (
                        <li key={i}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Discovered Patterns */}
                {migrationResult.patterns.discovered.length > 0 && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Discovered Patterns</span>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {migrationResult.patterns.discovered.map((pattern, i) => (
                        <li key={i}>• {pattern}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Separator />

                {/* Extracted Shifts */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">
                    Extracted Shifts ({migrationResult.shifts.length})
                  </span>
                  <ScrollArea className="h-64 rounded-md border p-4">
                    <div className="space-y-3">
                      {migrationResult.shifts.map((shift, i) => (
                        <div
                          key={i}
                          className="rounded-lg border p-3 space-y-2"
                          data-testid={`shift-preview-${i}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{shift.employeeName}</span>
                            <Badge
                              variant="outline"
                              className={getConfidenceColor(shift.confidence)}
                            >
                              {Math.round(shift.confidence * 100)}%
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div>
                              📅 {shift.startDate} {shift.startTime} - {shift.endTime}
                            </div>
                            {shift.position && <div>💼 {shift.position}</div>}
                            {shift.location && <div>📍 {shift.location}</div>}
                            {shift.notes && <div className="text-xs">📝 {shift.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Actions */}
                <div className="flex justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    data-testid="button-reset-migration"
                  >
                    Upload Another
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setOpen(false)}
                      data-testid="button-close-migration"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={() => importMutation.mutate()}
                      disabled={importMutation.isPending}
                      data-testid="button-import-shifts"
                    >
                      {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {importMutation.isPending ? "Importing..." : `Import ${migrationResult.shifts.length} Shifts`}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
