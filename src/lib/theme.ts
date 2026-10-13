export const THEME_STORAGE_KEY = "hplc-theme";

/**
 * Runs before first paint (inlined in the root layout) so the saved or
 * system theme is applied without a light-mode flash.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t!=null?t==="dark":true;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
