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
    const cheekL = document.getElementById('wa-cheek-l');
    const cheekR = document.getElementById('wa-cheek-r');
    if (!mouthPath) return;

    // Realistic mouth shapes — natural lip parting with subtle cupid's bow
    // Using a 0-60 viewBox, centered around x=30, y=20
    const shapes = [
        // Closed / Neutral — thin line with slight bow
        { mouth: "M12,20 Q20,18 30,19 Q40,18 48,20 Q40,22 30,21 Q20,22 12,20 Z", cheek: 0 },
        // Slightly open — relaxed small opening
        { mouth: "M12,20 Q20,15 30,16 Q40,15 48,20 Q40,25 30,24 Q20,25 12,20 Z", cheek: 1 },
        // Open (A/O sound) — wide vertical opening
        { mouth: "M14,19 Q20,10 30,11 Q40,10 46,19 Q42,30 30,32 Q18,30 14,19 Z", cheek: 3 },
        // Wide (E/I sound) — stretched horizontally, less vertical
        { mouth: "M10,20 Q18,14 30,15 Q42,14 50,20 Q42,26 30,27 Q18,26 10,20 Z", cheek: 2 },
        // Rounded (O/U sound) — small circular opening
        { mouth: "M18,19 Q22,12 30,13 Q38,12 42,19 Q38,28 30,29 Q22,28 18,19 Z", cheek: 2 },
        // Half-open — mid-speech natural position
        { mouth: "M13,20 Q20,13 30,14 Q40,13 47,20 Q42,27 30,28 Q18,27 13,20 Z", cheek: 1 },
    ];

    let lastShapeIdx = 0;
    mouthInterval = setInterval(() => {
        if (!isSpeaking) {
            stopLipSync();
            return;
        }
        // Pick a different shape each time for variety
        let idx = Math.floor(Math.random() * shapes.length);
        while (idx === lastShapeIdx && shapes.length > 1) {
            idx = Math.floor(Math.random() * shapes.length);
        }
        lastShapeIdx = idx;
        const shape = shapes[idx];
        mouthPath.setAttribute('d', shape.mouth);

        // Cheek deformation — subtle scale on cheek ovals
        if (cheekL && cheekR) {
            const scale = 1 + (shape.cheek * 0.015);
            const yShift = shape.cheek * 0.3;
            cheekL.setAttribute('transform', `translate(0, ${yShift}) scale(${scale})`);
            cheekR.setAttribute('transform', `translate(0, ${yShift}) scale(${scale})`);
        }
    }, 110); // Slightly varied timing for naturalism
}

function stopLipSync() {
    if (mouthInterval) {
        clearInterval(mouthInterval);
        mouthInterval = null;
    }
    const mouthPath = document.getElementById('wa-mouth-path');
    if (mouthPath) {
        mouthPath.setAttribute('d', "M12,20 Q20,18 30,19 Q40,18 48,20 Q40,22 30,21 Q20,22 12,20 Z");
    }
    const cheekL = document.getElementById('wa-cheek-l');
    const cheekR = document.getElementById('wa-cheek-r');
    if (cheekL) cheekL.setAttribute('transform', 'scale(1)');
    if (cheekR) cheekR.setAttribute('transform', 'scale(1)');
}

let isVideoEnabled = false;
let callMode = '2d'; // '2d' or '3d'

function setCallMode(mode) {
    if (callMode === mode) return;
    
    // If a call is active, we might need to restart it or switch views
    // For now, let's just update the UI
    callMode = mode;
    
    const btn2d = document.getElementById('mode-2d');
    const btn3d = document.getElementById('mode-3d');
    
    if (mode === '3d') {
        btn3d.style.background = 'var(--accent-gradient)';
        btn3d.style.color = 'white';
        btn2d.style.background = 'transparent';
        btn2d.style.color = 'rgba(255,255,255,0.6)';
        
        // Show 3D container, hide 2D avatar
        document.getElementById('avatar-3d-container').style.display = 'block';
        document.querySelector('.wa-avatar-container').style.display = 'none';
        
        // If call is active, we need to switch from Web Speech to Gemini Live
        if (isVoiceActive) {
            // This will be handled in startVoiceCall or via a switch function
            console.log("Switching to 3D mode in-call...");
            // For simplicity, let's restart the call if it's already active
            const wasVideo = isVideoEnabled;
            endVoiceCall();
            toggleVoiceCall(wasVideo);
        }
    } else {
        btn2d.style.background = 'var(--accent-gradient)';
        btn2d.style.color = 'white';
        btn3d.style.background = 'transparent';
        btn3d.style.color = 'rgba(255,255,255,0.6)';
        
        // Hide 3D container, show 2D avatar
        document.getElementById('avatar-3d-container').style.display = 'none';
        document.querySelector('.wa-avatar-container').style.display = 'flex';
        
        if (isVoiceActive) {
            console.log("Switching to 2D mode in-call...");
            const wasVideo = isVideoEnabled;
            endVoiceCall();
            toggleVoiceCall(wasVideo);
        }
    }
}
window.setCallMode = setCallMode;

