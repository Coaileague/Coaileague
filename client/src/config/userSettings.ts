/**
 * User Settings Configuration
 * Defines all available user settings and preferences
 * 
 * NO HARDCODED VALUES - All settings configurable
 */

export const USER_SETTINGS_CONFIG = {
  // Account settings sections
  sections: {
    account: {
      title: "Account Settings",
      icon: "User",
      items: [
        { id: "email", label: "Email Address", type: "email", editable: true },
        { id: "name", label: "Full Name", type: "text", editable: true },
        { id: "avatar", label: "Profile Picture", type: "file", editable: true },
        { id: "phone", label: "Phone Number", type: "tel", editable: true },
        { id: "timezone", label: "Timezone", type: "select", editable: true },
        { id: "language", label: "Language", type: "select", editable: true },
      ],
    },
    security: {
      title: "Security",
      icon: "Lock",
      items: [
        { id: "password", label: "Password", type: "password", editable: true, action: "change" },
        { id: "two-factor", label: "Two-Factor Authentication", type: "toggle", editable: true },
        { id: "sessions", label: "Active Sessions", type: "list", editable: false, action: "revoke" },
        { id: "login-history", label: "Login History", type: "list", editable: false },
      ],
    },
    notifications: {
      title: "Notifications",
      icon: "Bell",
      items: [
        { id: "email-notifications", label: "Email Notifications", type: "toggle", editable: true },
        { id: "ticket-updates", label: "Support Ticket Updates", type: "toggle", editable: true },
        { id: "digest-frequency", label: "Digest Email Frequency", type: "select", editable: true },
        { id: "sms-notifications", label: "SMS Alerts", type: "toggle", editable: true },
      ],
    },
    privacy: {
      title: "Privacy & Data",
      icon: "Shield",
      items: [
        { id: "data-export", label: "Export My Data", type: "action", editable: false },
        { id: "activity-log", label: "View Activity Log", type: "link", editable: false },
        { id: "cookie-consent", label: "Cookie Preferences", type: "toggle", editable: true },
        { id: "marketing-emails", label: "Marketing Emails", type: "toggle", editable: true },
      ],
    },
    danger: {
      title: "Danger Zone",
      icon: "AlertTriangle",
      items: [
        { id: "delete-account", label: "Delete Account", type: "action", editable: false, dangerous: true },
        { id: "revoke-access", label: "Revoke All Access", type: "action", editable: false, dangerous: true },
      ],
    },
  },

  // Default values
  defaults: {
    timezone: "America/New_York",
    language: "en",
    emailNotifications: true,
    ticketUpdates: true,
    digestFrequency: "daily",
    smsNotifications: false,
    marketingEmails: false,
    cookieConsent: false,
  },

  // Validation rules
  validation: {
    password: { minLength: 8, requireUppercase: true, requireNumbers: true },
    phone: { pattern: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/ },
  },

  // API endpoints
  endpoints: {
    updateProfile: "/api/user/profile",
    changePassword: "/api/user/password",
    enable2FA: "/api/user/2fa/enable",
    disable2FA: "/api/user/2fa/disable",
    exportData: "/api/user/export",
    deleteAccount: "/api/user/delete",
    getActivityLog: "/api/user/activity",
    getSessions: "/api/user/sessions",
    revokeSession: "/api/user/sessions/revoke",
  },

  // Test IDs
  testIds: {
    settingsButton: "button-user-settings",
    saveButton: "button-save-settings",
    cancelButton: "button-cancel-settings",
  },
};

export function getUserSettingSection(sectionId: string) {
  return USER_SETTINGS_CONFIG.sections[sectionId as keyof typeof USER_SETTINGS_CONFIG.sections];
}

export function getAllUserSettingItems() {
  const items = [];
  Object.values(USER_SETTINGS_CONFIG.sections).forEach((section) => {
    items.push(...section.items);
  });
  return items;
}
