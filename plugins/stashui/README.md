# Stash UI

A complete new interface for [Stash](https://github.com/stashapp/stash), built from scratch in the look of **Media Storm**:

- **Colors**: ink (plum) as the background, paper (blush white) for text, blush pink for actions and favorites, a cool sheen for keyboard focus.
- **Motifs**: blush hatching (////) marks active sections, a halftone screen in the background, messages as speech bubbles, the “STASH” lettering slanted like a sound effect.
- Thumbnails in justified rows (adjustable size); titles and details appear on hover.
- **Heart** = favorite.
- Font: Bahnschrift (included with Windows; other systems fall back to a similar sans-serif).

Open it: just open Stash (e.g. `http://localhost:9999`) – the home page redirects to Stash UI. Directly: `/plugin/stashui/assets/index.html`.

![Home](../../docs/screenshots/stashui-home.png)

![Player](../../docs/screenshots/stashui-player.png)

## Sections

| Section | What it does |
|---|---|
| Start | Greeting, figures, continue watching, **for you** (unwatched scenes with the tags you watched most this week – it says which), **long time no see** (favorites and 4-star scenes not watched for a month), favorites, recently added, folders, random (“Shuffle”). **Customize**: show/hide sections, drag them into your order, and add your own – scenes, images or both, sorted as you like, filtered by tags, performers or favorites, 8–40 items (kept in this browser) |
| Search | Across everything: tags, folders, scenes, images, galleries |
| Scenes / Images / Galleries | Justified rows with search, sorting, filters (include/exclude tags, performers, rating, favorites, watched, resolution, duration, format), infinite scrolling, preview video on hover The scene editor has **Fill in from the internet**: search a StashDB-style box or a scene scraper by title or link (empty = look the file up) and fill in title, date, description, links, studio, performers and tags – and, if you like, the cover; nothing is saved until you press Save. |
| Folders | Every folder with cover images, subfolders and its items; “Include subfolders” shows everything below. The folder tree sits in the navigation on the left. Folders without scenes and images are hidden. On a big library (large library mode) nothing is counted up front; the numbers of the folders on screen are counted per level, two cheap count queries each |
| Performers | Photo cards with search, sorting (name A–Z / Z–A, age, country, ethnicity, hair and eye color, height, weight, scenes, images, tags, O counter, rating, most watched, newest / oldest, recently changed, random; text fields are ordered in the browser, empty values last), gender and favorites filter; the heart on a card marks a favorite right away. The performer page shows photo, facts (age, country, height, measurements …), rating, heart, tags and links, then all their scenes, images and galleries with the usual filters. **Edit** covers everything: photo (upload, link, drop or paste), all fields (the ones your Stash version has), tags – and **Fill in from the internet**: search StashDB-style boxes or your performer scrapers (e.g. FreeOnes) by name, or paste a profile link; found values go into empty fields (or replace all, if you tick it), found pictures can be picked, StashDB links are kept. A new performer opens straight in the editor, already searching by the name. A tag on a performer doesn't link anything in Stash – if items carry one of the performer's tags (e.g. a creator tag from a downloader), or lie in a folder named like the performer (name, alias or tag), but aren't linked, the performer page says so and **Link them** adds the performer to all of them in one go (“Not this tag / folder” hides the hint). Scenes, images and galleries always have their own tab, even while one of them is still empty. Performers also show in the player's info bar and in search |
| Performer photos | In the performer editor: upload, link, paste/drop – or **Cut from a scene / image**: pick one of the performer's scenes or images (or search any), find the frame, drag/zoom a 2:3 / 3:4 / 1:1 frame over it and use it as the photo |
| Add to a performer | **Add scenes and images** on a performer page: browse or search what isn't linked yet (scenes, images, galleries), tick several and link them all at once |
| Tags | List of all tags, tag page with all items and its performers (those with the tag, and those in scenes with it), edit/delete tags, create new tags |
| Gallery | All images, slideshow, rating, heart, edit |
| Queue | Play items one after another, reorder by dragging, shuffle |
| What's new | The patch notes of Stash UI, the PMV Generator and Media Storm, newest first (English and Chinese); a dot in the menu while there's something you haven't opened yet |
| Interactive | Scenes with a funscript play on **The Handy**: it follows play, pause, jumps and repeat (status in the player bar – click to connect again), the funscript's intensity shows under the timeline. Settings → Player and previews: connection key, script offset, “The Handy fetches the script from Stash”, and a connection test – the same settings as classic Stash. Lists can filter by funscript; such scenes get a small mark. **The Handy menu** (click the Handy button in the player): sync offset (−250 … +250 ms), stroke range, invert, the device with model and firmware, the connection key, connect again / disconnect. **Funscript** in the info bar lists every .funscript in your Stash library folders (the ones matching the video first, with search; “From this computer …” too). Stash finds funscripts by name (video.mp4 → video.funscript next to it), so Stash UI's small backend (Python, like the PMV Generator's) puts the chosen one there – an existing one is kept as .funscript.bak – and has Stash scan that video; the choice stays with the scene (after restarts, in classic Stash too) until you switch or remove it. The scene then opens again, ready for the Handy. **Variants**: scripts next to the video whose name starts like the video's (“Video (Soft).funscript”, “Video - Hard.funscript”) are variants – the Handy menu and the Funscript list show them as a stacked heatmap (label, length, warning), a click switches the Handy to it at the current position, remembered per scene |
| Interactive | All scenes with a funscript (a normal list – search, sort, filter, play), and the .funscript files in the library that don't belong to a video yet: **Choose video …** suggests scenes with a similar name (or search) and assigns it like the player does. **Problems** tab: scripts that are broken, much longer or shorter than their video, and scenes with several scripts – each list can be set as a tag. **Duplicates** tab: finds funscripts with exactly the same movements (hash over the actions – names and metadata don't matter), grouped; you choose which one stays, the others are set aside as .funscriptdupe (nothing is deleted) and can be brought back. **Editor** (“Edit this script …” in the Handy menu / Funscript list): stroke range, speed limit, smoothing, reverse, shift in time, before / after heatmap preview; saved as a new variant (“Video (Name).funscript”), the original stays; own presets are kept. The Problems tab also counts interactive scenes without a speed and starts Stash's own “Heatmaps for interactive videos” task for just those (speed missing, 0 or below). Tag names are editable; the timeline picture follows the chosen variant; duplicates in a scene's stack are marked and can be set aside, and a switch stretches every stripe to the full width. **Overview** tab: scenes with a script, several scripts, problems; the average intensity (histogram), the most intense and calmest scenes, scenes with long pauses (over 20 s without a movement) and how much of the video is covered |
| Advanced rating | **★+ Detailed** next to the stars of a scene or performer: rate by several criteria (0–5 each, in weighted groups); Stash's own rating follows as the weighted result, snapped to your rating precision. The scores are tags – “<Name> ★” with children “<Name> ★: 0 … 5” under “Advanced Rating System” (scenes) / “Advanced Performer Rating” (performers) – so they work everywhere in Stash. **Customize …** edits groups, criteria, weights and tooltips, creates the tags and can recalculate every rating. Settings are kept in Stash UI's plugin settings (advRating). Idea and tag names after the Advanced Rating plugin on discourse.stashapp.cc |
| Event log | **Manage → Log** (and the Log button in Versus) opens a floating panel – drag it by the header, resize it at the corner, fold it away – that stays open while you browse. It lists what Stash UI does: Versus picks (names link to the item, tiers colour-coded, wins green, losses red), funscript changes, ratings, tags, generate tasks; filter per area, clear, export as a text file (names left out unless you untick “Hide names in the export”). Kept in this browser (the last 300). Idea: the event log of the Ascension plugin |
| Extensions | Every enabled plugin gets a menu entry under Extensions – with its own symbol when it ships an `icon.svg`, `icon.png` or `icon.webp` next to its page. |
| Extension API v2 | Plugins can bring their own **pages** (`#/p/<plugin>/…`, also full-screen overlays), **menu entries** (movable in Customize → Sidebar), **slots** (list bar and toolbar, selection bar, scene info section and menu, performer / studio / tag / gallery headers, home sections, settings screens), list cards with buttons and late results, plus shared services (`ui`, `t`, `gql`, `store`, `on`). The Plugins page lists what each module registered and its errors, with a switch. See “For plugin authors”. |
| Studios | **Make, edit, delete and scrape** studios (name, aliases, links, details, parent studio, tags, logo; “Fill in from the internet” uses StashDB-style boxes and studio scrapers) – also a new name typed into the Studio field of the editor. Every studio as a logo card (search, sort); a studio's page: scenes, images and galleries including sub-studios, links, aliases, parent studio. The edit drawer of scenes, images and galleries has a **Studio** field (and “Edit several” sets one for all); lists have a studio filter, which saved filters keep. |
| Saved filters | Scenes and Images have a **Saved filters** menu: one click applies a saved one. Save the current filters with “Save as playlist” – Playlists are the saved filters. |
| Markers, Groups | **Markers** (Watch): every marked moment as a grid – the same bar as Scenes (search, sort + direction, previews on/off, sound, card size), tag filter, hover preview; a click opens the scene at that moment. **Groups** (Library): all groups as poster cards, a page per group with its scenes in the group's order (Stash 0.27+) Groups can be made and edited here (cover, name, date, director, studio, tags …); on a group's page: add scenes (browse or search, tick many), edit, delete (only the group – its scenes stay). |
| Automatic backup | Settings → General → **Automatic backup in Stash** (on by default): the settings this interface keeps in the browser are copied to the plugin settings in Stash a little after they change. A browser that has forgotten them (site data cleared, another address – 127.0.0.1, localhost, the Tailscale name –, a new device) gets them back by itself at start, with a note. Saving the shared settings (ratings, playlists, Versus …) runs one write after the other and refuses to write over an empty answer. The manual Save / Restore backup stays. |
| Video folders | **Video folders** (Library, next to Galleries): every folder that holds videos as a card with pictures from its scenes, its name, number of videos and parent folder; a click opens the folder at its videos. Search, sort (A–Z, Z–A, most / fewest videos, random), “Include subfolders”. On a big library the folders are counted piece by piece instead of all at once. |
| Performer tagger | **Performer tagger** (Manage): the performers that are missing something (no photo, not linked to StashDB, no country, no birthdate, or all), one row each – look each up by name on a StashDB-style box or with a performer scraper, check what was found field by field (photo, dates, looks, links, known tags) and save. “Look up this page” searches everybody and picks a result by itself when it is the only one (or the only exact name) – nothing is saved until you press Save. A 401 from a source (wrong API key) is explained instead of showing raw JSON. |
| Parts of a scene | In the player's marker list, **Add a part …** (or the edit button of a marker) opens an editor: name, start, end (“Here” takes the spot you are watching), a main tag and more tags. The list shows the range and tags of each part; a part is a normal Stash scene marker (with end time and tags), so it also shows in Markers and in classic Stash. |
| External player | **External player** in a scene's info panel hands the video (stream address, with the API key if there is one, subtitles and the current position) to mpv, VLC, IINA, Infuse, MPC-HC, PotPlayer, nPlayer or MX Player through their link types – mpv needs mpv-handler and VLC on Windows / Linux vlc-protocol; on iPhone / iPad / Mac / Android the apps bring theirs. Which players are offered: Settings → Player and previews (kept in Stash) |
| Menu and selecting | The menu on the left: full, icons only or hidden (button at its top / Settings → This interface). **Select all {n} results** in the selection bar selects everything the search found, not just the loaded pages. Dates are typed year first with a calendar button; **E** opens the editor in the player; keys with Ctrl / Cmd / Alt are left to the browser |
| Large libraries | From 20 000 scenes or 100 000 images (**Large library mode**: automatic, on or off – Settings → This interface) Stash UI loads less: folders aren't counted on their own (the Folders page asks, with progress and a cancel button; a failed try isn't repeated on every page load), home sections load when scrolled to – two at a time, kept for five minutes –, Versus plays the preview clips (Settings → Versus: scenes), scans of all funscripts (Interactive → Problems / Overview) start on a click and keep their result, Stash's totals are asked for once, and leaving a page stops its requests |
| Customize the menu | Home → **Customize → Sidebar**: hide entries of the left menu, move them with the arrows or by dragging (also between groups), make your own groups, back to the default. Start and Settings always stay; new entries and plugins appear in their usual group. Saved in this browser. |
| Backup and restore | Settings → This interface → General: **Save backup** writes everything this interface remembers (browser settings, home page, menu, and the shared values in Stash: ratings, playlists, Versus, funscript variants, PMV presets) to one JSON file; **Restore backup** puts it back – also in another browser. May contain the Handy key. |
| Display options | Settings → This interface: studio logo (on / off, **corner**, **size**), **NSFW mode** (eye button on the menu, blurs all pictures and previews; strength, also player / viewer, clear on hover), **menu width**, **thumbnail shape** (as the picture is / posters / scenes) and **hover previews** (always / never / not with posters); a **mute** button on the home page. Kept in this browser |
| Tiers everywhere | The S–F tier (Versus standings, 3+ matches) shows as a badge on scene, image and performer cards, in the info panel, the player's title bar and on performer pages. The filter bar of Scenes / Images and the Performers page have **Tier** chips (tick S, A …); a playlist can keep the tier filter (“Best scenes: S + A”). Tiers appear once 5 or more have 3+ matches |
| Detailed rating in lists | The filter bar of Scenes and the Performers page have a **Detailed** filter (“Chemistry ≥ 4”, several points at once) and a sort by any point; a scene card shows its scores as small bars on hover, the info panel and performer pages as chips; playlists keep the filter. Keys: **R** opens the detailed rating in the player; in it ↑ ↓ choose the point, 0–5 rate and move on, Backspace clears. Stash can't sort by tags, so a sorted list is fetched once and ordered here |
| Playlists | Smart playlists: set filters in Scenes or Images (tags, performers, rating, never watched, resolution, length, format, favorites, sort) and press **Save as playlist** – it always holds what matches now. Play, shuffle or add to the queue with one click; open one to change its filters and save again. Kept in Stash, so they're the same in every browser – and the PMV Generator can take its clips from one The **Saved filters** menu in Scenes and Images also lists the filters saved in Stash itself (**Saved in Stash**): their criteria are applied on top of the filters set there (what can't be read is listed, one click removes it); they can't be kept as playlists. |
| History | Everything you've watched, most recent first |
| Versus | Two scenes, images, performers or **moments** (markers – each plays its stretch in a loop) side by side – click (or ←/→) the better one. Every pick moves an Elo standing: beating a stronger one counts more. Three ways to play: **fair matches** (similar strength, least played first), **winner stays** (how long a streak?) and **climb** (a newcomer climbs until it loses – that's its place); optional tag filter, **U** undoes, **F** plays it fullscreen, the card under the mouse is heard, a level every 25 picks. **Ranking** shows the top 100 with points and wins–losses, a **tier** badge (S–F by percentile among those with 3+ matches, as a bar and a filter), an overview and, behind the clock icon, an item's last 10 matches (the **ledger**). **Snapshots** keep copies of the standings in Stash (last 5; restore, export / import as a file), **Options** sets the points per pick. Idea: the Ascension plugin. The standings are kept in Stash, so they're the same in every browser and on every device (merged if you play on two); only **Turn into star ratings** changes ratings (top 10 % five stars … bottom 10 % one star, only those with 3+ matches – it asks first). The upper quarter of the moments (3+ matches) are your **best moments**: the player marks them gold, J jumps there first, a random start lands on one, and the PMV Generator prefers them. |
| Media Storm | Opens the Media Storm panel – shown when the Media Storm plugin is installed |
| PMV Generator | Opens the PMV Generator – shown when the PMV Generator plugin is installed |
| Tasks | Scan for new files, generate previews, auto tag, clean – with live progress and stop |
| Statistics | **Achievements**: a streak of days in a row (and your best), and medals in steps – plays, hours watched, how much of the library you've seen, night owl, Versus picks, O – with the way to the next step; new ones are announced. **Your week** (watch time, plays, most watched scene, top performer and tag, busiest day – against the week before), then everything for a chosen period (7 / 30 / 90 days, a year, all time) compared with the period before: watch time, plays, different scenes (and how many for the first time), O; activity by day, week or month with quick looks shown apart; top scenes, performers, tags and studios with trend and a small curve over the period; weekday and time of day; how much of the library you've seen and what you never watched. Count by watch time or by plays. Comes from the play and O history Stash keeps for every scene |
| Duplicates | Scenes that look the same (Stash's perceptual hashes), side by side with resolution, codec, bitrate and size – the best copy is marked. Delete single copies or “keep the best” in one click; deleting the files from disk is an extra checkbox. “Not duplicates” hides a group. Needs phashes (Tasks → Generate) |
| Settings | All Stash settings in sections: library, previews, playback, paths, login, log (with viewer), classic interface, DLNA, scrapers, more options, database (back up, optimize, clean up), this interface |
| Plugins | Installed: on/off, settings, run tasks, check for updates, update (one or all), uninstall. Browse: install plugins from your sources, with search. Sources: add, edit, remove plugin sources – no need to go to classic Stash Every enabled plugin has an “All settings in classic Stash” button – settings a plugin draws with its own code (not listed in its file) live there. |
| Phone upload | Manage → Phone upload: send photos and videos from your phone's gallery to your library over your home Wi-Fi. **Start**, scan the QR code with the phone, pick the files – they are written into a folder of your library (default “Phone uploads”), and Stash scans it by itself. Runs only while you use it; only people with the link can send; only photo and video types are accepted. |
| Effects and animations | Settings → This interface: button shine and ripples, tilting cards with a moving light, a hatched wipe on page changes, pop-in dialogs and messages, a glow behind the mouse. Normal and liquid glass; off with one switch and automatically when the system asks for less motion. |
| Classic Stash | The original Stash in the same look, embedded with quick picks: performers, studios, groups, markers, scene tagger, scrapers, tools, settings |

## Languages

Stash UI is available in **English**, **Simplified Chinese (简体中文)**, **Japanese (日本語)**, **Vietnamese (Tiếng Việt)**, **French (Français)**, **Spanish (Español)**, **German (Deutsch)** and **Polish (Polski)**. By default it follows the interface language set in Stash (classic Stash → Settings → Interface → Language); you can also pick one under **Settings → This interface → Language**.

![Stash UI in Simplified Chinese](../../docs/screenshots/stashui-zh.png)

### Help translate

Translations live in `app/js/locales/` – one file per language, English text → translation:

```js
export default {
  "Scenes": "场景",
  "{n} days ago": "{n} 天前",
};
```

- Anything missing simply shows in English, so partial translations work.
- `python tools/i18n_keys.py zh-CN` (or `ja`, `de` …) lists the texts a language file is still missing.
- Polish counts 2–4 with its own form: besides `"scenes"` the file has `"scenes#few"` (see `pl.js`).
- A new language: copy `zh-CN.js`, translate the values, and add it to `LANGS` and `FILES` in `app/js/i18n.js`.
- Found an odd or too long wording? Open an issue or a pull request.

## Works with the other plugins

Other people's plugins show up in the menu under **Extensions**, each pointing to the best place it has: its own web page (e.g. Stash TV), a page it adds to classic Stash (e.g. Stash Downloader – opened embedded), its card on the Plugins page with tasks and settings (plugins that only have those), or classic Stash for plugins that only add a button there. Libraries, font loaders and themes get no entry.


Stash UI works on its own. If you also install **Media Storm** or the **PMV Generator** (same plugin source), they show up in the menu under **Watch** – entries of plugins that aren't installed or are turned off are hidden. The PMV Generator opens as its own page; its back link and saved scenes lead back into Stash UI.

## For plugin authors: extension modules (API v2)

A plugin can bring its own pages, menu entries, list cards and panels into Stash UI. Nothing changes for people without such a plugin, and nothing costs anything until a plugin registers something. Put `assets/stashui.js` into the plugin; Stash UI imports it once per plugin version and calls its default export:

```js
export default function setup(stashui) {                // stashui.version === 2
  if (!stashui.has("slot:scene.info")) return;          // older Stash UI: check for a hook before you use it
  stashui.addListSource({ id: "myPlugin", match: ({ page, kind }) => kind === "scene", async extend(ctx) { … } });
  stashui.addRoute({ path: "library/*", title: "Audiobooks", render(el, { params, rest, query, signal }) { …; return () => {}; } });
  stashui.addNavItem({ id: "library", label: "Audiobooks", icon: "book", route: "library", group: "Library", count: async () => 42 });
  stashui.addSlot("scene.info", { id: "tool", title: "Audio tool", mount(el, ctx) { …; return () => {}; } });
}
```

Everything a plugin draws is `mount(el, ctx) → cleanup`: Stash UI owns where it goes and how big it is, the plugin fills the element. Every call is isolated – errors are caught and listed on the **Plugins** page (each plugin with a module has a “Stash UI extension” block: what it registered, its last errors, and a switch to turn the module off), waits have timeouts, and `ctx.signal` (an `AbortSignal`) fires when what the plugin drew is removed.

### List cards – `addListSource`

`ctx` = `page` (`scenes`, `images`, `galleries`, `performer`, `studio`, `tag`, `folder`, `gallery`, `group`, `history`, `funscripts`, `search`), `params` (e.g. `{ id }`), `kind`, `sort`, `dir`, `q`, `filter` (the Stash filter incl. the page's own), **`restricted`** (`true` when tier / detailed-rating filters limit the list by ids – they are not in `filter`, so a source can step back), `pageNumber`, `perPage`, `count` (library items), `items` (this page's raw items), `prev` (last raw item of the previous page or `null`). Each entry is `{ before, piece }`: `before` = id of an item of this page to insert in front of (`null` = after the page); `piece` = `key` (unique), `title`, `thumb`, `w`/`h`, optional `meta`, `stamp`, `href` (opens in a new tab), `className`, **`dim: true`** (the standard “not in the library” look), `badges: [{ text, title }]`, **`actions: [{ icon, title, run(cardEl) }]`** (buttons drawn by Stash UI in the corner of the card; they don't open the link; `run` may return a menu `[{ label, detail, run }]`; `icon` is the name of one of Stash UI's icons or an inline `<svg>`, sized for you), `mount(cardEl)` (may return a cleanup function). These cards are not selectable, have no favourites, tiers, previews or bulk actions and are not counted. Each `extend` has 3 seconds; errors and timeouts are ignored for that page.

- **Late results**: `stashui.invalidate(sourceId)` runs `extend` again for the pages already loaded and puts the new cards in place – no rebuild, the scroll position stays. A source that registers after a list is open is asked for it too.
- **Empty lists**: the extension cards stay; “Nothing found” sits above them instead of replacing them.

### Pages – `addRoute`

`path`: `"library"`, `"library/:id"` or `"library/*"` (`*` = the rest, as `rest`). The page lives at `#/p/<pluginId>/<path>`. `title` (shown as the page heading; the tab title too), `overlay: true` = full screen above the page with a close button, like the player (no menu – for readers and players). `render(el, { params, rest, query, signal }) → cleanup` is called on every visit and the cleanup when the page is left. `stashui.go("p/<pluginId>/library/123")` links inside the plugin's pages; Back works.

### Menu entries – `addNavItem`

`{ id, label, icon, route | href, group, place, count }`: `route` (a page of the plugin) or `href` (`#/…` or a URL); `group`: `Library`, `Watch`, `Manage` – default `Extensions`; `icon`: a name of one of Stash UI's icons, an inline `<svg>` (it gets the standard icon size – no `class="kb-ic"` needed) or an image address; `count: async () => n` shows a number. The entry joins the menu like a built-in one – Home → Customize → Sidebar can move and hide it. A plugin that registers menu entries is left out of the automatic Extensions scan.

`place` (optional) says where in its group the entry first appears: `{ after: anchor }`, `{ before: anchor }`, `"start"` or `"end"`. An anchor is a built-in entry's `href` (`"galleries"`, `"queue"` …) or action (`"log"`), `"folders"`, `"saved"`, or `"<pluginId>:<id>"` of another plugin's entry; one that isn't in the group falls back to the default. Without `place` the entry goes behind the group's last regular entry – before the folder tree and the saved filters in Library. `place` only counts when the entry first appears: after that, the user's layout (Customize → Sidebar) always wins.

### Slots – `addSlot(name, { id, title, match(ctx), mount(el, ctx) })`

| Slot | Where | ctx (besides `signal`, `onChange(fn)`, `reload()`) |
|---|---|---|
| `list.bar` | a bar above every media list | `page`, `params`, `kind`, `filter`, `sort`, `dir`, `q`, `restricted`, `count` (live: `onChange` fires when kind, filters or count change) |
| `list.toolbar` | in the list's toolbar, before the spacer | the same |
| `bulk.actions` | the selection bar | `kind`, `ids()` (the selection as it is now), `pieces()` |
| `scene.info` | a foldable section (`title`) in the player's info bar | `id`, `item` (the scene), `video`, `time()` |
| `scene.menu` | the player's gear menu | the same |
| `performer.header`, `studio.header`, `tag.header`, `gallery.header` | in the page header, below the facts | `page`, `id`, `item` |
| `home.section` | a section on the home page (`title`), filled when it is scrolled to | `page` |
| `settings.section` | a settings screen under Settings → **Plugins** (`title`) | `page` |

`match(ctx)` decides whether a slot shows (checked again when the ctx changes); `ctx.reload()` reloads the list (or reloads the scene); `ctx.onChange(fn) → off` follows the live fields.

### Shared services

- `stashui.ui`: `esc`, `icon(name)`, `toast`, `errorToast`, `confirmDialog`, `promptDialog`, `openDrawer`, `fmtDuration`, `fmtDate`, `fmtAgo`, `fmtBytes`, `fmtNum`, `plural`, `debounce`, and `menu(anchor, [{ label, detail, run }])` (the small popup menu).
- `stashui.t(text, vars)` and `stashui.addStrings(lang, { "English text": "Text" })` – the plugin follows the interface language (`"de"` also fits `de-DE`; Stash UI's own strings win).
- `stashui.gql(query, vars, { heavy })`: the app's own `gql` (aborted when the page is left, `heavy` queues big queries).
- `stashui.store.get(key, fallback)` / `.set(key, value)`: browser-local, namespaced per plugin (`stashui.ext.<pluginId>.*`) – part of Stash UI's backup and of the automatic backup in Stash.
- `stashui.on(event, fn) → off`: `route` (`{ path, view, params, query }`), `library-changed`, `plugins-changed`, `rail-changed`, `playlists-changed`, `display-changed` (with or without the `stash:` prefix).
- `stashui.has(feature)`: `list.source`, `list.invalidate`, `list.restricted`, `piece.actions`, `route`, `navItem`, `ui`, `strings`, `gql`, `store`, `on`, `slot:<name>` …

The CSS variables (`--base`, `--bg`, `--bg-2`, `--bg-3`, `--text`, `--text-2`, `--faint`, `--line`, `--pink`, `--paper`, `--danger`, `--ok`) and the classes `kb-btn`, `kb-chip`, `kb-field`, `kb-upsec`, `kb-h2`, `kb-empty`, `kb-hint` are stable – use them and your pieces follow the theme and liquid glass.

## Player

- Custom controls, timeline with thumbnails on hover, speed, volume, fullscreen.
- Portrait videos (9:16) are fitted completely, nothing is cropped.
- **Resume**: starts where you left off (button “From the start”), saves progress and counts plays like Stash.
- **Start at a random spot** (sliders menu or Settings → Player and previews): every scene starts somewhere between 5 % and 85 % – for just looking around. Your resume points in Stash aren't touched (the play still counts); “From the start” in the hint switches back to normal for that scene.
- One button for how it goes on at the end – a click cycles through **In order**, **Random order**, **Repeat this video**, **Repeat all** and **Stop at the end** (also under Settings → Player and previews); “Up next” in the info bar.
- The info bar on the right (key **I**): rating (in the rating system set under Settings → This interface → Rating system – the same setting classic Stash uses: whole, half, quarter or tenth stars – click where on the star, hovering shows the value – or 0.0–10.0), heart, O counter (right-click subtracts one), performers (× removes one, **+** adds one or creates a new performer; the pill shows the age in this scene, and hovering a performer opens a card with photo, gender, country, number of scenes, age on the scene's date, age now and birth date), tags, edit, queue, folder.
- **Smooth slow motion**: the speed menu (gear) has 0.1× and 0.25×; below 1× the pictures in between are made up in the browser with WebGL 2 – **Motion** (block matching: for each 8×8 block it finds where it moved, pushes both pictures along and blends; falls back to a plain blend where nothing fits), **Blend** (cross-fade) or **Off**. No model, no download; works on the graphics card, only while playing slowly. Needs `requestVideoFrameCallback` (Chrome, Edge, Safari, current Firefox). Not for VR.
- **Mouse wheel on the picture**: changes the volume (5 % per notch); Shift + wheel jumps 5 s. Settings → Player and previews → “Mouse wheel on the video”: Volume / Jump forward / back / Off (the swap with Shift follows). Replaces what the VideoScrollWheel plugin does in classic Stash.
- **Own markers**: **B** (or the sliders menu) sets a marker at the current spot – a yellow pin on the timeline, **J** jumps to it like to the highlights. The info bar lists them: jump, rename, delete. They're Stash's scene markers (tag “Highlight”), so classic Stash shows them too.
- **Frame by frame**: **,** and **.** (YouTube's keys) step one frame back / forward and stop the video; the note on the picture shows the exact time. **B** sets the marker on the frame you see, not on a rounded tenth.
- **Marker editor** (“Add a part …”, or the pencil in the marker list): times are shown to the millisecond. Under Start and End, **−1 s, −0.1, ◂| |▸, +0.1, +1 s** move the time (hold to repeat); in the field, **↑ ↓** change it by a frame, **Shift** by a second, **Alt** by a tenth. The video follows every change and stays on that frame; **,** and **.** step the video while the editor is open, **Here** takes the frame you see. The tag lists show the last 3 tags you picked for a marker on top (nothing, until you have picked some); they're kept in this browser.
- **Previews on demand**: a new or edited marker gets its hover preview and picture made by Stash right after saving; the Markers page has **Generate missing previews**; the selection bar of Scenes / Images (and the home page) has **Generate previews** for just the selected items (Stash task `metadataGenerate` with the ids; progress under Tasks). Plain photos have no moving preview in Stash – only thumbnails, animated images and image clips do.
- **Cover** in the info bar: pause where you like and the picture becomes the scene's cover. Try as many frames as you like: **Undo** in the message or **Old cover** next to it steps back, instantly. Stash only gets the final cover – a few seconds after the last change, or when you leave the scene (on Windows, Stash can't replace a cover file it has just written for up to 2 minutes; this way that doesn't get in the way).
- **Highlights** (switch in the bar): a heat curve sits above the timeline, diamonds mark the best spots – click or press **J** to jump to the next one. The curve combines two things:
  - **Motion**: from Stash's preview sprites (timeline thumbnails) – how much the picture changes, plus the share of skin. Needs generated sprites (Tasks → Generate previews).
  - **Your watching**: which parts you actually watch and where you seek to. Stored only in this browser (the last 400 scenes).
- **Mini player** (button next to fullscreen, key **X**): the player closes, the video keeps playing small in a corner while you browse – history and progress keep counting. Drag it anywhere; resize it by pulling any edge or corner, or with the mouse wheel over it (it keeps the video's shape and remembers where it was); the title or ⤢ goes back to the player at the same spot, ▣ floats it above other windows (picture in picture).
- **Music** in the info bar (with the PMV Generator installed): the sound of this video from/to any point (“Here” takes the current position) – **Open in PMV Generator** (it opens with the video and the part already picked), **Download** as .m4a, or **Save to library** (folder “PMV Generator/Songs”). ffmpeg (the one Stash brings) does the cutting.
- **Cast to TV** in the gear menu: sends the video to a Chromecast / Google TV (Chrome, Edge) or AirPlay (Safari) – the browser's own device picker.
- **Similar** in the info bar: up to 8 matching scenes – shared performers count most, then studio, share of common tags and the same folder; the best ones are also sorted by the look of the thumbnail (color, brightness, composition). Every suggestion shows the reason (e.g. “3 shared tags”, “similar look”). If a scene has no metadata, only the look decides.

| Key | Player | Image viewer |
|---|---|---|
| Space | Play/pause | Slideshow on/off |
| ← / → | 5 s back/forward (Shift: 30 s); the buttons next to play jump 10 s | Previous/next image |
| Home | From the beginning (also a button) | – |
| N / P | Next/previous scene | – |
| J | Next highlight | – |
| 0–9 | Jump to 0–90 % | – |
| 1–5 | Rating | Rating |
| Del | Delete (asks first) | Delete (asks first) |
| H | Heart (favorite) | Heart (favorite) |
| O | O counter +1 | O counter +1 |
| F | Fullscreen | Fullscreen |
| I | Info bar on/off | Info bar on/off |
| M, ↑/↓ | Mute, louder/quieter | – |
| Z | – | Original size (also double-click; mouse wheel zooms) |
| Esc | Close | Reset zoom, then close |

## Install as an app

Settings → General → **Install as app**: Stash UI gets its own window and a home screen / start menu icon, without the browser bar (Chrome, Edge, Safari on iPhone via Share → Add to Home Screen). Browsers only install apps from https or on the computer Stash runs on (localhost) – on a phone that opens Stash by its network address, “Add to Home screen” adds a normal shortcut instead.

## Selecting and editing

- The box in the top left of an item, Ctrl+click or Shift+click (range) selects. A bar appears at the bottom: select all, set/remove favorite, edit together (add/remove tags, rating, organized), add to queue, delete (optionally with files).
- Edit a single item: title, rating, heart, tags (including creating new ones), performers (including creating new ones), date, description, links, organized, delete. Editing several together can also add or remove performers.
- **Studio on scenes** (Settings → General): the studio's logo – or its name – in the corner of scene thumbnails.
- The menu on the left: a click on a group heading folds the group away. Settings → General → **Other plugins in the menu** hides the Extensions group or single plugins in it.

## Technical notes

- `app/` is the interface (plain JavaScript ES modules, no build step), `classic/` styles classic Stash and redirects the home page.
- **Favorites** = the Stash tag “Favorite” (created with the first heart).
- **Settings**: grouped into This interface (Appearance, Player and previews, General), Stash and More, with a search box that finds any setting across all sections and jumps to it.
- **Sound in previews**: hover previews play with sound (Settings → Player and previews). Stash only puts sound into previews when “Preview audio” is on under Previews.
- **Player menu** (gear next to fullscreen): quality (original or Stash's transcodes), subtitles (Stash's captions – the section appears when a scene has some), VR and speed.
- **VR**: 180°/360° videos, mono, side by side or top/bottom – drag to look around, wheel or two fingers to zoom. Guessed from the file name (e.g. `_180_LR`) or a "VR" tag, and remembered per scene. Shows one eye on a normal screen; headsets aren't supported yet.
- **Fullscreen**: move the mouse near the right edge to slide in the info panel (Settings → This interface → “Info panel in fullscreen”).
- **Advanced filter** (Filter → Advanced …): any number of criteria on top of the quick filters, like classic Stash's “Add filter” – text fields (contains, is, regex, empty), numbers and dates (is, between, greater / less), yes / no fields, resolution, format, tags / performers / studios (any, all, none), “is missing …”. It is kept in the address and in playlists.
- **Scene tagger** (menu → Manage): the scenes that aren't organized with a StashDB / scraper lookup per scene – by file or by title – and a field-by-field check before saving. Same scrapers as “Fill in from the internet” in the editor.
- **Sound button in Scenes**: Sound on / Muted for the hover previews sits in the Scenes toolbar as well as on the home page.
- **Delete in the player**: the info bar has a Delete button (it asks first, with the option to delete the file too). The next video of the list or queue keeps playing instead of going back to the list.
- **Cut clips** (player → “Cut clips”): mark start and end of the parts you want, collect them in a list and save them as new videos (separate or joined, Exact or Fast, optional “Clips” subfolder). They are scanned into Stash and take over the original's performers, tags and studio plus the tag “Clip”. Needs ffmpeg (Stash's own is used).
- **Plugins page**: plugins with an update come first (after “Check for updates”), and the buttons on every card are left-aligned.
- **Saved filters in the menu**: Stash's own saved filters (Scenes, Images) and your playlists sit under the folder tree – one click opens the list with it. Hide or move the section in Home → Customize → Sidebar.
- The detailed rating, dialogs and drawers also open while the player is in fullscreen; stepping from one image or video to the next no longer flashes the page underneath.
- **Colors**: Settings → This interface → Colors. Pick a preset (Plum, Midnight, OLED black, Forest, Ember, Ocean, Violet, Classic Stash) or set each color – accent, backgrounds, text, success/error – with the color wheel. Save your own colors as presets. Optional **background image**: a random image with the tag “background” (the same images the Random Backgrounds plugin uses in classic Stash) – on every start or, if switched on, on every page – or one image you choose (from those images or any URL), with a darken slider. Optional **Liquid glass** (transparency slider, blur can be switched off): see-through, blurred panels with a light edge over a soft glow in the theme colors – the photo or video under the mouse tints the background, and in the player the running video glows behind the info panel and into the black bars. Saved in the browser; the PMV Generator uses the same look.
- **Keep the classic home page**: Settings → This interface → “This interface as home page” off (or the plugin setting “Keep classic home page”). For a single tab: `http://localhost:9999/?classic=1`.
- Pages that only exist in classic Stash (registered by other plugins) are embedded through classic Stash; its navigation is hidden there.
- After changing files in `app/`: run `python tools/build.py --sync-only` from the repository root – it copies the shared files to the PMV Generator plugin and sets version stamps so browsers don't load stale files from their cache.
- **Folders** in the navigation and on the home page need one count of the whole library. The result is remembered in the browser and only counted again when the number of scenes/images changes or after a scan, clean or deletion. On very large libraries set Settings → General → “Folder loading” to “Only on the Folders page” or “Off” (no folders are loaded at all; the Folders page offers “Load anyway”).
- Classic Stash gets its look directly from this plugin. Other themes that restyle classic Stash may clash with it – turn them off if things look odd.
