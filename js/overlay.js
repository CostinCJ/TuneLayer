// js/overlay.js
console.log("Overlay script loaded.");

// Helper function to send messages to the background script
function sendMessageToBackground(messageId, payload, callback) {
    overwolf.windows.obtainDeclaredWindow("background", (result) => {
        if (result.status === "success" && result.window && result.window.id) {
            const backgroundWindowId = result.window.id;
            overwolf.windows.sendMessage(backgroundWindowId, messageId, payload, (response) => {
                if (callback) {
                    callback(response);
                }
            });
        } else {
            console.error(`Could not find background window to send message '${messageId}'. Status: ${result.status}, Error: ${result.error}`);
            if (callback) {
                callback({ status: "error", error: "Background window not found or error retrieving it." });
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('login-button');
    const authStatusElement = document.getElementById('auth-status');

    const authView = document.getElementById('auth-view');
    const mainView = document.getElementById('main-view');
    const navigation = document.getElementById('navigation'); // For later use

    if (loginButton) {
        loginButton.addEventListener('click', () => {
            console.log("Login button clicked.");
            authStatusElement.textContent = 'Attempting to log in...';
            // Send a message to the background script to initiate login
            sendMessageToBackground('request_login', null, (response) => {
                // The response here is from the sendMessage operation itself,
                // not necessarily a content response from the background script's handler.
                // Background script handles 'request_login' by initiating login and then
                // sends separate messages like 'AUTH_SUCCESS' or 'AUTH_ERROR'.
                // The actual success/failure of the login operation will come via a separate message from background.
                // Here, we just check if the sendMessage call itself had an issue.
                if (response && response.status === "error") {
                    console.error("Error sending login request to background:", response.error);
                    authStatusElement.textContent = `Error sending command.`;
                } else {
                    console.log("Login request dispatched to background.");
                }
            });
        });
    } else {
        console.error("Login button not found.");
    }

    // Listen for messages from the background script
    overwolf.windows.onMessageReceived.addListener((message) => {
        // Log the raw message first
        console.log("Overlay received raw message:", JSON.stringify(message));

        if (message && message.id === "background_message" && message.content) { // Check message.id instead of message.name
            const data = message.content;
             // Log the parsed data content
            console.log("Parsed message data:", JSON.stringify(data));
            
            switch (data.type) {
                case 'AUTH_SUCCESS':
                    console.log("Processing AUTH_SUCCESS message.");
                    try {
                        if (authStatusElement) {
                            authStatusElement.textContent = data.message || 'Login Successful!';
                            authStatusElement.style.color = 'green';
                            console.log("Set authStatus text and color.");
                        } else { console.error("authStatusElement not found!"); }

                        if (authView) {
                            authView.style.display = 'none';
                            console.log("Set authView display to none.");
                        } else { console.error("authView not found!"); }

                        if (mainView) {
                            mainView.style.display = 'flex'; // Use flex as internal layout uses flex properties
                            console.log("Set mainView display to flex.");
                        } else { console.error("mainView not found!"); }

                        if (navigation) {
                            navigation.style.display = 'flex'; // Show navigation
                            console.log("Set navigation display to flex.");
                        } else { console.error("navigation not found!"); }
                        
                        console.log("AUTH_SUCCESS processing complete.");
                        // TODO: Request initial playback state
                    } catch (uiError) {
                        console.error("Error updating UI during AUTH_SUCCESS:", uiError);
                    }
                    break;
                case 'AUTH_ERROR':
                    authStatusElement.textContent = `Error: ${data.message}`;
                    authStatusElement.style.color = 'red';
                    authView.style.display = 'block';
                    mainView.style.display = 'none';
                    navigation.style.display = 'none';
                    break;
                case 'AUTH_STATUS_KNOWN':
                     console.log("Processing AUTH_STATUS_KNOWN message.");
                     try {
                         if (authStatusElement) {
                             authStatusElement.textContent = data.message || (data.loggedIn ? 'Logged In' : 'Not Logged In');
                         } else { console.error("authStatusElement not found!"); }

                         if (data.loggedIn) {
                             if(authStatusElement) authStatusElement.style.color = 'green';
                             if(authView) authView.style.display = 'none'; else { console.error("authView not found!"); }
                             if(mainView) mainView.style.display = 'flex'; else { console.error("mainView not found!"); }
                             if(navigation) navigation.style.display = 'flex'; else { console.error("navigation not found!"); }
                             console.log("UI updated for logged-in state.");
                              // TODO: Request initial playback state
                         } else {
                             if(authStatusElement) authStatusElement.style.color = 'orange';
                             if(authView) authView.style.display = 'block'; else { console.error("authView not found!"); } // Use block for auth view
                             if(mainView) mainView.style.display = 'none'; else { console.error("mainView not found!"); }
                             if(navigation) navigation.style.display = 'none'; else { console.error("navigation not found!"); }
                             console.log("UI updated for logged-out state.");
                         }
                         console.log("AUTH_STATUS_KNOWN processing complete.");
                     } catch (uiError) {
                         console.error("Error updating UI during AUTH_STATUS_KNOWN:", uiError);
                     }
                     break;
                default:
                    console.log("Received unhandled message type from background:", data.type);
            }
        }
    });

    // Request initial auth status when overlay loads
    // This helps if the user is already logged in from a previous session
    console.log("Requesting initial auth status from background script.");
    // A bit of a delay to ensure background script is ready, especially on first load
    setTimeout(() => {
        sendMessageToBackground('request_initial_auth_status', null, (response) => {
            // Similar to the login request, this callback indicates the status of sending the message.
            // The actual auth status will come via a separate message from background.js.
            // The actual auth status will come via a separate message from background.js.
            // Here, we just check if the sendMessage call itself had an issue.
            if (response && response.status === "error") {
                console.error("Error requesting initial auth status from background:", response.error);
            } else {
                console.log("Initial auth status request dispatched to background.");
            }
        });
    }, 500);

});

// Basic window drag functionality
function dragMove() {
    overwolf.windows.getCurrentWindow(result => {
        if (result.status === "success") {
            overwolf.windows.dragMove(result.window.id);
        }
    });
}

// Make the window draggable (e.g., by its body or a specific header element)
// For simplicity, making the whole app container draggable.
// Consider adding a specific drag handle later for better UX.
document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.addEventListener('mousedown', (event) => {
            // Ensure it's a left-click and not on an interactive element like a button or slider
            if (event.button === 0 && 
                event.target.tagName !== 'BUTTON' && 
                event.target.tagName !== 'INPUT' &&
                event.target.tagName !== 'A') {
                dragMove();
            }
        });
    }
});