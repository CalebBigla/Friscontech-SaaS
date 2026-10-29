/**
 * Light / dark theme. The choice is per device (localStorage); "system" follows
 * the operating system. The `dark` class on <html> switches every colour token
 * in styles.css. THEME_BOOT_SCRIPT applies it before the first paint, so a dark
 * page never flashes white.
 */
import { useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "friscontech-theme";
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Put the resolved theme on <html>. */
function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Not remembered (private mode); still applied for this visit.
  }
  apply(choice);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Snapshot = choice + what is showing, so following the OS also re-renders.
const snapshot = () => `${read()}:${document.documentElement.classList.contains("dark") ? "dark" : "light"}`;

/** The current choice, and whether dark is showing. Re-renders on change. */
export function useTheme() {
  const [choice, shown] = useSyncExternalStore(subscribe, snapshot, () => "system:light").split(":") as [ThemeChoice, string];
  useEffect(() => {
    if (choice !== "system") return;
    // Follow the OS while on "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { apply("system"); listeners.forEach((l) => l()); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);
  return { choice, isDark: shown === "dark", setTheme };
}

/** Inline in <head>: applies the saved theme before the page paints. */
export const THEME_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${KEY}");var d=v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
