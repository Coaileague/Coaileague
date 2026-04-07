import { useId, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

interface UniversalInputProps {
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'number';
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  name?: string;
  id?: string;
  'data-testid'?: string;
}

const sizeMap = {
  sm: { height: '36px', fontSize: 'max(16px, var(--text-sm))', padding: '0 12px', gap: '8px' },
  md: { height: '44px', fontSize: 'max(16px, var(--text-base))', padding: '0 14px', gap: '10px' },
  lg: { height: '52px', fontSize: 'max(16px, var(--text-md))', padding: '0 16px', gap: '12px' },
};

export function UniversalInput({
  type = 'text',
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  onBlur,
  error,
  hint,
  icon,
  iconRight,
  disabled = false,
  required = false,
  size = 'md',
  fullWidth = false,
  className = '',
  style,
  autoComplete,
  inputMode,
  name,
  id: idProp,
  'data-testid': testId,
}: UniversalInputProps) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const sz = sizeMap[size];

  const isPassword = type === 'password';
  const isSearch = type === 'search';
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;
  const hasError = Boolean(error);

  const borderColor = hasError
    ? 'var(--color-danger)'
    : focused
    ? 'var(--color-brand-primary)'
    : 'var(--color-border-default)';

  const boxShadow = focused
    ? hasError
      ? '0 0 0 3px rgba(248,81,73,0.2)'
      : '0 0 0 3px var(--color-focus)'
    : 'none';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        width: fullWidth ? '100%' : 'auto',
        ...style,
      }}
    >
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--weight-medium)' as any,
            color: hasError ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}
        >
          {label}
          {required && (
            <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }} aria-hidden="true">*</span>
          )}
        </label>
      )}

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: sz.height,
          gap: sz.gap,
          background: disabled ? 'var(--color-bg-overlay)' : 'var(--color-bg-tertiary)',
          border: `1px solid ${borderColor}`,
          borderRadius: 'var(--radius-md)',
          boxShadow,
          transition: `border-color var(--duration-fast), box-shadow var(--duration-fast)`,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
          paddingInline: sz.padding.split(' ')[1],
        }}
      >
        {icon && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              color: 'var(--color-text-disabled)',
              pointerEvents: 'none',
            }}
          >
            {icon}
          </span>
        )}

        <input
          id={inputId}
          name={name}
          data-testid={testId}
          type={resolvedType}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={hasError}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: sz.fontSize,
            fontFamily: 'var(--font-body)',
            color: 'var(--color-text-primary)',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />

        {/* Clear button for search */}
        {isSearch && value && (
          <button
            type="button"
            onClick={() => onChange?.('')}
            aria-label="Clear search"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: '28px',
              height: '28px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-disabled)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={14} />
          </button>
        )}

        {/* Password toggle */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: '32px',
              height: '32px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-disabled)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}

        {iconRight && !isPassword && !isSearch && (
          <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--color-text-disabled)', pointerEvents: 'none' }}>
            {iconRight}
          </span>
        )}
      </div>

      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-body)',
            color: 'var(--color-danger)',
            lineHeight: 'var(--leading-normal)' as any,
          }}
        >
          {error}
        </p>
      )}

      {hint && !error && (
        <p
          id={`${inputId}-hint`}
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-body)',
            color: 'var(--color-text-secondary)',
            lineHeight: 'var(--leading-normal)' as any,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
