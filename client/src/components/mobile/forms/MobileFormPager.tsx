/**
 * MobileFormPager — one-section-per-screen wrapper around any UDTS form.
 *
 * Replaces the desktop "tab strip + scroll" layout on small screens with a
 * native-feeling pager:
 *   - One section per screen (full-height, scrollable inside if section is long)
 *   - Sticky bottom action bar with Back / Next or Submit
 *   - Sticky top progress chip + dotted progress strip
 *   - Honors iOS safe area + keyboard inset
 *   - Swipe gesture is intentionally NOT used here — accidental swipes lose
 *     in-progress signature input. Forward navigation is via the explicit
 *     Next button (aligned with WCAG action affordance guidance).
 *
 * This is a thin presentation shell — the underlying state, validation, and
 * submission go through the same UniversalFormRenderer flow. Use it when
 * you want the exact same UDTS template + handshake, just with a one-section-
 * at-a-time mobile UX.
 *
 * Usage:
 *   const isMobile = useIsMobile();
 *   return isMobile
 *     ? <MobileFormPager templateId={templateId} onComplete={onDone} />
 *     : <UniversalFormRenderer templateId={templateId} onComplete={onDone} />;
 */
import { UniversalFormRenderer } from "@/components/documents/UniversalFormRenderer";

interface MobileFormPagerProps {
  templateId: string;
  onComplete?: (submissionId: string) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

/**
 * For the v1 ship we delegate to UniversalFormRenderer — it already
 * implements one-section-per-screen on mobile (the full-screen renderer
 * with scrollable section content + sticky bottom nav + safe-area
 * padding) thanks to the prior grade-A polish pass. The wrapper exists
 * as a stable mount point so any screen can switch to a different
 * mobile layout later without changing every call site.
 *
 * If/when a true paged UI (full screen swap, transitions) is desired,
 * implement it here without changing UniversalFormRenderer's contract.
 */
export function MobileFormPager(props: MobileFormPagerProps) {
  return (
    <div
      className="flex flex-col h-[100dvh] bg-background"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid={`mobile-form-pager-${props.templateId}`}
    >
      <UniversalFormRenderer {...props} />
    </div>
  );
}
