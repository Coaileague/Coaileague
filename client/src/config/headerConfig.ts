/**
 * Universal Header Configuration
 * Easy-to-edit navigation items and behavior
 * Used by all pages (public + workspace)
 */

export const HEADER_CONFIG = {
  public: {
    navItems: [
      { label: "Pricing", href: "/pricing", testid: "link-pricing" },
      { label: "Features", href: "/features", testid: "link-features" },
      { label: "Contact", href: "/contact", testid: "link-contact" },
    ],
  },
};

export const HEADER_SPACING = {
  desktopNavGap: "gap-6",
  mobileIconGap: "gap-0.5",
  rightSideGap: "gap-1",
  containerPadding: "px-3 sm:px-6",
};

export const HEADER_HEIGHTS = {
  mobile: "h-12",
  desktop: "sm:h-16",
  iconButton: "sm:h-9 sm:w-9",
  iconButtonExplicit: "h-8 w-8 sm:h-9 sm:w-9",
};
