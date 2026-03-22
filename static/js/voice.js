// HeyMira - Voice Call Interface (Web Speech API)

let recognition = null;
let synthesis = window.speechSynthesis;
let isVoiceActive = false;
let isSpeaking = false;
let isMicMuted = false;
let isSpeakerMuted = false;

function toggleMute() {
    isMicMuted = !isMicMuted;
    const btn = document.getElementById('wa-mute-btn');
    if (isMicMuted) {
        btn.style.background = 'rgba(255, 59, 48, 0.8)';
        document.getElementById('icon-mic-on').style.display = 'none';
        document.getElementById('icon-mic-off').style.display = 'block';
        if (recognition) { try { recognition.stop(); } catch(e){} }
        document.getElementById('voice-status').textContent = 'Microphone Muted';
    } else {
        btn.style.background = 'rgba(255, 255, 255, 0.2)';
        document.getElementById('icon-mic-on').style.display = 'block';
        document.getElementById('icon-mic-off').style.display = 'none';
        document.getElementById('voice-status').textContent = 'Listening...';
        if (isVoiceActive && !isSpeaking) {
            try { recognition.start(); } catch(e){}
        }
    }
}

function toggleSpeaker() {
    isSpeakerMuted = !isSpeakerMuted;
    const btn = document.getElementById('wa-speaker-btn');
    if (isSpeakerMuted) {
        btn.style.background = 'rgba(255, 59, 48, 0.8)';
        document.getElementById('icon-speaker-on').style.display = 'none';
        document.getElementById('icon-speaker-off').style.display = 'block';
        if (synthesis.speaking) { synthesis.cancel(); isSpeaking = false; }
    } else {
        btn.style.background = 'rgba(255, 255, 255, 0.2)';
        document.getElementById('icon-speaker-on').style.display = 'block';
        document.getElementById('icon-speaker-off').style.display = 'none';
    }
}

function populateVoices() {
    const voiceSelect = document.getElementById('voice-select');
    if (!voiceSelect || !synthesis) return;
    
    let voices = synthesis.getVoices();
    if (voices.length === 0) return;
    
    const currentVal = voiceSelect.value;
    voiceSelect.innerHTML = '<option value="">Default AI Voice</option>';
    
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.name;
        voiceSelect.appendChild(option);
    });
    
    if (currentVal) voiceSelect.value = currentVal;
}

if (synthesis) {
    synthesis.onvoiceschanged = populateVoices;
    // initial try
    setTimeout(populateVoices, 500);
}

function toggleVoiceCall() {
    if (isVoiceActive) {
        endVoiceCall();
    } else {
        startVoiceCall();
    }
}

function startVoiceCall() {
    // Check browser support
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
    document.getElementById('voice-overlay').classList.add('active');
    document.getElementById('voice-btn').classList.add('active');

    // Setup speech recognition
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    // Defaulting to browser language to prevent potential network errors 
    // from Chrome trying to download unavailable language packs
    recognition.lang = 'en-US';

    let finalTranscript = '';
    let isProcessing = false;
    let isListening = false;

    recognition.onstart = () => {
        isListening = true;
    };

    recognition.onresult = (event) => {
        if (isSpeaking || isProcessing || isMicMuted) return;

        let interimTranscript = '';
        let hasFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
                hasFinal = true;
            } else {
                interimTranscript += transcript;
            }
        }

        // Show live transcript
        const display = finalTranscript || interimTranscript;
        document.getElementById('voice-user-transcript').textContent = 'You: ' + (display || 'Listening...');

        // If we hit a final transcript, stop and send immediately
        if (hasFinal && finalTranscript.trim().length > 0) {
            const msg = finalTranscript.trim();
            finalTranscript = ''; 
            isProcessing = true;
            
            document.getElementById('voice-status').textContent = 'Thinking...';
            document.getElementById('voice-ai-transcript').textContent = '';

            // Pause recognition while AI responds
            try { recognition.stop(); } catch(e){}
            
            // Send to backend
            sendVoiceMessage(msg).finally(() => {
                isProcessing = false;
            });
        }
    };

    let networkErrorCount = 0;

    recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            document.getElementById('voice-user-transcript').textContent = 'I\'m listening... take your time';
        } else if (event.error === 'not-allowed') {
            showToast('Microphone access denied. Please allow microphone access in your browser settings.', 'error');
            endVoiceCall();
        } else if (event.error === 'network') {
            networkErrorCount++;
            isListening = false;
            
            if (networkErrorCount > 3) {
                showToast('Network error: Unable to reach speech recognition servers. Please check your internet or try again later.', 'error');
                endVoiceCall();
            } else {
                document.getElementById('voice-user-transcript').textContent = 'Reconnecting...';
                setTimeout(() => {
                    if (isVoiceActive && !isSpeaking && !isProcessing && !isListening) {
                        try { recognition.start(); } catch(e){}
                    }
                }, 2000);
            }
        } else if (event.error !== 'aborted') {
            // Only toast on severe errors
        }
    };

    recognition.onend = () => {
        isListening = false;
        // Restart if voice call is still active, not speaking, and not processing a message
        if (isVoiceActive && !isSpeaking && !isProcessing) {
            try {
                setTimeout(() => {
                    if (isVoiceActive && !isSpeaking && !isProcessing && !isListening) {
                        recognition.start();
                        document.getElementById('voice-status').textContent = 'Listening...';
                    }
                }, 300);
            } catch (e) { }
        }
    };

    try {
        if (!isListening) {
            recognition.start();
        }
        document.getElementById('voice-status').textContent = 'Listening...';
        document.getElementById('voice-user-transcript').textContent = 'Speak naturally — I\'m here for you';
        document.getElementById('voice-ai-transcript').textContent = '';
    } catch (e) {
        showToast('Could not start voice recognition', 'error');
        endVoiceCall();
    }
}

