# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static web-based music archive application showcasing Chinese artists (primarily focused on Jay Chou/周杰伦). Built with vanilla HTML, CSS, and JavaScript - no build tools, frameworks, or package managers required.

### Entry Points
- `Music-Archive-Project.html` - Modular version with all features (references separate `style.css`, `app.js`, `player.js`, `data.js`, `lyrics.js`, `storage.js`, `lazy-loader.js`)
- `Music-Archive-Final.html` - Self-contained version (all CSS inline)

### Running the Application
Simply open either HTML file in a web browser. No server or build process required.

---

## Architecture

The application follows a modular three-layer architecture:

### Data Layer
- **`data.js`**: Artist and album data
  - Exports `MOCK_DB` - Array of artist objects containing albums and songs
  - Exports `CATEGORIES` - Array of genre filter options ("全部", "华语", "港台", "欧美", "摇滚", "民谣", "爵士", "电子", "嘻哈", "R&B")

- **`lyrics.js`**: LRC lyrics database
  - Stores song lyrics in LRC format with time stamps
  - Key format: "Artist-SongName" for lookup
  - Example: `'周杰伦-星晴': '[ti:星晴-周杰伦][ar:周杰伦][00:12.36]一步两步三步四步...'`

**Artist Object Structure:**
```javascript
{
    id: 'unique_id',           // Unique identifier (e.g., 'j1', 'x1')
    name: 'Artist Name',
    group: 'FirstLetter',      // For alphabet index bar (e.g., 'J', 'Z')
    category: 'Genre',         // Must match one in CATEGORIES
    avatar: 'path/to/image',   // Optional artist image (falls back to UI Avatars API)
    albums: [
        {
            title: 'Album Title',
            year: 'YYYY-MM',
            cover: 'path/to/image.jpg',
            songs: ['Song 1', 'Song 2', ...]
        }
    ]
}
```

### View Layer (`Music-Archive-Project.html`)
- **Sidebar**: Search box, category chips (horizontally scrollable with drag), artist list grouped by first letter, alphabet index bar
- **Main Content**: Album cover, metadata, album tabs (horizontally scrollable), song table
- **Player Bar**: Fixed bottom bar with vinyl player design (rotating record + tonearm), playback controls
- **Local Music View**: Alternative view for managing uploaded local songs

### Logic Layer
- **`app.js`**: Main application logic (1,163 lines)
  - `viewState` - Tracks selected artist index (`sIdx`), album index (`aIdx`), current category, and search query
  - `filterAndRender()` - Core function that filters artists by category/search and re-renders the sidebar
  - `updateView()` - Renders the selected artist's album details and songs
  - `selectArtist(idx)` - Changes artist selection and resets to first album
  - `renderCategories()`, `renderSidebar()` - UI rendering functions
  - IndexedDB integration for local audio file storage

- **`player.js`**: Audio player functionality
  - Real audio playback with progress bar, volume control, play modes (sequence, loop, single, shuffle)
  - LRC lyrics parsing and synchronization system with word-by-word highlighting
  - Favorite songs with heart animation
  - Vinyl player design with rotating disc and animated tonearm
  - Four play modes: sequential, list loop, single loop, random

- **`storage.js`**: Unified storage management system (398 lines)
  - Supports guest mode and logged-in user mode with data isolation
  - Manages: volume, play mode, favorites (with timestamps), lyrics offset, last played, play count
  - Data migration function: `migrateGuestDataToUser()` for when guests log in
  - Prefix-based storage: `'guest_'` vs `'user_{userId}_'`

- **`lazy-loader.js`**: Image lazy loading (219 lines)
  - Uses Intersection Observer API for performance
  - Supports placeholder images, loading states, error handling
  - Exports `window.LazyLoader` with methods: `init()`, `observe()`, `observeMany()`, `loadImmediately()`, `refresh()`, `destroy()`

---

## Adding New Artists

To add a new artist, edit `data.js` and append a new object to `MOCK_DB`:

1. Choose a unique `id` (e.g., `'x1'`, `'z3'`)
2. Set `group` to the first letter of the artist's name (for alphabetical sorting)
3. Set `category` to one of: "全部", "华语", "港台", "欧美", "摇滚", "民谣", "爵士", "电子", "嘻哈", "R&B"
4. Add album cover images to `./images/` directory or use placeholder URLs

## Adding Lyrics

Lyrics are stored in LRC format in `lyrics.js`. Add lyrics using the key format `"Artist-SongName"`:

```javascript
'周杰伦-新歌': `[ti:新歌-周杰伦]
[ar:周杰伦]
[00:10.00]歌词第一句
[00:15.00]歌词第二句
`
```

Alternatively, create `.lrc` files in the project root and reference them in `lyrics.js`.

---

## External Dependencies

- **Google Fonts**: Inter (English), Noto Serif SC (Chinese)
- **UI Avatars API**: Used for generating default artist avatars (`https://ui-avatars.com/api/?...`)
- **iTunes Search API**: Used for fetching artist images and album covers dynamically
- **SoundHelix**: Provides sample audio files for demonstration

## Browser APIs Used

- **IndexedDB**: Local music file storage (database: `MusicArchiveDB`, object store: `audioFiles`)
- **Audio API**: Real audio playback control
- **File API**: Local file upload handling
- **Intersection Observer API**: Image lazy loading
- **localStorage**: Settings persistence (via `storage.js`)

---

## Storage Systems

