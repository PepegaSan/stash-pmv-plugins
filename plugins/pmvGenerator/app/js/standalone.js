// Entry point of the standalone PMV Generator page.
import "./config.js";
import { applyTheme } from "./theme.js";
import { initLang } from "./i18n.js";
import { gql } from "./api.js";
import { startDomTranslation } from "./domi18n.js";
import { render } from "./views/pmvgen.js";

applyTheme(); // same colors as in Stash UI (same browser storage)

(async () => {
  // Language like Stash UI: its choice, or "automatic" = Stash's interface language
  let stashLang = "";
  try {
    stashLang = (await gql(`query { configuration { interface { language } } }`)).configuration.interface.language || "";
  } catch (e) { /* standalone or older Stash – the browser language decides */ }
  const lang = await initLang(stashLang);
  if (lang !== "en") {
    try {
      startDomTranslation(document.body, (await import(`./locales/pmv-${lang}.js`)).default);
    } catch (e) {
      console.error("[PMV Generator] translation", e);
    }
  }
  render(document.getElementById("main"));
})();
