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
    chatAreaMinHeight: 400,
    chatAreaMaxHeight: 450,
    chatAreaPadding: 4,   // p-4
    chatAreaSpacing: 3,   // space-y-3
    messageGap: 2,        // gap-2
    
    // Message bubbles
    messagePaddingX: 3,   // px-3
    messagePaddingY: 2,   // py-2
    messageMaxWidth: 80,  // max-w-[80%]
    avatarSize: 8,        // w-8 h-8
    avatarIconSize: 4,    // w-4 h-4
    smallAvatarSize: 2,   // w-2 h-2
    
    // Typing indicators
    typingDelay1: '0.1s',
    typingDelay2: '0.2s',
    
    // Header & input
    headerPadding: 3,     // p-3
    inputAreaPadding: 3,  // p-3
    inputAreaSpacing: 2,  // space-y-2
    inputGap: 2,          // gap-2
    inputIconSize: 4,     // w-4 h-4
    inputIconMarginRight: 2, // mr-2
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
    buttonText: {
      liveChat: 'Live Chat',
      requestHelp: 'Request Human Help',
      sending: 'Creating Ticket...',
      successTitle: '✅ Support Ticket Created',
      successDesc: 'Connecting you to a support agent...',
      errorTitle: '❌ Error',
      errorDesc: 'Could not create support ticket. Please try again.',
    },
  },

  // ===== VISIBILITY =====
  zIndex: 9999,
  touchAction: 'none',
  userSelect: 'none',
};
