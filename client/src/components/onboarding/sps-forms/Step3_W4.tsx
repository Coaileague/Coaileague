import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection, SignatureField, DocumentViewer, AckCheckbox, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step3_W4({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="W-4 Employee's Withholding Certificate">
        <p>
          Complete this form so your employer can withhold the correct federal income tax from your pay.
          Your SSN is required by law and is stored encrypted. Only the last 4 digits are stored in plaintext.
        </p>
      </DocumentViewer>

      <FormSection title="Tax Information">
        <div className="space-y-1">
          <Label htmlFor="ssn">Social Security Number (SSN) <span className="text-red-500">*</span></Label>
          <Input
            id="ssn"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={data.ssn ?? ''}
            onChange={e => onChange('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="9-digit SSN (stored encrypted)"
            maxLength={9}
          />
          <p className="text-xs text-muted-foreground">Your SSN is encrypted at rest. Only the last 4 digits are visible to administrators.</p>
          <FieldError error={errors.ssn} />
        </div>

        <div className="space-y-1">
          <Label>Filing Status <span className="text-red-500">*</span></Label>
          <Select value={data.filing_status ?? ''} onValueChange={v => onChange('filing_status', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select filing status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single or Married filing separately</SelectItem>
              <SelectItem value="married_jointly">Married filing jointly</SelectItem>
              <SelectItem value="head_of_household">Head of household</SelectItem>
            </SelectContent>
          </Select>
          <FieldError error={errors.filing_status} />
        </div>

        <AckCheckbox
          id="multiple_jobs"
          label="I (and/or my spouse) have multiple jobs simultaneously"
          checked={!!data.multiple_jobs}
          onChange={v => onChange('multiple_jobs', v)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="dependents_amount">Dependents Amount ($)</Label>
            <Input
              id="dependents_amount"
              type="number"
              min="0"
              step="0.01"
              value={data.dependents_amount ?? ''}
              onChange={e => onChange('dependents_amount', e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="other_income">Other Income ($)</Label>
            <Input
              id="other_income"
              type="number"
              min="0"
              step="0.01"
              value={data.other_income ?? ''}
              onChange={e => onChange('other_income', e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="extra_withholding">Extra Withholding ($)</Label>
            <Input
              id="extra_withholding"
              type="number"
              min="0"
              step="0.01"
              value={data.extra_withholding ?? ''}
              onChange={e => onChange('extra_withholding', e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Employee Signature">
        <SignatureField
          label="Employee Signature *"
          value={data.employee_signature ?? ''}
          onChange={v => onChange('employee_signature', v)}
          error={errors.employee_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="signed_at_w4">Date</Label>
          <Input
            id="signed_at_w4"
            type="date"
            value={data.signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
