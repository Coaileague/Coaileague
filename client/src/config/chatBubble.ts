/**
 * Chat Bubble Configuration
 * Central configuration for all chat bubble styling, sizing, and positioning
 * Change values here to instantly update the entire chat bubble UI
 */

export const CHAT_BUBBLE_CONFIG = {
  // ===== POSITIONING & SIZING =====
  positioning: {
    // Initial position calculations (values subtracted from window dimensions)
    initialOffsetX: 420,  // Initial X offset from right
    initialOffsetY: 620,  // Initial Y offset from bottom
    
    // Drag boundary constraints
    maxHeight: 600, // Maximum Y position (chat bubble height)
    bottomBoundary: 100, // Minimum Y position to prevent going off bottom
  },

  // Element widths in pixels for drag boundary calculations
  elementWidths: {
    floatingButton: 64,      // w-16 = 4rem = 64px
    minimizedPill: 140,      // approximate: px-4 py-3 + icon + text
    chatWindow: 400,         // Full chat window width
  },

  sizes: {
    // Chat window dimensions
    windowWidth: 400,
    windowHeight: 600,
    
    // Pill/minimized chat
    pillPaddingX: 4,      // px-4
    pillPaddingY: 3,      // py-3
    pillIconSize: 5,      // w-5 h-5
    
    // Floating button
    buttonSize: 16,       // w-16 h-16
    buttonPadding: 4,     // p-4
    buttonIconSize: 6,    // w-6 h-6
    
    // Header buttons
    headerButtonSize: 7,  // h-7 w-7
    headerIconSize: 4,    // w-4 h-4
    headerGap: 1,         // gap-1
    
    // Chat messages area
    chatAreaMinHeight: 250,  // Reduced to fit form
    chatAreaMaxHeight: 300,  // Reduced to fit form
    chatAreaPadding: 2,      // p-2 (reduced)
    chatAreaSpacing: 2,      // space-y-2 (reduced)
    messageGap: 2,           // gap-2
    
    // Message bubbles
    messagePaddingX: 2,      // px-2 (reduced)
    messagePaddingY: 1,      // py-1 (reduced)
    messageMaxWidth: 80,     // max-w-[80%]
    avatarSize: 6,           // w-6 h-6 (reduced)
    avatarIconSize: 3,       // w-3 h-3 (reduced)
    smallAvatarSize: 1,      // w-1 h-1 (reduced)
    
    // Typing indicators
    typingDelay1: '0.1s',
    typingDelay2: '0.2s',
    
    // Header & input
    headerPadding: 2,        // p-2 (reduced)
    inputAreaPadding: 2,     // p-2 (reduced)
    inputAreaSpacing: 1,     // space-y-1 (reduced)
    inputGap: 1,             // gap-1 (reduced)
    inputIconSize: 3,        // w-3 h-3 (reduced)
    inputIconMarginRight: 1, // mr-1 (reduced)
    
    // Form sizes (new)
    formPadding: 2,          // p-2
    formSpacing: 1,          // space-y-1
    formLabelSize: 'text-xs',
    formInputSize: 'text-xs',
  },

  // ===== COLORS =====
  colors: {
    // Primary button colors
    primary: 'from-blue-600 to-blue-500',
    primaryHover: 'from-blue-700 to-blue-600',
    
    // Secondary/header colors
    secondary: 'from-blue-500/10 to-blue-500/10',
    
    // Status colors
    error: 'bg-red-500',
    errorText: 'text-red-500',
    
    // Text colors
    text: 'text-white',
    textMuted: 'text-muted-foreground',
    
    // Background
    background: 'bg-card',
    border: 'border-border',
    messageBg: 'bg-muted',
    userMessageBg: 'bg-primary',
    userMessageText: 'text-primary-foreground',
  },

  // ===== EFFECTS & ANIMATIONS =====
  effects: {
    shadow: 'shadow-2xl',
    rounded: 'rounded-full',
    roundedLg: 'rounded-lg',
    transition: 'transition-all duration-300',
    transitionOpacity: 'transition-opacity',
    cursor: {
      grab: 'cursor-grab',
      grabbing: 'cursor-grabbing',
    },
  },

  // ===== ANIMATIONS =====
  animations: {
    // Drag movement - smooth follow with cubic bezier easing
    dragTransition: 'none', // No transition during drag (instant follow)
    dragTransitionDuration: '0ms',
    
    // Opening animation - scale and fade in
    openingDuration: 400, // ms
    openingEasing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // spring-like bounce
    openingStartScale: 0.75,
    openingStartOpacity: 0,
    
    // Closing animation - scale and fade out
    closingDuration: 250, // ms
    closingEasing: 'cubic-bezier(0.4, 0, 0.2, 1)', // smooth exit
    closingEndScale: 0.75,
    closingEndOpacity: 0,
    
    // Minimize animation
    minimizingDuration: 300, // ms
    minimizingEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // ===== CONTENT =====
  content: {
    initialMessage: "Hi! I'm AutoForce™ AI, your intelligent support system. How can I help you today?",
    headerTitle: 'Live Chat - AI Support',
    messagePlaceholder: 'Type your message...',
    identificationTitle: 'Connect with a Support Agent',
    identificationSubtitle: 'Please provide your information to create a support ticket',
    identificationEmailLabel: 'Email Address',
    identificationEmailPlaceholder: 'your@email.com',
    identificationNameLabel: 'Full Name',
    identificationNamePlaceholder: 'John Doe',
    identificationWarning: '⚠️ You must provide your information before connecting to an agent.',
    buttonText: {
      liveChat: 'Live Chat',
      requestHelp: 'Request Human Help',
      sending: 'Creating Ticket...',
      createTicket: 'Create Support Ticket',
      successTitle: '✅ Support Ticket Created',
      successDesc: 'Connecting you to a support agent...',
      errorTitle: '❌ Error',
      errorDesc: 'Could not create support ticket. Please try again.',
    },
  },

  // ===== INTAKE FORM DIALOG =====
  intakeFormDialog: {
    showHomeButton: true,
    homeButtonPlacement: 'header', // 'header' or 'footer'
    homeButtonVariant: 'ghost',
    homeButtonTooltip: 'Return to Home',
    homeButtonTestId: 'button-home-from-intake',
    homeNavigationPath: '/pricing', // Navigate to public pricing page (guaranteed no workspace redirect)
    useFullPageReload: true, // Force hard reload instead of SPA navigation
  },

  // ===== VISIBILITY =====
  zIndex: 9999,
  touchAction: 'none',
  userSelect: 'none',
};
