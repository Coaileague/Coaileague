/**
 * Trinity Document Validator
 * ==========================
 * 7-step validation pipeline for universal document form submissions.
 * Section 6 of the UDTS spec.
 *
 * Steps:
 * 1. Schema validation — required fields present
 * 2. Format validation — phone, email, SSN, ZIP formats
 * 3. Signature validation — all required signatures non-empty
 * 4. Acknowledgment validation — all required acknowledgments checked
 * 5. Initials validation — all required initials non-empty
 * 6. Date validation — dates are valid, not in future (for birthdates)
 * 7. Business rules — custom per-template rules
 */

import type { DocumentTemplate, ValidationRule } from './templateRegistry';

export interface ValidationError {
  field: string;
  message: string;
  step: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  passedSteps: number[];
  failedStep?: number;
}

// Step 1 — Required fields present
function validateRequiredFields(template: DocumentTemplate, data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (!field.required) continue;
      const val = data[field.id];
      const isEmpty = val === undefined || val === null || val === "" ||
        (typeof val === "object" && !Array.isArray(val) && Object.values(val).every(v => !v));
      if (isEmpty) {
        errors.push({ field: field.id, message: `${field.label} is required`, step: 1 });
      }
    }
  }
  return errors;
}

// Step 2 — Format validation
function validateFormats(template: DocumentTemplate, data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^\+?[\d\s\-().]{7,15}$/;
  const zipRe = /^\d{5}(-\d{4})?$/;
  const ssnPartialRe = /^\d{4}$|^\d{3}-\d{2}-\d{4}$|^\d{9}$/;

  for (const section of template.sections) {
    for (const field of section.fields) {
      const val = data[field.id];
      if (!val) continue;
      switch (field.type) {
        case 'email':
          if (!emailRe.test(String(val))) {
            errors.push({ field: field.id, message: `${field.label}: invalid email format`, step: 2 });
          }
          break;
        case 'phone':
          if (!phoneRe.test(String(val).replace(/\s/g, ''))) {
            errors.push({ field: field.id, message: `${field.label}: invalid phone format`, step: 2 });
          }
          break;
        case 'ssn': {
          const clean = String(val).replace(/[-\s]/g, '');
          if (clean.length > 0 && !ssnPartialRe.test(String(val))) {
            errors.push({ field: field.id, message: `${field.label}: invalid SSN format`, step: 2 });
          }
          break;
        }
        case 'address_block': {
          const addr = val as { zip?: string };
          if (addr?.zip && !zipRe.test(addr.zip)) {
            errors.push({ field: field.id, message: `${field.label}: ZIP code must be 5 digits`, step: 2 });
          }
          break;
        }
        default:
          break;
      }
      // Custom validation pattern
      if (field.validationPattern && typeof val === 'string' && val.length > 0) {
        const re = new RegExp(field.validationPattern);
        if (!re.test(val)) {
          errors.push({ field: field.id, message: `${field.label}: invalid format`, step: 2 });
        }
      }
    }
  }
  return errors;
}

// Step 3 — Signature validation
function validateSignatures(template: DocumentTemplate, data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const section of template.sections) {
    if (!section.requiresSignature) continue;
    for (const field of section.fields) {
      if (field.type !== 'signature') continue;
      if (!field.required) continue;
      const val = data[field.id];
      const hasSignature = val && typeof val === 'string' && val.length > 100;
      if (!hasSignature) {
        errors.push({ field: field.id, message: `${field.label}: signature is required`, step: 3 });
      }
    }
  }
  return errors;
}

// Step 4 — Acknowledgment validation
function validateAcknowledgments(template: DocumentTemplate, data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const section of template.sections) {
    if (!section.requiresAcknowledgment) continue;
    const ackKey = `__ack_${section.id}`;
    if (!data[ackKey]) {
      errors.push({
        field: ackKey,
        message: `Section "${section.title}": acknowledgment checkbox is required`,
        step: 4,
      });
    }
  }
  return errors;
}

// Step 5 — Initials validation
function validateInitials(template: DocumentTemplate, data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const section of template.sections) {
    if (!section.requiresInitials) continue;
    for (const field of section.fields) {
      if (field.type !== 'initials') continue;
      const val = data[field.id];
      const hasInitials = val && typeof val === 'string' && val.length > 50;
      if (!hasInitials) {
        errors.push({ field: field.id, message: `${field.label}: initials are required`, step: 5 });
      }
    }
  }
  return errors;
}

// Step 6 — Date validation
function validateDates(template: DocumentTemplate, data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.type !== 'date') continue;
      const val = data[field.id];
      if (!val) continue;
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        errors.push({ field: field.id, message: `${field.label}: invalid date`, step: 6 });
        continue;
      }
      // Birthdates must be in the past
      const lowerLabel = field.label.toLowerCase();
      if ((lowerLabel.includes('birth') || lowerLabel.includes('dob')) && d > today) {
        errors.push({ field: field.id, message: `${field.label}: date of birth cannot be in the future`, step: 6 });
      }
    }
  }
  return errors;
}

// Step 7 — Custom business rules from template
function validateBusinessRules(rules: ValidationRule[], data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const rule of rules) {
    const val = data[rule.field];
    switch (rule.rule) {
      case 'required': {
        if (!val || (typeof val === 'string' && !val.trim())) {
          errors.push({ field: rule.field, message: rule.message, step: 7 });
        }
        break;
      }
      case 'signature_not_empty': {
        const hasSig = val && typeof val === 'string' && val.length > 100;
        if (!hasSig) {
          errors.push({ field: rule.field, message: rule.message, step: 7 });
        }
        break;
      }
      case 'scroll_complete': {
        if (!val) {
          errors.push({ field: rule.field, message: rule.message, step: 7 });
        }
        break;
      }
      default:
        break;
    }
  }
  return errors;
}

// ── Main Validator ────────────────────────────────────────────────────────────

export function validateDocumentForm(
  template: DocumentTemplate,
  data: Record<string, unknown>,
): ValidationResult {
  const allErrors: ValidationError[] = [];
  const passedSteps: number[] = [];

  const runStep = (step: number, errs: ValidationError[]) => {
    if (errs.length === 0) {
      passedSteps.push(step);
    }
    allErrors.push(...errs);
  };

  runStep(1, validateRequiredFields(template, data));
  runStep(2, validateFormats(template, data));
  runStep(3, validateSignatures(template, data));
  runStep(4, validateAcknowledgments(template, data));
  runStep(5, validateInitials(template, data));
  runStep(6, validateDates(template, data));
  runStep(7, validateBusinessRules(template.trinityValidationRules, data));

  const valid = allErrors.length === 0;
  const failedStep = allErrors.length > 0 ? allErrors[0].step : undefined;

  return {
    valid,
    errors: allErrors,
    warnings: [],
    passedSteps,
    failedStep,
  };
}
