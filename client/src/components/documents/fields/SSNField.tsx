/**
 * SSNField — Masked SSN input: shows XXX-XX-XXXX while typing.
 * Only last 4 visible after completion. Never logged in plain text.
 */
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

interface SSNFieldProps {
  id: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  lastFourOnly?: boolean;
}

export function SSNField({
  id,
  label,
  required = false,
  value = "",
  onChange,
  error,
  disabled = false,
  lastFourOnly = false,
}: SSNFieldProps) {
  const [focused, setFocused] = useState(false);
  const [rawInput, setRawInput] = useState(value.replace(/-/g, ""));

  const format = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    if (lastFourOnly) {
      return digits.slice(0, 4);
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const mask = (formatted: string) => {
    if (lastFourOnly) return formatted;
    const parts = formatted.split("-");
    if (parts.length < 3) return formatted.replace(/\d/g, "•");
    return `•••-••-${parts[2]}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, lastFourOnly ? 4 : 9);
    setRawInput(digits);
    onChange(format(digits));
  };

  const displayValue = focused ? format(rawInput) : (rawInput.length > 0 ? mask(format(rawInput)) : "");

  return (
    <div className="space-y-1.5" data-testid={`field-ssn-${id}`}>
      <Label htmlFor={id} className="text-sm font-medium flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-muted-foreground" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={lastFourOnly ? "Last 4 digits" : "XXX-XX-XXXX"}
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        autoComplete="off"
        className="font-mono tracking-widest"
        data-testid={`input-ssn-${id}`}
        aria-label={label}
      />
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Lock className="w-2.5 h-2.5" />
        Encrypted and stored securely — never shared or displayed in full
      </p>
      {error && <p className="text-xs text-destructive" data-testid={`error-ssn-${id}`}>{error}</p>}
    </div>
  );
}
