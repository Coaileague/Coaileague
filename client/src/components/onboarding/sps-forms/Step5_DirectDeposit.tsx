import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection, SignatureField, FileUploader, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step5_DirectDeposit({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <FormSection
        title="Step 5 — Direct Deposit Authorization"
        description="Your pay will be deposited directly to the account below. Account numbers are stored encrypted."
      >
        <div className="space-y-1">
          <Label htmlFor="bank_name">Bank Name</Label>
          <Input
            id="bank_name"
            value={data.bank_name ?? ''}
            onChange={e => onChange('bank_name', e.target.value)}
            placeholder="e.g. Chase, Wells Fargo"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="routing_number">Routing Number (9 digits) <span className="text-red-500">*</span></Label>
          <Input
            id="routing_number"
            inputMode="numeric"
            value={data.routing_number ?? ''}
            onChange={e => onChange('routing_number', e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="9-digit ABA routing number"
            maxLength={9}
          />
          <FieldError error={errors.routing_number} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="account_number">Account Number <span className="text-red-500">*</span></Label>
          <Input
            id="account_number"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={data.account_number ?? ''}
            onChange={e => onChange('account_number', e.target.value.replace(/\D/g, ''))}
            placeholder="Numeric account number (stored encrypted)"
          />
          <p className="text-xs text-muted-foreground">Encrypted at rest. Only the last 4 digits will be visible to administrators.</p>
          <FieldError error={errors.account_number} />
        </div>

        <div className="space-y-1">
          <Label>Account Type <span className="text-red-500">*</span></Label>
          <Select value={data.account_type ?? ''} onValueChange={v => onChange('account_type', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="checking">Checking</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
          <FieldError error={errors.account_type} />
        </div>
      </FormSection>

      <FormSection title="Voided Check">
        <FileUploader
          label="Upload Voided Check (image)"
          value={data.voided_check_image_url ?? ''}
          onChange={v => onChange('voided_check_image_url', v)}
          error={errors.voided_check_image_url}
        />
        <p className="text-xs text-muted-foreground">
          A voided check confirms your account information. Write "VOID" across a check and upload a photo.
        </p>
      </FormSection>

      <FormSection title="Authorization Signature">
        <SignatureField
          label="Employee Signature *"
          value={data.employee_signature ?? ''}
          onChange={v => onChange('employee_signature', v)}
          error={errors.employee_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="signed_at_dd">Date</Label>
          <Input
            id="signed_at_dd"
            type="date"
            value={data.signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
