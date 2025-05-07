// js/background.js
console.log("Background script loaded.");

const SPOTIFY_CLIENT_ID = '39c923b2f1ec422cb8e3683ea3568f17';
let APP_UID = 'neelbkoabmkhlnhphkjimpdfgdicadnmbeghhnhh'; // Example: 'gflbopnpblcgifkpcopabjlelnajfhefphlogpnp'
const SPOTIFY_REDIRECT_URI = () => `overwolf-extension://${APP_UID}/html/callback.html`;

const SPOTIFY_SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'streaming'
].join(' ');

// PKCE Helper Functions
function dec2hex(dec) {
    return ('0' + dec.toString(16)).substr(-2);
}

function generateCodeVerifier() {
    const array = new Uint32Array(56 / 2);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec2hex).join('');
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function initiateLogin() {
    if (!APP_UID || APP_UID === 'neelbkoabmkhlnhphkjimpdfgdicadnmbeghhnhh') { // Check if it's still the placeholder
        console.error("APP_UID is not set or is placeholder. Attempting to retrieve from manifest.");
        overwolf.extensions.current.getManifest(manifest => {
            if (manifest && manifest.UID) {
                APP_UID = manifest.UID;
                console.log("APP_UID retrieved from manifest:", APP_UID);
                constructAndOpenAuthURL();
            } else {
                console.error("Failed to retrieve APP_UID from manifest for login.");
                sendMessageToOverlay({ type: 'AUTH_ERROR', message: 'Could not determine App UID. Please reload the extension.' });
            }
        });
        return;
    }
    constructAndOpenAuthURL();
}

async function constructAndOpenAuthURL() {
    const codeVerifier = generateCodeVerifier();

    // New check for settings API readiness
    function proceedWithAuthURL() {
        console.log("Attempting to access settings API in constructAndOpenAuthURL.");
        if (!overwolf.settings || typeof overwolf.settings.getExtensionSettings !== 'function') {
            console.error("constructAndOpenAuthURL: overwolf.settings.getExtensionSettings is not available. Retrying...");
            // Retry after a short delay
            setTimeout(proceedWithAuthURL, 500); // Retry after 500ms
            return;
        }

        console.log("Settings API seems available. Proceeding with getExtensionSettings.");
        overwolf.settings.getExtensionSettings(res => {
            // Store in localStorage as primary method due to potential settings persistence issues
            try {
                localStorage.setItem('spotify_code_verifier', codeVerifier);
                console.log("spotify_code_verifier stored in localStorage.");
            } catch (e) {
                 console.error("Error storing code_verifier in localStorage:", e);
                 sendMessageToOverlay({ type: 'AUTH_ERROR', message: 'Failed to store internal auth data (localStorage).' });
                 // Optionally, decide if you should abort the auth flow here
            }

            // Also attempt to store in overwolf.settings as a backup/future-proofing
            if (res.success === true) {
                let currentSettings = res.settings || {};
                currentSettings.spotify_code_verifier = codeVerifier; // Add it to settings object
                overwolf.settings.setExtensionSettings(currentSettings, setResult => {
                    if (setResult.status !== 'success' && setResult.success !== true) {
                        console.warn("Warning: Failed to store code_verifier using setExtensionSettings. Full response:", JSON.stringify(setResult));
                        // Don't send error to overlay here, as localStorage is primary
                    } else {
                        console.log("spotify_code_verifier also stored successfully via setExtensionSettings.");
                    }
                });
            } else {
                 console.warn("Warning: Failed to get current settings before attempting to store code_verifier via setExtensionSettings. Full response:", JSON.stringify(res));
                 // Don't send error to overlay here
            }
        });

        generateCodeChallenge(codeVerifier).then(codeChallenge => {
            const authUrl = new URL("https://accounts.spotify.com/authorize");
            authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('redirect_uri', SPOTIFY_REDIRECT_URI());
            authUrl.searchParams.append('scope', SPOTIFY_SCOPES);
            authUrl.searchParams.append('code_challenge_method', 'S256');
            authUrl.searchParams.append('code_challenge', codeChallenge);
            authUrl.searchParams.append('show_dialog', 'true');

            console.log("Opening Spotify Auth URL:", authUrl.toString());
            overwolf.utils.openUrlInDefaultBrowser(authUrl.toString());
        }).catch(error => {
            console.error("Error generating code challenge:", error);
            sendMessageToOverlay({ type: 'AUTH_ERROR', message: 'Failed to generate code challenge.' });
        });
    }

    // Start the process
    proceedWithAuthURL();
}

