/**
 * DocumentFormPage — /document-form/:templateId
 * Hosts the UniversalFormRenderer for any UDTS template.
 */
import { useParams, useLocation } from "wouter";
import { UniversalFormRenderer } from "@/components/documents/UniversalFormRenderer";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function DocumentFormPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();

  if (!templateId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">No template specified.</p>
      </div>
    );
  }

  const handleComplete = (submissionId: string) => {
  };

  const handleCancel = () => {
    navigate("/document-templates");
  };

  return (
    <div className="flex flex-col min-h-screen bg-background" data-testid="document-form-page">
      {/* Sticky header */}
      <header className="sticky top-0 z-[1020] flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          data-testid="button-back-to-templates"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <UnifiedBrandLogo size="sm" />
      </header>

      {/* Form content */}
      <div className="flex-1 flex flex-col">
        <UniversalFormRenderer
          templateId={templateId}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