function endVoiceCall() {
    isVoiceActive = false;
    isSpeaking = false;

    if (recognition) {
        try { recognition.stop(); } catch (e) { }
        recognition = null;
    }

    if (synthesis) {
        synthesis.cancel();
    }

    document.getElementById('voice-overlay').classList.remove('active');
    document.getElementById('voice-btn').classList.remove('active');
}

function speakResponse(text) {
    if (!isVoiceActive || !synthesis) return;

    document.getElementById('voice-ai-transcript').textContent = 'AI: ' + text;

    if (isSpeakerMuted) {
        // Skip TTS entirely, just wait a bit for reading time then re-enable mic
        setTimeout(() => {
            if (isVoiceActive && !isMicMuted) {
                document.getElementById('voice-status').textContent = 'Listening...';
                document.getElementById('voice-user-transcript').textContent = 'Your turn to speak...';
                if (recognition) {
                    try { recognition.start(); } catch (e) { }
                }
            }
        }, 1500);
        return;
    }

    isSpeaking = true;
    document.getElementById('voice-status').textContent = 'Speaking...';

    // Cancel any ongoing speech
    synthesis.cancel();

    // Strip emojis and weird symbols before speaking so it sounds natural
    const cleanText = text.replace(/[\u1F60-\u1F64|\u2702-\u27B0|\u1F68-\u1F6C|\u1F30-\u1F70|\u2600-\u26ff|\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '')
                          .replace(/[*#~`@$%^&_+=\[\]|\\<>]/g, '')
                          .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText || text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = synthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    
    if (voiceSelect && voiceSelect.value) {
        // Use user selected voice
        const selectedVoice = voices.find(v => v.name === voiceSelect.value);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
        }
    } else {
        // Default to Indian English
        utterance.lang = 'en-IN';
        const preferredVoice = voices.find(v => v.lang === 'en-IN' && v.name.includes('Google')) ||
                               voices.find(v => v.lang === 'en-IN') || 
                               voices.find(v => v.lang.startsWith('en'));

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
    }

    utterance.onend = () => {
        isSpeaking = false;
        if (isVoiceActive && !isMicMuted) {
            document.getElementById('voice-status').textContent = 'Listening...';
            document.getElementById('voice-user-transcript').textContent = 'Your turn to speak...';
            // Restart recognition
            if (recognition) {
                try { 
                    // Let the onend handler from previous recognition start it, or start it here
                    setTimeout(() => {
                        try { recognition.start(); } catch(e) {}
                    }, 100);
                } catch (e) { }
            }
        }
    };

    utterance.onerror = (e) => {
        console.warn("TTS Error:", e);
        isSpeaking = false;
        if (isVoiceActive && !isMicMuted && recognition) {
            try { 
                setTimeout(() => {
                    try { recognition.start(); } catch(e) {}
                }, 100);
            } catch (e) { }
        }
    };

    synthesis.speak(utterance);
}

// Ensure voices populate when ready
if (synthesis) {
    synthesis.onvoiceschanged = populateVoices;
    setTimeout(populateVoices, 500);
}
