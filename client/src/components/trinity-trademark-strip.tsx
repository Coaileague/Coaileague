/**
 * TrinityTrademarkStrip — persistent trademark/copyright notice
 *
 * Fixed at the bottom of every page (public and workspace).
 * z-index 900: above page content, below headers, drawers, modals.
 * pointer-events: none so it never blocks interactions.
 *
 * LAW: Trinity™ is a protected trademark. This strip must render on ALL pages.
 */

const YEAR = new Date().getFullYear();

export function TrinityTrademarkStrip() {
  return (
    <div
      className="trinity-trademark-strip"
      aria-hidden="true"
      data-testid="trinity-trademark-strip"
    >
      <span>
        Trinity™ is a proprietary trademark of CoAIleague, Inc.
        &nbsp;&nbsp;·&nbsp;&nbsp;
        © {YEAR} CoAIleague, Inc. All rights reserved.
      </span>
    </div>
  );
}
