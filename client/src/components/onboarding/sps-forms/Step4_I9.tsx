import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection, SignatureField, DocumentViewer, FieldError } from './shared';

interface Props {
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function Step4_I9({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <DocumentViewer title="I-9 Employment Eligibility Verification">
        <p>
          Federal law requires all employers to verify the identity and employment authorization
          of each person they hire. You must provide acceptable documents to confirm your eligibility.
        </p>
        <p>
          Completing this form does not guarantee employment. Providing false information is a federal crime.
        </p>
      </DocumentViewer>

      <FormSection title="Employee Contact Information">
        <div className="space-y-1">
          <Label htmlFor="i9_email">Email Address <span className="text-red-500">*</span></Label>
          <Input
            id="i9_email"
            type="email"
            inputMode="email"
            value={data.email ?? ''}
            onChange={e => onChange('email', e.target.value)}
            placeholder="your@email.com"
          />
          <FieldError error={errors.email} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="i9_phone">Phone</Label>
          <Input
            id="i9_phone"
            type="tel"
            inputMode="tel"
            value={data.phone ?? ''}
            onChange={e => onChange('phone', e.target.value)}
            placeholder="(555) 000-0000"
          />
        </div>
      </FormSection>

      <FormSection title="Citizenship / Immigration Status">
        <div className="space-y-1">
          <Label>Citizenship Status <span className="text-red-500">*</span></Label>
          <Select value={data.citizenship_status ?? ''} onValueChange={v => onChange('citizenship_status', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="citizen">A citizen of the United States</SelectItem>
              <SelectItem value="noncitizen_national">A noncitizen national of the United States</SelectItem>
              <SelectItem value="lawful_permanent_resident">A lawful permanent resident</SelectItem>
              <SelectItem value="alien_authorized">An alien authorized to work</SelectItem>
            </SelectContent>
          </Select>
          <FieldError error={errors.citizenship_status} />
        </div>
      </FormSection>

      <FormSection title="Identity Document" description="Provide one document from List A, or one from List B AND one from List C.">
        <div className="space-y-1">
          <Label>Document Type <span className="text-red-500">*</span></Label>
          <Select value={data.document_type ?? ''} onValueChange={v => onChange('document_type', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select document" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us_passport">U.S. Passport (List A)</SelectItem>
              <SelectItem value="perm_resident_card">Permanent Resident Card (List A)</SelectItem>
              <SelectItem value="drivers_license">Driver's License (List B)</SelectItem>
              <SelectItem value="id_card">State/Local ID Card (List B)</SelectItem>
              <SelectItem value="social_security_card">Social Security Card (List C)</SelectItem>
              <SelectItem value="birth_certificate">Birth Certificate (List C)</SelectItem>
            </SelectContent>
          </Select>
          <FieldError error={errors.document_type} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="document_number">Document Number</Label>
            <Input
              id="document_number"
              value={data.document_number ?? ''}
              onChange={e => onChange('document_number', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="document_expiry">Expiration Date</Label>
            <Input
              id="document_expiry"
              type="date"
              value={data.document_expiry ?? ''}
              onChange={e => onChange('document_expiry', e.target.value)}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Signatures">
        <SignatureField
          label="Employee Signature"
          value={data.employee_signature ?? ''}
          onChange={v => onChange('employee_signature', v)}
          error={errors.employee_signature}
        />
        <SignatureField
          label="Employer / Authorized Representative Signature"
          value={data.employer_signature ?? ''}
          onChange={v => onChange('employer_signature', v)}
          error={errors.employer_signature}
        />
        <div className="space-y-1">
          <Label htmlFor="signed_at_i9">Date</Label>
          <Input
            id="signed_at_i9"
            type="date"
            value={data.signed_at ?? new Date().toISOString().slice(0, 10)}
            onChange={e => onChange('signed_at', e.target.value)}
          />
        </div>
      </FormSection>
    </div>
  );
}
