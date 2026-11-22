/**
 * Inline <head> script that applies the saved theme before first paint. Same code and storage key
 * as the design system's `themeInitScript`, which cannot be read from a server component because
 * it lives in a "use client" module (logged in docs/DESIGN_SYSTEM_REQUESTS.md).
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("foundry-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`
