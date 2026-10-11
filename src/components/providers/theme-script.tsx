import {
  ACCENT_IDS,
  BACKGROUND_IDS,
  CARD_STYLE_IDS,
  DENSITY_IDS,
} from "@/config/appearance";
import { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE } from "@/lib/appearance";

/**
 * Field table used to generate the inline script below. Each entry maps a
 * stored key to the `<html>` attribute globals.css reads and the values that
 * are allowed to win over the default.
 */
const FIELDS = {
  accent: { attr: "data-accent", values: ACCENT_IDS },
  cardStyle: { attr: "data-card-style", values: CARD_STYLE_IDS },
  density: { attr: "data-density", values: DENSITY_IDS },
  background: { attr: "data-background", values: BACKGROUND_IDS },
} as const;

/**
 * A blocking script for `<head>`.
 *
 * This runs synchronously while the HTML is still being parsed, so the accent,
 * density, card style and background preset are on `<html>` before the browser
 * paints anything. Without it every hard load shows the default accent for one
 * frame and then repaints — the classic "why is it indigo for a second?" flash.
 *
 * It is generated from the config tables rather than hand-written so the inline
 * copy can never drift from the CSS or the Zod enums.
 *
 * Note: it deliberately does not touch the theme *class*. next-themes injects
 * its own inline script that owns `.light`/`.dark`/`.amoled`, and two writers
 * for the same class would fight.
 */
const SOURCE = `(function(){try{
var r=document.documentElement;
var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY
)})||"null")||{};
var f=${JSON.stringify(FIELDS)},d=${JSON.stringify({
  accent: DEFAULT_APPEARANCE.accent,
  cardStyle: DEFAULT_APPEARANCE.cardStyle,
  density: DEFAULT_APPEARANCE.density,
  background: DEFAULT_APPEARANCE.background,
})};
for(var k in f){var o=f[k],x=s[k];r.setAttribute(o.attr,o.values.indexOf(x)>-1?x:d[k])}
}catch(e){}})()`;

export function ThemeScript() {
  return (
    <script dangerouslySetInnerHTML={{ __html: SOURCE }} />
  );
}