function sendMessageToOverlay(message) {
    console.log("sendMessageToOverlay called. Diagnosing overwolf.windows...");
    console.log("typeof overwolf.windows:", typeof overwolf.windows);
    if (overwolf.windows) {
        console.log("typeof overwolf.windows.getWindows:", typeof overwolf.windows.getWindows);
    } else {
        console.log("overwolf.windows is undefined.");
    }

    // Defensive check before calling obtainDeclaredWindow
    if (typeof overwolf.windows.obtainDeclaredWindow !== 'function') {
        console.error("sendMessageToOverlay: overwolf.windows.obtainDeclaredWindow is not a function. Cannot send message.");
        return;
    }

    overwolf.windows.obtainDeclaredWindow("overlay", (result) => {
        if (result.status === "success" && result.window && result.window.id) {
            const overlayWindowId = result.window.id;
            console.log(`Obtained overlay window ID: ${overlayWindowId}`);

            // Defensive check for sendMessage
            if (typeof overwolf.windows.sendMessage !== 'function') {
                 console.error("sendMessageToOverlay: overwolf.windows.sendMessage is not a function. Cannot send message.");
                 return;
            }

            overwolf.windows.sendMessage(overlayWindowId, "background_message", message, (res) => {
                // Note: The callback for sendMessage might not always be invoked or contain useful info
                // unless the target window explicitly sends a response back.
                // We primarily check for errors during the send operation itself if possible,
                // but often just log success/failure based on finding the window.
                if (res && res.status === "error") { // Check if Overwolf reports an error sending
                    console.error("Error reported by sendMessage to overlay:", res.error);
                } else {
                    // Log success based on obtaining the window and calling send
                    console.log(`Message sent to overlay window ${overlayWindowId}.`);
                }
            });
        } else {
            console.error("Could not obtain declared window 'overlay'. Status:", result.status, "Error:", result.error);
            // Log the structure of the result if it's not success
             if (result.status !== "success") {
                 console.log("Full obtainDeclaredWindow result object:", JSON.stringify(result)); // Avoid circular errors if possible
             }
        }
    });
}

async function exchangeCodeForToken(authCode) {
    async function proceedWithTokenExchange() {
        console.log("Attempting to retrieve code_verifier from localStorage in exchangeCodeForToken.");
        let codeVerifier = null;
        try {
            codeVerifier = localStorage.getItem('spotify_code_verifier');
        } catch (e) {
            console.error("Error retrieving code_verifier from localStorage:", e);
            sendMessageToOverlay({ type: 'AUTH_ERROR', message: 'Internal error during token exchange (localStorage read failed).' });
            return;
        }

        if (!codeVerifier) {
            console.error("Failed to retrieve code_verifier for token exchange from localStorage: Verifier not found.");
            sendMessageToOverlay({ type: 'AUTH_ERROR', message: 'Internal error during token exchange (missing verifier).' });
            return;
        }

        console.log("Retrieved code_verifier from localStorage:", codeVerifier);

        const tokenUrl = "https://accounts.spotify.com/api/token";
        const payload = {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: SPOTIFY_CLIENT_ID,
                grant_type: 'authorization_code',
                code: authCode,
                redirect_uri: SPOTIFY_REDIRECT_URI(),
                code_verifier: codeVerifier,
            })
        };

        try {
            const response = await fetch(tokenUrl, payload);
            const data = await response.json();
            if (!response.ok) {
                console.error("Error exchanging code for token:", data);
                sendMessageToOverlay({ type: 'AUTH_ERROR', message: `Token exchange failed: ${data.error_description || data.error || 'Unknown error'}` });
                 // Clean up verifier from localStorage even on failure
                localStorage.removeItem('spotify_code_verifier');
                console.log("Cleaned up spotify_code_verifier from localStorage after failed token exchange.");
                return;
            }
            console.log("Tokens received:", data);
            const now = Math.floor(Date.now() / 1000);
            const accessTokenExpiry = now + data.expires_in;

            // Now, get current settings to ADD tokens, keeping existing settings
             console.log("Attempting to get current settings via getExtensionSettings before storing tokens.");
             overwolf.settings.getExtensionSettings(settingsResult => {
                 let updatedSettings = {};
                 if (settingsResult.success === true && settingsResult.settings) {
                     updatedSettings = { ...settingsResult.settings }; // Start with existing settings
                     console.log("Successfully retrieved existing settings:", JSON.stringify(updatedSettings));
                 } else {
                     console.warn("Could not retrieve existing settings before storing tokens. Starting with empty settings object. Response:", JSON.stringify(settingsResult));
                 }

                 // Add new tokens and expiry
                 updatedSettings.spotify_access_token = data.access_token;
                 updatedSettings.spotify_refresh_token = data.refresh_token;
                 updatedSettings.spotify_token_expiry = accessTokenExpiry.toString();
                 // Clean up verifier from settings if it somehow got there
                 delete updatedSettings.spotify_code_verifier;

                 console.log("Attempting to store tokens via setExtensionSettings. Settings to save:", JSON.stringify(updatedSettings));
                 overwolf.settings.setExtensionSettings(updatedSettings, setTokenResult => {
                     if (setTokenResult.status === 'success' || setTokenResult.success === true) { // Check both possibilities
                         console.log("Spotify authentication successful. Tokens stored via setExtensionSettings.");
                         sendMessageToOverlay({ type: 'AUTH_SUCCESS', message: 'Successfully logged in to Spotify!' });
                         // Clean up verifier from localStorage ONLY on successful token storage
                         localStorage.removeItem('spotify_code_verifier');
                         console.log("Cleaned up spotify_code_verifier from localStorage after successful token storage.");
                     } else {
                         console.error("Failed to store tokens using setExtensionSettings. Full response:", JSON.stringify(setTokenResult));
                         sendMessageToOverlay({ type: 'AUTH_ERROR', message: 'Failed to save session tokens.' });
                         // Consider if you should also remove from localStorage here, maybe not?
                     }
                 });
             });

        } catch (error) {
            console.error("Network error during token exchange:", error);
            sendMessageToOverlay({ type: 'AUTH_ERROR', message: `Network error during token exchange: ${error.message}` });
             // Clean up verifier from localStorage on network error
            localStorage.removeItem('spotify_code_verifier');
            console.log("Cleaned up spotify_code_verifier from localStorage after network error during token exchange.");
        }
    }

    // Start the process
    proceedWithTokenExchange();
}

