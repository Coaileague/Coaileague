import { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ValidationFeedbackProps {
  type: "error" | "success" | "warning" | "info";
  message: string;
  icon?: ReactNode;
  className?: string;
}

export function ValidationFeedback({
  type,
  message,
  icon,
  className,
}: ValidationFeedbackProps) {
  const baseClasses = "flex items-start gap-2 p-3 rounded-md text-sm";
  const variants = {
    error: "bg-destructive/10 text-destructive-foreground border border-destructive/20",
    success: "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border border-green-200/50 dark:border-green-900/30",
    warning: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/30",
    info: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-900/30",
  };

  const defaultIcons = {
    error: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />,
    warning: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />,
    info: <Info className="h-4 w-4 shrink-0 mt-0.5" />,
  };

  return (
    <div
      className={cn(baseClasses, variants[type], className)}
      role={type === "error" ? "alert" : "status"}
      data-testid={`feedback-${type}`}
    >
      {icon || defaultIcons[type]}
      <p>{message}</p>
    </div>
  );
}

interface FormHintProps {
  text: string;
  className?: string;
}

export function FormHint({ text, className }: FormHintProps) {
  return (
    <p className={cn("text-xs text-muted-foreground mt-1.5", className)}>
      {text}
    </p>
  );
}

interface FormErrorProps {
  error?: string;
  className?: string;
}

export function FormError({ error, className }: FormErrorProps) {
  if (!error) return null;
  return (
    <ValidationFeedback
      type="error"
      message={error}
      className={cn("mt-2", className)}
    />
  );
}

interface InlineValidationProps {
  isValid?: boolean;
  isDirty?: boolean;
  error?: string;
  hint?: string;
  className?: string;
}

export function InlineValidation({
  isValid,
  isDirty,
  error,
  hint,
  className,
}: InlineValidationProps) {
  if (!isDirty && !error) return null;

  if (isValid && isDirty) {
    return (
      <ValidationFeedback
        type="success"
        message="Looks good!"
        className={cn("mt-2 text-xs", className)}
      />
    );
  }

  if (error) {
    return (
      <ValidationFeedback
        type="error"
        message={error}
        className={cn("mt-2", className)}
      />
    );
  }

  if (hint) {
    return <FormHint text={hint} className={className} />;
  }

  return null;
}
