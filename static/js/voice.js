// HeyMira - Voice Call Interface (Web Speech API)

let recognition = null;
let synthesis = window.speechSynthesis;
let isVoiceActive = false;
let isSpeaking = false;

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
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        // Show live transcript
        const display = finalTranscript || interimTranscript;
        document.getElementById('voice-transcript').textContent = display || 'Listening...';

        // When we have a final transcript, send it
        if (finalTranscript.trim().length > 0) {
            // Wait a brief moment for more speech
            clearTimeout(recognition._sendTimeout);
            recognition._sendTimeout = setTimeout(() => {
                if (finalTranscript.trim()) {
                    const msg = finalTranscript.trim();
                    finalTranscript = '';
                    document.getElementById('voice-status').textContent = 'Thinking...';

                    // Pause recognition while AI responds
                    recognition.stop();
                    sendVoiceMessage(msg);
                }
            }, 1500);
        }
    };

    recognition.onend = () => {
        // Restart if voice call is still active and not speaking
        if (isVoiceActive && !isSpeaking) {
            try {
                setTimeout(() => {
                    if (isVoiceActive && !isSpeaking) {
                        recognition.start();
                        document.getElementById('voice-status').textContent = 'Listening...';
                    }
                }, 300);
            } catch (e) { }
        }
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
            document.getElementById('voice-transcript').textContent = 'I\'m listening... take your time';
        } else if (event.error !== 'aborted') {
            console.error('Recognition error:', event.error);
        }
    };

    try {
        recognition.start();
        document.getElementById('voice-status').textContent = 'Listening...';
        document.getElementById('voice-transcript').textContent = 'Speak naturally — I\'m here for you';
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

    synthesis.cancel();

    document.getElementById('voice-overlay').classList.remove('active');
    document.getElementById('voice-btn').classList.remove('active');
}

function speakResponse(text) {
    if (!isVoiceActive || !synthesis) return;

    isSpeaking = true;
    document.getElementById('voice-status').textContent = 'Speaking...';
    document.getElementById('voice-transcript').textContent = text;

    // Cancel any ongoing speech
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find a good voice
    const voices = synthesis.getVoices();
    const preferredVoice = voices.find(v =>
        v.name.includes('Google') && v.lang.startsWith('en')
    ) || voices.find(v =>
        v.lang.startsWith('en') && v.name.includes('Female')
    ) || voices.find(v =>
        v.lang.startsWith('en')
    );

    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
        isSpeaking = false;
        if (isVoiceActive) {
            document.getElementById('voice-status').textContent = 'Listening...';
            document.getElementById('voice-transcript').textContent = 'Your turn to speak...';
            // Restart recognition
            if (recognition) {
                try { recognition.start(); } catch (e) { }
            }
        }
    };

    utterance.onerror = () => {
        isSpeaking = false;
        if (isVoiceActive && recognition) {
            try { recognition.start(); } catch (e) { }
        }
    };

    synthesis.speak(utterance);
}

// Load voices (they load asynchronously in some browsers)
if (synthesis) {
    synthesis.onvoiceschanged = () => synthesis.getVoices();
}
