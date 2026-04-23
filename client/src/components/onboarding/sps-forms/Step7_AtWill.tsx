import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection, SignatureField, DocumentViewer, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step7_AtWill({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="At-Will Employment Agreement">
        <p>
          <strong>At-Will Employment Notice</strong>
        </p>
        <p>
          Your employment with the Company is at-will. This means that either you or the Company
          may terminate the employment relationship at any time, for any reason, or for no reason,
          with or without cause, and with or without prior notice, subject to applicable law.
        </p>
        <p>
          No manager, supervisor, or other representative of the Company (other than the President
          or CEO in a signed written agreement) has authority to enter into any agreement for
          employment for any specified period or to make any agreement contrary to the at-will nature
          of employment.
        </p>
        <p>
          Nothing in this agreement or the Employee Handbook changes the at-will employment
          relationship between you and the Company.
        </p>
      </DocumentViewer>

      <FormSection
        title="Signatures"
        description="Both employee and employer must sign to acknowledge this agreement."
      >
        <SignatureField
          label="Employee Signature *"
          value={data.employee_signature ?? ''}
          onChange={v => onChange('employee_signature', v)}
          error={errors.employee_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="emp_signed_at_aw">Employee Signed Date *</Label>
          <Input
            id="emp_signed_at_aw"
            type="date"
            value={data.employee_signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('employee_signed_at', e.target.value)}
          />
          <FieldError error={errors.employee_signed_at} />
        </div>

        <SignatureField
          label="Employer / Authorized Representative Signature *"
          value={data.employer_signature ?? ''}
          onChange={v => onChange('employer_signature', v)}
          error={errors.employer_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="er_signed_at_aw">Employer Signed Date *</Label>
          <Input
            id="er_signed_at_aw"
            type="date"
            value={data.employer_signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('employer_signed_at', e.target.value)}
          />
          <FieldError error={errors.employer_signed_at} />
        </div>
      </FormSection>
    </div>
  );
}