// ═══════════════════════════════════════════
//  TOGGLE / START / END
// ═══════════════════════════════════════════

function toggleVoiceCall(video) {
    video = (typeof video !== 'undefined') ? video : false;
    if (isVoiceActive) {
        endVoiceCall();
    } else {
        isVideoEnabled = video;
        startVoiceCall();
    }
}
window.toggleVoiceCall = toggleVoiceCall;

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
    if (!currentConversation) {
        showToast('Start a conversation first', 'error');
        return;
    }

    isVoiceActive = true;
    isMuted = false;
    isSpeakerOff = false;
    isSpeaking = false;
    isThinking = false;

    // --- 3D Mode Initialization ---
    if (callMode === '3d') {
        const apiKey = localStorage.getItem('geminiApiKey') || '';
        if (window.start3DCall) {
            window.start3DCall(apiKey);
            setCallStatus('listening');
            
            // Populate call screen identity
            const personaName = activePersona ? activePersona.name : 'Mira';
            document.getElementById('wa-call-name').textContent = personaName;
            
            document.getElementById('wa-user-text').textContent = "Speak naturally — I'm here for you";
            document.getElementById('wa-ai-text').textContent = 'Connected (3D Mode)';
            document.getElementById('voice-overlay').classList.add('active');
            document.getElementById('voice-btn').classList.add('active');
            return;
        }
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Voice calls require Chrome or Edge browser', 'error');
        isVoiceActive = false;
        return;
    }

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
    const mouthOverlay = `
        <div class="wa-mouth-overlay">
            <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <radialGradient id="mouth-inner-grad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" style="stop-color:#1a0a0a;stop-opacity:0.85" />
                        <stop offset="70%" style="stop-color:#2d1215;stop-opacity:0.7" />
                        <stop offset="100%" style="stop-color:#4a2028;stop-opacity:0.4" />
                    </radialGradient>
                    <radialGradient id="lip-tint" cx="50%" cy="50%" r="60%">
                        <stop offset="0%" style="stop-color:#b86b6b;stop-opacity:0.35" />
                        <stop offset="100%" style="stop-color:#8b5a5a;stop-opacity:0.1" />
                    </radialGradient>
                    <filter id="mouth-blur">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
                    </filter>
                </defs>
                <!-- Cheek deformation zones (invisible but animatable) -->
                <ellipse id="wa-cheek-l" cx="10" cy="18" rx="8" ry="6" fill="transparent" />
                <ellipse id="wa-cheek-r" cx="50" cy="18" rx="8" ry="6" fill="transparent" />
                <!-- Mouth interior (dark cavity) -->
                <path id="wa-mouth-path" class="wa-mouth-path"
                    d="M12,20 Q20,18 30,19 Q40,18 48,20 Q40,22 30,21 Q20,22 12,20 Z"
                    filter="url(#mouth-blur)" />
                <!-- Subtle lip tint overlay -->
                <path class="wa-lip-tint"
                    d="M12,20 Q20,18 30,19 Q40,18 48,20 Q40,22 30,21 Q20,22 12,20 Z"
                    fill="url(#lip-tint)" />
            </svg>
        </div>`;
    
    if (activePersona && activePersona.profile_image) {
        avatarEl.innerHTML = `<img src="${activePersona.profile_image}" alt="${personaName}">${mouthOverlay}`;
        
        // Apply custom coordinates if found by Gemini
        if (activePersona.lip_coords && activePersona.lip_coords.found) {
            const mouth = avatarEl.querySelector('.wa-mouth-overlay');
            if (mouth) {
                mouth.style.left = `${activePersona.lip_coords.x}%`;
                // Apply a slight upward correction (-2%) as requested by user feedback
                const correctedY = Math.max(0, activePersona.lip_coords.y - 2);
                mouth.style.top = `${correctedY}%`;
                mouth.style.bottom = 'auto'; 
                mouth.style.transform = 'translate(-50%, -50%)';
                console.log(`%c [LIPS-SYNC] Using Gemini coordinates: x:${activePersona.lip_coords.x}%, y:${correctedY}% (corrected) `, 'background: #1e293b; color: #a855f7;');
            }
        }
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
                    if (isVoiceActive && !isSpeaking && !isThinking && !isMuted && recognition) {
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

    if (callMode === '3d' && window.end3DCall) {
        window.end3DCall();
    }

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

// Expose to window to fix ReferenceErrors in HTML onclick handlers
window.toggleVoiceCall = toggleVoiceCall;
window.toggleVideoInCall = toggleVideoInCall;
window.endVoiceCall = endVoiceCall;
window.toggleMute = toggleMute;
window.toggleSpeaker = toggleSpeaker;
