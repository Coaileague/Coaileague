/**
 * Universal Header Configuration
 * Easy-to-edit navigation items and behavior
 * Used by all pages (public + workspace)
 */

export const HEADER_CONFIG = {
  public: {
    navItems: [
      { label: "Pricing", href: "/pricing", testid: "link-pricing" },
      { label: "Features", href: "/features", testid: "link-features", isSpecial: true }, // uses scroll handler
      { label: "Contact", href: "/contact", testid: "link-contact" },
    ],
  },
};

export const HEADER_SPACING = {
  desktopNavGap: "gap-6", // Space between nav items
  mobileIconGap: "gap-0.5", // Tight spacing for mobile icons (notification bell, menu)
  rightSideGap: "gap-2", // Space between buttons/icons on right side (auth area)
  containerPadding: "px-3 sm:px-6",
};

export const HEADER_HEIGHTS = {
  mobile: "h-16",
  desktop: "sm:h-20",
  iconButton: "h-10 w-10", // All icon buttons (bell, menu, avatar trigger)
};
