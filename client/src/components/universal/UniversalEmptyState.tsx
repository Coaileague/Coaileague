import {
  Calendar,
  Users,
  MessageSquare,
  SearchX,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import type { ButtonVariant } from '@/lib/tokens';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
}

interface UniversalEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  size?: 'sm' | 'md' | 'lg';
  'data-testid'?: string;
}

const sizeMap = {
  sm: { iconSize: 32, titleSize: 'var(--text-base)', descSize: 'var(--text-sm)', padding: 'var(--space-6)' },
  md: { iconSize: 48, titleSize: 'var(--text-lg)',   descSize: 'var(--text-base)', padding: 'var(--space-10)' },
  lg: { iconSize: 64, titleSize: 'var(--text-xl)',   descSize: 'var(--text-md)',   padding: 'var(--space-16)' },
};

export function UniversalEmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  'data-testid': testId,
}: UniversalEmptyStateProps) {
  const sz = sizeMap[size];

  return (
    <div
      data-testid={testId ?? 'empty-state'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: sz.padding,
        textAlign: 'center',
        gap: 'var(--space-4)',
      }}
    >
      {icon && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${sz.iconSize * 2}px`,
            height: `${sz.iconSize * 2}px`,
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-disabled)',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: '360px' }}>
        <h3
          style={{
            margin: 0,
            fontSize: sz.titleSize,
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--weight-semibold)' as any,
            color: 'var(--color-text-primary)',
            lineHeight: 'var(--leading-tight)' as any,
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: sz.descSize,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-text-secondary)',
              lineHeight: 'var(--leading-relaxed)' as any,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {action && (
        <button
          onClick={action.onClick}
          data-testid="button-empty-state-action"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 var(--space-5)',
            height: '40px',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--weight-medium)' as any,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-brand-primary)',
            background: action.variant === 'primary' ? 'var(--color-brand-primary)' : 'transparent',
            color: action.variant === 'primary' ? 'var(--color-text-inverse)' : 'var(--color-brand-primary)',
            cursor: 'pointer',
            transition: `transform var(--duration-fast), filter var(--duration-fast)`,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

UniversalEmptyState.NoSchedule = function NoSchedule(props: Partial<UniversalEmptyStateProps>) {
  return <UniversalEmptyState icon={<Calendar size={32} />} title="No shifts scheduled" description="No shifts have been scheduled yet." {...props} />;
};

UniversalEmptyState.NoEmployees = function NoEmployees(props: Partial<UniversalEmptyStateProps>) {
  return <UniversalEmptyState icon={<Users size={32} />} title="No employees added yet" description="Add your first team member to get started." {...props} />;
};

UniversalEmptyState.NoMessages = function NoMessages(props: Partial<UniversalEmptyStateProps>) {
  return <UniversalEmptyState icon={<MessageSquare size={32} />} title="No messages yet" description="Your inbox is empty. New messages will appear here." {...props} />;
};

UniversalEmptyState.NoResults = function NoResults(props: Partial<UniversalEmptyStateProps>) {
  return <UniversalEmptyState icon={<SearchX size={32} />} title="No results found" description="Try adjusting your search or filters." {...props} />;
};

UniversalEmptyState.NoPendingItems = function NoPendingItems(props: Partial<UniversalEmptyStateProps>) {
  return <UniversalEmptyState icon={<CheckCircle size={32} />} title="You're all caught up" description="Nothing pending right now. Great work!" {...props} />;
};

UniversalEmptyState.Error = function ErrorState(props: Partial<UniversalEmptyStateProps>) {
  return <UniversalEmptyState icon={<AlertTriangle size={32} />} title="Something went wrong" description="An error occurred. Please try again." {...props} />;
};
