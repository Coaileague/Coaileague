import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection, SignatureField, DocumentViewer, AckCheckbox, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step9_SecurityPolicy({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="Security Officer Code of Conduct & Confidentiality Policy">
        <p>
          As a security officer, you are held to a higher standard of conduct. You represent
          the company and its clients at all times while on duty.
        </p>
        <p><strong>Code of Conduct:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Conduct yourself professionally at all times on and off duty</li>
          <li>Report all incidents accurately and promptly</li>
          <li>Use only the degree of force necessary and legally permitted</li>
          <li>Comply with all client site rules and instructions</li>
          <li>Never engage in unauthorized use of force or weapons</li>
        </ul>
        <p><strong>Confidentiality:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Client identities, locations, schedules, and security plans are strictly confidential</li>
          <li>Do not discuss client information on social media or with unauthorized persons</li>
          <li>Confidentiality obligations survive termination of employment</li>
        </ul>
        <p>
          <strong>Consequences:</strong> Violations of this policy may result in immediate
          termination and may expose you to civil or criminal liability.
        </p>
      </DocumentViewer>

      <FormSection
        title="Policy Acknowledgments"
        description="All three acknowledgments must be accepted."
      >
        <AckCheckbox
          id="policy_ack1"
          label="I have read and understand the Security Officer Code of Conduct, and agree to comply with all requirements."
          checked={!!data.ack1}
          onChange={v => onChange('ack1', v)}
          error={errors.ack1}
        />
        <AckCheckbox
          id="policy_ack2"
          label="I understand the consequences of policy violations, including immediate termination and potential legal liability."
          checked={!!data.ack2}
          onChange={v => onChange('ack2', v)}
          error={errors.ack2}
        />
        <AckCheckbox
          id="policy_ack3"
          label="I agree to maintain strict confidentiality of all client information, security plans, and proprietary company information, both during and after my employment."
          checked={!!data.ack3}
          onChange={v => onChange('ack3', v)}
          error={errors.ack3}
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
          <Label htmlFor="signed_at_sp">Date</Label>
          <Input
            id="signed_at_sp"
            type="date"
            value={data.signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
