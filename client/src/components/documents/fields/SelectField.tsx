/**
 * SelectField — Native select on mobile, custom styled on desktop.
 */
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SelectFieldProps {
  id: string;
  label: string;
  options: string[];
  required?: boolean;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  helpText?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectField({
  id,
  label,
  options,
  required = false,
  value = "",
  onChange,
  error,
  helpText,
  disabled = false,
  placeholder = "Select an option",
}: SelectFieldProps) {
  return (
    <div className="space-y-1.5 w-full" data-testid={`field-select-${id}`}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn("min-h-[48px] sm:min-h-9 w-full", error && "border-destructive")}
          data-testid={`select-${id}`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {helpText && !error && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
      {error && (
        <p className="text-xs text-destructive" data-testid={`error-select-${id}`}>{error}</p>
      )}
    </div>
  );
}
