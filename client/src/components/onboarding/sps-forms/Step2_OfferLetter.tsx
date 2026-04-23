import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection, SignatureField, DocumentViewer, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step2_OfferLetter({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="Employment Offer Letter">
        <p>
          This offer letter confirms the terms of your employment. Please review the details below
          carefully. By signing, you acknowledge and accept these terms.
        </p>
        <p>
          Employment is contingent upon successful completion of all onboarding steps,
          background verification, and any applicable licensing requirements.
        </p>
      </DocumentViewer>

      <FormSection title="Offer Details" description="Your employment terms as offered.">
        <div className="space-y-1">
          <Label htmlFor="position_offered">Position Offered <span className="text-red-500">*</span></Label>
          <Input
            id="position_offered"
            value={data.position_offered ?? ''}
            onChange={e => onChange('position_offered', e.target.value)}
            placeholder="e.g. Security Officer"
          />
          <FieldError error={errors.position_offered} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="start_date">Start Date <span className="text-red-500">*</span></Label>
            <Input
              id="start_date"
              type="date"
              value={data.start_date ?? ''}
              onChange={e => onChange('start_date', e.target.value)}
            />
            <FieldError error={errors.start_date} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="salary_hourly_rate">Hourly Rate ($) <span className="text-red-500">*</span></Label>
            <Input
              id="salary_hourly_rate"
              type="number"
              min="0.01"
              step="0.01"
              value={data.salary_hourly_rate ?? ''}
              onChange={e => onChange('salary_hourly_rate', e.target.value)}
              placeholder="0.00"
            />
            <FieldError error={errors.salary_hourly_rate} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Signatures">
        <SignatureField
          label="Employee Signature *"
          value={data.employee_signature ?? ''}
          onChange={v => onChange('employee_signature', v)}
          error={errors.employee_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="employee_signed_at">Date</Label>
          <Input
            id="employee_signed_at"
            type="date"
            value={data.employee_signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('employee_signed_at', e.target.value)}
          />
        </div>
        <SignatureField
          label="Employer / Authorized Representative Signature *"
          value={data.employer_signature ?? ''}
          onChange={v => onChange('employer_signature', v)}
          error={errors.employer_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="employer_signed_at">Date</Label>
          <Input
            id="employer_signed_at"
            type="date"
            value={data.employer_signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('employer_signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
