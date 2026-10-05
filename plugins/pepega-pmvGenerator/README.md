# PMV Generator

Pick a song – on every beat it cuts to a clip from your Stash library: split-screen layouts like real PMVs, effects on cuts, beats and drops, beat-synced speed ramps and clip audio. It runs live in the browser and can record the result as a video and save it back to Stash as a scene. It can also analyze an existing PMV and rebuild it with your own clips.

Works with classic Stash and with the **Stash UI** plugin: with Stash UI installed, the generator shows up in its menu under **Watch**, and its back link and saved scenes lead back into Stash UI.

![PMV Generator: song and clips](../../docs/screenshots/pmvgen-setup.png)

![Style: moods and collapsible sections](../../docs/screenshots/pmvgen-style.png)

![Live show](../../docs/screenshots/pmvgen-run.png)

## Using it

Open it with the **PMV Pepega** button in the Stash navbar, from **Watch → PMV Generator Pepega** in Stash UI, or directly at `/plugin/pepega-pmvGenerator/assets/index.html`. Three steps on the left; on the right the **Go** card with a summary of all settings and the start button (on narrow screens it sticks to the bottom). Every function is its own row with a switch and a short explanation.

1. **Music**: drop or choose a song (MP3, M4A, WAV, OGG, FLAC). Tempo and beats are detected in the browser (under 1 s per minute of music). The waveform shows loudness and bars; if the tempo is off, **½ tempo** / **2× tempo** help, and **Earlier** / **Later** shift the cuts by 20 ms. **Music from a video**: drop a video instead of a song, or open **Music from a video in your library**, pick a scene and the part with the song (from/to) – ffmpeg cuts the sound out on the Stash computer (optionally also kept as a file in “PMV Generator/Songs”). Stash UI's player has the same as **Music → Open in PMV Generator**. **Only use … Cut** takes just a part of any song. **Long DJ mixes** (over 45 minutes, MP3 or WAV) work too: they're read piece by piece (with a progress display), the tempo is found per two-minute stretch, and the mix plays streamed from the file. **Several songs**: drop or choose several files (or a whole folder) – the show plays them one after another, optionally shuffled. Or take the music from **Plex**, listen live to **Spotify or another app**, or use **PMV as template** (all below).
2. **Clips**
   - **Clips from**: these filters, **a playlist** – one of Stash UI's smart playlists (e.g. “never watched, 4 stars and up”) decides which clips come – or a remix of your favorites: **Versus top** (the scenes that won their place in Versus, with their best moments) or **Most watched** (the last 30 days).
   - **What**: scenes, images, both – or **markers** (every clip starts at one of your markers; the tag filter then looks at the marker's tags, with sub-tags counted unless you switch that off) · **Clip shape**: all, portrait only, landscape only · include/exclude **tags** (right-click) – with several tags **all of them** or **any of them** · **performers** (all or any) · **Favorites only**.
   - **Tag stages that follow the song**: instead of one tag filter, list tags in order (A → B → C … up to five stages, each with its own include/exclude tags). The song is divided among the stages; the **last stage** plays on every drop and in the finale (the last tenth). The count shows the number of clips per stage; a stage without clips borrows from the others. Not for Plex/live music or templates.
   - **Rating at least**, **scenes at least** (1 / 5 / 20 min) and **resolution up to** 720p / 1080p / 1440p – lower resolutions run smoother.
   - **Folders**: a collapsible folder tree (searchable, with video/image counts); subfolders are included. Tick a folder to take it, **⊘** leaves a folder out (with its subfolders); every mark stands on its own and the deepest one wins – so you can leave a folder out and take one of its subfolders back, take a folder and leave a subfolder out, or take just a subfolder. A chip above the list goes away with a click. Without a choice: all folders.
   - **Clip selection** (one switch each):
     - **Best moments instead of random**: with Stash's scrubber thumbnails (sprites) all of a scene's ~80 pictures are rated for skin and contrast without touching the video, your markers get a bonus, and the best two are checked for motion; without sprites, markers and random spots are examined. Videos above 1440p skip the motion check – every jump in a 4K video costs. Short clips (under 10 s) start at the beginning.
     - **Smart crop**: when a clip has to be cropped, the crop follows what matters in the picture (skin, edges) instead of sticking to the center; re-measured every 0.4 s and smoothly followed.
     - **Match cuts**: at each cut, the ready clip that best matches the outgoing one in color, brightness and composition (where the subject sits) comes next.
     - **Clean cuts** (with best moments): a clip starts where its scene runs on for the next few seconds – spots with a hidden scene change inside (the clip would jump to another scene by itself) are passed over, a few more spots are tried first.
     - **Variety**: the same scene doesn't come back within the last 24 clips, the same performer preferably not within the last 4 (with a small selection it eventually can't be avoided).
