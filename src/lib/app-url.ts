/**
 * Absolute links that leave the browser: email redirects (sign-up confirmation,
 * password reset) and shared invite links. VITE_SITE_URL pins them to the live
 * address, so a link made on localhost still opens the live app. Without it the
 * current address is used.
 *
 * Supabase only redirects to addresses on the project's Redirect URLs list
 * (Authentication → URL Configuration); anything else falls back to Site URL.
 */
export function appUrl(path: string) {
  const configured = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim().replace(/\/+$/, "");
  const origin = configured || (typeof window === "undefined" ? "" : window.location.origin);
  return `${origin}${path}`;
}
