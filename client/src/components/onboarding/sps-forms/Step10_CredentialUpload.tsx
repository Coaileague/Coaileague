import { FormSection, FileUploader, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step10_CredentialUpload({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <FormSection
        title="Step 10 — Credential Documents"
        description="Upload clear photos of all required documents. Images are stored securely and scoped to your organization. All 5 images are required."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <FileUploader
            label="Driver's License — Front *"
            value={data.drivers_license_front_url ?? ''}
            onChange={v => onChange('drivers_license_front_url', v)}
            error={errors.drivers_license_front_url}
          />
          <FileUploader
            label="Driver's License — Back *"
            value={data.drivers_license_back_url ?? ''}
            onChange={v => onChange('drivers_license_back_url', v)}
            error={errors.drivers_license_back_url}
          />
          <FileUploader
            label="Guard Card / Security License — Front *"
            value={data.guard_card_front_url ?? ''}
            onChange={v => onChange('guard_card_front_url', v)}
            error={errors.guard_card_front_url}
          />
          <FileUploader
            label="Guard Card / Security License — Back *"
            value={data.guard_card_back_url ?? ''}
            onChange={v => onChange('guard_card_back_url', v)}
            error={errors.guard_card_back_url}
          />
          <FileUploader
            label="Social Security Card — Front *"
            value={data.ssn_front_url ?? ''}
            onChange={v => onChange('ssn_front_url', v)}
            error={errors.ssn_front_url}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          All credential images are encrypted in transit and stored securely in your organization's
          private storage bucket. Images are never shared outside your organization.
        </p>
      </FormSection>
    </div>
  );
}
