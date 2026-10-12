# RedTok

RedGifs as a TikTok-style feed inside Stash – swipe (or scroll) through videos one screen at a time, follow creators and niches, like, and save the ones you want into your Stash library with one tap. It also plays your own Stash scenes the same way. **No RedGifs account needed** – RedTok only reads RedGifs' public videos.

Open it from Stash UI's menu (it shows up there by itself) or with the **RedTok** button in classic Stash's top bar – or go straight to `/plugin/redtok/assets/index.html`.

## What's in it

- **For You** – trending videos mixed with the niches of what you like, save and follow (videos you've watched are skipped, if you like). Sort it by Trending, New or Top this week / month / all time instead.
- **Following** – the newest videos of every creator you follow, newest first.
- **My Stash** – your own scenes as a feed (random, recently added, newest, rating, most played, most O); long scenes start somewhere in the middle, like a clip.
- **Explore** – a grid of trending videos with chips for top lists, the niches you follow and popular niches; all niches with a filter.
- **Search** – suggestions while you type; results in Videos, Creators, Niches and My Stash.
- **Profiles** – a creator's videos (latest, popular, trending), follow, hide, download everything or the newest *n*; niche pages with follow; performer and tag pages for your Stash.
- **Your profile** – liked, saved, watched, the creators and niches you follow; select several to download or remove.
- **Downloads** – one folder per creator inside a folder of your library (suggested for you), skips what's already on disk, Stash scans the new videos by itself.
- On a video: double-tap to like, tap to pause, press and hold (or ⋯) for the share/options sheet – copy link, open on RedGifs, save, not interested, hide creator, speed, auto scroll, clear display, picture fit, details. The spinning disc shows the video's niches and tags. On phones, swipe left for the creator's profile.
- **Keys** on a computer: ↑ ↓ / J K, Space, M, L, S, ← →, F, P, C, /, ? (all listed under ?).
- **Your data** stays in the browser and is copied to a backup file next to Stash's config (`backups-redtok`) – a new browser or device gets it back by itself. Export/import as a file in Settings.
- English, Simplified Chinese, Japanese, Vietnamese, French, Spanish, German and Polish (follows Stash UI's / Stash's language, or pick one in Settings).

## Requirements

- `python` in the PATH (the small backend saves files into your library, and asks RedGifs when your browser can't – see below).
- The download folder must be inside one of your Stash libraries, otherwise Stash won't find the videos.

## Notes

- Your browser talks to RedGifs directly when Stash is opened as `localhost`. Opened through a network address or a domain (phone, Tailscale …), RedGifs refuses the browser, so the plugin's backend asks for it – that works the same, just a little slower. After installing or updating, press **Reload plugins** in Stash's settings once.
- RedTok is not made by or connected to RedGifs or TikTok.

## Changelog

| Version | What changed |
|---|---|
| 1.0.3 | Search brings matching videos again: RedGifs no longer understood the old way of asking and answered with its trending videos. The search box now finds the words in tags and descriptions; a tapped #tag (or a suggested tag) shows exactly that tag. |
| 1.0.2 | Videos start the moment you swipe: the next two are warmed up in advance (a muted play stopped on the first frame, so phones buffer them – preload alone isn't enough on Android/iOS), and the first frame replaces the poster as soon as it is decoded. |
| 1.0.1 | Pictures (posters, grids, profile pictures) showed as broken boxes where Stash doesn't let plugin pages load pictures from other sites – they now come through the plugin's backend, a batch at a time. |
| 1.0.0 | First release: For You (with your taste), Following, My Stash, Explore, search, profiles, niche pages, your profile, downloads into the library, share/options sheet, details, keys, backup, eight languages. |