function initializeAppUID() {
    overwolf.extensions.current.getManifest(manifest => {
        if (manifest && manifest.UID) {
            APP_UID = manifest.UID;
            console.log("APP_UID initialized from manifest:", APP_UID);
            // Delay checking initial auth state to allow APIs to fully initialize
            // Even with onAppLaunchTriggered, a slight delay for settings might be cautious
            setTimeout(() => {
                console.log("Diagnosing overwolf.settings before calling checkInitialAuthState (after delay):");
                console.log("typeof overwolf.settings:", typeof overwolf.settings);
                if (overwolf.settings) {
                    console.log("typeof overwolf.settings.getExtensionSettings:", typeof overwolf.settings.getExtensionSettings);
                } else {
                    console.log("overwolf.settings is undefined or null (after delay).");
                }
                checkInitialAuthState();
            }, 1000); // Increased delay to potentially allow settings API to become fully ready
        } else {
            console.error("Failed to retrieve APP_UID from manifest on startup. Using placeholder.");
            // Proceed with placeholder APP_UID, login will attempt to re-fetch
             setTimeout(checkInitialAuthState, 1000); // Increased delay here as well
         }
     });
}

function checkInitialAuthState() {
    // New check for settings API readiness
    function proceedWithAuthCheck() {
        console.log("Attempting to access settings API in checkInitialAuthState.");
        if (!overwolf.settings || typeof overwolf.settings.getExtensionSettings !== 'function') {
            console.error("checkInitialAuthState: overwolf.settings.getExtensionSettings is not available. Retrying...");
            // Retry after a short delay
            setTimeout(proceedWithAuthCheck, 500); // Retry after 500ms
            return;
        }

        console.log("Settings API seems available. Proceeding with getExtensionSettings for auth check.");
        overwolf.settings.getExtensionSettings(result => {
            if (result.success === true && result.settings && result.settings.spotify_access_token) {
                // Potentially check token expiry here using result.settings.spotify_token_expiry
                console.log("User seems to be logged in. Access token found via getExtensionSettings. Settings:", JSON.stringify(result.settings));
                sendMessageToOverlay({ type: 'AUTH_STATUS_KNOWN', loggedIn: true, message: 'Logged in.' });
            } else {
                if (result.success !== true) { // If the call itself failed (not just missing token)
                    console.error("Failed to get extension settings for auth check (API call unsuccessful). Full response:", JSON.stringify(result));
                }
                // This will now log true if API call was ok but token missing, or false/undefined if API call failed
                console.log("User not logged in or no stored access token. API success:", result.success, "Settings content:", JSON.stringify(result.settings));
                sendMessageToOverlay({ type: 'AUTH_STATUS_KNOWN', loggedIn: false, message: 'Please log in to Spotify.' });
            }
        });
    }

    // Start the process
    proceedWithAuthCheck();
}

