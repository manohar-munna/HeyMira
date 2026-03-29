// HeyMira - Voice Call Interface (WhatsApp-Style)
// Uses Web Speech API: SpeechRecognition (STT) + speechSynthesis (TTS)

let recognition = null;
let synthesis = window.speechSynthesis;
let isVoiceActive = false;
let isSpeaking = false;
let isThinking = false;
let isMuted = false;
let isSpeakerOff = false;
let mouthInterval = null;

// ═══════════════════════════════════════════
//  LIP SYNC ENGINE
// ═══════════════════════════════════════════

function startLipSync() {
    if (mouthInterval) clearInterval(mouthInterval);
    const mouthPath = document.getElementById('wa-mouth-path');
    if (!mouthPath) return;

    // Different mouth shapes (Phonemes)
    const shapes = [
        "M10,20 Q30,20 50,20", // Closed
        "M10,20 Q30,40 50,20", // Open (A/O)
        "M10,20 Q30,25 50,20", // Wide (E)
        "M15,20 Q30,35 45,20", // Narrow (U/W)
        "M10,20 Q30,30 50,20"  // Half-open
    ];

    mouthInterval = setInterval(() => {
        if (!isSpeaking) {
            stopLipSync();
            return;
        }
        // Pick a random shape from the phoneme list
        const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
        mouthPath.setAttribute('d', randomShape);
    }, 120); // Sync speed
}

function stopLipSync() {
    if (mouthInterval) {
        clearInterval(mouthInterval);
        mouthInterval = null;
    }
    const mouthPath = document.getElementById('wa-mouth-path');
    if (mouthPath) {
        mouthPath.setAttribute('d', "M10,20 Q30,20 50,20"); // Reset to closed
    }
}

let isVideoEnabled = false;

// ═══════════════════════════════════════════
//  TOGGLE / START / END
// ═══════════════════════════════════════════

function toggleVoiceCall(video = false) {
    if (isVoiceActive) {
        endVoiceCall();
    } else {
        isVideoEnabled = video;
        startVoiceCall();
    }
}

function toggleVideoInCall() {
    if (!isVoiceActive) return;
    isVideoEnabled = !isVideoEnabled;
    updateCallUISettings();
}

function updateCallUISettings() {
    const avatarContainer = document.querySelector('.wa-avatar-container');
    const videoBtn = document.getElementById('wa-video-btn');
    
    if (isVideoEnabled) {
        avatarContainer.classList.add('video-mode');
        videoBtn.classList.remove('muted');
        videoBtn.querySelector('.wa-ctrl-icon').textContent = '📹';
    } else {
        avatarContainer.classList.remove('video-mode');
        videoBtn.classList.add('muted');
        videoBtn.querySelector('.wa-ctrl-icon').textContent = '📵';
    }
}

