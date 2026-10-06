TEST YAML URL from PepegaSan.
https://pepegasan.github.io/stash-pmv-plugins/index.yml


# Stash plugins: Stash UI, PMV Generator, Media Storm

Three plugins for [Stash](https://github.com/stashapp/stash).

| Plugin | What it is |
|---|---|
| [**Stash UI**](plugins/stashui/README.md) | A complete new interface for Stash: browsing, player, image viewer, folders, tags, performers, statistics, duplicates, queue, tasks, plugins and all settings – in its own look with color themes and liquid glass. Classic Stash stays available in the same look. In English, Simplified Chinese, Japanese, Vietnamese, French, Spanish, German and Polish. |
| [**Pepega test version**](plugins/pepega-stashui/README.md) | Pepega fork of Stash UI with PluginApi host for Quick Markers, Folder Sidebar, Tag Categories, and Pepega PMV links. |
| [**PMV Generator**](plugins/pmvGenerator/README.md) | Pick a song – or take the music from any video in your library – and on every beat it cuts to a clip from your library, with split-screen layouts, effects, speed ramps and clip audio. Live in the browser, optionally recorded and saved back to Stash. Plays several songs in a row, follows the music you play in **Plex**, or listens live to **Spotify** (or any app on your PC) as a visualizer. Can also rebuild an existing PMV with your own clips, and mix in clips from RedGifs. |
| [**PMV Generator Pepega**](plugins/pepega-pmvGenerator/README.md) | Pepega build of the PMV Generator; install next to the original and enable either one. Same features as PMV Generator. |
| [**Media Storm**](plugins/mediaStorm/README.md) | Random images and videos from your library appear in waves in their own tab – eight layouts, effects, moods, folder and tag filters, waves on the beat of a song. |

Each plugin works on its own – install just the ones you want. They share the same look and work together: with Stash UI installed, Media Storm and the PMV Generator show up in its menu, the PMV Generator leads back into Stash UI, and Stash UI's player can hand a video's music straight to the PMV Generator.

## Stash UI at a glance

- **Browse** scenes, images and galleries in justified rows with preview on hover (with sound if you like), infinite scrolling, sorting and filters – tags (include/exclude), performers, rating, favorites, watched, resolution, duration, format.
- **Player**: resume, highlights (heat curve and jump marks), quality, subtitles, speed, VR (180°/360°), fullscreen info panel, queue and similar scenes in the info bar, **mini player** that keeps playing while you browse (drag and resize it anywhere), **Cast to TV** (Chromecast / AirPlay), and **Music** – the sound of a video into the PMV Generator or as a sound file.
- **Performers**: photo cards with search, sort and filters, a page per performer with facts, rating, favorite and all their scenes; edit everything including the photo, and fill it in from StashDB or your performer scrapers. Performers show in the player's info bar, in search and on tag pages.
- **Statistics**: plays, watch time and O counter, weekly activity, a weekday × hour heatmap, top scenes, tags, performers and studios.
- **Duplicates**: scenes that look the same side by side with resolution, bitrate and size – keep the best, delete the rest.
- **Folders, tags, queue, history, search**, tasks with live progress, **plugins** (install, update, sources) and every Stash setting, with a settings search.
- **Your look**: color themes with a color wheel and presets, liquid glass (transparency, blur), background images, animations. Installable as an app (its own window and icon).

## Screenshots

| | |
|---|---|
| ![Stash UI: home](docs/screenshots/stashui-home.png) | ![Stash UI: scenes with filters](docs/screenshots/stashui-scenes.png) |
| ![Stash UI: player with similar scenes](docs/screenshots/stashui-player.png) | ![Stash UI: mini player while browsing](docs/screenshots/stashui-mini.png) |
| ![Stash UI: performers](docs/screenshots/stashui-performers.png) | ![Stash UI: a performer's page](docs/screenshots/stashui-performer.png) |
| ![Stash UI: statistics](docs/screenshots/stashui-stats.png) | ![Stash UI: duplicates](docs/screenshots/stashui-duplicates.png) |
| ![PMV Generator: setup](docs/screenshots/pmvgen-setup.png) | ![PMV Generator: live show with a mirrored 3-way split](docs/screenshots/pmvgen-run.png) |
| ![Media Storm: panel](docs/screenshots/mediastorm-panel.png) | ![Media Storm: the storm tab](docs/screenshots/mediastorm-storm.png) |

*Screenshots use placeholder sample data and test clips.*

## Install

1. In Stash, open **Settings → Plugins → Available Plugins → Add Source**.
2. Name: anything you like. URL: `https://anonym88312.github.io/stash-pmv-plugins/index.yml`
3. The plugins appear in the list below – tick the ones you want and click **Install**.
4. Reload the Stash page.

Updates show up in the same place (**Check for Updates**) – or in Stash UI under **Plugins**, where you can update everything with one click.

Manual install: copy a folder from `plugins/` into your Stash plugins folder and click **Reload plugins** in Settings → Plugins.

### Requirements

- A recent Stash version and a current Chrome, Edge, Safari or Firefox.
- `python` in the PATH for the small backends: saving PMV Generator recordings to Stash, taking the music out of videos, and the optional RedGifs features of Media Storm and the PMV Generator. Everything else runs in the browser.
- ffmpeg – Stash's own is used – for the music out of videos and so saved recordings get a proper duration.

## Development

- No build step for the code itself: plain JavaScript ES modules.
- Stash UI is the source of the shared basics (the CSS, `api.js`, `ui.js`, `theme.js`, `i18n.js`, `pmvsmart.js`, `audiox.js`, the tag picker, the Chinese strings). The PMV Generator owns its own code (`pmvgen.js`, `beats.js`, `pmvfx.js`, `pmvscan.js`, `backend.py`); its `beats.js` is also used by Media Storm. After editing shared files, run `python tools/build.py --sync-only` – it copies them where they're needed and stamps versions against stale browser caches.
- `python tools/build.py` additionally writes the zips and `index.yml` to `dist/`. On every push to `main`, the GitHub Actions workflow builds them and publishes them with GitHub Pages (Settings → Pages → Source: **GitHub Actions**).

## License

[MIT](LICENSE)
