"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "./primitives";

export type ThemeChoice = "light" | "dark";
const KEY = "foundry-theme";

/** Paste into <head> (as an inline script) to set the theme before first paint and avoid a flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

function systemTheme(): ThemeChoice {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setThemeState] = useState<ThemeChoice>("light");

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setThemeState(attr === "light" || attr === "dark" ? attr : systemTheme());
  }, []);

  const setTheme = useCallback((t: ThemeChoice) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage can be blocked; the theme still applies for this visit */
    }
    setThemeState(t);
  }, []);

  return [theme, setTheme];
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton label={`Switch to ${next} theme`} className={className} onClick={() => setTheme(next)}>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  );
}