function toggleOverlayWindow() {
    const overlayWindowName = "overlay";
    overwolf.windows.obtainDeclaredWindow(overlayWindowName, (result) => {
        if (result.status !== "success") {
            console.error(`toggleOverlayWindow: Could not obtain window '${overlayWindowName}'. Status: ${result.status}, Error: ${result.error}`);
            return;
        }
        const overlayWindow = result.window;
        console.log(`toggleOverlayWindow: Obtained window '${overlayWindowName}'. Current visibility: ${overlayWindow.isVisible}, StateEx: ${overlayWindow.stateEx}`);
        if (overlayWindow.isVisible) {
            console.log(`toggleOverlayWindow: Window '${overlayWindowName}' is visible, attempting to minimize.`);
            overwolf.windows.minimize(overlayWindow.id, (minimizeResult) => {
                if (minimizeResult.status === "success") {
                    console.log(`toggleOverlayWindow: Window '${overlayWindowName}' minimized successfully.`);
                } else {
                    console.error(`toggleOverlayWindow: Error minimizing window '${overlayWindowName}'. Error: ${minimizeResult.error}`);
                }
            });
        } else {
            console.log(`toggleOverlayWindow: Window '${overlayWindowName}' is not visible (or minimized/closed), attempting to restore.`);
            overwolf.windows.restore(overlayWindow.id, (restoreResult) => {
                if (restoreResult.status === "success") {
                    console.log(`toggleOverlayWindow: Window '${overlayWindowName}' restored successfully.`);
                } else {
                    console.error(`toggleOverlayWindow: Error restoring window '${overlayWindowName}'. Error: ${restoreResult.error}`);
                }
            });
        }
    });
}

let isAppInitialized = false;

function startAppLogic() {
    if (isAppInitialized) {
        console.log("startAppLogic called, but app already initialized. Source of call might be onAppLaunchTriggered for an already running app.");
        return;
    }
    isAppInitialized = true;
    console.log("startAppLogic() called for the first time, setting up listeners and initializing.");

    overwolf.windows.onMessageReceived.addListener((message) => {
        console.log("Background script received message:", message);
        if (message && message.id === 'request_login') initiateLogin();
        if (message && message.id === 'spotify_auth_callback') {
            if (message.data.code) exchangeCodeForToken(message.data.code);
            else if (message.data.error) {
                console.error("Error from Spotify auth callback:", message.data.error);
                sendMessageToOverlay({ type: 'AUTH_ERROR', message: `Spotify Auth Error: ${message.data.error}` });
            }
        }
        if (message && message.id === 'request_initial_auth_status') checkInitialAuthState();
    });

    overwolf.settings.hotkeys.onPressed.addListener((hotkeyResult) => {
        console.log("Hotkey pressed:", JSON.stringify(hotkeyResult));
        if (hotkeyResult.name === "toggle_overlay") {
            console.log("Toggle overlay hotkey detected.");
            toggleOverlayWindow();
        }
    });
    initializeAppUID();

    // Explicitly try to restore the overlay window after a short delay
    console.log("Attempting to explicitly restore overlay window shortly after init.");
    setTimeout(() => {
        overwolf.windows.obtainDeclaredWindow("overlay", result => {
            if (result.status === "success" && result.window && result.window.id) {
                const windowId = result.window.id;
                const targetWidth = 430; // As per manifest.json
                const targetHeight = 500; // As per manifest.json
                
                console.log(`Attempting to change size of overlay window ${windowId} to ${targetWidth}x${targetHeight}. Current visibility: ${result.window.isVisible}, StateEx: ${result.window.stateEx}`);
                
                overwolf.windows.changeSize(windowId, targetWidth, targetHeight, (sizeResult) => {
                    if (sizeResult.status === "success") {
                        console.log(`Overlay window ${windowId} size changed successfully to ${targetWidth}x${targetHeight}.`);
                        // Now attempt to restore it, as it might be minimized or hidden
                        overwolf.windows.restore(windowId, restoreResult => {
                            if (restoreResult.status === "success") {
                                console.log(`Overlay window ${windowId} restored successfully after size change.`);
                            } else {
                                console.error(`Error restoring overlay window ${windowId} after size change:`, restoreResult.error);
                            }
                        });
                    } else {
                        console.error(`Error changing overlay window ${windowId} size:`, sizeResult.error);
                        // Still try to restore, in case size change failed but window exists and might be hidden
                        console.log(`Attempting to restore ${windowId} even if size change failed.`);
                        overwolf.windows.restore(windowId, restoreResult => {
                            if (restoreResult.status === "success") {
                                console.log(`Overlay window ${windowId} restored (size change failed but restore attempted).`);
                            } else {
                                console.error(`Error restoring overlay window ${windowId} (size change also failed):`, restoreResult.error);
                            }
                        });
                    }
                });
            } else {
                console.error("Failed to obtain overlay window for explicit size change/restore. Status:", result.status, "Error:", result.error);
            }
        });
    }, 3000); // 3-second delay

    console.log("Background script event listeners, initializations, and explicit restore timeout are now set up.");
// Simple test function to check settings API availability
function testSettingsApi() {
    console.log("Attempting to call getExtensionSettings from testSettingsApi.");
    if (overwolf.settings && typeof overwolf.settings.getExtensionSettings === 'function') {
        overwolf.settings.getExtensionSettings(result => {
            console.log("testSettingsApi: getExtensionSettings result:", JSON.stringify(result));
        });
    } else {
        console.error("testSettingsApi: overwolf.settings.getExtensionSettings not available.");
    }
}
}

