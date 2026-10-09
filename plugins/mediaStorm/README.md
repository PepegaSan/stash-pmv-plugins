# Media Storm

Random images and videos from your Stash library, appearing in waves in their own browser tab.

![Media Storm panel](../../docs/screenshots/mediastorm-panel.png)

![The storm tab](../../docs/screenshots/mediastorm-storm.png)

Open it with **⚡ Storm** in the Stash navbar → panel → **Start** (opens a separate tab). **Esc** stops with a fade-out and closes the tab.

## Its own tab

- The storm runs at `/plugin/mediaStorm/assets/stage.html`: a black page, optionally with a wallpaper from the Random Backgrounds plugin, media on top.
- The panel in the Stash tab stays the remote control: start, stop, pause, next wave, reroll background. Settings apply to the storm tab right away.
- Inside the storm tab, **S** or the sliders icon in the HUD opens the same panel.
- Browsers only allow sound after an interaction in the new tab: click once or press a key (a hint is shown).
- Mouse cursor and HUD hide after 2.5 s without movement.

## Design

The look of a comic book cover: ink (plum), paper (blush white), blush pink, blush hatching (////) and a halftone screen. The top of the panel shows a slanted cover with the comic-style lettering “Media Storm”; messages appear as speech bubbles. The font is Bahnschrift (included with Windows; other systems fall back to a similar sans-serif).

- **Artwork images** (off by default): panel → **Background → Artwork in the design**. Enter the name of a tag or folder – images and scene screenshots with that tag, or from folders with that name (including subfolders), are shown on the panel cover and the start screen. The cover changes every 7 s while the panel is open; click it for the next image.
- **Nothing found**: if the source/filters return no media, the storm stops and the panel shows a card with **Reset filters**.

## Panel: overview, moods, tiles

The overview shows the cover, status, start/pause/next wave/reroll background, then **moods** and the **settings as tiles**. Every tile shows a summary of its values; a hatched mark in the top right means a filter or effect is active there. Click to open a page, **‹** or **Esc** to go back.

Tiles: Tempo · On the beat · Media · Sound · Layout · Effects · Background · Source & filters · Folders · RedGifs · My presets (hotkeys as a link at the bottom).

### Moods (built-in presets)

One click sets tempo, media mix, layout and effects at once. Source, filters, volume, RedGifs and background stay unchanged. **V** switches to the next mood. The active mood is marked pink; as soon as you change something, it's your own mix.

| Mood | What happens |
|---|---|
| Default | Chaos as usual, no effects |
| Chill | Pile, slow, items breathe, vignette, sound only from the newest video |
| Storm | Many small items, fast, slam entry, drift, glitch, shake and flash |
| Gallery | Mosaic without frames, calm fade-in |
| Cinema | Spotlight with videos only, the newest one big with sound |
| Trip | Spiral, spin entry, color rush, pulse at 120 BPM, 3D, double exposure, VHS |
| Ticker | Polaroids drift from right to left |
| Rain | Items fall through from the top and wobble |
| Manga | Ink frames, halftone, slam, shake, avoiding overlap |
| Neon | Grid with neon glow, glitch entry, pulse, film grain |

## Layouts

| Layout | Description |
|---|---|
| Chaos | Scattered everywhere – drag and mouse wheel work |
| Pile | Like photos on a table, heaped towards the middle |
| Grid | Fixed cells across the whole screen |
| Mosaic | Pinboard columns, new items at the top, the rest slides down animated |
| Spotlight | The newest item big in the middle, older ones in a circle |
| Spiral | Sunflower spiral with the newest in the middle – every wave turns everything further |
| Ticker | Lanes from right to left; items that have passed make room |
| Rain | Falls through from the top; at the bottom, items make room |

Settings depending on the layout (only the relevant ones are shown): size min/max, rotation, **spacing**, **columns** (0 = automatic), **speed** (ticker/rain), **avoid overlap** (chaos). For all: **format** (original, square, portrait, landscape – images are cropped to fit) and **frame** (soft, none, polaroid, manga, neon, circle).

## Effects

- **Appear**: zoom, fade in, slam, flip, fall, spin, glitch or random per item. When fading out, the effect runs backwards.
- **Afterwards**: hold still, drift, breathe, wobble or mixed.
- **Pulse** (BPM): the whole stage pumps to the beat.
- **Color rush**: colors rotate slowly or quickly through the color wheel.
- **Glitch**: random items twitch briefly with RGB offset and slices.
- **Blending**: double exposure or negative rush where items overlap.
- **Texture**: film grain, VHS (scanlines, color fringe, rolling bar), halftone, vignette.
- **3D depth**: every item sits at its own depth, the vanishing point follows the mouse (parallax).
- **Reflection** under every item.
- **On every new wave**: shake and/or a gentle flash (at most once per wave).
- Ken Burns zoom and fade duration live here too.

## On the beat

The waves come on the beat of a song instead of by time. Tile **On the beat** → **Choose song …** (MP3, M4A, WAV, OGG, FLAC) – this switches the mode on right away. The song is stored in the browser (IndexedDB), applies to Stash and the storm tab and stays until you remove it.

- The storm tab detects tempo and beats itself (a few seconds per song; until then the waves run by time) and loops the song. The HUD then shows **♪ BPM** instead of the seconds until the next wave.
- New items load ahead and wait in the background – on their beat they all appear at once. The beats are scheduled ahead of time, so it stays on the beat even with many items and a low frame rate.
- **New wave**: *automatic* (calm parts every bar, medium parts every 2 beats, loud parts every beat, drops right away) or fixed on every beat, every 2 beats, every bar, every 2 bars. “New wave every … s” doesn't apply in this mode; items per wave, maximum and endless do.
- **Pulse** (effects) becomes the real beat in this mode: the stage pumps on every beat, harder on waves and drops. **Flash** and **shake** come with every wave; on drops a few items also glitch (if glitch is on).
- **Song volume** is separate from the video volume. Pause also pauses the music, stop ends it.
- Like video sound, the music needs a click or key press in a freshly opened storm tab.
- The beat detection (`web/beats.js`) runs entirely in the browser.

## Play by folder

Panel → **Folders**: a tree of your Stash folders with the number of images (I) and videos (V). Empty folders are hidden.

- Tick a folder = only media from this folder, subfolders always included. Several folders are possible.
- Without a choice, the whole library is used.
- Can be combined with tags, rating and “current page”. Changes apply from the next wave; **C** clears the screen right away.

## RedGifs (optional)

Panel → **RedGifs**:

- **RedGifs share**: what percentage of every wave comes from RedGifs (0 = off, the default; 100 = RedGifs only). The rest comes from Stash as usual.
- **Niches, tags & creators**: type in the search field → live suggestions in three groups (with clip count, subscribers/followers, preview image). Click or ↑/↓ + Enter adds them as a chip (pink = niche, purple = tag, blue = creator), × removes. Several are possible; one is picked at random per fetch. Without a choice you get trending.
- **Sort order** (trending, top of the week/month/all time, latest) and **quality** (SD/HD). Niches only know “hot/best/latest” – trending becomes “hot” there, top becomes “best”.
- Ctrl+click or ↗ opens the clip on redgifs.com.

Technical notes:

- The storm tab loads clips directly from RedGifs (temporary token, stored in the browser for ~20 h). The Stash interface blocks external sources through its Content Security Policy, so RedGifs only plays in the storm tab.
- The suggestions in the panel of the Stash interface go through the small Python backend `rgbackend.py` (called through Stash's `runPluginOperation`, needs `python` in the PATH). In the storm tab they are queried directly.
- If RedGifs can't be reached, the wave is filled up with Stash media.

### Saving RedGifs clips to Stash

- Hovering over a RedGifs clip shows **⬇** in its toolbar, or press **D** (clip under the mouse or in focus).
- Always saved in **HD** as `creator_id.mp4`.
- Save location (panel → RedGifs → Saving): default `<first Stash library>/RedGifs`. Subfolders:
  - **By source** (default): name of the niche, tag or creator the clip came from – `Trending` without a choice.
  - **By the clip's creator**.
  - **Everything in one folder**.
- Then Stash scans just this folder (with cover, preview, thumbnails, phash) and the new scene gets the RedGifs link, a title (the clip's description, otherwise “creator – ID”), the description and the tag **RedGifs**.
- A green dot in the top left = saved. Files that already exist are detected and not downloaded twice.
- The spelling of existing folders is kept (Windows ignores upper/lower case, Stash doesn't) – so no duplicate folder entries appear.
- The backend only downloads from `media.redgifs.com`.

## Core features

- Random selection through GraphQL (`findImages` / `findScenes`, `sort: random_<seed>` with a new seed per call)
- First wave right away, then the next one every X seconds, cumulative up to “at most at once”
- Image/video mix in % (error diffusion, so the ratio holds even for small waves)
- **Marker clips**: a share of the videos (Media → “Marker clips”) plays the moments marked in your scenes – only the marked part, looping – instead of whole scenes. Under Source & filters, **Tags apply to** chooses whether the tag box edits the tags for scenes and images or for marker clips (marker tags: primary or extra tag of the marker; the other kind keeps its own tags, a note says so); **Exclude tags**, **All tags must match** and **Including sub-tags (recursive)** count for scenes, images and marker clips alike – with the recursive switch a parent tag also catches all its sub-tags, and it shows up in the marker tag suggestions even when only its sub-tags have markers (without it only tags with markers of their own are offered). The other filters apply to the marker's scene. A click opens the scene at that moment. (`findSceneMarkers` with the clip `stream` Stash cuts itself.)
- Video loop on/off (off = the video fades out after its end and makes room)
- Volume 0–100, applies right away to running videos
- Fade-in on appearing, fade-out on stopping (sound fades in and out too)
- Esc stops everything (even from fullscreen)
- “Reroll background” button for the Random Backgrounds plugin (same logic as the plugin, preloads the image and never repeats the current one)

## Extras

1. **Endless mode**: when the maximum is reached, the oldest items are replaced instead of stopping.
2. **Layouts**: eight layouts, see above. Switch live with animation.
3. **Source & filters**: whole library, current page (performer/tag/studio/gallery/group) or **a playlist** (one of Stash UI's smart playlists – it decides on its own); include/exclude tags with autocomplete (all of them or any of them), **performers** (all or any), minimum rating, favorite performers only, **resolution up to** 720p/1080p/1440p (lower runs smoother) and **videos at least** 1/5/20 min.
4. **Sound modes**: all videos, only under the mouse, only the newest video, muted.
5. **Focus & mouse**: click shows an item big, drag moves, mouse wheel scales, right-click removes, Ctrl- or middle-click opens in Stash.
6. **Ken Burns effect** on images, **random start point** in videos.
7. **Darken and blur the wallpaper** (sliders).
8. **Reroll the background automatically** every N waves.
9. **Sleep timer**: stops after X minutes with a fade-out.
10. **Presets** to save and load, plus a **HUD** with counters and countdown, and **hotkeys**.

## Hotkeys (while running)

| Key | Action |
|---|---|
| Esc | Stop |
| Space | Pause / resume |
| N | Next wave right away |
| B | Reroll background |
| L | Change layout (all 8) |
| V | Next mood |
| C | Remove all items |
| F | Fullscreen |
| H | HUD on/off |
| S | Panel |
| ↑ / ↓ | Volume ±5 |
| D | Save the RedGifs clip under the mouse to Stash |

Settings and presets are stored in the browser's `localStorage`.

## Requirements

- Stash with the plugin installed (see the repository README).
- `python` in the PATH – only needed for the RedGifs features (suggestions in the Stash tab, saving clips).
- Optional: the Random Backgrounds plugin for wallpapers behind the storm.

## Performance: full videos at once

Over plain HTTP, browsers keep only about 6 connections to one server, and every full video that plays keeps one busy while it loads. When all are taken, Stash stops answering in that browser – every tab, not just Media Storm. Media Storm handles this by itself (Media → “Full videos at once”, 0 = automatic): with Stash on the same computer or behind HTTPS it plays up to 24 full videos to begin with, over the network up to 5; while the storm runs it checks every few seconds how quickly Stash answers – quick means more full videos (up to 60), slow means fewer, and the oldest full videos fade out before Stash stops answering. Further videos play as preview clips, or show their cover if no previews are generated (Tasks → Generate → Previews). RedGifs comes from another server and doesn't count. A fixed number can be set instead.

## Languages

English, **Simplified Chinese (简体中文)**, **Japanese (日本語)**, **Vietnamese (Tiếng Việt)**, **French (Français)**, **Spanish (Español)**, **German (Deutsch)** and **Polish (Polski)**. The language follows Stash UI's choice (Settings → General → Language); on “Automatic” it follows the interface language set in Stash.