### IndexedDB (Local Audio Files)
- Database name: `MusicArchiveDB`
- Object store: `audioFiles`
- Stores song metadata + audio blobs for offline playback

**Functions** (in `app.js`):
- `saveLocalSongsToStorage()` - Saves uploaded songs to IndexedDB
- `loadLocalSongsFromStorage()` - Loads saved songs on app initialization
- `uploadSongForTrack()` - Handles individual song audio upload
- `hasLocalFile()` - Checks if song has local audio file
- `getSongAudioUrl()` - Gets audio URL (prioritizes local files over streaming)

### localStorage (User Settings)
Managed by `storage.js` with dual-mode support:

**Guest Mode**: Uses `'guest_'` prefix for all keys
**User Mode**: Uses `'user_{userId}_'` prefix for data isolation

**Storage Keys**:
- `volume` - Audio volume (0-1)
- `play_mode` - Playback mode (sequence/loop/single/shuffle)
- `favorites` - Array of favorite songs with timestamps
- `lyrics_offset` - Lyrics time offset in seconds
- `last_played` - Last played song info
- `play_count_{artist}_{song}` - Per-song play count

**API**:
- `Settings.saveVolume()`, `Settings.loadVolume()`
- `Settings.savePlayMode()`, `Settings.loadPlayMode()`
- `Settings.addFavorite()`, `Settings.removeFavorite()`, `Settings.isFavorite()`
- `Settings.saveLyricsOffset()`, `Settings.loadLyricsOffset()`
- `UserState.setCurrentUser()`, `UserState.getCurrentUser()`
- `migrateGuestDataToUser()` - Migrates guest data when user logs in

---

## Image Handling

### Dynamic Fetching
The app can dynamically fetch artist images and album covers from iTunes API:
- `fetchArtistImage()` - Searches iTunes API for artist images
- `fetchAlbumCover()` - Searches iTunes API for album covers
- `preloadArtistImages()` - Preloads all artist images on startup
- `preloadAlbumCovers()` - Preloads current artist's album covers

Images have fallback to UI Avatars API or placeholder URLs if fetch fails.

### Lazy Loading
Implemented in `lazy-loader.js` using Intersection Observer API:
- Add `data-src` attribute to images for lazy loading
- Automatic placeholder and error handling
- Use `window.LazyLoader.observe(image)` to manually observe images
- Use `window.LazyLoader.refresh()` to scan for new lazy-loadable images

---

## CSS Architecture (`style.css`)

Uses CSS custom properties for theming:
- `--bg-main`, `--bg-sidebar`, `--bg-hover` - Background colors
- `--accent: #d4af37` - Gold accent color for active states
- `--font-en: "Inter"` - English font
- `--font-cn: "Noto Serif SC"` - Chinese font

**Key styling notes**:
- Scrollbars are hidden globally (`scrollbar-width: none`, `::-webkit-scrollbar { display: none; }`)
- Category and tab lists use horizontal scrolling with drag support
- Active states use gold accent color with subtle glow effects

**Vinyl Player Design** (documented in `VINYL_PLAYER_DESIGN.md`):
- Rotating black vinyl disc with album cover background
- Animated tonearm using CSS pseudo-elements (::before, ::after)
- Uses `animation-play-state: paused/running` to maintain rotation position
- Tonesarm rotates from -90deg (paused) to 25deg (playing)

---

## Important Implementation Details

1. **Script Loading Order**: `data.js` → `app.js` → `storage.js` → `lazy-loader.js` → `player.js`
2. **Click vs Drag Detection**: Category and tab clicks distinguish between click and drag by tracking `startClickX` delta (threshold: 5px)
3. **Auto-Scroll**: Selected category chips and album tabs automatically scroll into view using custom center calculation (not native `scrollIntoView`)
4. **Multi-view System**: App switches between Artist View and Local Music View for managing uploaded songs
5. **Image Loading with Fallbacks**: Images attempt iTunes API first, then fall back to UI Avatars or placeholders
6. **Hidden Scrollbars**: All scrollbars are hidden globally for a cleaner appearance
7. **Dark Theme**: All UI uses dark colors (#111111, #181818) with gold (#d4af37) accents
8. **Lyrics Synchronization**: LRC parser supports word-by-word highlighting with CSS mask fade effects

## File Structure

```
E:\Html-work\
├── Music-Archive-Project.html    # Main entry point (modular)
├── Music-Archive-Final.html      # Alternative entry point (self-contained)
├── style.css                     # Main stylesheet
├── data.js                       # Artist and album data
├── lyrics.js                     # LRC lyrics database
├── app.js                        # Application logic
├── player.js                     # Audio player module
├── storage.js                    # Storage management system
├── lazy-loader.js                # Image lazy loading
├── CLAUDE.md                     # This file - project instructions
├── Music-Archive-Project.md      # Project documentation (Chinese)
├── VINYL_PLAYER_DESIGN.md        # Vinyl player design spec
├── PERFORMANCE_PLAN.md           # Performance optimization plan
└── images/                       # Image assets
    ├── avatars/                  # Artist avatar images
    └── jay_j1.jpg through jay_j14.jpg  # Album covers
```

## Related Documentation

- `Music-Archive-Project.md` - Detailed feature documentation (Chinese)
- `VINYL_PLAYER_DESIGN.md` - Technical implementation of vinyl player
- `PERFORMANCE_PLAN.md` - Performance optimization strategies