console.log("Diagnosing overwolf.extensions before adding onAppLaunchTriggered listener:");
console.log("typeof overwolf.extensions:", typeof overwolf.extensions);
if (overwolf.extensions) {
    console.log("typeof overwolf.extensions.onAppLaunchTriggered:", typeof overwolf.extensions.onAppLaunchTriggered);
}

try {
    overwolf.extensions.onAppLaunchTriggered.addListener(e => {
        console.log("onAppLaunchTriggered event received:", JSON.stringify(e, null, 2)); // Log the full event object
        
        // Attempt to parse the auth code from the launch event
        let authCode = null;
        let potentialUrl = null;
        let decodedParameter = null;

        if (e && typeof e.parameter === 'string') {
            try {
                decodedParameter = decodeURIComponent(e.parameter);
                console.log("Decoded e.parameter:", decodedParameter);
            } catch (decodeError) {
                console.error("Error decoding e.parameter:", decodeError, "Original was:", e.parameter);
            }
        }

        if (decodedParameter && decodedParameter.includes('html/callback.html?code=')) {
            potentialUrl = decodedParameter;
        } else if (e && typeof e.origin === 'string' && e.origin.includes('html/callback.html?code=')) {
            // This path is less likely given the logs, but keep as a fallback.
            potentialUrl = e.origin;
        }
        // Add more checks here if Overwolf uses other properties like e.url or e.uri
        // For example:
        // else if (e && typeof e.url === 'string' && e.url.includes('html/callback.html?code=')) {
        //     potentialUrl = e.url;
        // }

        if (potentialUrl) {
            try {
                const urlParams = new URLSearchParams(new URL(potentialUrl).search);
                authCode = urlParams.get('code');
            } catch (parseError) {
                console.error("Error parsing code from onAppLaunchTriggered event URL:", parseError, "URL was:", potentialUrl);
            }
        }

        if (authCode) {
            console.log("Auth code extracted from onAppLaunchTriggered event:", authCode);
            exchangeCodeForToken(authCode);
        } else if (decodedParameter && decodedParameter.includes('html/callback.html?error=')) {
            // Check for error in the decoded parameter
            let errorMsg = 'Unknown error from callback';
            try {
                const urlParams = new URLSearchParams(new URL(decodedParameter).search);
                errorMsg = urlParams.get('error');
            } catch (parseError) {
                console.error("Error parsing error from onAppLaunchTriggered event URL:", parseError, "URL was:", decodedParameter);
            }
            console.error("Error received in onAppLaunchTriggered event:", errorMsg);
            sendMessageToOverlay({ type: 'AUTH_ERROR', message: `Spotify Auth Error: ${errorMsg}` });
        } else {
            // If no code/error in launch params, proceed with normal app startup/check
            // This handles cases where the app is launched normally, not via auth callback
            console.log("No auth code in onAppLaunchTriggered event, proceeding with normal startAppLogic.");
            startAppLogic(); // Call this to ensure app initializes if not already
        }
    });
    console.log("Successfully attempted to add onAppLaunchTriggered listener.");
} catch (err) {
    console.error("Error while adding onAppLaunchTriggered listener:", err);
}

// Call startAppLogic directly for initial cold start
startAppLogic();