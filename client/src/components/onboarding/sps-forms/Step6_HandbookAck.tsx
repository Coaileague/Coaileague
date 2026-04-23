import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection, SignatureField, DocumentViewer, AckCheckbox, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step6_HandbookAck({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="Employee Handbook — Summary">
        <p>
          The Employee Handbook contains important information about company policies, procedures,
          benefits, and expected standards of conduct. Please read it carefully.
        </p>
        <p>Key topics covered:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Code of conduct and professional standards</li>
          <li>Attendance, punctuality, and scheduling policies</li>
          <li>Uniform and equipment requirements</li>
          <li>Use of force policy and incident reporting</li>
          <li>Anti-harassment and non-discrimination policies</li>
          <li>Confidentiality of client information</li>
          <li>Progressive discipline and termination procedures</li>
        </ul>
        <p>
          The handbook does not constitute an employment contract. Policies may be updated
          at the company's discretion with reasonable notice.
        </p>
      </DocumentViewer>

      <FormSection
        title="Handbook Acknowledgments"
        description="All five acknowledgments must be accepted to proceed."
      >
        <AckCheckbox
          id="ack1"
          label="I have received a copy of the Employee Handbook and have had the opportunity to read it."
          checked={!!data.ack1}
          onChange={v => onChange('ack1', v)}
          error={errors.ack1}
        />
        <AckCheckbox
          id="ack2"
          label="I understand the policies and procedures described in the Employee Handbook."
          checked={!!data.ack2}
          onChange={v => onChange('ack2', v)}
          error={errors.ack2}
        />
        <AckCheckbox
          id="ack3"
          label="I understand that the Employee Handbook is not a contract of employment."
          checked={!!data.ack3}
          onChange={v => onChange('ack3', v)}
          error={errors.ack3}
        />
        <AckCheckbox
          id="ack4"
          label="I agree to comply with all company policies and understand that violations may result in disciplinary action up to and including termination."
          checked={!!data.ack4}
          onChange={v => onChange('ack4', v)}
          error={errors.ack4}
        />
        <AckCheckbox
          id="ack5"
          label="I understand that policies may be updated and it is my responsibility to stay current with any changes."
          checked={!!data.ack5}
          onChange={v => onChange('ack5', v)}
          error={errors.ack5}
        />
      </FormSection>

      <FormSection title="Employee Signature">
        <SignatureField
          label="Employee Signature *"
          value={data.employee_signature ?? ''}
          onChange={v => onChange('employee_signature', v)}
          error={errors.employee_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="signed_at_hb">Date</Label>
          <Input
            id="signed_at_hb"
            type="date"
            value={data.signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
