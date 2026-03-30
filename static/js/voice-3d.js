import * as THREE from 'three';
import { TalkingHead } from 'talkinghead';

let head;
let ws;
let micContext, micStream, micProcessor;
let chunkAccumulator = [];
let accumulatedLength = 0;

export async function start3DCall(apiKey) {
    const avatarNode = document.getElementById('avatar-3d-container');
    if (!head) {
        head = new TalkingHead(avatarNode, {
            cameraView: "head", 
            cameraDistance: 3.0, 
            cameraX: 0,
            cameraY: 0.8, 
            lipsyncModules: [] 
        });

        await head.showAvatar({
            url: "https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb",
            body: 'F', avatarMood: 'neutral'
        });

        // Manual Lip-sync Loop from provided index.html
        const audioData = new Uint8Array(32);
        let lastJaw = 0;
        let jawOpenStartTime = 0;
        const syncLoop = () => {
            const now = performance.now();
            if (head && head.isSpeaking && head.audioAnalyzerNode) {
                head.audioAnalyzerNode.getByteFrequencyData(audioData);
                let volSum = 0;
                let volCount = 0;
                for (let i = 2; i < 16; i++) {
                    volSum += audioData[i];
                    volCount++;
                }
                let avgVol = volSum / volCount;
                if (avgVol < 50) avgVol = 0;
                let targetJaw = Math.max(0, (avgVol - 50) / 100); 
                targetJaw = Math.min(1.0, targetJaw);
                if (targetJaw > 0.1) {
                    if (jawOpenStartTime === 0) jawOpenStartTime = now;
                    if (now - jawOpenStartTime > 100) {
                        targetJaw = 0; 
                        lastJaw = 0; 
                        if (now - jawOpenStartTime > 150) jawOpenStartTime = 0;
                    }
                } else {
                    jawOpenStartTime = 0;
                }
                if (targetJaw > lastJaw) {
                    targetJaw = lastJaw * 0.3 + targetJaw * 0.7; 
                } else {
                    targetJaw = lastJaw * 0.8 + targetJaw * 0.2; 
                }
                lastJaw = targetJaw;
                head.setValue('jawOpen', targetJaw);
            } else if (head && !head.isSpeaking) {
                lastJaw = 0;
                jawOpenStartTime = 0;
                head.setValue('jawOpen', 0);
            }
            requestAnimationFrame(syncLoop);
        };
        syncLoop();
    }

    await head.streamStart({ sampleRate: 24000, lipsyncType: 'audio' });
    await startLiveSession(apiKey);
}

async function startLiveSession(apiKey) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Backend proxy runs on 5001
    const WS_URL = `${protocol}//${window.location.hostname}:5001/ws?key=${apiKey}`;
    ws = new WebSocket(WS_URL);

    ws.onopen = async () => {
        console.log('WebSocket Connected to Backend Proxy');
        await initMicrophone();
    };

    ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.serverContent) {
            const content = response.serverContent;
            if (content.modelTurn && content.modelTurn.parts) {
                for (const part of content.modelTurn.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        const pcm16 = decodeBase64ToInt16(part.inlineData.data);
                        chunkAccumulator.push(pcm16);
                        accumulatedLength += pcm16.length;
                        if (accumulatedLength > 4800) flushAudioChunk();
                    }
                }
            }
            if (content.turnComplete) flushAudioChunk();
            if (content.interrupted) {
                chunkAccumulator = [];
                accumulatedLength = 0;
                if (head) head.stopSpeaking();
            }
            if (content.inputTranscription) {
                const userText = document.getElementById('wa-user-text');
                if (userText) userText.innerText = content.inputTranscription.text;
                document.getElementById('wa-transcript-user').classList.add('active');
            }
            if (content.outputTranscription) {
                const aiText = document.getElementById('wa-ai-text');
                if (aiText) aiText.innerText = content.outputTranscription.text;
                document.getElementById('wa-transcript-ai').classList.add('active');
            }
        }
    };

    ws.onclose = () => console.log('WebSocket Closed');
}

async function initMicrophone() {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    await micContext.resume();
    const source = micContext.createMediaStreamSource(micStream);
    const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(4096);
        this.bufferSize = 0;
    }
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0 && input[0].length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferSize++] = channelData[i];
                if (this.bufferSize >= 4096) {
                    const pcm16 = new Int16Array(4096);
                    for (let j = 0; j < 4096; j++) {
                        pcm16[j] = Math.max(-32768, Math.min(32767, this.buffer[j] * 32768));
                    }
                    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
                    this.bufferSize = 0;
                }
            }
        }
        return true;
    }
}
registerProcessor('pcm-processor', PCMProcessor);
`;
    const workletUrl = 'data:application/javascript;base64,' + btoa(workletCode);
    await micContext.audioWorklet.addModule(workletUrl);
    micProcessor = new AudioWorkletNode(micContext, 'pcm-processor');
    micProcessor.port.onmessage = (e) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const pcm16 = new Int16Array(e.data);
            const uint8 = new Uint8Array(pcm16.buffer);
            let binary = '';
            for (let i = 0; i < uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
            ws.send(JSON.stringify({
                realtimeInput: {
                    audio: { mimeType: "audio/pcm;rate=16000", data: btoa(binary) }
                }
            }));
        }
    };
    const gainNode = micContext.createGain();
    gainNode.gain.value = 0;
    source.connect(micProcessor);
    micProcessor.connect(gainNode);
    gainNode.connect(micContext.destination);
}

function decodeBase64ToInt16(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return new Int16Array(bytes.buffer);
}

function flushAudioChunk() {
    if (accumulatedLength === 0) return;
    const combinedPcm = new Int16Array(accumulatedLength);
    let offset = 0;
    for (let chunk of chunkAccumulator) {
        combinedPcm.set(chunk, offset);
        offset += chunk.length;
    }
    chunkAccumulator = [];
    accumulatedLength = 0;
    if (head) head.streamAudio({ audio: combinedPcm });
}

export function end3DCall() {
    if (ws) ws.close();
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (micContext) micContext.close();
    if (head) head.stopSpeaking();
}

window.start3DCall = start3DCall;
window.end3DCall = end3DCall;