function startVoiceCall() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Voice calls require Chrome or Edge browser', 'error');
        return;
    }

    if (!currentConversation) {
        showToast('Start a conversation first', 'error');
        return;
    }

    isVoiceActive = true;
    isMuted = false;
    isSpeakerOff = false;
    isSpeaking = false;
    isThinking = false;

    // --- Populate call screen identity ---
    const personaSelect = document.getElementById('persona-select');
    const selectedOption = personaSelect ? personaSelect.selectedOptions[0] : null;
    let personaName = 'Mira';
    if (activePersona) {
        personaName = activePersona.name;
    } else if (selectedOption && selectedOption.value) {
        personaName = selectedOption.textContent.split(' — ')[0];
    }
    document.getElementById('wa-call-name').textContent = personaName;

    // Set avatar image if available
    const avatarEl = document.getElementById('voice-avatar');
    const mouthOverlay = `<div class="wa-mouth-overlay"><svg viewBox="0 0 60 40"><path id="wa-mouth-path" class="wa-mouth-path" d="M10,20 Q30,20 50,20" /></svg></div>`;
    
    if (activePersona && activePersona.profile_image) {
        avatarEl.innerHTML = `<img src="${activePersona.profile_image}" alt="${personaName}">${mouthOverlay}`;
    } else {
        avatarEl.innerHTML = `💜${mouthOverlay}`;
    }

    // Update UI for video/voice
    updateCallUISettings();

    // Reset UI
    setCallStatus('calling');
    document.getElementById('wa-user-text').textContent = '...';
    document.getElementById('wa-ai-text').textContent = 'Waiting to connect...';
    resetMuteUI();
    resetSpeakerUI();

    // Show the overlay
    document.getElementById('voice-overlay').classList.add('active');
    document.getElementById('voice-btn').classList.add('active');

    // --- Setup Speech Recognition ---
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US'; // Use browser's language for better accuracy

    let finalTranscript = '';

    recognition.onresult = (event) => {
        if (isMuted || isSpeaking) return;

        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        // Show live user transcript
        const display = finalTranscript || interimTranscript;
        if (display.trim()) {
            document.getElementById('wa-user-text').textContent = display.trim();
            document.getElementById('wa-transcript-user').classList.add('active');
        }

        // When we have a final result, wait briefly then send
        if (finalTranscript.trim().length > 0) {
            clearTimeout(recognition._sendTimeout);
            recognition._sendTimeout = setTimeout(() => {
                if (finalTranscript.trim()) {
                    const msg = finalTranscript.trim();
                    finalTranscript = '';
                    isThinking = true;
                    setCallStatus('thinking');
                    document.getElementById('wa-transcript-user').classList.remove('active');

                    // Pause recognition while AI responds
                    try { recognition.abort(); } catch (e) { }
                    sendVoiceMessage(msg);
                }
            }, 400); // 400ms for "immediate" response after pausing
        }
    };
    recognition.onend = () => {
        // Auto-restart if call is active and we're not speaking
        if (isVoiceActive && !isSpeaking && !isThinking) {
            try {
                setTimeout(() => {
                    if (isVoiceActive && !isSpeaking && !isThinking && !isMuted) {
                        recognition.start();
                        setCallStatus('listening');
                    }
                }, 300);
            } catch (e) { }
        }
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
            document.getElementById('wa-user-text').textContent = "I'm listening... take your time";
        } else if (event.error === 'network') {
            setCallStatus('reconnecting');
            // Auto-retry after a brief pause
            setTimeout(() => {
                if (isVoiceActive && !isSpeaking) {
                    try { recognition.start(); } catch (e) { }
                    setCallStatus('listening');
                }
            }, 2000);
        } else if (event.error !== 'aborted') {
            console.error('Recognition error:', event.error);
        }
    };

    // Brief "Calling..." delay then start listening
    setTimeout(() => {
        if (!isVoiceActive) return;
        try {
            recognition.start();
            setCallStatus('listening');
            document.getElementById('wa-user-text').textContent = "Speak naturally — I'm here for you";
            document.getElementById('wa-ai-text').textContent = 'Connected';
        } catch (e) {
            showToast('Could not start voice recognition', 'error');
            endVoiceCall();
        }
    }, 800);
}

function endVoiceCall() {
    isVoiceActive = false;
    isSpeaking = false;
    isThinking = false;
    isMuted = false;
    isSpeakerOff = false;

    if (recognition) {
        try { recognition.stop(); } catch (e) { }
        recognition = null;
    }

    synthesis.cancel();
    
    const avatar = document.getElementById('voice-avatar');
    if (avatar) avatar.classList.remove('is-speaking-pulse');

    document.getElementById('voice-overlay').classList.remove('active');
    document.getElementById('voice-btn').classList.remove('active');
}


// ═══════════════════════════════════════════
//  STATUS MANAGEMENT
// ═══════════════════════════════════════════

function setCallStatus(status) {
    const statusEl = document.getElementById('voice-status');
    // Remove all status classes
    statusEl.classList.remove('listening', 'thinking', 'speaking', 'reconnecting');

    switch (status) {
        case 'calling':
            statusEl.textContent = 'Calling...';
            break;
        case 'listening':
            statusEl.textContent = 'Listening...';
            statusEl.classList.add('listening');
            break;
        case 'thinking':
            statusEl.textContent = 'Thinking...';
            statusEl.classList.add('thinking');
            break;
        case 'speaking':
            statusEl.textContent = 'Speaking...';
            statusEl.classList.add('speaking');
            break;
        case 'reconnecting':
            statusEl.textContent = 'Reconnecting...';
            statusEl.classList.add('reconnecting');
            break;
    }
}


// ═══════════════════════════════════════════
//  MUTE / SPEAKER TOGGLES
// ═══════════════════════════════════════════

function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById('wa-mute-btn');

    if (isMuted) {
        btn.classList.add('muted');
        btn.querySelector('.wa-ctrl-icon').textContent = '🔇';
        btn.querySelector('.wa-ctrl-label').textContent = 'Unmute';
        // Stop recognition
        if (recognition) {
            try { recognition.stop(); } catch (e) { }
        }
    } else {
        resetMuteUI();
        // Restart recognition
        if (isVoiceActive && !isSpeaking && recognition) {
            try { recognition.start(); } catch (e) { }
            setCallStatus('listening');
        }
    }
}

function resetMuteUI() {
    const btn = document.getElementById('wa-mute-btn');
    btn.classList.remove('muted');
    btn.querySelector('.wa-ctrl-icon').textContent = '🎤';
    btn.querySelector('.wa-ctrl-label').textContent = 'Mute';
}

