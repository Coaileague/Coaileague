/**
 * TextField — Label-above full-width text input.
 * Min 48px height on mobile, character counter if maxLength set.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TextFieldProps {
  id: string;
  label: string;
  type?: "text" | "email" | "phone" | "textarea" | "number";
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  helpText?: string;
  disabled?: boolean;
  maxLength?: number;
  rows?: number;
}

export function TextField({
  id,
  label,
  type = "text",
  required = false,
  placeholder,
  value = "",
  onChange,
  error,
  helpText,
  disabled = false,
  maxLength,
  rows = 3,
}: TextFieldProps) {
  const inputType = type === "phone" ? "tel" : type === "textarea" ? "text" : type;
  const isTextarea = type === "textarea";

  return (
    <div className="space-y-1.5 w-full" data-testid={`field-text-${id}`}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {isTextarea ? (
        <Textarea
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          rows={rows}
          className={cn(error && "border-destructive")}
          data-testid={`input-${id}`}
        />
      ) : (
        <Input
          id={id}
          type={inputType}
          inputMode={type === "phone" ? "tel" : type === "number" ? "numeric" : "text"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          className={cn("min-h-[48px] sm:min-h-9", error && "border-destructive")}
          data-testid={`input-${id}`}
        />
      )}

      {helpText && !error && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}

      {maxLength && (
        <p className="text-xs text-muted-foreground text-right">
          {value.length}/{maxLength}
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive" data-testid={`error-${id}`}>{error}</p>
      )}
    </div>
  );
}