3. **Style** – at the top the **mood** (*PMV classic*, *Maximal*, *Hypno*, *Clean* set cutting, layouts and effects in one go), below five sections – all open; click a section's header to collapse it, or use **Collapse all**:
   - **Cutting**: **Bars and phrases** finds the “one” of each bar and where a 4-bar phrase starts (a song with a pickup or a short intro breaks “every 4th beat”): cuts sit on the bar grid (every beat, beats 1 and 3, or the “one”), split screens change at the start of a phrase. Not for live music, templates or very long files · automatic by energy (calm every 4 beats, medium every 2, loud every beat) or fixed · **Layouts** (split screens like in real PMVs): fullscreen, kaleidoscope, 2-way, **3-way mirrored** (the same clip mirrored left and right, a different one in the middle), 3-way, 4-way. Calm parts stay fullscreen, loud parts switch between the 3-way layouts, drops jump straight into many fields; narrow fields prefer portrait clips · **Fields in 2-/3-way layouts**: side by side or stacked.
   - **Effects**, grouped by occasion, each group with “All on/off” (on by default: zoom-in entry, flash, zoom pulse, RGB split):
     - *On cuts*: transitions (motion blur), zoom-in entry, flash
     - *On the beat*: zoom pulse, shake, **speed ramps** (slow motion in calm parts, faster in loud ones, a burst on drops), stutter, strobe (off by default – careful if you are sensitive to light)
     - *On drops*: RGB split, glitch, tunnel, negative, echo, **text** (your own words in SFX style)
   - **Look & picture**: **color look** for all clips – Original, Warm, Pink, Cold, Vivid, Black & white, Noir · **Even out brightness** (clips that are too dark get brightened, too bright ones toned down) · color rush, VHS, **image drift** (Ken Burns on still images), **glowing dividers** · format 16:9 or 9:16 · **Fit** (default: the whole clip, with a blurred border) or **Fill** (crops the clip to fill the field).
   - **Sound**: sliders for the volume of the **song** and the **clips** (0–100 % each) · **clip audio** on/off · **clip audio plays** *only on drops* (the original audio of the biggest clip fades in for a few beats, like the voice-overs in real PMVs) or *always* (all visible clips play audibly under the song; in split screens they share the clip volume). Everything ends up in the recording exactly like this.
   - **Output**: **intro** (your title slams in on a pink hatched bar, ~3 s) and **outro** (the picture fades dark, title and number of clips, the last second black); title of your choice, empty = song name · **Record** in 720p or 1080p.
4. **Go**: runs as a fullscreen show (Space pause, F fullscreen, Esc stop; with several songs N / P or the buttons in the bar skip, and shuffle can be switched there too). The bar at the top and the mouse pointer disappear after 2.5 s without moving the mouse; **H** hides the bar for good. **I** shows which clips are on screen (name, file, size, state) and which had to be skipped and why – e.g. a video the browser can't decode is left out instead of showing a black field, and a clip that fails during the show is replaced. **My settings** saves everything about clips, cutting, effects, look and sound under a name, loads it again, and exports/imports it as a file. Saved settings are kept in Stash (the plugin's settings), so they're there in every browser. The bar at the top lets you adjust the sound live: sliders for **song** and **clips**, and the button next to them cycles clip audio through *off → on drops → always*. This applies right away (including the recording) and is remembered for the next show. With **Record** you get a video (WebM): preview, **Download** or **Save to Stash** – it lands in `<first video library>/PMV Generator`, gets scanned and receives the title “PMV – song” and the tag “PMV Generator”.

