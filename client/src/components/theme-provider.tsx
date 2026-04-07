import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "dark" | "light" | "auto";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  isNightHours: boolean;
};

const initialState: ThemeProviderState = {
  theme: "auto",
  resolvedTheme: "light",
  setTheme: () => null,
  isNightHours: false,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;

function checkIsNightHours(): boolean {
  const hour = new Date().getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

function resolveTheme(theme: Theme, isNight: boolean): "dark" | "light" {
  if (theme === "auto") {
    return isNight ? "dark" : "light";
  }
  return theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "auto",
  storageKey = "coaileague-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light" || stored === "auto") {
      return stored;
    }
    return defaultTheme;
  });

  const [isNightHours, setIsNightHours] = useState<boolean>(checkIsNightHours);

  const resolved = resolveTheme(theme, isNightHours);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsNightHours(checkIsNightHours());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }, [resolved]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setThemeState(newTheme);
    },
    [storageKey],
  );

  const value: ThemeProviderState = {
    theme,
    resolvedTheme: resolved,
    setTheme,
    isNightHours,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
