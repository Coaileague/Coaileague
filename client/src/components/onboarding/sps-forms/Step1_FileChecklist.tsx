import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step1_FileChecklist({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <FormSection
        title="Step 1 — Personal Information"
        description="Basic information needed for your employee file and licensing records."
      >
        <div className="space-y-1">
          <Label htmlFor="full_legal_name">Full Legal Name <span className="text-red-500">*</span></Label>
          <Input
            id="full_legal_name"
            value={data.full_legal_name ?? ''}
            onChange={e => onChange('full_legal_name', e.target.value)}
            placeholder="As it appears on your government-issued ID"
          />
          <FieldError error={errors.full_legal_name} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="date_of_birth">Date of Birth <span className="text-red-500">*</span></Label>
            <Input
              id="date_of_birth"
              type="date"
              value={data.date_of_birth ?? ''}
              onChange={e => onChange('date_of_birth', e.target.value)}
            />
            <FieldError error={errors.date_of_birth} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hire_date">Hire Date <span className="text-red-500">*</span></Label>
            <Input
              id="hire_date"
              type="date"
              value={data.hire_date ?? ''}
              onChange={e => onChange('hire_date', e.target.value)}
            />
            <FieldError error={errors.hire_date} />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="position">Position / Job Title <span className="text-red-500">*</span></Label>
          <Input
            id="position"
            value={data.position ?? ''}
            onChange={e => onChange('position', e.target.value)}
            placeholder="e.g. Security Officer, Lead Guard"
          />
          <FieldError error={errors.position} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="work_address">Primary Work Address <span className="text-red-500">*</span></Label>
          <Input
            id="work_address"
            value={data.work_address ?? ''}
            onChange={e => onChange('work_address', e.target.value)}
            placeholder="Street, City, State, ZIP"
          />
          <FieldError error={errors.work_address} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone ?? ''}
            onChange={e => onChange('phone', e.target.value)}
            placeholder="(555) 000-0000"
          />
        </div>
      </FormSection>
    </div>
  );
}
