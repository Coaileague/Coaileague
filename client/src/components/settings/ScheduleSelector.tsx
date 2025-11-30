import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ScheduleOption {
  value: string;
  label: string;
}

interface ScheduleSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ScheduleOption[];
  customDays?: number;
  onCustomDaysChange?: (days: number) => void;
  showCustomInput?: boolean;
  disabled?: boolean;
  helpText?: string;
}

export function ScheduleSelector({
  label,
  value,
  onChange,
  options,
  customDays,
  onCustomDaysChange,
  showCustomInput = false,
  disabled = false,
  helpText,
}: ScheduleSelectorProps) {
  const testId = `schedule-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={testId}>{label}</Label>
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={testId} data-testid={testId}>
            <SelectValue placeholder="Select schedule" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {helpText && (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        )}
      </div>
      
      {showCustomInput && value === "custom" && onCustomDaysChange && (
        <div className="space-y-2">
          <Label htmlFor={`${testId}-custom`}>Custom interval (days)</Label>
          <Input
            id={`${testId}-custom`}
            type="number"
            min={1}
            max={365}
            value={customDays || ''}
            onChange={(e) => onCustomDaysChange(parseInt(e.target.value) || 0)}
            placeholder="Enter number of days"
            disabled={disabled}
            data-testid={`${testId}-custom`}
          />
        </div>
      )}
    </div>
  );
}
