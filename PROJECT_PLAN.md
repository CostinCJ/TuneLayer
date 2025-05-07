# Project Plan: TuneLayer - Spotify Game Overlay Application

## 1. Project Goal
Develop "TuneLayer," a lightweight, interactive PC overlay application using Overwolf that allows users to control Spotify playback, browse playlists, and search for songs while in-game, without needing to alt-tab or exit the game.

## 2. Target User
Gamers who listen to Spotify while playing PC games and want seamless control over their music.

## 3. Core Requirements Overview
*   **Platform:** Windows PC (Primary), using Overwolf.
*   **Spotify Integration:** Utilize Spotify Web API with OAuth 2.0. Robust error handling.
*   **Overlay UI/UX:**
    *   **Main View (Minimal):** Unobtrusive, transparent (adjustable), movable, saves position. Displays current track/artist, volume, Play/Pause, Next, Previous. Real-time updates.
    *   **Navigation:** Subtle mechanism for switching views (Main, Playlist, Search).
    *   **Playlist View:** Display user's playlists, select playlist to view tracks, select track to play (switches to Main View).
    *   **Search View:** Search input, display results (track/artist), select track to play (switches to Main View).
    *   **Styling:** Clean, modern, game-overlay appropriate (minimal, potential themes).
*   **Performance:** Minimal impact on game performance (CPU, GPU, RAM). Smooth UI.

## 4. Chosen Technology
*   **Overlay Platform:** Overwolf
*   **Music Service Integration:** Spotify Web API (with OAuth 2.0 for authentication)

## 5. Proposed Architecture

```mermaid
graph TD
    subgraph User PC
        subgraph Game Process
            Game
        end
        subgraph Overwolf Platform
            OW_API[Overwolf APIs e.g., Windows, Hotkeys, Events]
            subgraph TuneLayer App
                BG[Background Script (js/background.js)]
                UI_Overlay[Overlay Window (html/overlay.html + js/overlay.js + css/overlay.css)]
                CallbackPage[OAuth Callback Page (html/callback.html)]

                BG -- Manages Window State & Data --> UI_Overlay
                BG -- Handles Hotkeys --> OW_API
                BG -- Spotify API Calls --> SpotifyAPI
                BG -- Stores/Retrieves Tokens & Settings --> LocalStorage[Overwolf Local Storage/Settings API]
                UI_Overlay -- User Interactions/Commands --> BG
                UI_Overlay -- Displays Data to --> User
                CallbackPage -- Receives Auth Code & Forwards to --> BG
            end
        end
        SpotifyApp[Spotify Desktop App/Web Player (Playback Target)]
    end

    subgraph Internet
        SpotifyAPI[Spotify Web API]
    end

    User[User] -- Interacts --> UI_Overlay
    User -- Interacts --> Game
    OW_API -- Renders Overlay In-Game --> Game Process

    classDef ow fill:#f9f,stroke:#333,stroke-width:2px;
    classDef spotify fill:#1DB954,stroke:#333,stroke-width:2px;
    classDef app fill:#add8e6,stroke:#333,stroke-width:2px;
    classDef user_interaction fill:#ffcc99,stroke:#333,stroke-width:2px;

    class OW_API,BG,UI_Overlay,CallbackPage ow;
    class SpotifyAPI,SpotifyApp spotify;
    class TuneLayer App app;
    class User,Game user_interaction;
```

**Architectural Components:**
*   **Background Script (`js/background.js`):** Core logic, Spotify OAuth, API communication, state management, hotkey handling, settings.
*   **Overlay Window (`html/overlay.html`, `js/overlay.js`, `css/overlay.css`):** UI rendering (Main, Playlist, Search views), user interaction, dynamic updates.
*   **OAuth Callback Page (`html/callback.html`):** Handles Spotify redirect post-authentication, passes auth code to background script.
*   **Spotify Web API:** External service for music data and control.

