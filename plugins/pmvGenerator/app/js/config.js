// PMV Generator page: which plugin backend saves recordings, and where "back" and saved
// scenes lead – into Stash UI when you came from there, otherwise classic Stash.
const UI = "/plugin/pepega-stashui/assets/index.html";
let fromUI = false;
try {
  // Stash UI opens this page with ?from=pepega-stashui (the pages send no referrer)
  if (new URLSearchParams(location.search).get("from") === "pepega-stashui") sessionStorage.setItem("pmvgen.fromUI", "1");
  fromUI = sessionStorage.getItem("pmvgen.fromUI") === "1";
} catch (e) { /* storage blocked – classic Stash links */ }

window.PMVGEN_PLUGIN = "pmvGenerator";
window.PMVGEN_SCENE_LINK = (id) => (fromUI ? UI + "#/scene/" + id : "/scenes/" + id);

const back = document.querySelector(".kb-solo-back");
if (back && fromUI) {
  back.href = UI + "#/";
  back.title = "Back to Stash UI";
}
