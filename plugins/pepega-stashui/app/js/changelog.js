// What's new: the patch notes shown on the "What's new" page (newest first).
// Every release that changes something you can see gets an entry; en + zh (Simplified Chinese).
// app: "ui" = Stash UI, "pmv" = PMV Generator, "storm" = Media Storm
// An item can have a 4th entry "route::target" – the What's new page then shows a "Show me" button that opens the route and lights
// up the target for a moment. The target is a CSS selector (starts with [ . #) or the label of a setting (opens it in Settings).
// "@performer" / "@scene" inside the route (performer/@performer) stand for the id of one of your own performers (most scenes) / scenes. Older entries are listed in LINKS.

export const CHANGES = [
  {
    v: "3.119.0",
    date: "2026-10-23",
    items: [
      ["ui", "Discover: next to “Performers from my library” there is “Women from my library”, as suggested by Ghboon – only scenes with female performers you linked to that stash-box (the performer's gender must be set; trans women count too).", "Discover 新增“我库中的女性演员”选项（Ghboon 的建议）：只显示与该 stash-box 关联的女性演员的场景（需要在演员资料中设置性别，跨性别女性也算）。", "discover::[data-perf]"],
    ],
  },
  {
    v: "3.118.0",
    date: "2026-10-22",
    items: [
      ["ui", "Clips from markers: the Markers page has a “Make clips” button (it takes everything the search and tag filter show), and Cut clips in the player has “Clips from markers” for that video. A marker that has a start and an end becomes a clip as it is. For markers without an end you choose “take the next 20 seconds” (5/10/20/30/60 or any number, optionally stopping at the next marker of the same video) or leave them out – and in the list you can type the end of any marker yourself (1:25, or +15 for 15 seconds after the start) or untick the ones you don't want. Clips are saved like in Cut clips (Fast or Exact, joined per video, “Clips” subfolder) and can take over the video's performers/tags/studio plus the marker's own tags.", "用标记制作片段：标记页面新增“Make clips”按钮（处理搜索和标签筛选当前显示的所有标记），播放器里的“Cut clips”也有针对该视频的“Clips from markers”。有开始和结束时间的标记直接变成片段；没有结束时间的标记可以选择“取之后 20 秒”（5/10/20/30/60 秒或任意数字，可选在同一视频的下一个标记处停止），或者跳过 – 在列表中还可以自己输入任意标记的结束时间（1:25，或 +15 表示开始后 15 秒），也可以取消勾选不要的标记。片段的保存方式与“Cut clips”相同（快速或精确、按视频合并、“Clips”子文件夹），并可沿用该视频的演员/标签/工作室以及标记自己的标签。", "markers::[data-mkclips]"],
    ],
  },
  {
    v: "3.117.0",
    date: "2026-10-21",
    items: [
      ["ui", "A–B loop in the player, as suggested by Blueocean15: press L where the part should start (A), press L again where it should end (B) and that part repeats. The third press clears it. The gear menu has the same entry, and the repeated part is shown on the timeline.", "播放器新增 A–B 循环（Blueocean15 的建议）：在要开始的位置按 L（A 点），在结束的位置再按一次 L（B 点），这一段就会重复播放。第三次按下则清除。齿轮菜单里也有同样的条目，重复的部分会显示在时间轴上。", "scene/@scene::[data-menubtn]"],
      ["ui", "Themes from other plugins: an extension module can call stashui.addTheme({ id, name, colors, css, glass }) and the theme shows up next to the colour presets in Settings → Appearance. Picking it sets the colours, loads the plugin's stylesheet and switches liquid glass on or off if the theme says so; picking another preset removes it again. (Thanks CandyBoudoir – for plugin authors: see the README.)", "来自其他插件的主题：扩展模块可以调用 stashui.addTheme({ id, name, colors, css, glass })，主题就会出现在“设置 → 外观”的配色预设旁边。选择它会设置颜色、加载插件的样式表，并按主题的要求开启或关闭液态玻璃；选择其他预设则会移除它。（感谢 CandyBoudoir – 插件作者请看 README。）", "settings/look::[data-theme]"],
    ],
  },
  {
    v: "3.116.0",
    date: "2026-10-21",
    items: [
      ["ui", "Discover and Missing scenes, as suggested by ufousox007: (1) a “Last (days)” field instead of exact dates – only scenes from the last n days (Discover: released in the last n days; the performer page's Missing scenes and Settings → This interface have the same field, and it replaces the From / To dates). (2) Discover has a “Performers from my library” filter – only scenes with performers you have linked to that stash-box (together with the days field that gives “recently released by my performers”). (3) Clicking a scene you don't have opens a window with a larger cover, the details, the performers (the ones in your library link to them), the tags, a button to search your library for the title, and the one to open it on the stash-box. I could only test this against a fake stash-box – StashDB's date and performer criteria are assumed; if a box doesn't know them the page filters itself. Searching or downloading from that window isn't built yet.", "发现和缺失场景（ufousox007 的建议）：（1）用“最近（天）”字段代替确切日期 – 只显示最近 n 天内的场景（发现：最近 n 天内发布；演员页面的缺失场景以及“设置 → 此界面”里有同样的字段，它会取代“从”/“到”日期）。（2）发现新增“我资料库中的演员”筛选 – 只显示包含你已与该 stash-box 关联的演员的场景（与天数字段一起就是“我的演员最近发布的”）。（3）点击你没有的场景会打开一个窗口，包含更大的封面、详情、演员（资料库中已有的可点击跳转）、标签、在资料库中搜索该标题的按钮以及在 stash-box 上打开的按钮。这些只在模拟的 stash-box 上测试过 – StashDB 的日期和演员条件是假设的；如果某个 stash-box 不支持，页面会自己筛选。窗口里的搜索和下载功能尚未实现。", "discover::[data-days]"],
    ],
  },
  {
    v: "3.115.1",
    date: "2026-10-20",
    items: [
      ["pmv", "Mouse control in the PMV Generator, as suggested by abverbaerba: it has its own section now (between Sound and Funscript) in the order you'd use it – click the middle, middle mouse button, click the sides, mouse wheel. Clicking the sides has the same choice as the wheel – off / next-previous song / song volume – and changes the volume in 5 % steps (was 10 %). “Start by itself” moved next to the intro and outro switches.", "PMV Generator 的鼠标控制（采纳 abverbaerba 的建议）：现在有独立的区域（在“声音”和“Funscript”之间），按使用顺序排列——点击中间、鼠标中键、点击两侧、鼠标滚轮。点击两侧和滚轮一样可以选择：关闭 / 下一首-上一首 / 歌曲音量，音量每次调 5 %（原来是 10 %）。“自动开始”移到了片头和片尾开关旁边。"],
    ],
  },
  {
    v: "3.115.0",
    date: "2026-10-20",
    items: [
      ["ui", "Matching the O video now works like a video editor: “Match an O video …” shows two bars on a timeline, one above the other – this video and the O video. Drag the O video's bar sideways to line it up, drag the ends of either bar to trim it, click the ruler to move the playhead, press Space to play both (the arrow keys step one picture), zoom with the slider. The O video then only plays where the two trimmed bars overlap. “Find it by the sound” still lines the bar up for you.", "对齐 O 视频现在像视频编辑器一样：“对齐 O 视频 …”会显示时间轴上上下叠放的两个条块——本视频和 O 视频。左右拖动 O 视频的条块来对齐，拖动任一条块的两端来裁剪，点击标尺移动播放头，按空格同时播放（方向键逐帧移动），用滑块缩放。之后 O 视频只在两个裁剪后条块重叠的部分播放。“通过声音查找”仍会自动帮你对齐。", "scene/@scene::.kb-omoments"],
    ],
  },
  {
    v: "3.114.0",
    date: "2026-10-20",
    items: [
      ["ui", "O video that plays along: if you have a video of the O with the PMV (or any video) running in its background, line the two up once and the O video then plays in a window whenever the PMV plays. Info bar → “O video” → “Match an O video …”: both videos sit side by side – put them on a moment you can see in both and press “These two match”, or let “Find it by the sound” compare the music of the two (works to about a hundredth of a second). “Play both” checks it; −1 s … +1 frame nudge the match. The single O moments from 3.113.0 are still there, folded away below.", "一起播放的 O 视频：如果你有一个 O 的视频，背景里正播放着 PMV（或任何视频），把两者对齐一次，之后每当播放这个 PMV，O 视频就会在小窗口里同步播放。信息栏 →“O 视频”→“对齐 O 视频 …”：两个视频并排显示——把它们定位到两边都能看到的同一时刻，点“这两处对上了”；或让“通过声音查找”比较两边的音乐（精度约百分之一秒）。“同时播放”用来检查；−1 秒 … +1 帧可微调。3.113.0 的单个 O 时刻仍然保留，折叠在下方。", "scene/@scene::.kb-omoments"],
    ],
  },
  {
    v: "3.113.1",
    date: "2026-10-20",
    items: [
      ["ui", "O clip window: it now takes the shape of the clip. A 9:16 clip no longer sits in a 16:9 window with thick black bars – the window becomes tall and a little narrower instead.", "O 片段窗口：现在会采用片段本身的形状。9:16 的片段不再放在带粗黑边的 16:9 窗口里，窗口会变成竖向并略窄。", "scene/@scene::.kb-omoments"],
    ],
  },
  {
    v: "3.113.0",
    date: "2026-10-20",
    items: [
      ["ui", "Crop / zoom in on a video and save it as its own video: player → “Cut clips” → “Crop / zoom in”. Drag a frame on the picture (free, 16:9, 9:16, 1:1, 4:5 or like the video), “Preview the zoom” shows what you'll get, then “Add clip” and “Save clips” – the new video holds only that part of the picture (re-encoded; optionally scaled up to the original height). Every clip can have its own area; joined clips are fitted to one size. “Whole video” fills in 0:00 to the end.", "对视频裁剪 / 放大，并另存为独立视频：播放器 →“剪辑片段”→“裁剪 / 放大”。在画面上拖动方框（自由、16:9、9:16、1:1、4:5 或与视频相同），“预览放大效果”显示最终画面，然后“添加片段”并“保存片段”——新视频只包含画面的这一部分（会重新编码；可选放大到原视频高度）。每个片段可以有自己的区域；合并的片段会统一尺寸。“整个视频”会填入 0:00 到结尾。", "scene/@scene::[data-cut]"],
      ["ui", "O moments and O clips: press Shift+O at the moment of an O in a video (the O key and button mark it too – Settings → Player has a switch). The info bar gets an “O moments” section: choose an O clip there (a marker or a part of any scene; for this scene or for every scene without its own). From each marked moment on, that clip plays in a small window over the video, in step with it (pause, jumping and speed carry over); the window can sit in any corner, be resized and has its own sound button. The moments and clips are kept in Stash's plugin settings.", "O 时刻和 O 片段：在视频中 O 发生的时刻按 Shift+O（按 O 键和按钮也会标记——设置 → 播放器里有开关）。信息栏新增“O 时刻”区域：在那里选择 O 片段（一个标记或任意场景的一段；用于这个场景，或用于所有没有自己片段的场景）。从每个标记的时刻起，该片段会在视频上的小窗口中同步播放（暂停、跳转和速度都会跟随）；窗口可放在任意角落、可调大小，并有自己的声音按钮。时刻和片段保存在 Stash 的插件设置中。", "scene/@scene::.kb-omoments"],
    ],
  },
  {
    v: "3.112.1",
    date: "2026-10-19",
    items: [
      ["ui", "Scene cards: you can now choose how the time of day is written – 24-hour (14:25), 12-hour with AM/PM (2:25 PM) or automatic (what your language uses). Settings → This interface → “Time format”; it applies when “With the time” is on.", "场景卡片：现在可以选择时间的写法——24 小时制（14:25）、带 AM/PM 的 12 小时制（2:25 PM）或自动（按所选语言）。设置 → 本界面 →“时间格式”；开启“显示具体时间”后生效。", "settings::Time format"],
    ],
  },
  {
    v: "3.112.0",
    date: "2026-10-19",
    items: [
      ["ui", "Scene cards can show more under the date: when you last watched it (or “Never watched”), when it was added, the time you watched it and the file size. Settings → This interface → “Info on scene cards”: switch each line on or off, show dates as the exact date or as “3 days ago” / “Yesterday”, with or without the time of day. Only “Last watched” is on at first.", "场景卡片可在日期下方显示更多信息：最近观看时间（或“从未观看”）、添加时间、观看时长和文件大小。设置 → 本界面 →“场景卡片上的信息”：可逐行开关，日期可显示为确切日期或“3 天前”/“昨天”，可带或不带具体时间。默认只开启“最近观看”。", "settings::Info on scene cards"],
    ],
  },
  {
    v: "3.111.0",
    date: "2026-10-19",
    items: [
      ["ui", "Player: new switch “Always start from the beginning” (sliders menu in the player, or Settings → Player and previews). Scenes you stopped halfway then begin at 0:00 instead of where you left off. The saved point stays in Stash untouched, and the hint at the top offers it as a button (“Resume at …”).", "播放器：新增开关“始终从头开始播放”（播放器的滑块菜单，或 设置 → 播放器和预览）。中途停止的场景会从 0:00 开始，而不是从上次停下的位置继续。保存的进度原样保留在 Stash 中，顶部提示里有“从 … 继续”按钮。", "settings::Always start from the beginning"],
    ],
  },
  {
    v: "3.110.0",
    date: "2026-10-19",
    items: [
      ["ui", "Performers: the “Looks” filter now has a “Natural or enhanced” dropdown, and a performer who names several ethnicities (“Caucasian, Asian”) shows up under each one – pick “Asian” and you get all of them. A new sort order “Natural / enhanced (A–Z)”. Statistics has a new card “Your performers”: how many performers (and scenes) per ethnicity, eye color, hair color or natural/enhanced – a click opens the Performers list with that filter. (Thanks JoeBiden!)", "演员：“外貌”筛选新增“自然或丰胸”下拉框；填写多个种族（如“Caucasian, Asian”）的演员会出现在每个种族下——选“Asian”即可找到全部。新增排序“自然/丰胸（A–Z）”。统计页新增“你的演员”卡片：按种族、眼睛颜色、发色或自然/丰胸统计演员（及场景）数量——点击即打开带该筛选的演员列表。（感谢 JoeBiden！）", "stats::[data-looks]"],
      ["ui", "E and T on a card (the key under the mouse): the page behind is no longer dimmed or blurred, and the cursor is already in the tags field – type, Enter, done. (Thanks JoeBiden!)", "在卡片上按 E / T（鼠标所指的卡片）：背景页面不再变暗或模糊，光标已在标签栏——输入、回车即可。（感谢 JoeBiden！）"],
      ["ui", "Home → Continue watching: select scenes and use “Remove from Continue watching” in the bar – they stay off the list until you watch them again. Your watch history is untouched. (Thanks Sunset-1982!)", "首页 → 继续观看：选中场景，在底部栏点“从继续观看中移除”——在你再次观看之前它们不再出现。观看历史不受影响。（感谢 Sunset-1982！）"],
      ["ui", "Photo cutter (performer photos): turn the picture left or right and change brightness and contrast before cutting – for a vertical frame that lies on its side. (Thanks JoeBiden!)", "照片裁剪（演员照片）：裁剪前可向左/向右旋转图片并调整亮度和对比度——适合横躺的竖向画面。（感谢 JoeBiden！）"],
      ["pmv", "Mouse control while the show plays (Output → Mouse and start): click the middle = play / pause, click the left / right side = song volume (reversible), middle mouse button = new clips, mouse wheel = next / previous song or song volume (reversible). “Start by itself” opens the show as soon as it can. All off by default. (Thanks abverbaerba!)", "播放时的鼠标控制（输出 → 鼠标与启动）：点击中间 = 播放/暂停，点击左/右侧 = 歌曲音量（可反向），鼠标中键 = 换新片段，滚轮 = 下一首/上一首或歌曲音量（可反向）。“自动开始”会在条件满足时立即开始。默认全部关闭。（感谢 abverbaerba！）"],
    ],
  },
  {
    v: "3.109.0",
    date: "2026-10-19",
    items: [
      ["ui", "Player: the picture above the timeline now stays inside the window, is a bit bigger, loads only once per scene (and ahead of the first hover), isn't shown while a finger just hovers, and has the liquid-glass look. New switch Settings → Player and previews → “Picture when hovering the timeline” (on). Scenes without timeline images show only the time, as before. A video that is played through a live transcode could freeze at the start (endless loop when jumping to 1–2 s) – fixed.", "播放器：时间轴上方的预览图现在不会超出窗口、略微放大、每个场景只加载一次（并在首次悬停前预加载）、手指悬停时不显示，并支持液态玻璃外观。新开关 设置 → 播放器与预览 →“悬停时间轴显示画面”（默认开启）。没有时间轴图片的场景和以前一样只显示时间。修复：通过实时转码播放的视频在跳到 1–2 秒时可能在开头卡住（无限循环）。", "settings::Picture when hovering the timeline"],
    ],
  },
  {
    v: "3.108.2",
    date: "2026-10-19",
    items: [
      ["ui", "Discover: if a stash-box counts scenes but sends none, the plugin now also asks it with a plainer question (no sort order, no page size), and the page shows what the box answered so the problem can be found.", "发现：如果某个 stash-box 报告有场景却不返回任何内容，插件现在还会用更简单的请求再问一次（不带排序和每页数量），页面也会显示该 stash-box 的回复，方便查找问题。"],
    ],
  },
  {
    v: "3.108.1",
    date: "2026-10-19",
    items: [
      ["ui", "Discover: when a stash-box says it has scenes but sends none (ThePornDB did this for a search without a word), the page now says so and suggests typing a search word instead of just “Nothing found.” – and it first tries the same question once more without the sort order. If “Show” hides everything, it says that too.", "发现：当某个 stash-box 声称有场景却没有返回任何内容时（ThePornDB 在不输入搜索词时就是这样），页面现在会说明情况并建议输入搜索词，而不只是显示“没有找到。”——并且会先去掉排序再问一次。如果“显示”把所有内容都隐藏了，也会提示。", "discover::[data-show]"],
    ],
  },
  {
    v: "3.108.0",
    date: "2026-10-19",
    items: [
      ["ui", "Performers: a new “Tags” button filters the performer list by the performers’ own tags (like classic Stash). Pick several tags, right-click a tag to leave it out, and choose whether a performer needs all of them or just one. The choice is kept in the address, so you can bookmark it. (Thanks eialici!)", "演员：新增“标签”按钮，可按演员自己的标签筛选演员列表（与经典 Stash 一样）。可选多个标签，右键点击标签表示排除，并可选择需要全部匹配还是任一匹配。所选内容会保存在地址中，方便收藏。（感谢 eialici！）", "performers::[data-tagbtn]"],
      ["ui", "New language: Ukrainian (Українська) – translated by illuminat-ua, with the newer texts added on top. Pick it under Settings → This interface → Language (or it follows Stash’s language). (Thanks illuminat-ua!)", "新语言：乌克兰语（Українська）——由 illuminat-ua 翻译，较新的文本已补全。可在“设置 → 此界面 → 语言”中选择（也会跟随 Stash 的语言）。（感谢 illuminat-ua！）"],
    ],
  },
  {
    v: "3.107.0",
    date: "2026-10-19",
    items: [
      ["ui", "New: Discover (Library). Search a stash-box such as StashDB for scenes – not only what your library has. The results are cards with cover, title, studio, performers and length; scenes you already have say so and open the local scene, the others open the stash-box page. Search by title, performer or studio, sort by newest, trending or title, show only what’s missing, and pick the stash-box if you have several. (Thanks ufousox007!)", "新增：发现（资料库菜单）。在 stash-box（如 StashDB）中搜索场景，而不仅限于你的资料库。结果以卡片显示封面、标题、工作室、演员和时长；你已有的场景会标明并打开本地场景，其余的打开 stash-box 页面。可按标题、演员或工作室搜索，按最新、热门或标题排序，只显示缺失的，有多个 stash-box 时可选择其一。（感谢 ufousox007！）", "discover::[data-q]"],
      ["ui", "Tasks: the “Running now” panel now stays at the top while you scroll through the task cards, so the progress remains in view after you press Start. It also shows what the task is doing right now and for how long it has been running, and what finished during your visit is listed underneath (done / cancelled).", "任务：“正在运行”面板现在会在你滚动任务卡片时固定在顶部，因此点击开始后进度始终可见。它还会显示任务当前在做什么、已运行多久，并在下方列出本次访问期间已结束的任务（完成/已取消）。", "tasks::[data-jobs]"],
    ],
  },
  {
    v: "3.106.0",
    date: "2026-10-19",
    items: [
      ["ui", "Missing scenes (performer page): every scene now shows its cover picture (loaded through the plugin while you scroll), and you can limit the list to scenes from an oldest to a newest date – in the list itself and in Settings → General, where you also pick which stash-box is asked first and can switch the covers off. (Thanks ufousox007!)", "缺失场景（演员页面）：每个场景现在都会显示封面图片（滚动到时通过插件加载），并且可以把列表限制在最早到最晚日期之间的场景 – 在列表中以及“设置 → 常规”里都可以设置，在那里还可以选择优先询问哪个 stash-box，也可以关闭封面。（感谢 ufousox007！）", "performer/@performer::[data-pmiss]"],
      ["ui", "Card view: the studio logo follows Settings → General → Studio logo: corner and size now (top right as before if you never set it), and on a phone the cards no longer reach past the right edge of the screen.", "卡片视图：工作室标志现在会遵循“设置 → 常规 → 工作室标志：位置/大小”（如果你没设置过，仍在右上角）；在手机上，卡片也不再超出屏幕右边缘。"],
      ["ui", "Versus (Chinese): the button on the ranking page that goes back to the duels now says “继续” (Continue) instead of “播放” (Play).", "对决（中文）：排行榜页面上返回对决的按钮现在显示“继续”，而不是“播放”。"],
    ],
  },
  {
    v: "3.105.2",
    date: "2026-10-19",
    items: [
      ["ui", "Liquid glass: the filter panel of the Scenes, Images, Galleries and other lists (tags, performers, rating, resolution …) and its suggestion list when you type a tag, performer or studio are glass now, like the rest of the page.", "液态玻璃：场景、图片、图库等列表的筛选面板（标签、演员、评分、分辨率等）以及输入标签、演员或工作室时的建议列表现在也是玻璃效果，与页面其余部分一致。", "scenes::[data-filter]"],
    ],
  },
  {
    v: "3.105.1",
    date: "2026-10-19",
    items: [
      ["ui", "Statistics: the big panel at the top (“Your week”) now follows the period you pick – 7 days, 30 days, 3 months, a year or all time – with its title, dates, most watched, top performer and tag, busiest day and days with something on. And in the Liquid glass look every panel of the page is glass now: the key figures, the bar with the period buttons, the achievements, the streak, the hover tip and the small bars. (Thanks ufousox007!)", "统计：顶部的大面板（“你的一周”）现在会跟随所选时间段变化 – 7 天、30 天、3 个月、1 年或全部 – 标题、日期、观看最多、最常看的演员和标签、最忙的一天和有观看的天数都会随之变化。并且在液态玻璃样式下，该页面的所有面板都是玻璃效果：关键数据、时间段按钮栏、成就、连续天数、悬停提示和小条形图。（感谢 ufousox007！）", "stats::[data-period]"],
    ],
  },
  {
    v: "3.105.0",
    date: "2026-10-19",
    items: [
      ["ui", "What’s new: entries of new features now have a “Show me” button that takes you to the feature – the right page, or the right setting – and lights it up for a moment (the latest entries have it; plugin authors can add it to their own with a fourth entry).", "更新内容：新功能的条目现在有“带我去看”按钮，点击后会跳到对应的页面或设置，并让该功能短暂高亮（最近的条目都有）。"],
    ],
  },
  {
    v: "3.104.0",
    date: "2026-10-19",
    items: [
      ["ui", "New: delete several performers at once. The Performers page has a “Select” button, and every card gets a tick box on hover (shift-click ticks a stretch, ctrl-click one more; once something is ticked a click on a card ticks it instead of opening it). The bar at the bottom deletes what is ticked after one question – their scenes, images and galleries stay, only the link to the performer goes – and “Select all” also takes everything the search and filters found, not just what is loaded. (Thanks ufousox007!)", "新增：一次删除多个演员。演员页面有“选择”按钮，鼠标悬停在每张卡片上都会出现勾选框（Shift+点击勾选一段，Ctrl+点击再勾一个；有勾选后，点击卡片是勾选而不是打开）。底部的操作栏只问一次就删除已勾选的 – 他们的场景、图片和图库会保留，只移除与演员的关联 – “全选”还会选中搜索和筛选找到的全部，而不只是已加载的。（感谢 ufousox007！）"],
    ],
  },
  {
    v: "3.103.0",
    date: "2026-10-19",
    items: [
      ["ui", "Performer page: two new buttons. “Statistics” shows what the library holds of the performer – scenes, watched and not yet, plays, watch time, total length and size, average rating, scenes per year, top tags, who they often appear with, studios, resolutions, most watched and best rated. “Missing scenes” asks StashDB (or another stash-box the performer is linked to) for the performer’s scenes and lists those the library doesn’t have yet – with a link to each, and “Show all” to see the ones you have too (matched by StashDB id, or by title and date). The stash-box is asked through the plugin’s backend with the key Stash already has; the key never reaches the page. (Thanks ufousox007!)", "演员页面：新增两个按钮。“统计”显示资料库中该演员的内容 – 场景数、已看和未看、播放次数、观看时间、总时长和大小、平均评分、每年场景数、常用标签、经常同台的演员、工作室、分辨率、观看最多和评分最高的场景。“缺失的场景”会向 StashDB（或该演员关联的其他 stash-box）查询该演员的场景，列出资料库里还没有的 – 每个都有链接，点“显示全部”还能看到已有的（按 StashDB ID 或标题和日期匹配）。查询由插件后端使用 Stash 已有的密钥完成，密钥不会传到页面。（感谢 ufousox007！）"],
      ["ui", "Badges on thumbnails: the rating, the tier and the length (with resolution) can each sit in any corner or be hidden (Settings → This interface). The rating badge now also shows on the normal thumbnails if you choose a corner, and its colour can follow the value – dark as before, coloured text, or filled – from red (low) to green (high). Several badges in one corner stack next to each other. (Thanks ufousox007!)", "缩略图徽章：评分、等级和时长（含分辨率）都可以放在任意角落或隐藏（设置 → 本界面）。选择一个角落后，评分徽章也会显示在普通缩略图上，其颜色可随评分变化 – 深色（同以前）、彩色文字或颜色填充 – 从红色（低）到绿色（高）。同一角落的多个徽章会并排显示。（感谢 ufousox007！）"],
      ["ui", "Fix: the performer card that opens over a performer in the scene’s info bar was see-through in the glass look, so the text behind it showed and was hard to read. It is frosted again and much more opaque. (Thanks ufousox007!)", "修复：在液态玻璃样式下，场景信息栏中演员卡片是透明的，后面的文字透出来很难读。现在重新有磨砂效果，而且更不透明。（感谢 ufousox007！）"],
    ],
  },
  {
    v: "3.102.0",
    date: "2026-10-19",
    items: [
      ["ui", "Versus (performers): the button that opens a performer\u2019s page now opens it in a new tab, so the duel and your streak stay where they are \u2013 also the names in the ranking. (Thanks Ghboon!)", "对战（演员）：打开演员页面的按钮现在会在新标签页中打开，对战和连胜记录保持原样——排行榜中的名字也一样。（感谢 Ghboon！）"],
      ["pmv", "Clip selection: two sliders, \u201cSkip the start of each scene\u201d and \u201cSkip the end of each scene\u201d (0\u2013300 s). No clip is taken from those seconds \u2013 e.g. a studio logo or the credits. The start comes on top of the automatic intro skip, the end sits on top of the last few seconds that were always skipped. Off by default. (Thanks rudi123!)", "片段选择：新增两个滑块“跳过每个场景的开头”和“跳过每个场景的结尾”（0–300 秒）。这些秒数内不会取片段——例如厂牌标志或片尾字幕。开头叠加在自动跳过片头之上，结尾叠加在原本就会跳过的最后几秒之上。默认关闭。（感谢 rudi123！）"],
    ],
  },
  {
    v: "3.101.1",
    date: "2026-10-19",
    items: [
      ["ui", "Fix: \u201cShow file\u201d worked only for some files \u2013 on Windows, paths with spaces or commas made Explorer open a default folder instead of selecting the file. The file is now passed to Explorer the way it expects it. If it still can\u2019t open a file, the message says why (not in a library folder / not found on Stash\u2019s computer) and the path is copied. (Thanks Ghboon!)", "修复：“显示文件”只对部分文件有效——在 Windows 上，含空格或逗号的路径会使资源管理器打开默认文件夹，而不是选中文件。现在按资源管理器期望的方式传递文件。如果仍无法打开，提示会说明原因（不在库文件夹内 / 在 Stash 所在电脑上找不到），并复制路径。（感谢 Ghboon！）"],
    ],
  },
  {
    v: "3.101.0",
    date: "2026-10-19",
    items: [
      ["ui", "Fix: the image viewer no longer flickers when you turn the page (also from a gallery). Before, the whole viewer faded in again over the page with every picture and the controls popped back up; now only the picture changes, and controls that were hidden stay hidden. The page-turning animations \u201cslide\u201d and \u201czoom\u201d no longer dip to black. (Thanks ufousox007!)", "修复：图片查看器翻页（包括从图库打开时）不再闪烁。以前每翻一张，整个查看器都会在页面上重新淡入，控制栏也会重新弹出；现在只有图片本身切换，已隐藏的控制栏保持隐藏。“滑入”和“放大进入”翻页动画也不再变黑闪烁。（感谢 ufousox007！）"],
      ["ui", "New: a \u201cShow file\u201d button in the info bar (scenes, images, galleries) opens the file in Explorer / Finder with the file selected \u2013 when Stash runs on the same computer. Otherwise (other computer, phone) the path is copied. Only files inside your library folders. (Thanks Ghboon!)", "新增：信息栏（场景、图片、图库）中的“显示文件”按钮，可在资源管理器 / Finder 中打开并选中该文件——前提是 Stash 运行在同一台电脑上；否则（其他电脑、手机）会复制文件路径。仅限库文件夹内的文件。（感谢 Ghboon！）"],
    ],
  },
  {
    v: "3.100.0",
    date: "2026-10-18",
    items: [
      ["ui", "Detailed rating: the window shows the picture and name of what you rate \u2013 for a performer also a few pictures of them from your library, to judge \u201cFace\u201d, \u201cBody\u201d \u2026 by. (Thanks JoeBiden!)", "详细评分：窗口顶部显示被评分对象的图片和名称——演员还会显示她/他在你库中的几张图片，方便判断“脸”“身材”等。（感谢 JoeBiden！）"],
      ["ui", "Tag fields: with nothing typed, the list is for browsing \u2013 the most used tags first, up to 200 to scroll through (typing still shows the 30 best matches). (Thanks JoeBiden!)", "标签输入框：未输入时列表用于浏览——最常用的标签在前，最多 200 个可滚动查看（输入后仍显示最匹配的 30 个）。（感谢 JoeBiden！）"],
    ],
  },
  {
    v: "3.99.0",
    date: "2026-10-18",
    items: [
      ["ui", "Performers: a \u201cLooks\u201d button opens filters for the performer\u2019s own eye color, hair color, ethnicity and country (the values your library has, with counts) \u2013 for \u201cblue eyes\u201d without relying on a tag. They stay in the address and combine with the other filters. (Thanks JoeBiden!)", "演员：新增“外貌”按钮，可按演员自身的眼睛颜色、发色、种族和国家筛选（列出你库中已有的值及数量）——不必再依赖标签来找“蓝眼睛”。筛选保存在地址中，可与其他筛选组合。（感谢 JoeBiden！）"],
      ["ui", "Quick keys on the card under the mouse (scene, image and gallery lists): E edit, T tags (add / remove), D or Delete delete \u2013 each asks or opens a form first. (Thanks JoeBiden!)", "鼠标所指卡片上的快捷键（场景、图片、图库列表）：E 编辑，T 标签（添加/移除），D 或 Delete 删除——都会先询问或打开表单。（感谢 JoeBiden！）"],
      ["ui", "Editing a performer from the internet: the found pictures are bigger, and the mouse resting on one shows it large beside the drawer. (Thanks JoeBiden!)", "从网上编辑演员：找到的图片更大，鼠标停在某张图片上时会在抽屉旁显示大图。（感谢 JoeBiden！）"],
    ],
  },
  {
    v: "3.98.0",
    date: "2026-10-18",
    items: [
      ["ui", "Fix: studio \u201cFill in from the internet\u201d found no source in many Stash versions \u2013 asking for studio scrapers (which don\u2019t exist there) made the whole question fail, so not even StashDB was offered. The StashDB-style boxes are asked on their own now. (Thanks sashi!)", "修复：在许多 Stash 版本中，工作室的“从网上填写”找不到任何来源——询问（那里并不存在的）工作室刮削器会使整个查询失败，连 StashDB 都没有列出。现在单独查询 StashDB 类的来源。（感谢 sashi！）"],
      ["ui", "The E key opens Edit on the performer, studio, gallery and tag pages and in the image viewer, like in the player. (Thanks sashi!)", "在演员、工作室、图库、标签页面以及图片查看器中，按 E 键即可打开编辑，与播放器一致。（感谢 sashi！）"],
      ["ui", "Studio editor: the logo button \u201cRemove\u201d is now \u201cDefault image\u201d \u2013 Stash shows its default image again. (Thanks sashi!)", "工作室编辑器：标志按钮“移除”改为“默认图片”——Stash 会重新显示其默认图片。（感谢 sashi！）"],
      ["ui", "Home \u2192 Customize \u2192 Sidebar: if the sidebar editor can\u2019t be built, the error is shown instead of an empty tab (so it can be reported).", "主页 \u2192 自定义 \u2192 侧边栏：如果无法构建侧边栏编辑器，现在会显示错误信息，而不是空白标签页（便于反馈）。"],
    ],
  },
  {
    v: "3.97.0",
    date: "2026-10-18",
    items: [
      ["ui", "New: Settings \u2192 Player \u2192 \u201cStart playing when a scene opens\u201d. Off, a scene waits for the play button; going on to the next video from the player still plays. (Thanks pr0nNDal!)", "新增：设置 \u2192 播放器 \u2192 \u201c打开场景时自动播放\u201d。关闭后，场景会等待你点击播放按钮；从播放器继续到下一个视频时仍会自动播放。（感谢 pr0nNDal！）"],
      ["ui", "New: Settings \u2192 General \u2192 \u201cStyle classic Stash like this interface\u201d. Off, classic Stash keeps its own look and only Stash UI is styled (the button back to Stash UI stays). (Thanks ufousox007!)", "新增：设置 \u2192 常规 \u2192 \u201c经典 Stash 采用与本界面相同的外观\u201d。关闭后，经典 Stash 保持自己的外观，只有 Stash UI 使用此外观（返回 Stash UI 的按钮保留）。（感谢 ufousox007！）"],
      ["ui", "Image viewer: dragging with the mouse turns the page like a swipe (the picture follows the mouse), the next picture is loaded before it is shown (no blank flash between two images), and Settings \u2192 Player has a page-turning animation: fade, slide in, zoom in or none. Arrow keys and finger swipes worked before. (Thanks ufousox007!)", "图片查看器：用鼠标拖动即可像滑动一样翻页（图片跟随鼠标），下一张图片会先加载好再显示（两张图片之间不再闪白），设置 \u2192 播放器中新增翻页动画：淡入、滑入、放大进入或无。方向键和手指滑动此前已可用。（感谢 ufousox007！）"],
      ["ui", "Versus: performers can be filtered by gender (only women \u2026). (Thanks Ghboon!)", "对战：演员可按性别筛选（只看女性\u2026）。（感谢 Ghboon！）"],
      ["ui", "Fix: when every duplicate group was hidden, the \u201cShow x hidden groups again\u201d button disappeared \u2013 it stays now. (Thanks Ghboon!)", "修复：隐藏了全部重复组后，“重新显示 x 个已隐藏的组”按钮会消失——现在会保留。（感谢 Ghboon！）"],
      ["ui", "The favorite button on a performer says what a click does: \u201cAdd to favorites\u201d / \u201cRemove from favorites\u201d (also the heart on the cards). (Thanks sashi!)", "演员页的收藏按钮现在直接说明点击的效果：“加入收藏”/“从收藏中移除”（演员卡片上的心形也一样）。（感谢 sashi！）"],
    ],
  },
  {
    v: "3.96.0",
    date: "2026-10-18",
    items: [
      ["ui", "Edit → Fill in from the internet: a checkbox \u201cLook up by file hash (oshash / phash / md5)\u201d asks the source for the scene by its file fingerprints instead of its title (the title box is greyed out while it is ticked; the choice is remembered). (Thanks AffordObedienceUntamed!)", "编辑 → 从网上填写：新增复选框“按文件哈希查找（oshash / phash / md5）”，按文件指纹而不是标题向来源查询场景（勾选时标题框变灰；该选择会被记住）。（感谢 AffordObedienceUntamed！）"],
      ["pmv", "Clip speed follows the music (experimental) now picks the scene for its speed, not only the spot in it, and keeps its speed maps between shows (in the browser) – from the second show on the first clips already fit the music. The speed measure copes with very fast motion; the clip info (I) shows each clip's speed. (Thanks PepegaSan!)", "“片段速度跟随音乐”（实验性）现在会按速度挑选场景，而不只是场景中的位置，并在两次放映之间保留速度图（保存在浏览器中）——从第二次放映起，开头的片段就已经符合音乐。速度测量能应对非常快的动作；片段信息（I）显示每个片段的速度。（感谢 PepegaSan！）"],
      ["pmv", "New: Motion on the beat (experimental, off by default). The rhythm of the motion in each clip is measured and lined up with the beat – a clip comes in on a turn of the motion and plays up to 12 % faster or slower. (Thanks PepegaSan!)", "新增：动作踩点（实验性，默认关闭）。会测量每个片段中动作的节奏并与节拍对齐——片段从动作的转折点进入，播放速度最多快或慢 12 %。（感谢 PepegaSan！）"],
      ["pmv", "No more clips from a scene's intro (studio logo, titles): picked spots start after it (your markers are not affected), and a clip that reaches the end of its scene turns back to its start instead of looping into the intro. (Thanks PepegaSan!)", "不再截取场景片头（工作室标志、标题）的片段：挑选的位置从片头之后开始（你的标记不受影响），到达场景结尾的片段会回到自己的起点，而不是循环到片头。（感谢 PepegaSan！）"],
    ],
  },
  {
    v: "3.95.1",
    date: "2026-10-14",
    items: [
      ["ui", "Smoother scrolling in the Liquid glass look: the cards of long lists (scene cards, tag cards, performer cards, tier and extension badges, tagger rows) no longer carry their own blur filter – with hundreds of cards it was recalculated on every scrolled frame and could drop scrolling to about 15 fps. The glass look stays (translucent fill, light edge); the blur remains on the big panels.", "液态玻璃外观下滚动更流畅：长列表中的卡片（场景卡片、标签卡片、演员卡片、等级和扩展徽章、标记器行）不再各自带有模糊滤镜——卡片多达数百张时，每滚动一帧都要重新计算，可能使滚动降到约 15 帧。玻璃外观保留（半透明填充、浅色边缘）；大面板仍保留模糊。"],
    ],
  },
  {
    v: "3.95.0",
    date: "2026-10-14",
    items: [
      ["ui", "Duplicates (pull request by Fixik071): a “Select …” menu ticks copies by a rule in every group – all but the highest resolution, all but the largest file, the oldest or the newest file – and “Delete selected (N)” removes them all after one question, in batches with progress (also the groups below “Show more”). It warns when every copy of a group is ticked. When Stash refuses a file (e.g. “file name too long”), the others still go and the failed ones stay ticked with the reason on their card. Replaces the simpler selection of 3.93.0.", "重复项（Fixik071 的拉取请求）：“选择 …”菜单按规则勾选每组中的副本——除最高分辨率外的全部、除最大文件外的全部、最旧或最新的文件——然后“删除所选 (N)”只需确认一次，分批删除并显示进度（包括“显示更多”下方的组）。若某组的所有副本都被勾选会给出警告。当 Stash 拒绝某个文件（如“文件名过长”）时，其余文件仍会删除，失败的保持勾选并在卡片上显示原因。取代 3.93.0 中较简单的选择方式。"],
      ["ui", "Performer page (pull request by Fixik071): the performer's Stash IDs show up as links to their page on StashDB, ThePornDB and any other configured stash-box.", "演员页面（Fixik071 的拉取请求）：演员的 Stash ID 会显示为指向 StashDB、ThePornDB 及其他已配置 stash-box 上其页面的链接。"],
      ["ui", "Player (pull request by AffordObedienceUntamed): the controls keep taking clicks for a moment after they fade out, and a click counts as activity – skipping 10 seconds every second or two no longer pauses the video by accident.", "播放器（AffordObedienceUntamed 的拉取请求）：控制栏淡出后仍会短暂接受点击，且点击算作操作——每隔一两秒跳过 10 秒时不再误暂停视频。"],
      ["ui", "Versus (pull request by magz-hash): an “Exclude tag” field keeps scenes, images, performers or moments with certain tags out of the pool, and two new match options set how long moments play at least and how often scene previews jump to a new spot.", "对决（magz-hash 的拉取请求）：新增“排除标签”字段，可将带有某些标签的场景、图片、演员或片段排除在候选池之外；另有两个对决选项，设置片段至少播放多久以及场景预览多久跳到新位置。"],
      ["pmv", "Clip speed follows the music (experimental, off by default; pull request by PepegaSan): fast, busy music gets clips with fast motion, calm music slow ones. The music's pace per beat is measured, and the fast and calm spots of each scene are found in Stash's scene previews. Also in Media Storm's copy of the beat analysis.", "片段速度跟随音乐（实验性，默认关闭；PepegaSan 的拉取请求）：快速、密集的音乐配快速运动的片段，平静的音乐配缓慢的片段。会测量每拍的音乐节奏，并在 Stash 的场景预览中找出每个场景的快慢位置。Media Storm 的节拍分析副本同步更新。"],
    ],
  },
  {
    v: "3.94.1",
    date: "2026-10-14",
    items: [
      ["ui", "Scene cards now look like the cards of classic Stash: studio logo on the picture (top right), rating (bottom left), resolution and length (bottom right); below it the title, the date, a piece of the details and a row of small icon buttons with numbers – performers, tags, galleries (the mouse resting on one, or a click, opens the list) – plus plays, O counter and “organized”. Thanks to finn.", "场景卡片现在与经典 Stash 的卡片一致：图片上有工作室徽标（右上）、评分（左下）、分辨率和时长（右下）；下方是标题、日期、详情摘要，以及一排带数字的小图标按钮——演员、标签、图库（鼠标停留或点击即可打开列表）——还有播放次数、O 计数和“已整理”。感谢 finn。"],
    ],
  },
  {
    v: "3.94.0",
    date: "2026-10-14",
    items: [
      ["ui", "Scenes can be shown as cards: next to the sound button there is a Tiles / Cards switch. A card has the picture (hover preview as before) with the title, studio, date, performers, tags, rating and file facts below it. The size slider sets the card width. Thanks to finn.", "场景可以显示为卡片：声音按钮旁新增“平铺/卡片”切换。卡片在图片（悬停预览同前）下方显示标题、工作室、日期、演员、标签、评分和文件信息。大小滑块调整卡片宽度。感谢 finn。"],
      ["ui", "Tags can be shown as cards (List / Cards switch on the Tags page): the tag's picture or its initial, name and counts – and when the mouse rests on a card, a random marker of that tag plays over it. Thanks to redignium.", "标签可以显示为卡片（标签页上的“列表/卡片”切换）：显示标签的图片或首字母、名称和数量——鼠标停在卡片上时，会播放该标签的一个随机标记。感谢 redignium。"],
      ["ui", "Tasks → Identify: bulk identify of your scenes by their fingerprints in your StashDB-style boxes and scrapers – choose the sources (tried from the top), what to fill in, keep or overwrite existing values, create missing performers/studios/tags, skip unclear matches, optionally only some folders. Needs the sources set up in classic Stash; only tested against the demo server here, not a real Stash. Thanks to finn.", "任务 → 识别：通过指纹在 StashDB 类站点和抓取器中批量识别场景——可选择来源（从上往下尝试）、要填写的内容、保留或覆盖已有值、创建缺失的演员/工作室/标签、跳过不确定的匹配，也可只处理部分文件夹。需要先在经典 Stash 中设置好来源；这里只在演示服务器上测试过，未在真实 Stash 上测试。感谢 finn。"],
    ],
  },
  {
    v: "3.93.0",
    date: "2026-10-14",
    items: [
      ["ui", "Clip cutter: after saving, the clips now really get the original's performers, tags and studio (and the tag “Clip”). Before, the step was skipped quietly when Stash hadn't finished adding the new file – now it waits up to a minute for each clip and says so if a clip never showed up. Also fixes the Python “invalid escape sequence” warning in Stash's log. Thanks to tvzndro.", "剪辑裁切：保存后，剪辑现在确实会带上原视频的演员、标签和工作室（以及标签“Clip”）。此前如果 Stash 还没添加新文件，这一步会被悄悄跳过——现在每个剪辑最多等待一分钟，若仍未出现会明确提示。同时修复了 Stash 日志里 Python 的“无效转义序列”警告。感谢 tvzndro。"],
      ["ui", "Duplicates: tick the copies you want to get rid of (checkbox on each one, or “Select all but the best” for every group at once) and delete them with a single question – no more three clicks per scene. Thanks to tvzndro.", "重复项：勾选要删除的副本（每个副本上有复选框，或用“选择除最佳外的全部”一次选中所有组），只需确认一次即可删除——不必再为每个场景点三次。感谢 tvzndro。"],
      ["ui", "Sort order as the default: a “Make default” button next to the sort control of Scenes, Images, Galleries, Performers, Studios, Groups and Tags (and the list pages of a tag, performer or studio) – the page then opens with that sort every time (kept in this browser). Click again to remove it. Thanks to redignium.", "默认排序：场景、图片、图库、演员、工作室、群组和标签（以及标签、演员、工作室的列表页）的排序控件旁新增“设为默认”按钮——之后每次打开该页面都使用该排序（保存在此浏览器中）。再次点击可取消。感谢 redignium。"],
      ["ui", "Scene cards can show the resolution (1080p, 720p …) next to the length: Settings → This interface → “Resolution on scene cards”. Thanks to redignium.", "场景卡片可以在时长旁显示分辨率（1080p、720p……）：设置 → 此界面 →“场景卡片上显示分辨率”。感谢 redignium。"],
      ["ui", "The scene's info panel now shows the studio (logo and name, a link to the studio page). Thanks to finn.", "场景信息面板现在会显示工作室（徽标和名称，可链接到工作室页面）。感谢 finn。"],
      ["ui", "Parts of a scene with a start and an end are drawn as coloured bars on the timeline – every main tag has its own colour (pins and rows in the list share it), and neighbouring parts alternate in shade so you can see where one ends and the next begins. In the marker list, hovering a marker shows its preview picture next to it. Thanks to redignium.", "带开始和结束的场景片段在时间轴上以彩色条显示——每个主标签有自己的颜色（图钉和列表中的行使用同一种颜色），相邻片段交替深浅，便于看出一个在哪里结束、下一个从哪里开始。在标记列表中悬停某个标记时，会在旁边显示其预览图。感谢 redignium。"],
    ],
  },
  {
    v: "3.92.2",
    date: "2026-10-14",
    items: [
      ["ui", "Translations: the bubble that pops up in the corner when you switch the end-of-video mode (In order / Random order / Repeat …) is now translated, and so are the default criteria and groups of the detailed rating (Production Quality, Chemistry … Face, Body, Technique …) in the rating window, the scene and performer chips, the filter and the sort list. Names you typed yourself stay as they are. Thanks to ufousox007 for spotting it.", "翻译：切换视频结束方式（顺序播放/随机播放/循环…）时角落弹出的气泡现已翻译；详细评分的默认评分项和分组（制作质量、化学反应……脸蛋、身材、技巧等）在评分窗口、场景和演员标签、筛选及排序列表中也已翻译。您自己输入的名称保持不变。感谢 ufousox007 的发现。"],
    ],
  },
  {
    v: "3.92.1",
    date: "2026-10-12",
    items: [
      ["ui", "Performers on a scene, image or gallery: the red × now asks before it takes a performer off. On touch screens the × is gone – hold the performer's card (it turns red), let go, and the question comes. Thanks to ufousox007 for the report.", "场景、图片或图库中的演员：点击红色 × 现在会先确认再移除。触屏上不再显示 ×——按住演员卡片（变红）后松开，即会出现确认。感谢 ufousox007 的反馈。"],
    ],
  },
  {
    v: "3.92.0",
    date: "2026-10-12",
    items: [
      ["ui", "Phone player: holding a finger on the picture plays at 2× while it stays down (back to normal when you let go; swiping still seeks). “From the start” in the corner is a real button again (not just underlined text). Thanks to ufousox007 for the ideas.", "手机播放器：手指按住画面时以 2 倍速播放，松开恢复正常（滑动仍用于快进/快退）。角落里的“从头开始”重新成为真正的按钮（不再只是带下划线的文字）。感谢 ufousox007 的建议。"],
      ["ui", "Performer editor on touch screens: the red Delete button has to be held for a moment (it fills up), then the usual confirmation comes – no more accidental taps.", "触屏上的演员编辑器：红色“删除”按钮需要按住片刻（会逐渐填满），然后才出现常规确认——不会再误触。"],
      ["ui", "Videos that Stash transcodes live (quality menu): the bar now shows the scene's full length and you can jump anywhere – outside what is loaded, the stream is asked to start at that second (start=). Not verified against a real Stash yet.", "由 Stash 实时转码的视频（画质菜单）：进度条现在显示场景的完整时长并可跳到任意位置——超出已加载的部分时会请求从该秒开始的流（start=）。尚未在真实 Stash 上验证。"],
      ["ui", "Settings → Player and previews: new switch “Reverse the wheel” – up = quieter / back, down = louder / forward.", "设置 → 播放器与预览：新增开关“反转滚轮方向”——向上 = 减小音量/后退，向下 = 增大音量/前进。"],
    ],
  },
  {
    v: "3.91.5",
    date: "2026-10-12",
    items: [
      ["ui", "Chinese (and the other languages): the “Start” button on the Tasks page, in the clip cutter, the marker editor, Phone upload and Sharing no longer reads “Home” – only the menu entry that leads to the start page keeps that word. Thanks to ufousox007 for spotting it.", "中文（及其他语言）：任务页、剪辑裁切、标记编辑、手机上传和共享中的“开始”按钮不再显示为“主页” – 只有通往起始页的菜单项仍使用该词。感谢 ufousox007 指出。"],
    ],
  },
  {
    v: "3.91.4",
    date: "2026-10-12",
    items: [
      ["ui", "Sharing: a new “Guide” tab explains how everything works, how to set up Tailscale (fixed address) and cloudflared (address changes, links can stop working) and what to keep in mind. A link in a Tailscale message (e.g. to allow Funnel) is clickable now.", "共享：新增“指南”标签页，说明各项功能、如何设置 Tailscale（固定地址）和 cloudflared（地址会变，链接可能失效）以及注意事项。Tailscale 消息中的链接（例如允许 Funnel）现在可以点击。"],
    ],
  },
  {
    v: "3.91.3",
    date: "2026-10-12",
    items: [
      ["ui", "Sharing: your profile picture can now be cut out of a picture or a scene frame of your library (square crop) – or uploaded as before. And typing in the search box when you choose what to send is no longer interrupted while the pictures below load.", "共享：头像现在可以从媒体库的图片或场景画面中裁剪（方形裁剪），也可以像以前一样上传。选择要发送的内容时，在搜索框输入不再被下方图片的加载打断。"],
    ],
  },
  {
    v: "3.91.2",
    date: "2026-10-12",
    items: [
      ["ui", "Sharing → Internet access: an “Install cloudflared” button (Windows) installs the Cloudflare tunnel program with Windows' own package manager, after a confirmation – so the internet button works without Tailscale.", "共享 → 互联网访问：新增“安装 cloudflared”按钮（Windows），确认后用 Windows 自带的包管理器安装 Cloudflare 隧道程序 – 这样没有 Tailscale 也能使用互联网按钮。"],
    ],
  },
  {
    v: "3.91.1",
    date: "2026-10-12",
    items: [
      ["ui", "Sharing → Internet access: when Tailscale is installed but not connected (message “NoState”), a Cloudflare tunnel is used instead if cloudflared is installed – otherwise you are told to open Tailscale and sign in.", "共享 → 互联网访问：如果已安装 Tailscale 但未连接（提示 “NoState”），且装有 cloudflared，就改用 Cloudflare 隧道 – 否则会提示你打开 Tailscale 并登录。"],
    ],
  },
  {
    v: "3.91.0",
    date: "2026-10-12",
    items: [
      ["ui", "Sharing (Manage → Sharing): give people a link and they send you photos, videos and messages – or use their links to send yours. Your name and picture, tags you like and don't want (checked when a file arrives and shown to the sender), permanent or expiring links you can switch off or delete any time, an inbox where nothing reaches your library before you accept it (blurred previews, accept, reject, block), saved links of others with a picker for what fits their taste, and a chat. Everything goes directly between the PCs – no server of ours. A button under “Public address” makes your links work from the internet (Tailscale Funnel or a Cloudflare tunnel, if installed) and switches it off again. Setup and security notes are in the README.", "共享（管理 → 共享）：把链接给别人，他们就能给你发照片、视频和消息 – 也可以用他们的链接发送你的内容。包括你的名字和头像、你喜欢和不想要的标签（文件到达时检查，并向发送者显示）、可随时关闭或删除的永久或限时链接、在你接受之前任何内容都不会进入媒体库的收件箱（模糊预览、接受、拒绝、屏蔽）、保存他人的链接并按其喜好挑选内容，以及聊天。一切都在电脑之间直接传输 – 没有我们的服务器。“公开地址”下的按钮可让链接从互联网访问（需已安装 Tailscale Funnel 或 Cloudflare 隧道），并可再次关闭。设置与安全说明见 README。"],
    ],
  },
  {
    v: "3.90.0",
    date: "2026-10-12",
    items: [
      ["ui", "Russian (Русский): Stash UI is now also available in Russian, with the correct plural forms (1 сцена, 2 сцены, 5 сцен, 21 сцена). It follows Stash's own interface language, or pick it under Settings → This interface → Language. Thanks to Fixik071.", "俄语（Русский）：Stash UI 现已支持俄语，并带有正确的复数形式（1 сцена、2 сцены、5 сцен、21 сцена）。会跟随 Stash 自身的界面语言，也可在“设置 → 此界面 → 语言”中选择。感谢 Fixik071。"],
      ["pmv", "PMV Generator 2.30.0: with “Best moments” the clips now follow the music – calm parts get calmer clips, loud parts and drops the busiest ones – scenes with a funscript count how fast it is at that spot, and spots a scene was just shown from are avoided. Thanks to PepegaSan.", "PMV Generator 2.30.0：开启“最佳时刻”后，片段会跟随音乐 – 平缓的部分用较平静的片段，响亮的部分和高潮用最激烈的片段；带 funscript 的场景还会参考该处的速度，并避开该场景刚用过的位置。感谢 PepegaSan。"],
      ["pmv", "PMV Generator 2.30.0: RedGifs creators with their own tags – add a creator, then pick the tags to use from the ones they really use (all of them or any of them), and only their clips with those tags come. Thanks to PepegaSan.", "PMV Generator 2.30.0：RedGifs 创作者可附带自己的标签 – 添加创作者后，从其实际使用的标签中选择（全部或任一），就只会出现其带这些标签的片段。感谢 PepegaSan。"],
    ],
  },
  {
    v: "3.89.1",
    date: "2026-10-12",
    items: [
      ["pmv", "PMV Generator 2.29.1: RedGifs tags you pick bring clips with that tag again – RedGifs had stopped understanding the old way of asking and sent its trending clips instead.", "PMV Generator 2.29.1：所选的 RedGifs 标签重新只带来含该标签的片段 – RedGifs 已不再支持旧的请求方式，之前返回的是热门片段。"],
      ["storm", "Media Storm 2.8.1: the same fix for RedGifs tags in the storm – a tag now brings videos with that tag, not RedGifs' trending ones.", "Media Storm 2.8.1：风暴中的 RedGifs 标签同样已修复 – 现在只会出现带该标签的视频，而不是 RedGifs 的热门视频。"],
    ],
  },
  {
    v: "3.89.0",
    date: "2026-10-11",
    items: [
      ["ui", "Player on phones: a swipe left or right across the picture jumps back or forward (the further, the more – a full width is one to five minutes, depending on the video's length; a note shows where it goes). The 10-second buttons are gone there to make room, titles are smaller, the “Resume at …” note is a small pill in the corner with “From the start” as a text button, and the gear menu (quality, subtitles, speed) opens as a sheet at the bottom of the screen – before, it was cut off above the short picture and hidden behind the info bar.", "手机上的播放器：在画面上向左或向右滑动即可后退或快进（滑得越远跳得越多——整个宽度约为一到五分钟，取决于视频长度；会有提示显示跳到哪里）。为节省空间，手机上去掉了 10 秒按钮，标题更小，“从 … 继续”提示变成角落里的小标签，“从头开始”改为文字按钮；齿轮菜单（画质、字幕、速度）现在从屏幕底部弹出——以前它在较矮的画面上方被截断，并被信息栏遮住。"],
      ["ui", "For plugin authors: stashui.play(scenes, index) opens a scene from a plugin's own list – next / previous and the end of a video then go on in that list. (Contributed by PepegaSan.)", "面向插件作者：stashui.play(scenes, index) 可从插件自己的列表中打开场景——之后的上一个 / 下一个以及视频结束后都会在该列表中继续。（由 PepegaSan 贡献。）"],
      ["pmv", "PMV Generator 2.29.0: with only a few matching clips (e.g. a high minimum rating) all of them come up again instead of mostly one. Copies of one clip no longer crowd out the others, “Clip shape per layout” takes turns between the clips of that shape, a clip being loaded twice at once gets its own address, and a clip that only loaded too slowly gets two more chances. (Contributed by PepegaSan.)", "PMV 生成器 2.29.0：匹配的片段很少时（例如设置了较高的最低评分），现在所有片段都会轮流出现，而不是几乎只有一个。同一片段的多个副本不再挤掉其他片段，“每种布局的片段形状”会在该形状的片段之间轮换，同时加载两次的片段会使用各自的地址，仅因加载太慢而失败的片段还会再获得两次机会。（由 PepegaSan 贡献。）"],
    ],
  },
  {
    v: "3.88.0",
    date: "2026-10-11",
    items: [
      ["ui", "Markers page: new button “Original quality” – the hover preview is then cut from the original video (from the marker's start to its end, looping; 8 s if it has no end) instead of Stash's small generated preview, so it is sharp. It loads slower, because the real file is read.", "“标记”页面：新增“原始画质”按钮——悬停预览会直接取自原始视频（从标记起点到终点，循环播放；没有终点时为 8 秒），而不是 Stash 生成的小预览，因此更清晰。由于要读取真实文件，加载会更慢。"],
    ],
  },
  {
    v: "3.87.2",
    date: "2026-10-10",
    items: [
      ["ui", "Markers page: tiles now sit in rows like on the Scenes page – every row has one height and each tile is as wide as its video's shape needs (upright, wide or square), so there are no more gaps between wide and upright tiles. The size slider now sets the row height.", "“标记”页面：卡片现在像“场景”页面一样按行排列——每行高度一致，每张卡片的宽度由视频自身的形状决定（竖屏、横屏或方形），因此横屏和竖屏卡片之间不再有空隙。大小滑块现在调整的是行高。"],
    ],
  },
  {
    v: "3.87.1",
    date: "2026-10-10",
    items: [
      ["ui", "Fixed: upright videos on the Markers page. Their tiles were wide and zoomed into the middle of the picture, so you saw almost nothing – now a marker of an upright video gets an upright tile in the video's own shape (the size slider still sets the width).", "已修复：“标记”页面中的竖屏视频。它们的卡片是横向的，并放大到画面中间，几乎什么都看不到——现在竖屏视频的标记会使用与视频自身比例相同的竖向卡片（大小滑块仍可调整宽度）。"],
    ],
  },
  {
    v: "3.87.0",
    date: "2026-10-10",
    items: [
      ["ui", "Smooth slow motion in the player. The speed menu (gear) now goes down to 0.25× and 0.1×, and below 1× the pictures in between are made up so it stays fluid instead of stuttering: “Motion” follows the movement of the picture (block matching on the graphics card, WebGL – no model, nothing to download), “Blend” only cross-fades, “Off” plays the plain video. Where the motion doesn't fit (cuts, things appearing) it falls back to the blend. Not for VR videos; needs a browser with WebGL 2.", "播放器中的流畅慢动作。速度菜单（齿轮）现在可以降到 0.25× 和 0.1×；低于 1× 时会补出中间的画面，使画面保持流畅而不是卡顿：“运动跟随”会跟踪画面的运动（在显卡上做块匹配，WebGL——无需模型，无需下载任何东西），“混合”只做交叉淡化，“关”则播放原始视频。运动无法匹配的地方（切镜头、物体出现）会回退到混合。不适用于 VR 视频；需要支持 WebGL 2 的浏览器。"],
    ],
  },
  {
    v: "3.86.0",
    date: "2026-10-10",
    items: [
      ["ui", "Mouse wheel in the player: turning the wheel over the picture changes the volume (5 % per notch); with Shift it jumps 5 s instead. Settings → Player and previews → “Mouse wheel on the video” switches between volume, jumping and off. (Asked for by a user who relied on the VideoScrollWheel plugin of classic Stash, which can't reach the new player.)", "播放器中的鼠标滚轮：在画面上滚动滚轮可调节音量（每格 5%）；按住 Shift 则改为跳转 5 秒。在“设置 → 播放器和预览 → 视频上的鼠标滚轮”中可切换为音量、跳转或关闭。（应一位依赖经典 Stash 的 VideoScrollWheel 插件的用户的请求而加入，该插件无法作用于新播放器。）"],
    ],
  },
  {
    v: "3.85.0",
    date: "2026-10-10",
    items: [
      ["ui", "The Markers page has the same bar as the Scenes page: search, sort order and its direction button, hover previews on / off, sound on / muted (the same switches as for scenes) and a size slider for the cards. Sort, direction and search stay in the address.", "“标记”页面现在拥有与“场景”页面相同的工具栏：搜索、排序及其方向按钮、悬停预览开/关、声音开/静音（与场景使用同一开关）以及卡片大小滑块。排序、方向和搜索会保留在地址中。"],
    ],
  },
  {
    v: "3.84.2",
    date: "2026-10-10",
    items: [
      ["ui", "Marker hover previews now play with sound (the same “Sound in previews” switch as for scenes). Stash only puts sound into a preview if Settings → Tasks → “Audio in previews” was on when it was made – previews made before stay silent; make them again with “Overwrite existing” in the Generate task.", "标记的悬停预览现在带声音（与场景使用同一个“预览声音”开关）。只有生成预览时“预览中的音频”已开启，Stash 才会把声音放进预览——之前生成的预览仍然没有声音；请在“生成”任务中勾选“覆盖现有”重新生成。"],
    ],
  },
  {
    v: "3.84.1",
    date: "2026-10-10",
    items: [
      ["ui", "Fixed: marker hover previews. The Markers page asked Stash for the animated picture (WebP) of a marker and tried to play it as a video, so nothing moved – now it plays the marker's video preview (MP4), which Stash makes with “Marker previews”.", "已修复：标记的悬停预览。“标记”页面向 Stash 请求的是标记的动画图片（WebP），却把它当作视频播放，所以没有任何动画——现在改为播放标记的视频预览（MP4），它由 Stash 的“标记预览”生成。"],
    ],
  },
  {
    v: "3.84.0",
    date: "2026-10-10",
    items: [
      ["ui", "Previews on demand. New markers (key B, “Add a part …”) and edited ones now get their hover preview and picture made by Stash right after saving. On the Markers page, “Generate missing previews” makes them for all markers that have none. In the selection bar of the Scenes and Images pages (and on the home page), “Generate previews” makes the missing hover previews, timeline images, covers and thumbnails of just the selected items – no need to run the whole library from Tasks. Progress shows under Tasks.", "按需生成预览。新建的标记（按 B、“添加片段 …”）和编辑过的标记，保存后会立即由 Stash 生成悬停预览和图片。在“标记”页面，“生成缺失的预览”会为所有没有预览的标记生成。在场景和图片页面（以及首页）的选择栏中，“生成预览”只为所选项目生成缺失的悬停预览、时间轴图片、封面和缩略图——无需在“任务”中处理整个库。进度显示在“任务”中。"],
    ],
  },
  {
    v: "3.83.1",
    date: "2026-10-10",
    items: [
      ["pmv", "PMV Generator 2.28.0: main tags. Under What → Main tags you can name tags (e.g. a model) that every clip must have – the normal Tags below only count together with them, also with “Any of the tags”. Clips are drawn from the scenes or images that have the main tags and any of the other tags. (Contributed by PepegaSan.)", "PMV Generator 2.28.0：主标签。在“内容”→“主标签”中可以指定每个片段都必须带有的标签（例如某位模特）——下面普通的标签只在与它们同时满足时才生效，选择“任一标签”时也一样。片段取自同时带有主标签和其他任一标签的场景或图片。（由 PepegaSan 贡献。）"],
    ],
  },
  {
    v: "3.83.0",
    date: "2026-10-10",
    items: [
      ["ui", "Performer cards in the player's info bar: the performer's pill shows the age in this scene, and hovering a performer opens a card with photo, gender, country, number of scenes, age on the scene's date, age now and birth date. (Contributed by AffordObedienceUntamed.)", "播放器信息栏中的演员卡片：演员标签上显示其在该场景中的年龄；鼠标悬停在演员上会弹出卡片，显示照片、性别、国家、场景数、拍摄时年龄、现年和出生日期。（由 AffordObedienceUntamed 贡献。）"],
      ["ui", "Frame-exact markers: the keys , and . step the video one frame back / forward; B sets a marker on the frame you see. The marker editor shows times to the millisecond, has −1 s / −0.1 / frame / +0.1 / +1 s buttons (hold to repeat) and ↑ ↓ in the fields (Shift = second, Alt = tenth); the video follows. The tag lists in the editor show the three tags you used last on top. (Contributed by AffordObedienceUntamed.)", "精确到帧的标记：按 , 和 . 让视频逐帧后退/前进；按 B 会在你看到的那一帧设置标记。标记编辑器显示精确到毫秒的时间，提供 −1 秒 / −0.1 / 帧 / +0.1 / +1 秒按钮（按住可连续），输入框中可用 ↑ ↓（Shift = 一秒，Alt = 十分之一秒），视频会跟随。编辑器中的标签列表会把你最近用过的三个标签放在最前面。（由 AffordObedienceUntamed 贡献。）"],
    ],
  },
  {
    v: "3.82.2",
    date: "2026-10-10",
    items: [
      ["ui", "Fixed: the list jumped back to the top. After you had changed the sorting, a filter or the search of a list, opening a scene or an image and coming back (Esc or Back) built the list again from the start – so you had to scroll down and find your place again. It now stays exactly where it was. The same after editing several selected items together: only their cards are refreshed instead of reloading the whole list.", "已修复：列表跳回顶部。更改了列表的排序、筛选或搜索后，打开某个场景或图片再返回（Esc 或后退），列表会从头重新构建——你得重新往下滚动找到原来的位置。现在它会停在原来的位置。同样适用于一起编辑多个选中项目之后：只刷新它们的卡片，而不是重新加载整个列表。"],
    ],
  },
  {
    v: "3.82.1",
    date: "2026-10-09",
    items: [
      ["pmv", "PMV Generator 2.27.1: tag stages need your own song of known length. With Plex, a live app or a PMV template they used to apply no tags at all – so clips from everywhere came up although stages were set. Now the tags of all stages count together there, and a message says so.", "PMV 生成器 2.27.1：标签阶段需要你自己的、长度已知的歌曲。使用 Plex、实时应用或 PMV 模板时，它们过去完全不应用任何标签——因此尽管设置了阶段，仍会出现来自各处的片段。现在这些情况下所有阶段的标签一并生效，并会给出提示。"],
    ],
  },
  {
    v: "3.82.0",
    date: "2026-10-09",
    items: [
      ["pmv", "PMV Generator 2.27.0: more control over the cuts, and for shows with several songs. Cutting → Timing → “Shortest clip” and “Longest clip” (in beats, off by default): a clip stays on screen at least / at most that many beats – no more clips that come and go on the next beat. New clips without stopping the music: the new button in the bar (or the R key). With several songs or Plex: “New clips for every song” (Clip order), “Again for every song” – intro and outro come again for each song (Output → Title cards) – and “One video per song” (Output → Recording), which cuts the recording into one video per song, each one to download or save to Stash on its own. Marker clips with an end now stay inside their marker instead of playing on into the rest of the scene, and the clip info (I) shows each clip's tags and, with tag stages, its stage. “Follow the scenes' timeline” is hidden for Markers and Images, where it did nothing.", "PMV 生成器 2.27.0：对剪辑和多首歌的演出有更多控制。剪辑 → 节奏 →“最短片段”和“最长片段”（以拍为单位，默认关闭）：一个片段在画面上至少/至多停留这么多拍——不再有下一拍就来了又走的片段。换新片段而不停止音乐：栏中的新按钮（或 R 键）。多首歌或 Plex 时：“每首歌换新片段”（片段顺序）、“每首歌重新片头片尾”——每首歌再次出现片头和片尾（输出 → 标题卡）——以及“每首歌一个视频”（输出 → 录制），把录制按歌曲切成多个视频，每个都可以单独下载或保存到 Stash。带结束时间的标记片段现在停留在标记之内，而不是继续播放场景的其余部分；片段信息（I）会显示每个片段的标签，使用标签阶段时还会显示其阶段。“跟随场景的时间线”在标记和图片模式下已隐藏（那里它不起作用）。"],
      ["storm", "Media Storm 2.8.0: one tag filter for everything. Under Source & filters, “Tags apply to” chooses whether the tag box edits the tags for scenes and images or for marker clips (the other kind keeps its own, a note says so). Exclude tags, “All tags must match” and “Including sub-tags (recursive)” now count for scenes, images and marker clips alike. With the recursive switch on, parent tags show up in the marker tag suggestions even when only their sub-tags have markers (off: only tags with markers of their own are offered). Marker clips also honor “Exclude tags” now.", "Media Storm 2.8.0：一个标签筛选适用于所有类型。在“来源与筛选”中，“标签应用于”决定标签框编辑的是场景和图片的标签还是标记片段的标签（另一类型保留自己的，并有提示说明）。排除标签、“必须匹配所有标签”和“包含子标签（递归）”现在对场景、图片和标记片段都有效。打开递归开关后，即使只有子标签有标记，父标签也会出现在标记标签的建议中（关闭时：只提供自身有标记的标签）。标记片段现在也遵守“排除标签”。"],
    ],
  },
  {
    v: "3.81.0",
    date: "2026-10-09",
    items: [
      ["ui", "Extension API: menu entries of plugins can say where they go (place: after / before a built-in entry, start or end) – without it, a plugin's entry now sits behind the last regular entry of its group instead of below the folder tree and saved filters. It only counts when the entry first appears; your own layout under Customize → Sidebar always wins. Inline SVG icons of plugins are sized like the others (menu and card buttons). Header slots can reload their page (ctx.reload()).", "扩展 API：插件的菜单项可以指定位置（place：放在某个内置项之前/之后，或最前/最后）——不指定时，插件的菜单项现在位于其分组最后一个常规项之后，而不再排在文件夹树和已保存筛选之下。它只在该菜单项首次出现时生效；你在 自定义 → 侧边栏 中的布局始终优先。插件的内联 SVG 图标与其他图标大小一致（菜单项和卡片按钮）。页头插槽可以重新加载其页面（ctx.reload()）。"],
    ],
  },
  {
    v: "3.80.0",
    date: "2026-10-08",
    items: [
      ["ui", "Extension API v2 for plugin authors (GitHub issue #3): plugins can now bring their own pages (#/p/<plugin>/…, also as full-screen overlays), menu entries (which Customize → Sidebar can move and hide), and slots – the list bar and toolbar, the selection bar, a section and a menu entry in the player, headers of performer, studio, tag and gallery pages, home page sections and settings screens. List cards got buttons drawn by Stash UI, a “not in the library” look, late results without rebuilding the list (invalidate) and stay on an empty list; sources can see when tier / detailed-rating filters limit a list. Shared helpers (ui, t, gql, store, on) make plugins look and behave like Stash UI. The Plugins page lists what each extension registered and its errors, with a switch to turn it off. Nothing changes for people without such a plugin. See the README, “For plugin authors”.", "面向插件作者的扩展 API v2（GitHub issue #3）：插件现在可以带来自己的页面（#/p/<插件>/…，也可作为全屏覆盖层）、菜单项（可在 自定义 → 侧边栏 中移动和隐藏）以及插槽——列表栏和工具栏、选择栏、播放器中的一个区块和一个菜单项、演员/工作室/标签/图库页面的页头、主页区块和设置页面。列表卡片新增由 Stash UI 绘制的按钮、“不在库中”的外观、无需重建列表的延迟结果（invalidate），并且在列表为空时仍会保留；来源可以得知等级/详细评分筛选限制了列表。共享的辅助功能（ui、t、gql、store、on）让插件的外观和行为与 Stash UI 一致。插件页面会列出每个扩展注册的内容及其错误，并带有关闭开关。没有此类插件的用户不受任何影响。详见 README 的“For plugin authors”。"],
    ],
  },
  {
    v: "3.79.0",
    date: "2026-10-08",
    items: [
      ["ui", "Settings that don't get lost: (1) The settings of this browser are now copied to Stash a little after they change (Settings → General → “Automatic backup in Stash”, on by default). A browser that has forgotten them – site data cleared, another address like 127.0.0.1 / localhost / the Tailscale name, a new device – gets them back by itself at start. (2) Saving shared settings (ratings, playlists, Versus …) is safer: writes now run one after the other instead of overlapping, and a read that comes back empty by mistake is no longer written over everything.", "不再丢失的设置：（1）此浏览器的设置现在会在更改后不久复制到 Stash（设置 → 常规 →“在 Stash 中自动备份”，默认开启）。忘记了设置的浏览器——清除了网站数据、换了地址（如 127.0.0.1 / localhost / Tailscale 名称）、新设备——在启动时会自动取回。（2）保存共享设置（评分、播放列表、Versus 等）更安全：写入现在依次进行而不是互相重叠，错误地返回空内容的读取也不会再覆盖所有设置。"],
    ],
  },
  {
    v: "3.78.0",
    date: "2026-10-08",
    items: [
      ["ui", "Video folders (menu → Library, next to Galleries): the video counterpart of the Galleries page. Every folder that holds videos is a card with pictures from its scenes, its name, the number of videos and its parent folder; a click opens the folder at its videos. Search, sort (A–Z, Z–A, most / fewest videos, random) and “Include subfolders” (then folders that only hold subfolders with videos appear too). On a big library nothing is counted up front: the folders come in pieces, each piece is counted first (one cheap query per folder) and folders without videos drop out.", "视频文件夹（菜单 → 媒体库，位于“图库”旁边）：图库页面的视频版本。每个包含视频的文件夹都是一张卡片，显示来自其场景的图片、名称、视频数量和上级文件夹；点击后在其视频处打开该文件夹。支持搜索、排序（A–Z、Z–A、视频最多/最少、随机）和“包含子文件夹”（此时只包含带视频的子文件夹的文件夹也会显示）。大型媒体库不会预先统计：文件夹分批载入，每一批先统计数量（每个文件夹一次很轻的查询），没有视频的文件夹会被去掉。"],
    ],
  },
  {
    v: "3.77.0",
    date: "2026-10-08",
    items: [
      ["ui", "Performers: many more sort orders – youngest / oldest first, country, ethnicity, hair color and eye color (A–Z), tallest / shortest, heaviest / lightest, fewest scenes, most images, most tags, alphabetical Z–A, oldest additions and recently changed. Stash does most of the sorting itself (with the direction); text fields it can't sort by (country, ethnicity, hair and eye color) are read once and ordered in the browser, with empty values always last.", "演员：新增许多排序方式——年龄最小/最大优先、国家、种族、发色和眼睛颜色（A–Z）、最高/最矮、最重/最轻、场景最少、图片最多、标签最多、按字母倒序、最早添加和最近更改。大部分排序由 Stash 自己完成（带方向）；Stash 无法排序的文本字段（国家、种族、发色、眼睛颜色）会一次性读取并在浏览器中排序，空值始终排在最后。"],
    ],
  },
  {
    v: "3.76.1",
    date: "2026-10-08",
    items: [
      ["ui", "Fix: the Performers list (and Studios, Groups, Markers) stopped after the first 60 entries when the screen was tall or zoomed out – the first page already reached past the bottom of the window, so the “load more” trigger never fired again and there was nothing to scroll. After every page the list now checks whether its end is still in view and loads the next page right away.", "修复：当屏幕很高或页面缩小时，演员列表（以及工作室、分组、标记）在前 60 项之后停止加载——第一页已经超出窗口底部，“加载更多”的触发器不再触发，也就没有可滚动的内容。现在每加载一页后，列表都会检查末尾是否仍在视野内，并立即加载下一页。"],
    ],
  },
  {
    v: "3.76.0",
    date: "2026-10-08",
    items: [
      ["ui", "Performer tagger (menu → Manage): the performers that are missing something – no photo, not linked to StashDB, no country or birthdate, or everyone – one row each. Look each one up by name in a StashDB-style box or a performer scraper, check what was found field by field (photo, birthdate, country, looks, links, tags …) and save. “Look up this page” searches everybody on the page and takes a result right away when it is the only one or the only one with exactly that name (nothing is saved until you press Save). Also: a scrape that Stash answers with a 401 or “too many requests” now says what that means (check the source's API key) instead of showing raw JSON – in the tagger, the scene tagger and the performer editor.", "演员标记器（菜单 → 管理）：列出缺少信息的演员——没有照片、未关联 StashDB、没有国家或生日，或所有演员——每人一行。通过名称在 StashDB 类站点或演员抓取器中查找，逐项检查找到的内容（照片、生日、国家、外貌、链接、标签……）后保存。“查找本页”会搜索页面上的所有人，当结果只有一个或只有一个名称完全相同时直接选中（在你点击保存之前不会保存任何内容）。另外：Stash 以 401 或“请求过多”回应的抓取，现在会说明含义（请检查来源的 API 密钥），而不是显示原始 JSON——在标记器、场景标记器和演员编辑器中都适用。"],
    ],
  },
  {
    v: "3.75.1",
    date: "2026-10-08",
    items: [
      ["ui", "Fix: in fullscreen, the next scene (autoplay, Next, up next) no longer throws you out of fullscreen – the page's overlay layer goes fullscreen and stays, only the player inside it is replaced. Leaving the player any other way (back, closing, another page) still ends fullscreen.", "修复：全屏时，下一个场景（自动播放、下一个、接下来播放）不再把你踢出全屏——全屏的是页面的覆盖层，它会一直保留，只替换其中的播放器。以其他方式离开播放器（返回、关闭、其他页面）仍会退出全屏。"],
    ],
  },
  {
    v: "3.75.0",
    date: "2026-10-08",
    items: [
      ["ui", "Parts of a scene with their own tags: in the player's marker list, “Add a part …” (or the edit button of a marker) opens an editor with a name, a start and an end (“Here” takes the spot you are watching), a main tag and more tags. The list shows the range and the tags of every part, and the part is a normal Stash scene marker (with end time and tags), so it also shows in Markers and in classic Stash.", "场景中带有自己标签的片段：在播放器的标记列表里点“添加片段 …”（或标记的编辑按钮），打开编辑器，可设置名称、开始和结束（“此处”取你正在观看的位置）、主标签和更多标签。列表会显示每个片段的时间范围和标签；片段本身就是普通的 Stash 场景标记（带结束时间和标签），所以也会出现在“标记”页和经典 Stash 中。"],
      ["ui", "Big libraries: the folder numbers come back, counted per level – only the folders on screen are counted (two cheap count queries each, including their subfolders), so the Folders page, a folder page and the Start page show videos and images again without reading the whole library.", "大型媒体库：文件夹数量回来了，按层级统计——只统计屏幕上显示的文件夹（每个文件夹两个很轻的计数查询，包含其子文件夹），因此“文件夹”页、文件夹页面和起始页重新显示视频和图片数量，而无需读取整个媒体库。"],
      ["pmv", "PMV Generator 2.26.0: two settings. Cutting → Timing → “Cut ahead of the beat” (0–80 ms, off by default): the picture changes a little before the beat (2 frames are about 33 ms) so it is already there when the beat hits – the zoom pulse still sits on the beat. Picture & frame → Seams and edges → “Divider width” (1–8 px at 1280 wide, 2 px as before; scales with the picture).", "PMV 生成器 2.26.0：两项新设置。剪辑 → 节奏 →“在节拍之前切换”（0–80 毫秒，默认关闭）：画面比节拍稍早一点切换（2 帧约 33 毫秒），节拍到来时画面已经就位——缩放脉冲仍然落在节拍上。画面与边框 → 接缝与边缘 →“分隔线宽度”（1280 宽时 1–8 像素，默认 2 像素与之前相同；随画面缩放）。"],
      ["ui", "The new texts of the last releases (Cut clips, Funscript section, clip shape per layout, the regrouped PMV settings, parts of a scene) are now also in Japanese, Vietnamese, French, Spanish and Polish (and German where it was missing).", "最近几个版本的新文字（切割片段、Funscript 部分、按布局设置片段形状、重新分组的 PMV 设置、场景片段）现在也有日语、越南语、法语、西班牙语和波兰语版本（德语缺失的部分也已补齐）。"],
    ],
  },
  {
    v: "3.74.1",
    date: "2026-10-07",
    items: [
      ["ui", "Big libraries: the folder tree is no longer counted (that read every scene and image and ran for minutes) – folders show without numbers and both Scenes and Images tabs are offered; the other queries that read everything (detailed ratings, tags of the week, performer tags, recalculating ratings) join the queue of at most two heavy queries.", "大型媒体库：文件夹树不再统计数量（那会读取每个场景和图片，要运行数分钟）——文件夹不显示数字，并同时提供“场景”和“图片”标签页；其他会读取全部内容的查询（详细评分、本周标签、演员标签、重新计算评分）也加入了最多同时两个的繁重查询队列。"],
    ],
  },
  {
    v: "3.74.0",
    date: "2026-10-07",
    items: [
      ["ui", "Extension hook for plugin authors: a plugin with assets/stashui.js can add its own cards to the lists (scenes, performer, studio, tag, folder pages …) – shown with their own link, badges and controls, not selectable and not counted (see the README). Also: big libraries – heavy queries (everything with “all items”, the folder counting) now run at most two at a time and drop out when you leave the page.", "为插件作者提供的扩展接口：带有 assets/stashui.js 的插件可以向列表（场景、演员、工作室、标签、文件夹页面等）添加自己的卡片——带有自己的链接、角标和控件，不可选中，也不计入数量（见 README）。另外：大型媒体库——繁重的查询（所有“全部项目”的查询、文件夹统计）现在最多同时运行两个，离开页面时会自动退出队列。"],
    ],
  },
  {
    v: "3.73.2",
    date: "2026-10-06",
    items: [
      ["ui", "The Handy no longer gives up after “device timeout” or “The Handy isn't online”: a failed command is tried once more right away, and if that fails too, Stash UI connects again by itself (every few seconds, up to about a minute), loads the script again and carries on from where the video is. A short stall of the picture (buffering) no longer stops the device right away. Also applies to the funscript of the PMV Generator.", "The Handy 在出现“设备超时”或“The Handy 不在线”后不再放弃：失败的命令会立即再试一次，若仍失败，Stash UI 会自动重新连接（每隔几秒，最多约一分钟），重新加载脚本并从视频当前位置继续。画面短暂卡顿（缓冲）不再立刻让设备停下。PMV 生成器的 funscript 同样适用。"],
    ],
  },
  {
    v: "3.73.1",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.24.0: new section “Funscript”. The PMV builds a funscript from your song – the beats become strokes, the energy decides how fast and how big – and plays it on The Handy together with the show (pause and resume follow, a playlist gets one script per song). Options: pace (follow the song, slow, normal, fast), stroke size (follow the song, small, medium, large, full), where on the stroke (low, middle, high), style (sharp or smooth), gentle strokes in calm parts, accents on the first beat of each bar and on drops, and a top speed that makes too-fast strokes smaller. When the show is over, “Save funscript” downloads the script. The connection key is the one from Stash UI → Settings → Interactive; it works with your own song files (not with Plex or a live app).", "PMV 生成器 2.24.0：新增“Funscript 脚本”部分。PMV 会根据你的歌曲生成 funscript——节拍变成冲程，能量决定快慢和大小——并与演出同步在 The Handy 上播放（暂停和继续会跟随，播放列表每首歌一个脚本）。选项：节奏（跟随歌曲、慢、正常、快）、冲程大小（跟随歌曲、小、中、大、全程）、冲程位置（低、中间、高）、风格（利落或平滑）、平静部分温和、每小节第一拍和高潮处加重音，以及最高速度（过快的冲程会变小）。演出结束后点“保存 funscript”即可下载脚本。连接密钥使用 Stash UI → 设置 → 互动里的那一个；适用于你自己的歌曲文件（不适用于 Plex 或实时应用）。"],
    ],
  },
  {
    v: "3.73.0",
    date: "2026-10-06",
    items: [
      ["ui", "New: “Cut clips” in the player. Mark the parts you want while watching (“Here” takes the current position for start and end), collect any number of clips in a list and save them as new videos – each one on its own or all joined into one. Choose Exact (re-encoded, frame-accurate) or Fast (no re-encoding, the start snaps to the nearest keyframe), optionally into a “Clips” subfolder. The new videos are scanned into Stash right away and get the original's performers, tags and studio plus the tag “Clip”. The original is never touched.", "新功能：播放器里的“剪辑片段”。边看边标记想要的部分（“此处”取当前位置作为开始和结束），把任意数量的片段放进列表，保存为新视频——每个单独保存或全部合并成一个。可选“精确”（重新编码，精确到帧）或“快速”（不重新编码，起点对齐到最近的关键帧），也可放进“Clips”子文件夹。新视频会立即扫描进 Stash，并沿用原视频的演员、标签和工作室，再加上标签“Clip”。原视频不会被改动。"],
    ],
  },
  {
    v: "3.72.3",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.23.3: “Clip shape per layout” is now strict. A layout with a rule (e.g. 3-way = landscape only) only opens once enough clips of that shape are ready – until then the show stays in the current layout – so no wrong-shaped clip slips in when the layout changes.", "PMV 生成器 2.23.3：“每种布局的片段形状”现在是严格的。带规则的布局（例如三分屏仅横屏）只有在有足够该形状的片段就绪后才会打开，在此之前保持当前布局，因此切换布局时不会再混入形状不对的片段。"],
    ],
  },
  {
    v: "3.72.2",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.23.2: “Clip shape per layout” now really sticks to the rule. The generator keeps clips of each wanted shape ready (landscape for full screen, portrait for 3-way …), picks them from your selection even if they were shown recently, and a single field that is re-cut never takes a clip of the wrong shape. Only when a layout opens and none of the right shape is ready yet, the old clip keeps running for a moment.", "PMV 生成器 2.23.2：“每种布局的片段形状”现在真正遵守规则。生成器会为每种所需形状（全屏用横屏、三分屏用竖屏……）预备足够的片段，即使近期播放过也会从你的选择中挑选；单个画面重新切换时不会再取到形状不对的片段。仅当某个布局刚打开而还没有合适形状的片段就绪时，旧片段会再播放片刻。"],
    ],
  },
  {
    v: "3.72.1",
    date: "2026-10-06",
    items: [
      ["ui", "The language list now shows the English name behind each language, e.g. “Deutsch (German)”.", "语言列表中每种语言后面现在带有英文名称，例如“Deutsch (German)”。"],
    ],
  },
  {
    v: "3.72.0",
    date: "2026-10-06",
    items: [
      ["ui", "Plugins page: plugins that have an update are listed first (press “Check for updates”), and the buttons on every plugin card are now aligned to the left instead of jumping between left, centre and right.", "插件页面：有更新的插件排在最前面（点击“检查更新”），每张插件卡片上的按钮现在统一左对齐，不再忽左忽右。"],
      ["pmv", "PMV Generator 2.23.0: new “Clip shape per layout” (Show → Layouts): choose for every layout whether it uses all clips, only landscape or only portrait – e.g. landscape in full screen, portrait in 3-way, both in 2-way. Set “Clip shape” in What to “All” so both kinds are loaded; if no clip of the wanted shape is ready, another one is used so the show never stalls.", "PMV 生成器 2.23.0：新增“每种布局的片段形状”（显示 → 布局）：可为每种布局选择使用全部片段、仅横屏或仅竖屏——例如全屏用横屏、三分屏用竖屏、双分屏两种都用。请把“内容”里的“片段形状”设为“全部”以加载两种片段；如果没有符合形状的片段就绪，会改用其他片段，不会卡住。"],
    ],
  },
  {
    v: "3.71.0",
    date: "2026-10-06",
    items: [
      ["ui", "Six new languages: Japanese (日本語), Vietnamese (Tiếng Việt), French (Français), Spanish (Español), German (Deutsch) and Polish (Polski). Pick one under Settings → This interface → Language – or leave it on Automatic, then it follows the language set in Stash. Polish even counts correctly (1 scena, 2 sceny, 5 scen). The patch notes on this page stay in English and Chinese for now.", "新增六种语言：日语（日本語）、越南语（Tiếng Việt）、法语（Français）、西班牙语（Español）、德语（Deutsch）和波兰语（Polski）。在“设置 → 此界面 → 语言”中选择，或保持“自动”，此时会跟随 Stash 中设置的语言。波兰语的数量词也能正确变化（1 scena、2 sceny、5 scen）。本页的更新说明暂时仍只有英文和中文。"],
      ["pmv", "PMV Generator 2.22.0: translated into the same six languages.", "PMV 生成器 2.22.0：已翻译成同样的六种语言。"],
      ["storm", "Media Storm 2.7.0: translated into the same six languages.", "媒体风暴 2.7.0：已翻译成同样的六种语言。"],
    ],
  },
  {
    v: "3.70.3",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.21.3: the lines between the fields of a split screen are thinner now (2 px at 720p, 3 px at 1080p instead of 4 px), so the clips sit closer together.", "PMV 生成器 2.21.3：分屏中各区域之间的分隔线更细了（720p 为 2 像素，1080p 为 3 像素，原来是 4 像素），片段之间更紧凑。"],
    ],
  },
  {
    v: "3.70.2",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.21.2: with “Fit”, a clip whose shape is only a little off the field's (up to about 16 %) now fills the field – a few percent are cropped – instead of showing thin blurred bars at the sides that the zoom pulse covered and uncovered again. Clips with a very different shape still get their bars.", "PMV 生成器 2.21.2：使用“适应”时，如果片段形状与画面区域只有轻微差异（约 16% 以内），现在会直接填满该区域（裁掉几个百分点），而不再露出两侧细窄的模糊边条（缩放脉冲会反复盖住又露出它们）。形状差异很大的片段仍保留边条。"],
    ],
  },
  {
    v: "3.70.1",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.21.1: fixed – a new clip no longer zooms out into the field (that showed borders). The zoom-in entry now always zooms in, alternating a strong and a soft zoom. The zoom pulse itself only ever zooms in.", "PMV 生成器 2.21.1：已修复——新片段不再缩小进入画面（那样会露出边框）。“放大进入”现在始终是放大，强弱交替。缩放脉冲本身也只会放大。"],
    ],
  },
  {
    v: "3.70.0",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.21.0: the color look has a strength and a color of your own (a light pink or blue breath over everything); new Brightness (smooth, no burnt highlights); new Rim of the picture (blur, motion or lens – only the edges, the middle stays sharp); Smooth scaling for less pixelated clips.", "PMV 生成器 2.21.0：色调现在可调强度，并支持自定义颜色（给整个画面轻轻罩上一层粉色或蓝色）；新增亮度（平滑，不会过曝）；新增画面边缘效果（模糊、动态或镜头——只作用于边缘，中间保持清晰）；新增平滑缩放，减少像素块。"],
      ["pmv", "The zoom pulse is smoother and sits exactly on the beat (it eases in just before it and fades out softly). New: its strength, and pumping on every beat, every 2nd beat or each bar only.", "缩放脉冲更平滑，并且精确落在拍点上（在拍点前缓缓进入，之后柔和消退）。新增：脉冲强度，以及每一拍、每隔一拍或仅每小节脉动。"],
      ["pmv", "New Pace for Automatic cuts: Slow, Normal or Fast – is the PMV slow or fast paced.", "自动剪切新增节奏设置：慢、正常或快——决定 PMV 是慢节奏还是快节奏。"],
    ],
  },
  {
    v: "3.69.7",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.20.3: “Scrolling sides” now scrolls like a real feed – the old clip moves up (or down) and out, the new one follows right behind it from below (or above). Before, the new clip's blurred backdrop covered the old clip.", "PMV 生成器 2.20.3：“侧边滚动”现在像真正的信息流一样滚动——旧片段向上（或向下）移出，新片段紧随其后从下方（或上方）进入。此前新片段的模糊背景会盖住旧片段。"],
    ],
  },
  {
    v: "3.69.6",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.20.2: in the “Reveal opening” it is one single clip that grows – no cuts to other clips until the drop.", "PMV 生成器 2.20.2：“开场渐显”期间只有一个片段在变大——在 drop 之前不会切换到其他片段。"],
    ],
  },
  {
    v: "3.69.5",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.20.1: the “Reveal opening” window now has the clip's own shape (a portrait clip stands upright), the clip fills it, everything around is black, the corners are rounded and a soft glow breathes with the beat.", "PMV 生成器 2.20.1：“开场渐显”的窗口现在采用片段自身的形状（竖屏片段竖着显示），片段铺满窗口，四周为黑色，边角圆润，并带有随节拍呼吸的柔和光晕。"],
    ],
  },
  {
    v: "3.69.4",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.20.0: new switch “Reveal opening” – the first clip sits small in the middle with rounded corners and slowly grows; at the first drop the picture opens up into the layouts.", "PMV 生成器 2.20.0：新增开关“开场渐显”——第一个片段以圆角小窗口出现在中央并缓慢变大，第一次 drop 时画面展开为所选布局。"],
      ["pmv", "New switch “Scrolling sides”: in 3-way layouts the middle clip stays longer while the clips at the sides scroll up or down like a feed (direction chosen per phase).", "新增开关“侧边滚动”：在三分屏布局中，中间的片段停留更久，两侧的片段像信息流一样向上或向下滚动（方向每个阶段随机）。"],
    ],
  },
  {
    v: "3.69.3",
    date: "2026-10-06",
    items: [
      ["pmv", "PMV Generator 2.19.0: new switch “Follow the scenes' timeline” – clips come from the part of their scene that matches how far the song is (song start = scene beginnings, song end = scene endings).", "PMV 生成器 2.19.0：新增开关“跟随场景的时间线”——片段取自其场景中与歌曲进度相对应的部分（歌曲开头 = 场景开头，歌曲结尾 = 场景结尾）。"],
      ["pmv", "When no clip can be played, the error now lists which clips were tried and why (and hints at codec problems: HEVC / AV1 → H.264). After a show the end card lists skipped clips.", "没有片段可播放时，错误信息现在会列出尝试过的片段及原因（并提示编码问题：HEVC / AV1 → H.264）。节目结束后，结束卡片会列出被跳过的片段。"],
      ["pmv", "It is now said clearly that the recording runs in real time: hints at the Record switch and the REC badge, and a stopped show tells how far the video got.", "现在明确说明录制是实时进行的：录制开关和 REC 标记处有提示，提前停止的节目会说明视频录到了哪里。"],
    ],
  },
  {
    v: "3.69.2",
    date: "2026-10-06",
    items: [
      ["ui", "Stash UI 3.69.2: fixed – with the menu reduced to icons, the two buttons at the top were squeezed to thin lines. They are normal rounded squares again, one above the other.", "Stash UI 3.69.2：已修复——菜单缩为仅图标时，顶部的两个按钮被压成细线。现在它们恢复为正常的圆角方形，上下排列。"],
      ["pmv", "PMV Generator 2.18.16: the shared files were updated.", "PMV 生成器 2.18.16：共享文件已更新。"],
    ],
  },
  {
    v: "3.69.1",
    date: "2026-10-06",
    items: [
      ["ui", "Stash UI 3.69.1: the two buttons at the top of the menu are a bit smaller and no longer overlap the Start entry.", "Stash UI 3.69.1：菜单顶部的两个按钮略微缩小，不再与“开始”项重叠。"],
      ["pmv", "PMV Generator 2.18.15: the shared files were updated.", "PMV 生成器 2.18.15：共享文件已更新。"],
    ],
  },
  {
    v: "3.69.0",
    date: "2026-10-06",
    items: [
      ["ui", "Sound on / Muted button in the Scenes toolbar too (the same switch as on the home page and in Settings → Player and previews).", "场景工具栏中也有了“声音开/已静音”按钮（与主页和“设置 → 播放器与预览”中的开关相同）。"],
      ["ui", "The two buttons at the top of the menu (menu size, NSFW mode) are rounded squares now, sit on the right one above the other, and have the same effects as the other buttons (shimmer, ripple, icon bounce) – in normal and liquid glass.", "菜单顶部的两个按钮（菜单大小、NSFW 模式）现在是圆角方形，位于右侧上下排列，并拥有与其他按钮相同的效果（流光、涟漪、图标弹跳）——普通和液态玻璃样式均适用。"],
      ["pmv", "PMV Generator 2.18.14: the shared files were updated.", "PMV 生成器 2.18.14：共享文件已更新。"],
    ],
  },
  {
    v: "3.68.2",
    date: "2026-10-06",
    items: [
      ["ui", "Stash UI 3.68.2: some scrapers (e.g. the built-in auto tag) can only look up the file, not search by name. The source list now says “file only” / “name only”, and a search they can't do gives a clear message instead of Stash's error – in the Scene tagger and in the editor's “Fill in from the internet”.", "Stash UI 3.68.2：有些抓取器（例如内置的自动标签）只能按文件查找，不能按名称搜索。来源列表现在会标注“仅限文件”/“仅限名称”，做不到的搜索会给出清晰的提示，而不是 Stash 的错误信息——场景标记器和编辑器的“从网上填写”都适用。"],
      ["pmv", "PMV Generator 2.18.13: the shared files were updated.", "PMV 生成器 2.18.13：共享文件已更新。"],
    ],
  },
  {
    v: "3.68.1",
    date: "2026-10-06",
    items: [
      ["ui", "Stash UI 3.68.1: fixed – closing the detailed rating (or another drawer or dialog) with the × in fullscreen closed the whole player.", "Stash UI 3.68.1：已修复——全屏时点击 × 关闭详细评分（或其他侧栏、对话框）会把整个播放器一起关闭。"],
      ["pmv", "PMV Generator 2.18.12: the shared files were updated.", "PMV 生成器 2.18.12：共享文件已更新。"],
    ],
  },
  {
    v: "3.68.0",
    date: "2026-10-06",
    items: [
      ["ui", "Advanced filter in Scenes, Images and Galleries (Filter → Advanced …): any number of criteria like in classic Stash – title, path, dates, durations, counts, codec, resolution, tags / performers / studios with “any / all / none”, “is missing …” and more, each with a condition (contains, is, between, is empty …). It sits on top of the quick filters, is kept in the address and in playlists.", "场景、图片和图库中的高级筛选（筛选 → 高级 …）：像经典 Stash 一样可添加任意多个条件——标题、路径、日期、时长、数量、编码、分辨率、标签/演员/工作室（任一/全部/没有）、“缺少 …” 等，每个条件都有判断方式（包含、等于、介于、为空 …）。它叠加在快速筛选之上，会保存在地址和播放列表中。"],
      ["ui", "Scene tagger (menu → Manage): the scenes that aren't organized, one row each – look each one up by its file or by a title on StashDB or with a scraper, check what was found field by field, save (and mark it organized). “Look up this page” does the whole page by file.", "场景标记器（菜单 → 管理）：列出尚未整理的场景，每个一行——通过文件或标题在 StashDB 或抓取器中查找，逐项检查找到的内容后保存（并标记为已整理）。“查找本页”会按文件一次查找整页。"],
      ["ui", "The folder tree in the menu: when it is off (a big library switches it off), the menu now says so and offers “Show the folder tree here” and a link to the Folders page – before it simply vanished.", "菜单中的文件夹树：关闭时（大型媒体库会自动关闭），菜单现在会说明原因，并提供“在此显示文件夹树”和“文件夹”页面的链接——以前它只是消失了。"],
      ["ui", "The Delete key deletes the scene or image you are looking at (it asks first). The saved filter that is open is lit in the menu.", "按 Delete 键可删除当前查看的场景或图片（会先确认）。当前打开的已保存筛选会在菜单中高亮。"],
      ["pmv", "PMV Generator 2.18.11: the shared files were updated.", "PMV 生成器 2.18.11：共享文件已更新。"],
    ],
  },
  {
    v: "3.67.0",
    date: "2026-10-06",
    items: [
      ["ui", "Delete button in the player's info bar: it asks first, and the next video of the list or queue keeps playing instead of going back to the list.", "播放器信息栏新增删除按钮：会先确认，删除后继续播放列表或队列中的下一个视频，而不是返回列表。"],
      ["ui", "Saved filters in the menu: Stash's own saved filters (scenes, images) and your playlists are listed under the folder tree – one click opens the list with it. Can be hidden or moved in Home → Customize → Sidebar.", "菜单中的已保存筛选：文件夹树下方列出 Stash 自带的已保存筛选（场景、图片）和你的播放列表——点击即可用它打开列表。可在“主页 → 自定义 → 侧边栏”中隐藏或移动。"],
      ["ui", "Fixed: the detailed rating (and other dialogs and drawers) did not open while the player was in fullscreen.", "已修复：播放器全屏时，详细评分（以及其他对话框和侧栏）无法打开。"],
      ["ui", "Fixed: stepping to the next or previous image flashed the page underneath for a moment.", "已修复：切换到上一张或下一张图片时，下方页面会短暂闪现。"],
      ["pmv", "PMV Generator 2.18.10: the shared files were updated.", "PMV 生成器 2.18.10：共享文件已更新。"],
    ],
  },
  {
    v: "3.66.1",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.66.1: fixed the button that brings back a hidden menu – the new effects had moved it to the bottom of the page.", "Stash UI 3.66.1：修复了用于恢复已隐藏菜单的按钮——新特效把它移到了页面底部。"],
      ["pmv", "PMV Generator 2.18.9: the shared files were updated.", "PMV 生成器 2.18.9：共享文件已更新。"],
    ],
  },
  {
    v: "3.66.0",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.66.0: effects and animations. Buttons shine when you point at them and send out a ripple when pressed, cards lean towards the mouse with a light that follows it, pages rise in under a hatched wipe, dialogs and messages pop in, the menu icons wiggle and a soft glow follows the mouse. Same look, in normal and liquid glass. Switch off: Settings → This interface → Effects and animations (also off when your system asks for less motion). Also: the home page now has the same selection bar as Scenes (favorite, edit, add to queue, delete – also for scenes and images mixed), and the bar is liquid glass in the glass look.", "Stash UI 3.66.0：特效和动画。鼠标指向按钮时会闪过光泽，按下时扩散涟漪；卡片朝鼠标倾斜并有跟随的光线；切换页面时出现斜线擦除并让页面升起；对话框和消息弹出；菜单图标摆动；柔和的光晕跟随鼠标。外观不变，普通和液态玻璃模式均适用。关闭：设置 → 此界面 → 特效和动画（系统要求减少动态效果时也会自动关闭）。另外：主页现在也有与“场景”页相同的选择栏（收藏、编辑、加入队列、删除，场景和图片混选也可以），并且选择栏在玻璃模式下是液态玻璃。"],
      ["pmv", "PMV Generator 2.18.8: the shared files were updated.", "PMV 生成器 2.18.8：共享文件已更新。"],
    ],
  },
  {
    v: "3.65.0",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.65.0: Phone upload (menu: Manage → Phone upload). Send photos and videos from your phone's gallery to your library over your home Wi-Fi: press Start, scan the QR code with the phone, pick the files – they are streamed straight into a folder of your library (default “Phone uploads”, you choose the library folder and the subfolder), keep the date they have on the phone, and Stash scans the folder by itself a few seconds after the last file. Big videos are fine (no size limit, written to disk as they arrive). Safety: it runs only while you use it (Stop, or by itself after three hours without use), only people with the link / QR code can send, only photo and video types are accepted, nothing is overwritten, and the folder has to be inside a library folder. Use it on a network you trust. Windows may ask once whether Python may use the private network – allow it. Only tested with simulated uploads on this PC, not with a real phone.", "Stash UI 3.65.0：手机上传（菜单：管理 → 手机上传）。通过家庭 Wi-Fi 把手机相册中的照片和视频发送到你的媒体库：点击“开始”，用手机扫描二维码，选择文件——它们会被直接流式写入媒体库中的一个文件夹（默认“Phone uploads”，媒体库文件夹和子文件夹可自选），保留手机上的原始日期，最后一个文件到达几秒后 Stash 会自动扫描该文件夹。大视频没有问题（无大小限制，边接收边写入磁盘）。安全：只在你使用时运行（点“停止”，或三小时无人使用后自动停止），只有拥有链接/二维码的人才能发送，只接受照片和视频类型，不会覆盖任何文件，且文件夹必须位于媒体库文件夹之内。请在你信任的网络中使用。Windows 可能会询问一次是否允许 Python 使用专用网络——请允许。仅在本机用模拟上传测试过，未用真实手机测试。"],
      ["pmv", "PMV Generator 2.18.7: the shared files were updated.", "PMV 生成器 2.18.7：共享文件已更新。"],
    ],
  },
  {
    v: "3.64.2",
    date: "2026-10-05",
    items: [
      ["pmv", "PMV Generator 2.18.6: fixed the suggestion lists of the Tags and Performers fields – they were drawn far below the field, out of sight, so typing a tag showed nothing. They appear right under the field again (normal and Liquid glass).", "PMV 生成器 2.18.6：修复了“标签”和“演员”输入框的建议列表——它们被绘制在输入框下方很远的位置，看不到，所以输入标签时什么都不显示。现在它们再次出现在输入框正下方（普通和液态玻璃外观）。"],
      ["ui", "Stash UI 3.64.2: a shared stylesheet was extended (for the PMV Generator).", "Stash UI 3.64.2：扩展了一个共享样式表（用于 PMV 生成器）。"],
    ],
  },
  {
    v: "3.64.1",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.64.1: the tag search is more robust. While the tag list is still loading it says “Loading tags …” and the suggestions appear by themselves as soon as it is there (before: nothing, until you typed another letter). If the whole list can't be loaded (very large libraries, a slow Stash), it asks Stash for matches while you type instead. An error shows up in the list instead of leaving it empty. This is also the tag search of the PMV Generator.", "Stash UI 3.64.1：标签搜索更稳健。标签列表仍在加载时会显示“正在加载标签 …”，加载完成后建议会自动出现（以前：在你再输入一个字母之前什么都不显示）。如果无法加载整个列表（非常大的库、Stash 较慢），则会在你输入时向 Stash 请求匹配项。出错时会在列表中显示错误，而不是留空。PMV 生成器的标签搜索也是同一个。"],
      ["pmv", "PMV Generator 2.18.5: the tag search is more robust (see Stash UI 3.64.1).", "PMV 生成器 2.18.5：标签搜索更稳健（见 Stash UI 3.64.1）。"],
    ],
  },
  {
    v: "3.64.0",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.64.0: groups can be made and edited here now. Library → Groups: “New group” (cover picture by upload, link or paste, name, aliases, date, director, studio, links, synopsis, tags). On a group's page: “Add scenes” (browse or search your scenes, tick as many as you like, add them in one go), “Edit group” and “Delete group”. The scenes are added to the group; they stay in your library when a group is deleted.", "Stash UI 3.64.0：现在可以在这里创建和编辑群组。媒体库 → 群组：“新建群组”（可通过上传、链接或粘贴设置封面，以及名称、别名、日期、导演、工作室、链接、简介、标签）。在群组页面：“添加场景”（浏览或搜索场景，勾选任意多个后一次添加）、“编辑群组”和“删除群组”。场景会被加入群组；删除群组时场景仍保留在你的库中。"],
      ["pmv", "PMV Generator 2.18.4: the shared files were updated.", "PMV 生成器 2.18.4：共享文件已更新。"],
    ],
  },
  {
    v: "3.63.2",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.63.2: tag and studio search no longer picks anything for you. The suggestions show while you type – click one, or use ↑/↓ and Enter. Only a name you typed exactly (or an alias) is highlighted, so Enter takes that one. Enter on a name that matches nothing still creates it (where that is allowed). Also the tag search of the PMV Generator.", "Stash UI 3.63.2：标签和工作室搜索不再替你自动选择。输入时会显示建议——点击其中一个，或用 ↑/↓ 加回车。只有你完整输入的名称（或别名）会高亮，回车就选它。输入没有任何匹配的名称并按回车，仍会创建它（在允许创建的地方）。PMV 生成器的标签搜索也是如此。"],
      ["pmv", "PMV Generator 2.18.3: the tag search no longer auto-picks (see Stash UI 3.63.2).", "PMV 生成器 2.18.3：标签搜索不再自动选择（见 Stash UI 3.63.2）。"],
    ],
  },
  {
    v: "3.63.1",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.63.1: tag and studio search now put the name you typed first – the exact name, then an alias, then names that start with it. Before, Enter could take another tag that merely contained the text (typing “anal” could pick a longer tag). This is also the tag search of the PMV Generator.", "Stash UI 3.63.1：标签和工作室搜索现在把你输入的名称排在最前——先是完全匹配，其次是别名，再是以它开头的名称。以前按回车可能选中仅包含该文字的其他标签（输入“anal”可能选到更长的标签）。PMV 生成器的标签搜索也是同一个。"],
      ["pmv", "PMV Generator 2.18.2: the tag search picks the tag you typed (see Stash UI 3.63.1). README: a note on browsers and codecs (H.264 is light, HEVC/4K heavy; Safari can lag with many clips).", "PMV 生成器 2.18.2：标签搜索会选中你输入的标签（见 Stash UI 3.63.1）。README：新增关于浏览器和编码的说明（H.264 很轻，HEVC/4K 较重；片段很多时 Safari 可能卡顿）。"],
    ],
  },
  {
    v: "3.63.0",
    date: "2026-10-05",
    items: [
      ["ui", "Stash UI 3.63.0: a group can be deleted – open the group, “Delete group” (only the group is deleted, its scenes stay in your library). Plugins page: every enabled plugin has an “All settings in classic Stash” button – settings that a plugin draws itself with its own code (not listed in its file) are only there, because the classic interface is where plugins can add to the page.", "Stash UI 3.63.0：现在可以删除群组——打开群组，点击“删除群组”（只删除群组，其中的场景保留在库中）。插件页面：每个已启用的插件都有“在经典 Stash 中查看全部设置”按钮——插件用自己的代码绘制的设置（未列在其文件中）只在那里，因为经典界面才是插件可以扩展页面的地方。"],
      ["pmv", "PMV Generator 2.18.1: the shared files were updated.", "PMV 生成器 2.18.1：共享文件已更新。"],
    ],
  },
  {
    v: "3.62.1",
    date: "2026-10-05",
    items: [
      ["pmv", "PMV Generator 2.18.0: two new options. Clip selection → Clean cuts (with best moments): a clip starts where its scene runs on for the next few seconds, so it doesn't jump to another scene by itself in the middle of a cut (and a cut inside a clip no longer counts as “lots of motion”). Style → Cutting → Bars and phrases: finds the “one” of each bar and where a 4-bar phrase starts – cuts land on the bar's strong beats and split screens change at the start of a phrase instead of “every 4th beat from the first beat”. Both can be switched off.", "PMV 生成器 2.18.0：两个新选项。片段选择 → 干净剪切（配合最佳时刻）：片段从其场景在接下来几秒内持续不断的位置开始，不会在一次剪切中途自行跳到另一个场景（片段内部的剪切也不再被当作“大量运动”）。样式 → 剪切 → 小节与乐句：找出每个小节的“第一拍”和 4 小节乐句的开头——剪切落在小节的强拍上，分屏在乐句开头切换，而不是“从第一拍起每 4 拍”。两者都可以关闭。"],
      ["ui", "Stash UI 3.62.1: nothing to see – a shared file for the PMV Generator was extended.", "Stash UI 3.62.1：无可见变化——为 PMV 生成器扩展了一个共享文件。"],
    ],
  },
  {
    v: "3.62.0",
    date: "2026-10-05",
    items: [
      ["ui", "Settings → This interface → General: Backup and restore. One file holds everything this interface remembers – the settings of this browser (home page, menu, display, queue …) and the shared ones kept in Stash (ratings, playlists, Versus, funscript variants, PMV presets). Restoring writes the file's values over the current ones, also in another browser. The file may contain your Handy connection key – keep it private.", "设置 → 此界面 → 常规：新增「备份与恢复」。一个文件包含此界面记住的所有内容——此浏览器的设置（首页、菜单、显示、队列等）和保存在 Stash 中的共享设置（评分、播放列表、Versus、funscript 变体、PMV 预设）。恢复时文件中的值会覆盖当前值，也可在另一个浏览器中使用。文件可能包含你的 Handy 连接密钥，请妥善保管。"],
      ["pmv", "PMV Generator 2.17.3: the shared files were updated.", "PMV 生成器 2.17.3：共享文件已更新。"],
    ],
  },
  {
    v: "3.61.0",
    date: "2026-10-05",
    items: [
      ["ui", "Home → Customize now has a Sidebar tab: hide entries of the menu on the left, move them (with the arrows or by dragging – also into another group, e.g. from Extensions to Library), and make your own groups. Start and Settings can't be hidden, so you can't lock yourself out. New menu entries and newly installed plugins show up in their usual group by themselves; “Back to the default” resets it. Saved in this browser.", "首页 → 自定义 现在有「侧边栏」标签页：可以隐藏左侧菜单中的条目、移动它们（用箭头或拖动，也可以移到其他分组，例如从「扩展」移到「资料库」），还可以创建自己的分组。「开始」和「设置」不能隐藏，因此不会把自己锁在外面。新增的菜单条目和新安装的插件会自动出现在它们通常所在的分组；「恢复默认」可重置。保存在此浏览器中。"],
      ["pmv", "PMV Generator 2.17.2: the shared files were updated.", "PMV 生成器 2.17.2：共享文件已更新。"],
    ],
  },
  {
    v: "3.60.2",
    date: "2026-10-05",
    items: [
      ["pmv", "PMV Generator 2.17.1: every folder mark now stands on its own (the deepest one wins) instead of replacing the others. Leave a folder out and take one of its subfolders back, take a folder and leave a subfolder out, take a subfolder and the main folder as well – all work, and subfolders of a taken or left-out folder can be clicked again.", "PMV 生成器 2.17.1：每个文件夹标记现在各自独立（以最深一层为准），不再互相替换。可以排除某个文件夹但把其中一个子文件夹加回来，也可以选入某个文件夹但排除其中的子文件夹，或同时选子文件夹和主文件夹——都可以，被选入或被排除的文件夹下的子文件夹也能再次点击。"],
    ],
  },
  {
    v: "3.60.1",
    date: "2026-10-05",
    items: [
      ["pmv", "PMV Generator 2.17.0: the folder choice is easier. A chosen folder chip goes away with a click anywhere on it (the × is bigger, too) – and its text was unreadable (dark on dark) with Liquid glass, which also affected the other picked chips like tags. New: ⊘ on a folder leaves it out (with its subfolders), the folder list is a collapsible tree, and picking a subfolder of a picked folder narrows the choice to that subfolder.", "PMV 生成器 2.17.0：文件夹选择更方便。点击已选文件夹标签的任意位置即可移除（× 也变大了）；液态玻璃模式下标签文字原本是深色压在深底上、看不清，其他已选标签（如标签名）也有同样问题，现已修复。新增：文件夹上的 ⊘ 可排除该文件夹（含子文件夹）；文件夹列表改为可折叠的树；在已选文件夹中再选其子文件夹，会把范围缩小到该子文件夹。"],
    ],
  },
  {
    v: "3.60.0",
    date: "2026-10-05",
    items: [
      ["ui", "Scene editor: a new “Fill in from the internet” section – search a StashDB-style box or an installed scene scraper by title (or paste a link; an empty search looks the file up by its fingerprint), pick the result and the title, date, description, links, studio, performers and tags are filled in (what already has a value stays unless you tick “replace”; missing studios, performers and tags can be created on the fly; the found picture can become the cover). Nothing is saved until you press Save. Written for Stash's scraper API – untested against a real Stash, only a mock.", "场景编辑：新增“从网络填写”区域——可通过 StashDB 类站点或已安装的场景爬取器按标题搜索（也可粘贴链接；留空搜索则按文件指纹查找），选择结果后会填入标题、日期、简介、链接、工作室、演员和标签（已有值的字段保持不变，除非勾选“替换”；不存在的工作室、演员和标签可以即时创建；找到的图片可用作封面）。点击保存之前不会写入任何内容。按 Stash 的爬取器 API 编写——只在模拟环境中测试过，未在真实 Stash 上测试。"],
      ["pmv", "PMV Generator 2.16.2: the shared files were updated.", "PMV 生成器 2.16.2：共享文件已更新。"],
    ],
  },
  {
    v: "3.59.0",
    date: "2026-10-05",
    items: [
      ["ui", "Scenes and Images: the “Saved filters” menu now also lists the filters you saved in Stash itself (classic interface) under “Saved in Stash”. Pick one and its criteria (tags, performers, studios, rating, duration, dates, organized, orientation …) are applied on top of the filters set here, with its search and sort; a note says what Stash UI can't read yet, and one click removes it. Written for Stash's saved-filter format – untested against a real Stash, only a mock.", "场景与图片：“已保存的筛选”菜单现在也会在“保存在 Stash 中”下列出你在 Stash 本身（经典界面）里保存的筛选。选择其中一个，它的条件（标签、演员、工作室、评分、时长、日期、已整理、方向 …）会叠加到这里设置的筛选上，并沿用它的搜索与排序；提示会说明 Stash UI 暂时无法读取的条件，点一下即可移除。按 Stash 的已保存筛选格式编写——只在模拟环境中测试过，未在真实 Stash 上测试。"],
      ["pmv", "PMV Generator 2.16.1: the shared files were updated.", "PMV 生成器 2.16.1：共享文件已更新。"],
    ],
  },
  {
    v: "3.58.1",
    date: "2026-10-05",
    items: [
      ["pmv", "PMV Generator 2.16.0: two new ways to pick clips. “Markers” (next to Scenes / Images / Both) uses the moments you marked – every clip starts at a marker, filtered by the tag on the marker, with sub-tags counted too (switch). “Tag stages that follow the song” lets you list tags in order (A → B → C …): the song is divided among the stages, the last stage plays on every drop and in the finale; the count shows how many clips each stage has, and an empty stage borrows from the others.", "PMV 生成器 2.16.0：两种新的选片方式。“标记”（在场景/图片/两者旁边）使用你标记的片刻——每个片段都从一个标记开始，按标记上的标签筛选，子标签也算在内（可开关）。“跟随歌曲的标签阶段”可以按顺序列出标签（A → B → C …）：歌曲被分配给各个阶段，最后一个阶段用于每次高潮（Drop）和结尾；计数会显示每个阶段有多少片段，没有片段的阶段会借用其他阶段的片段。"],
    ],
  },
  {
    v: "3.58.0",
    date: "2026-10-05",
    items: [
      ["ui", "The photo cutter can now cut a portrait out of any picture handed to it – the Chaturbate plugin uses it to make a performer photo straight from a live cam (needs this version).", "照片裁剪器现在可以从任意传入的图片中裁剪竖版照片——Chaturbate 插件用它直接从直播画面制作演员照片（需要此版本）。"],
    ],
  },
  {
    v: "3.57.1",
    date: "2026-10-05",
    items: [
      ["ui", "Fix: searching in “Add scenes and images” failed with “invalid sort: relevance”.", "修复：在“添加场景和图片”中搜索时出现“invalid sort: relevance”错误。"],
    ],
  },
  {
    v: "3.57.0",
    date: "2026-10-05",
    items: [
      ["ui", "Performer page: a new “Add scenes and images” button next to Edit. Browse or search the scenes, images and galleries that aren't linked to the performer yet, tick as many as you like (or all shown) and link them in one go.", "演员页面：编辑按钮旁新增“添加场景和图片”按钮。浏览或搜索尚未关联到该演员的场景、图片和图库，随意勾选（或勾选当前显示的全部），一次性完成关联。"],
    ],
  },
  {
    v: "3.56.0",
    date: "2026-10-05",
    items: [
      ["ui", "Performer photos: “Cut from a scene” now also takes images – switch between Scenes and Images at the top (the performer's own first, or search all), pick a picture and cut the portrait frame straight out of it.", "演员照片：“从场景截取”现在也支持图片——在顶部切换“场景”和“图片”（先显示该演员自己的，也可搜索全部），选一张图片后直接裁剪出竖版框。"],
    ],
  },
  {
    v: "3.55.0",
    date: "2026-10-05",
    items: [
      ["ui", "Performer photos from a scene: in the performer editor, “Cut from a scene” opens a picker with the performer's scenes (or search all scenes). Find the frame in the video (frame-by-frame buttons), take it, drag and resize a 2:3, 3:4 or 1:1 frame over it – mouse wheel or slider zooms – and use the cut-out as the photo. Save as usual.", "从场景制作演员照片：在演员编辑器中，“从场景截取”会打开选择器，列出该演员的场景（或搜索所有场景）。在视频中找到画面（可逐帧），截取后在其上拖动并缩放 2:3、3:4 或 1:1 的裁剪框——滚轮或滑块可缩放——并将裁剪结果用作照片，然后照常保存。"],
    ],
  },
  {
    v: "3.54.0",
    date: "2026-10-05",
    items: [
      ["ui", "Plugins can bring their own symbol for the Extensions list in the menu: put an icon.svg, icon.png or icon.webp next to the plugin's page (its assets folder) and Stash UI shows it instead of the plug.", "插件可以为菜单中的“扩展”列表提供自己的图标：把 icon.svg、icon.png 或 icon.webp 放在插件页面旁（其 assets 文件夹），Stash UI 就会显示它，而不是插头图标。"],
    ],
  },
  {
    v: "3.53.2",
    date: "2026-10-05",
    items: [
      ["pmv", "PMV Generator 2.15.7: fixes two start-up crashes – the page didn't open with “A playlist” as the clip source (“can't access lexical declaration 'pls' before initialization”), and a file of the big-library mode was missing since Stash UI 3.50.0, so the page stayed empty. Thanks to mistery for the exact report.", "PMV 生成器 2.15.7：修复两个启动崩溃——以“播放列表”作为片段来源时页面无法打开（“can't access lexical declaration 'pls' before initialization”），以及自 Stash UI 3.50.0 起缺少大型媒体库模式的一个文件导致页面空白。感谢 mistery 的详细报告。"],
    ],
  },
  {
    v: "3.53.1",
    date: "2026-10-05",
    items: [
      ["storm", "Media Storm 2.6.0: “Including sub-tags (recursive)” under the marker tag filter – enter a parent tag and the marker clips of all its sub-tags are included.", "媒体风暴 2.6.0：标记标签筛选新增“包含子标签（递归）”——输入上级标签后，其所有子标签的标记片段也会被包含。"],
    ],
  },
  {
    v: "3.53.0",
    date: "2026-10-04",
    items: [
      ["ui", "Make and edit studios in Stash UI: “New studio” on the Studios page, “Edit” on a studio's page (name, aliases, links, details, parent studio, tags, logo by upload, link, paste or drop) and “Delete studio”. A studio typed into the Studio field of the edit drawer can be created right there.", "在 Stash UI 中创建和编辑工作室：工作室页面的“新建工作室”，工作室页面的“编辑”（名称、别名、链接、简介、上级工作室、标签，徽标可上传、链接、粘贴或拖入）以及“删除工作室”。在编辑面板的“工作室”字段中输入新名称即可直接创建。"],
      ["ui", "Scraping for studios: “Fill in from the internet” on a studio – search by name in StashDB-style boxes or the installed studio scrapers, or paste a link; the fields, parent studio and logo are filled in for you to check and save.", "工作室刮削：在工作室上点击“从网上填写”——在 StashDB 类站点或已安装的工作室刮削器中按名称搜索，或粘贴链接；字段、上级工作室和徽标会自动填入，供你检查后保存。"],
    ],
  },
  {
    v: "3.52.0",
    date: "2026-10-04",
    items: [
      ["ui", "New page: Studios (Library) – every studio as a logo card with search and sorting; a studio's page shows its scenes, images and galleries (sub-studios included), its links, aliases and parent studio. The studio shown on a group page links to it.", "新页面：工作室（媒体库）——每个工作室以徽标卡片显示，可搜索和排序；工作室页面显示其场景、图片和图库（含子工作室）、链接、别名和上级工作室。"],
      ["ui", "Studios in the editor: the edit drawer of a scene, image or gallery has a Studio field, and “Edit several” can set one studio for all selected items.", "编辑器中的工作室：场景、图片或图库的编辑面板新增“工作室”字段；批量编辑可为所有选中项设置同一工作室。"],
      ["ui", "Saved filters: lists have a Studio filter, a playlist keeps it, and Scenes / Images show a “Saved filters” menu to apply a saved one with one click (Playlists = your saved filters). Media Storm 2.5.1 understands the studio in a playlist too.", "已保存的筛选：列表新增工作室筛选，播放列表会保存它；场景/图片页面新增“已保存的筛选”菜单，一键应用（播放列表即已保存的筛选）。媒体风暴 2.5.1 也支持播放列表中的工作室。"],
    ],
  },
  {
    v: "3.51.1",
    date: "2026-10-04",
    items: [
      ["storm", "Media Storm 2.5.0: marker clips – a share of the videos (Media → “Marker clips”) plays the moments you marked in your scenes, only the marked part and looping. Under Source & filters, “Only marker clips with tags” picks the marker tags (primary or extra tag); the other filters apply to the marker's scene. A click opens the scene at that moment.", "媒体风暴 2.5.0：标记片段——视频中的一定比例（媒体 → “标记片段”）会播放你在场景中标记的片段，仅播放标记的部分并循环。在“来源与筛选”中，“仅含这些标签的标记片段”可选择标记标签（主标签或附加标签）；其他筛选条件作用于标记所在的场景。点击会在该时刻打开场景。"],
    ],
  },
  {
    v: "3.51.0",
    date: "2026-10-04",
    items: [
      ["ui", "New pages: Markers (Watch) – every moment you marked as a grid with search, tag filter and sorting, hover preview, a click opens the scene at that moment – and Groups (Library) with a page for each group and its scenes in the group's order.", "新页面：标记（观看）——以网格显示你标记的每个时刻，支持搜索、标签筛选和排序，悬停预览，点击即可在该时刻打开场景；以及分组（媒体库），每个分组有自己的页面，场景按分组内顺序排列。"],
      ["ui", "External player: the info panel of a scene has an “External player” button that hands the video to mpv, VLC, IINA, Infuse, MPC-HC, PotPlayer, nPlayer or MX Player (the ones that fit your system) – for formats the browser can't play. Choose the players under Settings → Player and previews.", "外部播放器：场景信息面板新增“外部播放器”按钮，可把视频交给 mpv、VLC、IINA、Infuse、MPC-HC、PotPlayer、nPlayer 或 MX Player（适合你系统的那些）播放——适用于浏览器无法播放的格式。在 设置 → 播放器和预览 中选择播放器。"],
      ["ui", "The menu on the left can be full, icons only or hidden (button at its top, or in the settings; hidden opens with the menu button in the corner).", "左侧菜单可为完整、仅图标或隐藏（菜单顶部的按钮，或在设置中切换；隐藏时通过左上角的菜单按钮打开）。"],
      ["ui", "Selecting: “Select all {n} results” selects everything a search found, not only the pages already loaded. The embedded classic Stash keeps its menu (Scenes, Images, Groups …).", "选择：“选择全部 {n} 个结果”会选中搜索找到的全部内容，而不只是已加载的页面。嵌入的经典 Stash 保留其菜单（场景、图片、分组 …）。"],
      ["ui", "Dates are typed year first (2019, 2019-05 or 2019-05-17; a year alone becomes January 1st) with a calendar button; E opens the editor in the player, and keys with Ctrl / Cmd / Alt are left to the browser (Ctrl+R reloads the page again).", "日期以年份在前输入（2019、2019-05 或 2019-05-17；只写年份则为 1 月 1 日），并带日历按钮；在播放器中按 E 打开编辑器；带 Ctrl / Cmd / Alt 的按键交给浏览器处理（Ctrl+R 又可以刷新页面了）。"],
    ],
  },
  {
    v: "3.50.0",
    date: "2026-10-04",
    items: [
      ["fix", "Big libraries (from 20 000 scenes or 100 000 images – “Large library mode”, automatic or in the settings): Stash no longer gets hammered. Folders aren't counted on their own (the Folders page asks, shows progress and can be cancelled, and a try that failed isn't repeated on every page load), the home page loads sections when you scroll to them, two at a time, and keeps them for five minutes, Versus plays the preview clips instead of whole video files and lets go of old ones, and scans of all funscripts (Problems, Overview) start on a click and keep their result.", "大型媒体库（从 20 000 个场景或 100 000 张图片起——“大型媒体库模式”，自动或在设置中开启）：不再让 Stash 不堪重负。文件夹不会自动统计（“文件夹”页面会询问、显示进度并可取消，失败的尝试不会在每次加载页面时重复），主页在滚动到时才加载各部分，每次两个，并保留五分钟；对决播放预览片段而不是整个视频文件，并释放旧的；扫描所有 funscript（问题、概览）需点击才开始，并保留结果。"],
      ["fix", "Fewer and lighter requests everywhere: Stash's totals are asked for once and shared (kept for 15 minutes on a big library), leaving a page stops what it was still asking for, sorting by a criterion fetches only ids and then the visible page, Statistics counts the scenes added instead of listing every scene, and the performer page skips its tag-link hint on a big library.", "各处请求更少更轻：Stash 的总数只请求一次并共享（大型媒体库保留 15 分钟），离开页面会停止其未完成的请求，按评分项排序只获取 ID 再获取可见页面，统计页面通过计数来统计新增场景而不是列出每个场景，大型媒体库上演员页面跳过标签关联提示。"],
    ],
  },
  {
    v: "3.49.0",
    date: "2026-10-02",
    items: [
      ["ui", "Studio logo on thumbnails: choose the corner (bottom left / right, top left / right) and the size (small to extra large) – next to the on / off switch (Settings → This interface).", "缩略图上的工作室标志：可选择位置（左下/右下/左上/右上）和大小（小到特大）——位于开/关开关旁（设置 → 此界面）。"],
      ["ui", "NSFW mode: an eye button at the top of the menu on the left (and in the settings) blurs all pictures and hover previews – choose the strength, whether the player and the image viewer are blurred too, and whether a thumbnail shows clear while the mouse is on it.", "NSFW 模式：左侧菜单顶部的眼睛按钮（以及设置中）可模糊所有图片和悬停预览——可选择强度、播放器和图片查看器是否也模糊，以及鼠标指向时缩略图是否清晰显示。"],
      ["ui", "Mute button on the home page (the same switch as “Sound in previews” in the settings), a setting for the width of the menu on the left, the shape of thumbnails (as the picture is, all posters, all scenes) and whether hover previews play (always, never, not with posters).", "主页上的静音按钮（与设置中的“预览声音”是同一开关）；新增设置：左侧菜单宽度、缩略图形状（按图片本身、全部海报、全部场景），以及悬停预览是否播放（始终、从不、海报时不播放）。"],
    ],
  },
  {
    v: "3.48.0",
    date: "2026-10-02",
    items: [["ui", "Interactive → Overview: how many scenes have a funscript, several scripts or problems, the average intensity with a histogram, the most intense and the calmest scenes, scenes with long pauses (more than 20 s without a movement) and how much of the video the scripts cover.", "互动 → 概览：有多少场景带 funscript、多个脚本或有问题，平均强度及直方图，最激烈和最平缓的场景，有长停顿（超过 20 秒无动作）的场景，以及脚本覆盖视频的比例。"]],
  },
  {
    v: "3.47.0",
    date: "2026-10-02",
    items: [
      ["ui", "Detailed rating in lists: a Detailed filter in Scenes and Performers (“Chemistry ≥ 4”, several points together), a sort by any point (“Detailed: Chemistry”), small bars of a scene's scores on its card (on hover), score chips in the info panel and on performer pages – and playlists keep the filter.", "列表中的详细评分：场景和演员页面新增“详细”筛选（“默契 ≥ 4”，可组合多个评分项）、按任意评分项排序（“详细：默契”）、场景卡片上的小型分数条（悬停时显示）、信息面板和演员页面上的分数标签——播放列表也会保存该筛选。"],
      ["ui", "Keys for the detailed rating: R opens it in the player; in the list ↑ ↓ choose the point, 0–5 rate it and jump on, Backspace takes the rating away.", "详细评分快捷键：在播放器中按 R 打开；在列表中用 ↑ ↓ 选择评分项，按 0–5 评分并跳到下一项，Backspace 清除评分。"],
    ],
  },
  {
    v: "3.46.0",
    date: "2026-10-02",
    items: [
      ["ui", "Tiers everywhere: the S–F badge (from the Versus standings) now also sits on scene and image cards, performer cards, in the info panel, the player's title bar and on performer pages. Lists get a Tier filter (tick S, A …) for scenes, images and performers, and playlists can keep it – so “Best scenes: S + A” is a playlist that updates itself.", "等级无处不在：来自对决排名的 S–F 徽章现在也显示在场景和图片卡片、演员卡片、信息面板、播放器标题栏和演员页面上。列表新增“等级”筛选（勾选 S、A …），适用于场景、图片和演员，播放列表也可保存它——例如“最佳场景：S + A”就是一个会自动更新的播放列表。"],
    ],
  },
  {
    v: "3.45.0",
    date: "2026-10-02",
    items: [["ui", "Plugins → Sources: every source unfolds (arrow) to show the plugins inside – search them, tick several and “Install selected”, or install, update one by one. Installed ones are marked, like in classic Stash.", "插件 → 来源：每个来源都可展开（箭头）显示其中的插件——可搜索，勾选多个后“安装所选”，也可逐个安装或更新；已安装的会被标记，与经典 Stash 一样。"]],
  },
  {
    v: "3.44.0",
    date: "2026-10-02",
    items: [
      ["ui", "Event log as a floating panel (menu: Manage → Log; also the Log button in Versus): drag it by the header, resize it at the corner, fold it away – it stays open while you play or browse. It lists what Stash UI does – Versus picks (names link to the item, tiers colour-coded, wins green), funscript changes, ratings, tags and generate tasks – with filters per area, a clear button and an export as a text file in which names are left out (unless you untick “Hide names in the export”). Replaces the small Versus-only log.", "事件日志变为浮动面板（菜单：管理 → 日志；对决页面也有“日志”按钮）：拖动标题栏移动、拖拽角落调整大小、可折叠——在播放或浏览时保持打开。它列出 Stash UI 所做的事——对决选择（名称链接到条目，等级用颜色标注，胜利为绿色）、funscript 更改、评分、标签和生成任务——可按区域筛选，可清空，也可导出为文本文件（默认不含名称，可取消“导出时隐藏名称”）。取代原先仅限对决的小日志。"],
    ],
  },
  {
    v: "3.43.0",
    date: "2026-10-02",
    items: [
      ["ui", "Versus: tiers S – A – B – C – D – F by percentile (top 5 % S, then 15 %, 25 %, 30 %, 15 %, last 10 % F) among everything with 3+ matches – shown as a badge in the ranking, as a bar and as a filter; plus a small overview (compared, picks, average and highest points).", "对决：按百分位划分的 S – A – B – C – D – F 等级（前 5 % 为 S，然后 15 %、25 %、30 %、15 %，最后 10 % 为 F），统计对象为对决 3 场以上的条目——在排名中显示为徽章、分布条和筛选项；另有小型概览（已比较、选择次数、平均和最高积分）。"],
      ["ui", "Versus ledger: the little clock next to a ranking entry shows its last 10 matches (won / lost, points, against whom, when).", "对决记录：排名条目旁的小时钟显示其最近 10 场对决（胜/负、积分、对手、时间）。"],
      ["ui", "Versus snapshots: take a copy of all standings (kept in Stash, the last 5), restore one (a snapshot of the current state is made first), export the standings to a file and import them again.", "对决快照：为所有排名创建副本（保存在 Stash 中，最近 5 个），可恢复其中之一（之前会先为当前状态创建快照），也可将排名导出为文件并再次导入。"],
      ["ui", "Versus event log (picks, undo, restore, start over …) and match options (points per pick for new and settled ones, how many matches count as new).", "对决事件日志（选择、撤销、恢复、重新开始 …）以及对决选项（新加入和已稳定条目每次选择的积分、多少场以内算新）。"],
    ],
  },
  {
    v: "3.42.1",
    date: "2026-10-02",
    items: [["ui", "Detailed rating: the stars are now exactly those of the info bar – they light up when you hover and the new ones pop in after a click.", "详细评分：星星现在与信息栏中的完全一致——悬停时点亮，点击后新点亮的星星依次弹出。"]],
  },
  {
    v: "3.42.0",
    date: "2026-10-02",
    items: [
      ["ui", "Advanced rating: “★+ Detailed” next to the stars of a scene or performer opens a list of criteria (scenes: Production Quality, Chemistry, Performance …; performers: Face, Body, Technique … in groups) – rate each from 0 to 5 and Stash's own rating follows as the weighted result, snapped to your rating precision. The scores are tags (“Chemistry ★: 4” under “Advanced Rating System” / “Advanced Performer Rating”), so they work everywhere in Stash. “Customize …” edits groups, criteria, weights and tooltips, makes the tags, and can recalculate every rating. Idea: the Advanced Rating plugin on discourse.stashapp.cc (same tag names).", "高级评分：场景或演员星级旁的“★+ 详细”打开评分项列表（场景：制作质量、默契、表现 …；演员：脸、身材、技巧 … 按分组）——每项评 0 到 5 分，Stash 自己的评分随之按加权结果更新，并取整到你设置的评分精度。分数以标签保存（“Chemistry ★: 4”，位于“Advanced Rating System”/“Advanced Performer Rating”之下），因此在 Stash 中随处可用。“自定义 …”可编辑分组、评分项、权重和提示，创建标签，并可重新计算所有评分。灵感来自 discourse.stashapp.cc 上的 Advanced Rating 插件（标签名称相同）。"],
    ],
  },
  {
    v: "3.41.0",
    date: "2026-10-02",
    items: [
      ["ui", "The picture under the player's timeline follows the script in use: choose a variant and its intensity shows there (Stash's own heatmap stays for the video's own script).", "播放器时间轴下方的图像跟随当前使用的脚本：选择一个变体后，这里显示它的强度（视频自带脚本仍使用 Stash 自己的热力图）。"],
      ["ui", "Stacked heatmap: scripts with exactly the same movements are marked (white outline, “Same movements as …”) and can be set aside with one button – the one with the video's name always stays. New switch “Stretch each script to the full width” (default: aligned to the video's length).", "叠放热力图：动作完全相同的脚本会被标记（白色轮廓，“动作与……相同”），可一键搁置——与视频同名的脚本始终保留。新开关“将每个脚本拉伸至整个宽度”（默认按视频长度对齐）。"],
      ["ui", "Interactive → Problems: the tag names are editable (kept in the settings), and the speed check also finds scenes whose speed is 0 or below, not only missing ones; the task then measures them again (heatmap and speed of those scenes only).", "互动 → 问题：标签名称可编辑（保存在设置中）；速度检查现在也会找出速度为 0 或更低的场景，而不只是缺失的；任务会重新测量它们（仅这些场景的热力图和速度）。"],
    ],
  },
  {
    v: "3.40.0",
    date: "2026-10-02",
    items: [
      ["ui", "Interactive → Problems: shows how many interactive scenes Stash hasn't measured yet (no speed, so no heatmap or speed filter) and starts Stash's own task “Heatmaps for interactive videos” for exactly those scenes, with a confirmation. Nothing is written to the database directly.", "互动 → 问题：显示 Stash 尚未测量的互动场景数量（没有速度，因而没有热力图和速度筛选），并在确认后仅为这些场景启动 Stash 自带的任务“互动视频热力图”。不会直接写入数据库。"],
    ],
  },
  {
    v: "3.39.0",
    date: "2026-10-02",
    items: [
      ["ui", "Simple funscript editor (“Edit this script …” in the Handy menu and the Funscript list): stroke range, speed limit, smoothing, reverse and shift in time, with a before / after heatmap preview. It's saved as a new variant next to the video – the original is never touched. Your own presets are kept.", "简易 funscript 编辑器（Handy 菜单和 Funscript 列表中的“编辑此脚本 …”）：行程范围、速度上限、平滑、反转和时间偏移，附修改前/后热力图预览。结果另存为视频旁的新变体——原脚本不会被改动。可保存自己的预设。"],
      ["ui", "The scripts box in the Handy menu and the Funscript list now also shows for a video with a single script (its heatmap and the editor).", "Handy 菜单和 Funscript 列表中的脚本区现在也会显示只有一个脚本的视频（其热力图和编辑器）。"],
    ],
  },
  {
    v: "3.38.0",
    date: "2026-10-02",
    items: [
      ["ui", "Interactive → Duplicates: finds funscripts with exactly the same movements (names and metadata don't matter) and shows them in groups. Choose which one stays; the others are set aside as .funscriptdupe – nothing is deleted – and can be brought back from the same page.", "互动 → 重复：查找动作完全相同的 funscript（名称和元数据无关），并按组显示。选择保留哪一个；其余的会被搁置为 .funscriptdupe——不会删除任何文件——并可在同一页面恢复。"],
    ],
  },
  {
    v: "3.37.0",
    date: "2026-10-02",
    items: [
      ["ui", "Several funscripts per video: scripts next to the video that start with its name (“Video.funscript”, “Video (Soft).funscript”, “Video - Hard.funscript” …) are variants, labelled by the rest of the file name. Pick one in the Handy menu or the Funscript list – the Handy loads it and carries on from where the video is; the choice is remembered per scene.", "每个视频可有多个 funscript：视频旁以其名称开头的脚本（“Video.funscript”、“Video (Soft).funscript”、“Video - Hard.funscript” …）即为变体，以文件名其余部分作标签。在 Handy 菜单或 Funscript 列表中选择——Handy 加载后从视频当前位置继续；选择按场景记住。"],
      ["ui", "Stacked heatmap: every variant as a stripe with label, length and a click to choose it – in the Handy menu and the Funscript list.", "叠放热力图：每个变体一条，带标签、时长，点击即可选择——位于 Handy 菜单和 Funscript 列表中。"],
      ["ui", "Length check: a script that can't be read, has no movements, or is much longer or shorter than its video gets a warning (the stripe shows where it ends). New tab Problems on the Interactive page lists such scenes and the scenes with several scripts – each list can be set as a tag.", "长度检查：无法读取、没有动作、或比视频长得多/短得多的脚本会收到警告（条带显示其结束位置）。“互动”页面的新标签“问题”列出这些场景以及有多个脚本的场景——每个列表都可设为标签。"],
    ],
  },
  {
    v: "3.36.0",
    date: "2026-10-01",
    items: [
      ["ui", "New page Interactive (Watch): all scenes with a funscript, as a normal list – and the funscripts in your library that don't belong to a video yet, each with “Choose video …” (similar names first, or search).", "新页面“互动”（观看）：所有带 funscript 的场景，以普通列表显示——以及媒体库中尚未属于任何视频的 funscript，每个都可“选择视频 …”（名称相似的优先，也可搜索）。"],
    ],
  },
  {
    v: "3.35.2",
    date: "2026-10-01",
    items: [["ui", "Funscript list: the script you picked last is the one marked “in use” – the copy next to the video isn't listed as an extra entry any more.", "Funscript 列表：标记为“使用中”的是你最后选择的脚本——视频旁边的副本不再作为单独条目列出。"]],
  },
  {
    v: "3.35.1",
    date: "2026-10-01",
    items: [
      ["ui", "The Handy gets the newly chosen funscript right away (it kept playing the old one).", "选择新的 funscript 后，Handy 会立即使用它（之前会继续播放旧的）。"],
      ["ui", "Back in the player leaves with one click after choosing a funscript (it needed several).", "选择 funscript 后，播放器中的返回按钮点一次即可退出（之前需要点好几次）。"],
    ],
  },
  {
    v: "3.35.0",
    date: "2026-10-01",
    items: [
      ["ui", "“Funscript” in the player now lists every .funscript in your Stash folders – the ones matching the video first, with search. Pick one and it stays with the scene (also after a restart, also in classic Stash); switch or remove it any time.", "播放器中的“Funscript”现在会列出 Stash 文件夹中的所有 .funscript——与视频匹配的排在前面，并可搜索。选中后它会一直属于该场景（重启后、在经典 Stash 中也一样）；随时可以更换或移除。"],
    ],
  },
  {
    v: "3.34.0",
    date: "2026-10-01",
    items: [
      ["ui", "The Handy menu in the player (click the Handy button): sync offset, stroke range, invert, the device with its firmware, the connection key, connect again or disconnect.", "播放器中的 Handy 菜单（点击 Handy 按钮）：同步偏移、行程范围、反转、设备及固件信息、连接密钥、重新连接或断开。"],
      ["ui", "Give a scene a funscript right from the player (“Funscript” in the info bar): it's put next to the video with the right name, Stash scans it, and the scene plays on the Handy.", "可直接在播放器中为场景添加 funscript（信息栏中的“Funscript”）：文件会以正确的名称放在视频旁边，Stash 扫描后即可在 Handy 上播放。"],
      ["ui", "The Handy connection key is shown in full.", "Handy 连接密钥完整显示。"],
    ],
  },
  {
    v: "3.33.0",
    date: "2026-10-01",
    items: [
      ["ui", "Interactive: scenes with a funscript play on The Handy – it follows play, pause, jumps and repeat. Settings → Player and previews (the same settings as classic Stash), with a connection test. The funscript intensity shows under the timeline.", "互动：带 funscript 的场景可在 The Handy 上播放——跟随播放、暂停、跳转和循环。设置 → 播放器与预览（与经典 Stash 相同的设置），可测试连接。时间轴下方显示 funscript 强度。"],
      ["ui", "Lists: filter by funscript; scenes with one get a small mark.", "列表：可按 funscript 筛选；带 funscript 的场景有小标记。"],
    ],
  },
  {
    v: "3.32.0",
    date: "2026-10-01",
    items: [["ui", "Player: buttons to start from the beginning (also the Home key) and to jump 10 seconds back or forward, with a short note on the picture.", "播放器：新增“从头开始”（也可按 Home 键）以及后退/前进 10 秒按钮，画面上会短暂显示提示。"]],
  },
  {
    v: "3.31.0",
    date: "2026-10-01",
    items: [
      ["ui", "New: this page – what changed in every version.", "新增：本页面——每个版本的更新内容。"],
      ["ui", "Player: the play mode button looks like the other toggles when it's on; “Repeat this video” has the 1 inside its icon.", "播放器：播放模式按钮开启时的样式与其他开关一致；“单集循环”图标中的 1 现在位于图标内部。"],
      ["ui", "Versus: more under each card – performers, studio, resolution, rating, plays and tags (performers: age, country, scenes and images).", "Versus：每张卡片下显示更多信息——演员、工作室、分辨率、评分、播放次数和标签（演员：年龄、国家、场景和图片数量）。"],
    ],
  },
  {
    v: "3.30.0",
    date: "2026-10-01",
    items: [
      ["ui", "Statistics: achievements – a streak of days in a row and medals in steps (plays, hours, library seen, night owl, Versus picks, O).", "统计：成就——连续观看天数，以及分级奖牌（播放、时长、已看媒体库、夜猫子、Versus 选择、O）。"],
      ["pmv", "Remix of your favorites: clips from your Versus top scenes or your most watched ones.", "收藏混剪：片段可来自 Versus 前列场景或最常观看的场景。"],
    ],
  },
  {
    v: "3.29.0",
    date: "2026-10-01",
    items: [
      ["ui", "Versus for moments (markers). The best ones are marked gold in the player, J jumps there first and a random start lands on one.", "Versus 支持“时刻”（标记）。最佳时刻在播放器中显示为金色，按 J 先跳到那里，随机开始也会落在其中之一。"],
      ["pmv", "Best moments from Versus are where clips start most of the time.", "片段大多从 Versus 选出的最佳时刻开始。"],
    ],
  },
  {
    v: "3.28.0",
    date: "2026-10-01",
    items: [["ui", "Home page: “For you” (unwatched scenes with your top tags of the week) and “Long time no see” (favorites not watched for a month).", "首页：“为你推荐”（带有你本周常看标签的未看场景）和“好久没看了”（一个月没看过的收藏）。"]],
  },
  {
    v: "3.27.0",
    date: "2026-10-01",
    items: [
      ["ui", "Smart playlists: save the filters of a list as a playlist – always up to date. Play, shuffle or add to the queue from the new Playlists page.", "智能播放列表：把列表的筛选条件保存为播放列表——始终保持最新。可在新的播放列表页面播放、随机播放或加入队列。"],
      ["pmv", "Clips can come from a playlist.", "片段可以来自播放列表。"],
      ["storm", "Performers, resolution, video length and playlists as filters.", "新增演员、分辨率、视频时长和播放列表筛选。"],
    ],
  },
  {
    v: "3.26.0",
    date: "2026-10-01",
    items: [["ui", "Statistics redone: your week, a period to choose with comparison, clear charts, top lists with trends, when you watch, your library.", "统计全面改版：你的一周、可选时间段及对比、清晰的图表、带趋势的排行、观看时间分布、你的媒体库。"]],
  },
  {
    v: "3.25.0",
    date: "2026-10-01",
    items: [
      ["ui", "Versus standings are kept in Stash – the same in every browser.", "Versus 排名保存在 Stash 中——所有浏览器都一样。"],
      ["pmv", "“My settings” works again and is kept in Stash.", "“我的设置”恢复正常，并保存在 Stash 中。"],
      ["ui", "Setting a cover in the player is instant and can be undone.", "在播放器中设置封面即时生效，并且可以撤销。"],
    ],
  },
  {
    v: "3.24.5",
    date: "2026-10-01",
    items: [["ui", "Ratings follow the rating system chosen in Stash (half, quarter, tenth stars or 0–10) – also settable under Settings → General.", "评分遵循 Stash 中选择的评分方式（半星、四分之一星、十分之一星或 0–10）——也可以在 设置 → 常规 中设置。"]],
  },
  {
    v: "3.24.0",
    date: "2026-09-30",
    items: [
      ["ui", "Versus: two side by side – pick the better one; Elo ranking, three ways to play, fullscreen, sound on hover.", "Versus：两个并排——选出更好的一个；Elo 排名、三种玩法、全屏、悬停有声音。"],
      ["ui", "Player: start at a random spot (your resume point stays).", "播放器：从随机位置开始（续播位置保持不变）。"],
      ["ui", "GIFs play again.", "GIF 恢复播放。"],
    ],
  },
  {
    v: "3.23.0",
    date: "2026-09-30",
    items: [
      ["ui", "Custom home page, markers in the player, cover from the current frame, performers on scenes, studio logos, foldable menu.", "可自定义首页、播放器中的标记、用当前画面做封面、场景上的演员、工作室标志、可折叠菜单。"],
      ["pmv", "Smooth with 4K, hide the bar (H), clip info (I), saved settings, more filters, long DJ mixes, Plex and Spotify.", "4K 也流畅、隐藏工具栏（H）、片段信息（I）、保存设置、更多筛选、长 DJ 混音、Plex 和 Spotify。"],
    ],
  },
];

// "version:index of the item" → target, for entries written before items could carry their own
export const LINKS = {
  "3.104.0:0": "performers::[data-selmode]",
  "3.103.0:0": "performer/@performer::[data-pstats], [data-pmiss]",
  "3.103.0:1": "settings/this-ui::Rating badge",
  "3.101.0:1": "scene/@scene::[data-reveal]",
  "3.99.0:0": "performers::[data-attrbtn]",
  "3.97.0:0": "settings/player-ui::Start playing when a scene opens",
  "3.97.0:1": "settings/this-ui::Style classic Stash like this interface",
  "3.97.0:5": "performer/@performer::[data-fav]",
  "3.94.1:0": "scenes::[data-viewseg]",
  "3.94.0:0": "scenes::[data-viewseg]",
};

export const LATEST = CHANGES[0].v;
