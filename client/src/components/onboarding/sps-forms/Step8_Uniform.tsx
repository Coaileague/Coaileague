import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection, SignatureField, DocumentViewer, AckCheckbox, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

export function Step8_Uniform({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="Uniform & Equipment Policy">
        <p>
          You will be issued company uniforms and equipment necessary to perform your duties.
          All uniforms and equipment remain property of the Company at all times.
        </p>
        <p>
          <strong>Return Policy:</strong> All uniforms and equipment must be returned in good condition
          upon separation of employment. Failure to return items may result in deductions from your
          final paycheck as permitted by applicable law.
        </p>
        <p>
          <strong>Care Requirements:</strong> Uniforms must be clean, pressed, and in good repair
          at all times while on duty. Loss, damage, or negligent misuse may result in replacement
          cost deductions from pay.
        </p>
      </DocumentViewer>

      <FormSection title="Uniform Sizing">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Shirt Size <span className="text-red-500">*</span></Label>
            <Select value={data.uniform_shirt_size ?? ''} onValueChange={v => onChange('uniform_shirt_size', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select shirt size" />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError error={errors.uniform_shirt_size} />
          </div>
          <div className="space-y-1">
            <Label>Pants Size</Label>
            <Input
              value={data.uniform_pants_size ?? ''}
              onChange={e => onChange('uniform_pants_size', e.target.value)}
              placeholder='e.g. 32x30'
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Uniform Deduction Acknowledgments">
        <AckCheckbox
          id="deduction_ack1"
          label="I understand that uniforms and equipment issued to me remain property of the Company, and that items not returned upon separation may result in a deduction from my final paycheck."
          checked={!!data.deduction_ack1}
          onChange={v => onChange('deduction_ack1', v)}
          error={errors.deduction_ack1}
        />
        <AckCheckbox
          id="deduction_ack2"
          label="I understand that willful damage, loss, or negligent misuse of company uniforms or equipment may result in a payroll deduction for replacement cost, as permitted by applicable law."
          checked={!!data.deduction_ack2}
          onChange={v => onChange('deduction_ack2', v)}
          error={errors.deduction_ack2}
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
          <Label htmlFor="signed_at_uni">Date</Label>
          <Input
            id="signed_at_uni"
            type="date"
            value={data.signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