**Format and window**: the picture is 16:9, 9:16 or **Match window** – it takes the shape of your window (an ultrawide or a tall window too) and follows when you resize it while it runs (not while recording, a video can't change its size). **In the window**: *Show all* (bars where the shapes differ), *Fill the window* (the edges are cut off) or *Stretch*.

Tip: three full-size portrait clips side by side = format **16:9** + layout 3-way + “Portrait only” (each column is then almost exactly 9:16).

## RedGifs (optional)

Step 2 → **RedGifs** – the same source as in Media Storm:

- **Share**: what percentage of the clips comes from RedGifs (0 = off, the default; 100 = RedGifs only). The rest comes from your library; if one side runs out or RedGifs can't be reached, the other fills in.
- **Niches, tags & creators**: type in the search field → live suggestions in three groups (with clip count and subscribers/followers). Click or Enter adds them as a chip (pink = niche, purple = tag, blue = creator), × removes. Several are possible; one is picked at random per fetch. Without a choice you get trending.
- **Sort order** (trending, top of the week/month/all time, latest) and **quality** (SD/HD).
- Clip shape and “scenes/images” apply to RedGifs clips too; best moments, smart crop, match cuts and the recording work with them as well.

### Saving RedGifs clips to Stash

- During the show: **D** or **Save clip** in the top bar saves the RedGifs clips that are on screen.
- On the end card: **Save the N RedGifs clips** saves every RedGifs clip used in this PMV.
- Always saved in **HD** as `creator_id.mp4`. Save location: default `<first Stash library>/RedGifs`, subfolders **by source** (niche, tag or creator – `Trending` without a choice), **by the clip's creator** or **everything in one folder**.
- Stash then scans just this folder and the new scene gets the RedGifs link, a title, the description and the tag **RedGifs**. Files that already exist aren't downloaded twice.

Technical notes: the page talks to the RedGifs API directly when Stash is opened via `localhost`; opened via its network address, the browser isn't allowed to, so the requests go through the plugin backend (`rgbackend.py`, shared with Media Storm – needs `python` in the PATH). Downloads only come from `media.redgifs.com`.

## Music from Plex

Switch step 1 to **Plex** and **Sign in with Plex** – you confirm on plex.tv like with any Plex app (no password passes through the generator, the key stays in this browser). With one server it's picked right away, otherwise you choose. Then:

- **Follow what's playing**: the generator becomes a visualizer for whatever you play in Plex – Plexamp, your phone, the Plex web app, a TV. The sound stays in your Plex player; the show only brings the pictures and follows along: the next song (its beats are detected as soon as it starts), pause, seeking. Players report their position only every few seconds; the generator keeps the tightest estimate from all reports, so it settles within a few seconds. What it can't know is how late your speakers are (Bluetooth, TV, AV receiver): press **T** (or **Tap** in the bar) along to the beat you hear – after four taps the offset sets itself, tap on to refine. **− / +** (or **[ / ]**) shift the cuts by hand in 50 ms steps. The offset is remembered per Plex player. Nothing is recorded in this mode.
- **A playlist**: one of your Plex music playlists, in order or shuffled – played here, like several songs of your own.
- **Shuffle all**: random songs from all your music libraries.

The browser talks to plex.tv and to your server directly. Stash on `http://localhost` can reach your server in the local network; on a `https` page (e.g. the web version) only a server reachable over https works (Plex's secure connections or Remote Access).

## Spotify & other apps (live)

Switch step 1 to **Spotify & apps**. The generator listens to one program on this PC – Spotify by default, any other by its name as in the Task Manager (TIDAL, foobar2000, a browser …) – and cuts on the hits you hear – kick and snare, not the hi-hats – about when your speakers play them, at most about once per beat (the tempo is measured along the way). There's no guessed beat grid: in trap, hip-hop or phonk the hits sit on thirds of the beat and a predicted grid keeps slipping; this way every cut lands on a real hit. Calm parts without clear hits get a quiet cut every few seconds instead of pumping on nothing. A new song, pause and skipping are followed. Only that program is heard – a game, Discord or anything else running at the same time stays out. You play music in the app as usual; the song title comes from Spotify's window. Nothing is recorded in this mode.

- If your speakers are late (Bluetooth, TV), the cuts come early: tap **T** along to the beat or use **−** / **[** – remembered per app.
- How it works: the plugin's backend compiles a small helper (`applisten.cs`) once with the C# compiler that comes with Windows and starts it. It uses Windows' per-app audio capture and hands only that app's sound to this page, on `127.0.0.1` with a secret key; it stops by itself when nobody listens for 90 s (one helper per app).
- Needs Stash on **Windows 11** (or Windows 10 from 2022) and the browser on the same computer.

## PMV as template

Switch step 1 to **PMV as template**, then pick a PMV from your library (without a search, scenes tagged “PMV” are listed first) or a video file. The analysis runs in the browser at about three times real-time speed:

- **Music** comes from the video's audio track, plus tempo and beats.
- **Cuts**: where the picture changes abruptly – even in just one field of a split screen.
- **Layouts**: dividers running through almost every row (2-/3-/4-way), and exactly mirrored thirds (3-way mirrored) or quarters (kaleidoscope).
- **Flashes**: suddenly very bright frames (white or pink).

A timeline then shows the sections colored by layout (cuts on top, flashes at the bottom). **Rebuild with my clips** plays the original music with the same cuts, layouts and flashes – only with clips from your library (clip selection and effects as usual). Effects like glitch, RGB split or text are burned into the original and can't be recovered; your effects run at the same moments. Stutter jumps in the original are detected as cuts.

Needs a browser with `requestVideoFrameCallback` (Chrome, Edge, current Firefox) and a video the browser can play.

## Performance

Picture analysis (smart crop, even brightness, match cuts, best moments) shrinks the picture on the graphics card and reads it back in a background thread, so even 4K60 clips don't stall the page; at most three clips are prepared at once. If it still stutters, **Resolution up to 1080p** is the biggest lever.

## Requirements

- A current Chrome, Edge or Firefox.
- Saving to Stash and saving RedGifs clips use the small backend `backend.py` (needs `python` in the PATH). With ffmpeg (Stash's own or from the PATH) the recording is remuxed without re-encoding so duration and seeking work – browser recordings otherwise carry no duration.

## Languages

English and **Simplified Chinese (简体中文)**. The language follows Stash UI's choice (Settings → General → Language); on “Automatic” it follows the interface language set in Stash.