## 6. Key UI/UX Decisions
*   **View Switching:** Views (Main, Playlist, Search) will initially aim to fit within the `max_size` of 450x600 pixels defined in `manifest.json`. Resizing will be a secondary consideration if usability demands it.
*   **OAuth Redirect URI:** To be constructed as `overwolf-extension://[YOUR_APP_UID]/html/callback.html` (App UID to be confirmed/retrieved).
*   **Transparency Control:** Adjustable via a slider for a continuous range of values. This control will reside on a separate settings page/view, not directly on the minimal main overlay.
*   **Window Position:** Overlay window will be draggable and its position will be saved between sessions.

## 7. Initial Prototype Focus (Highest Priority)
1.  **Phase 1: Authentication:** Full OAuth 2.0 flow with Spotify.
2.  **Core of Phase 2: Basic Playback Control:** Displaying the currently playing track & artist, and Play/Pause buttons in the Main View.

## 8. Detailed Development Phases & Timeline Estimation

**Phase 1: Setup & Authentication (Estimate: 5-7 days) - *High Priority***
*   Spotify Developer Dashboard setup (App registration, Client ID/Secret, Redirect URI).
*   Overwolf environment confirmation.
*   OAuth 2.0 PKCE flow implementation in `js/background.js`.
*   `html/callback.html` logic to handle redirect and token exchange.
*   Secure token storage (Overwolf encrypted settings or localStorage).
*   Token refresh mechanism.
*   Basic UI in `html/overlay.html` for "Login with Spotify" and status display.

**Phase 2: Core Playback Control (Estimate: 4-6 days) - *Core elements High Priority***
*   Spotify API integration in `js/background.js` for:
    *   Get current playback state (`/me/player`).
    *   Play/Pause, Next/Previous, Set Volume.
*   Polling/mechanism for real-time playback state updates.
*   Main View UI (`html/overlay.html`, `css/overlay.css`, `js/overlay.js`):
    *   Display: Track Title, Artist.
    *   Controls: Play/Pause, Next, Previous buttons.
    *   Volume slider/bar.
    *   Real-time UI updates.

**Phase 3: Playlist Functionality (Estimate: 5-7 days)**
*   Spotify API integration in `js/background.js` for:
    *   Fetch user's playlists (`/me/playlists`).
    *   Fetch tracks for a selected playlist (`/playlists/{playlist_id}/tracks`).
*   Playlist View UI (dynamic section in `html/overlay.html`):
    *   Display list of playlists.
    *   On selection, display tracks.
    *   Allow track selection to start playback.

**Phase 4: Search Functionality (Estimate: 4-6 days)**
*   Spotify API integration in `js/background.js` for search (`/search` with `type=track`).
*   Search View UI (dynamic section in `html/overlay.html`):
    *   Search input field.
    *   Display search results.
    *   Allow track selection from results to start playback.

**Phase 5: Overlay Mechanics & UX Refinements (Estimate: 5-7 days)**
*   Window Management (`js/overlay.js` using Overwolf APIs):
    *   Overlay movability (`overwolf.windows.dragMove`).
    *   Save/restore window position (`overwolf.settings`).
*   View Switching Mechanism (`js/overlay.js`, `html/overlay.html`).
*   Settings Page/View:
    *   Transparency control (slider).
    *   Other potential user settings (e.g., default view).
*   UI/UX Polish: Styling, transitions, overall flow. Consider dark/light themes.

**Phase 6: Testing & Optimization (Estimate: 7-10 days, ongoing throughout)**
*   Performance testing with various games (CPU, GPU, RAM).
*   Compatibility testing (resolutions, scaling).
*   Robust error handling (API errors, network issues, no active device, user feedback).
*   Code optimization (API call frequency, caching, debouncing).
*   Code comments and build instructions.

**Total Estimated Timeline: Approximately 30-43 development days.**
*(This estimate assumes one developer familiar with JavaScript/web tech, with some ramp-up for Overwolf/Spotify API specifics.)*

## 9. Key Considerations
*   **Spotify API Rate Limiting:** Implement smart caching, avoid excessive polling, handle `Retry-After` headers.
*   **Game Compatibility:** Leverage Overwolf's strengths, but test across popular titles.
*   **Error Handling:** Comprehensive error handling and clear user feedback are crucial for good UX.

## 10. Deliverables
*   Source code with clear documentation and comments.
*   Build instructions.
*   A functional application package (Overwolf app package `.opk`).