# HeyMira - Voice Call Feature Documentation

## 1. Overview
HeyMira provides a real-time, hands-free voice calling experience that allows users to talk to their AI companions just like a regular phone call. The feature leverages the **Web Speech API** for both Speech-to-Text (STT) and Text-to-Speech (TTS), creating a seamless conversational loop without the need for typing.

---

## 2. Calling User Interface (UI)
The voice call interface is designed with a modern, "WhatsApp-style" aesthetic to provide a familiar and comforting experience.

### 2.1 The Call Overlay (`.wa-call-screen`)
- **Full-Screen Experience**: A glassmorphic overlay that appears over the chat interface when a call is active.
- **Header**: Displays "End-to-end encrypted" to reassure the user of their privacy.
- **Persona Identity**: Shows the name of the AI companion and a real-time status (e.g., "Calling...", "Listening...", "Thinking...", "Speaking...").
- **Visual Feedback**:
  - **Dynamic Avatar**: Displays the persona's profile picture or a default icon.
  - **Ripple Animation**: Concentric circles pulsing from the avatar to indicate an active connection.
  - **Live Transcripts**: 
    - **User Transcript**: Shows a real-time preview of what the user is saying ("You: ...").
    - **AI Transcript**: Displays the AI's response as it is being spoken ("AI: ...").

### 2.2 Call Controls
A floating control bar at the bottom provides essential call management:
- **Mute Microphone**: Toggles the user's microphone on/off. Visual cues (red background/slashed icon) indicate a muted state.
- **End Call**: A prominent red button to immediately terminate the voice session.
- **Speaker Toggle**: Allows users to mute the AI's voice output while still maintaining the call (useful for reading transcripts in silence).

---

## 3. How the Calling Feature Works

### 3.1 Speech-to-Text (The "Listener")
- **Technology**: Uses `window.SpeechRecognition` (Web Speech API).
- **Process**:
  1. The system listens continuously while `isVoiceActive` is true.
  2. It provides "interim results" to show the user their words appearing in real-time.
  3. Once the user stops speaking (detected via `onresult` with `isFinal`), the transcript is automatically sent to the backend.
  4. Recognition is temporarily paused while the AI is "Thinking" or "Speaking" to prevent the system from listening to its own voice.

### 3.2 Backend Communication
- **API Endpoint**: Messages are sent via `POST /api/chat/send`.
- **Payload**: Includes the conversation ID, the transcribed text, and a flag `is_voice: true`.
- **Response**: The backend returns the AI's response text, which is then passed to the TTS engine.

### 3.3 Text-to-Speech (The "Speaker")
- **Technology**: Uses `window.speechSynthesis`.
- **Natural Voice Processing**:
  - **Emoji Stripping**: Before speaking, the system removes emojis and special characters (e.g., `*`, `#`) to ensure the AI sounds natural and doesn't read out technical symbols.
  - **Voice Selection**: Users can select from various voices available on their device (Chrome/Edge recommended for the best selection).
  - **Smart Language Selection**: Defaults to localized voices (like `en-IN` or `en-US`) to provide a high-quality auditory experience.
- **Interruption Handling**: If the user ends the call or mutes the speaker while the AI is talking, the system immediately cancels the current speech.

---

## 4. Technical Requirements & Performance
- **Browser Support**: Optimized for **Google Chrome** and **Microsoft Edge**, as they provide the most robust implementation of the Web Speech API and high-quality cloud-based voices.
- **Privacy**: The system uses end-to-end encryption for the chat flow, and voice processing is handled primarily by the browser's native capabilities.
- **Firebase Integration**: While the database has been migrated to Firebase, the voice calling logic remains decoupled, sending transcribed text to the chat API like a standard message, ensuring compatibility with any database backend.

---

## 5. User States
- **Calling...**: Initializing the connection.
- **Listening...**: Waiting for user input.
- **Thinking...**: Waiting for the AI to generate a response.
- **Speaking...**: AI is reading its response aloud.
- **Reconnecting...**: Automatic retry logic if a network error occurs during speech recognition.