function toggleSpeaker() {
    isSpeakerOff = !isSpeakerOff;
    const btn = document.getElementById('wa-speaker-btn');

    if (isSpeakerOff) {
        btn.classList.add('muted');
        btn.querySelector('.wa-ctrl-icon').textContent = '🔈';
        btn.querySelector('.wa-ctrl-label').textContent = 'Unmute';
        // If currently speaking, cancel it
        if (isSpeaking) {
            synthesis.cancel();
            isSpeaking = false;
            // Restart listening
            if (isVoiceActive && !isMuted && recognition) {
                try { recognition.start(); } catch (e) { }
                setCallStatus('listening');
            }
        }
    } else {
        resetSpeakerUI();
    }
}

function resetSpeakerUI() {
    const btn = document.getElementById('wa-speaker-btn');
    btn.classList.remove('muted');
    btn.querySelector('.wa-ctrl-icon').textContent = '🔊';
    btn.querySelector('.wa-ctrl-label').textContent = 'Speaker';
}


// ═══════════════════════════════════════════
//  TEXT-TO-SPEECH (The "Speaker")
// ═══════════════════════════════════════════

function cleanTextForSpeech(text) {
    // Strip emojis
    let cleaned = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');
    // Strip markdown symbols
    cleaned = cleaned.replace(/[*#_~`>|]/g, '');
    // Collapse multiple spaces / newlines
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

function speakResponse(text) {
    if (!isVoiceActive || !synthesis) return;

    // If speaker is muted, skip speaking and go back to listening
    if (isSpeakerOff) {
        document.getElementById('wa-ai-text').textContent = text;
        isThinking = false;
        if (!isMuted && recognition) {
            try { recognition.start(); } catch (e) { }
            setCallStatus('listening');
        }
        return;
    }

    isThinking = false;
    isSpeaking = true;
    setCallStatus('speaking');
    startLipSync(); // Trigger phoneme animation

    // Add audio-reactive pulse effect
    const avatar = document.getElementById('voice-avatar');
    if (avatar) avatar.classList.add('is-speaking-pulse');

    // Show AI transcript
    document.getElementById('wa-ai-text').textContent = text;
    document.getElementById('wa-transcript-ai').classList.add('active');
    document.getElementById('wa-transcript-user').classList.remove('active');

    // Cancel any ongoing speech
    synthesis.cancel();

    const cleanedText = cleanTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Pick the selected voice or best voice
    const voices = synthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    let selectedVoice = null;
    
    if (voiceSelect && voiceSelect.value) {
        selectedVoice = voices.find(v => v.voiceURI === voiceSelect.value);
    }
    
    if (!selectedVoice) {
        selectedVoice =
            voices.find(v => v.lang === 'en-IN') ||
            voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
            voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
            voices.find(v => v.lang.startsWith('en'));
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
        // Remove pulse effect
        if (avatar) avatar.classList.remove('is-speaking-pulse');
        stopLipSync(); // Close mouth
        
        // Wait briefly for room echo to die down before re-enabling listening
        setTimeout(() => {
            isSpeaking = false;
            document.getElementById('wa-transcript-ai').classList.remove('active');
            if (isVoiceActive) {
                setCallStatus('listening');
                document.getElementById('wa-user-text').textContent = 'Your turn to speak...';
                // Restart recognition
                if (!isMuted && recognition) {
                    try { recognition.start(); } catch (e) { }
                }
            }
        }, 200);
    };

    utterance.onerror = () => {
        // Remove pulse effect
        if (avatar) avatar.classList.remove('is-speaking-pulse');
        stopLipSync(); // Close mouth

        setTimeout(() => {
            isSpeaking = false;
            document.getElementById('wa-transcript-ai').classList.remove('active');
            if (isVoiceActive && !isMuted && recognition) {
                try { recognition.start(); } catch (e) { }
                setCallStatus('listening');
            }
        }, 200);
    };

    synthesis.speak(utterance);
}

// ═══════════════════════════════════════════
//  INIT: Load voices (async in some browsers)
// ═══════════════════════════════════════════

function populateVoiceList() {
    if (!synthesis) return;
    const voices = synthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    if (!voiceSelect) return;

    const currentSelection = voiceSelect.value;
    voiceSelect.innerHTML = '';

    // Prioritize Indian English voices
    let indianVoices = voices.filter(v => v.lang === 'en-IN' || v.name.includes('India'));
    let otherEngVoices = voices.filter(v => v.lang.startsWith('en') && v.lang !== 'en-IN' && !v.name.includes('India'));

    const combinedVoices = [...indianVoices, ...otherEngVoices];

    combinedVoices.forEach((voice) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.voiceURI;
        voiceSelect.appendChild(option);
    });

    if (currentSelection && combinedVoices.find(v => v.voiceURI === currentSelection)) {
        voiceSelect.value = currentSelection;
    } else if (indianVoices.length > 0) {
        voiceSelect.value = indianVoices[0].voiceURI;
    }
}

if (synthesis) {
    synthesis.onvoiceschanged = populateVoiceList;
}

// Call initially in case they are already loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(populateVoiceList, 500);
});
