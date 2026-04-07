import { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkspaceTheme } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

/**
 * WorkspaceBrandProvider — manages per-workspace brand CSS variables.
 *
 * DISTINCT from ThemeProvider (@/components/theme-provider) which manages
 * the system-level dark/light/auto color mode.
 *
 * This provider fetches the authenticated org's brand settings from the API
 * and applies them as CSS custom properties on documentElement so all
 * workspace pages inherit the correct primary color, fonts, and favicon.
 *
 * It is a NO-OP for unauthenticated (public) routes — it simply passes
 * children through without fetching or applying anything.
 */

interface WorkspaceBrandContextValue {
  theme: WorkspaceTheme | null;
  isLoading: boolean;
  applyTheme: (theme: WorkspaceTheme | null) => void;
}

const WorkspaceBrandContext = createContext<WorkspaceBrandContextValue | undefined>(undefined);

export function WorkspaceBrandProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [appliedTheme, setAppliedTheme] = useState<WorkspaceTheme | null>(null);

  const { data: theme, isLoading } = useQuery<WorkspaceTheme | null>({
    queryKey: ["/api/workspace/theme"],
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const applyTheme = (newTheme: WorkspaceTheme | null) => {
    if (!newTheme) {
      document.documentElement.removeAttribute("data-workspace");
      return;
    }

    setAppliedTheme(newTheme);

    document.documentElement.setAttribute(
      "data-workspace",
      newTheme.workspaceId
    );

    if (newTheme.primaryColor) {
      document.documentElement.style.setProperty("--cad-blue", newTheme.primaryColor);
      document.documentElement.style.setProperty("--primary", newTheme.primaryColor);
    }

    if (newTheme.successColor) {
      document.documentElement.style.setProperty("--cad-green", newTheme.successColor);
    }

    if (newTheme.warningColor) {
      document.documentElement.style.setProperty("--cad-orange", newTheme.warningColor);
    }

    if (newTheme.errorColor) {
      document.documentElement.style.setProperty("--cad-red", newTheme.errorColor);
      document.documentElement.style.setProperty("--destructive", newTheme.errorColor);
    }

    if (newTheme.secondaryColor) {
      document.documentElement.style.setProperty("--secondary", newTheme.secondaryColor);
    }

    if (newTheme.fontFamily) {
      document.documentElement.style.setProperty("--font-sans", newTheme.fontFamily);
    }

    if (newTheme.faviconUrl) {
      const link =
        document.querySelector<HTMLLinkElement>("link[rel*='icon']") ||
        document.createElement("link");
      link.type = "image/x-icon";
      link.rel = "shortcut icon";
      link.href = newTheme.faviconUrl;
      if (!document.querySelector("link[rel*='icon']")) {
        document.head.appendChild(link);
      }
    }
  };

  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  return (
    <WorkspaceBrandContext.Provider
      value={{ theme: appliedTheme || theme || null, isLoading, applyTheme }}
    >
      {children}
    </WorkspaceBrandContext.Provider>
  );
}

export function useWorkspaceBrand() {
  const context = useContext(WorkspaceBrandContext);
  if (context === undefined) {
    throw new Error("useWorkspaceBrand must be used within WorkspaceBrandProvider");
  }
  return context;
}

/**
 * @deprecated Use WorkspaceBrandProvider and useWorkspaceBrand instead.
 * Kept as aliases to avoid breaking existing consumers during migration.
 */
export const ThemeProvider = WorkspaceBrandProvider;
export const useTheme = useWorkspaceBrand;
