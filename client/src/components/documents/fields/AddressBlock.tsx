/**
 * AddressBlock — Structured address entry group.
 * Street, City, State dropdown, ZIP.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

export interface AddressValue {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
}

interface AddressBlockProps {
  id: string;
  label: string;
  required?: boolean;
  value?: AddressValue;
  onChange: (value: AddressValue) => void;
  error?: string;
  disabled?: boolean;
}

const EMPTY: AddressValue = { street1: "", street2: "", city: "", state: "", zip: "" };

export function AddressBlock({
  id,
  label,
  required = false,
  value = EMPTY,
  onChange,
  error,
  disabled = false,
}: AddressBlockProps) {
  const up = (field: keyof AddressValue, val: string) => onChange({ ...value, [field]: val });

  return (
    <div className="space-y-2" data-testid={`field-address-${id}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="space-y-2">
        <Input
          placeholder="Street Address"
          value={value.street1}
          onChange={(e) => up("street1", e.target.value)}
          disabled={disabled}
          data-testid={`input-address-street1-${id}`}
        />
        <Input
          placeholder="Street Address Line 2 (optional)"
          value={value.street2 ?? ""}
          onChange={(e) => up("street2", e.target.value)}
          disabled={disabled}
          data-testid={`input-address-street2-${id}`}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Input
            placeholder="City"
            value={value.city}
            onChange={(e) => up("city", e.target.value)}
            disabled={disabled}
            className="sm:col-span-1"
            data-testid={`input-address-city-${id}`}
          />
          <Select value={value.state} onValueChange={(v) => up("state", v)} disabled={disabled}>
            <SelectTrigger data-testid={`select-address-state-${id}`}>
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="ZIP"
            value={value.zip}
            onChange={(e) => up("zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
            disabled={disabled}
            inputMode="numeric"
            className="sm:col-span-1"
            data-testid={`input-address-zip-${id}`}
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive" data-testid={`error-address-${id}`}>{error}</p>}
    </div>
  );
}
