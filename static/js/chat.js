// HeyMira - Chat Interface

let currentConversation = null;
let currentUser = null;
let conversations = [];
let personaCache = {}; // Cache personas to avoid repeated API calls
let activePersona = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadPersonas();
    await loadConversations();
});

async function loadUser() {
    try {
        const data = await apiCall('/api/auth/me');
        currentUser = data.user;
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-role').textContent = currentUser.role;

        if (currentUser.profile_image) {
            document.getElementById('user-avatar').innerHTML = `<img src="${currentUser.profile_image}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            document.getElementById('user-avatar').textContent = currentUser.username[0].toUpperCase();
        }

        // Hide doctor status completely
        const docStatus = document.getElementById('doctor-status');
        if (docStatus) {
            docStatus.style.display = 'none';
        }

        if (currentUser.theme) {
            setTheme(currentUser.theme);
        }
    } catch (error) {
        window.location.href = '/login';
    }
}

async function loadPersonas() {
    try {
        const data = await apiCall('/api/persona/list');
        const select = document.getElementById('persona-select');
        select.innerHTML = '<option value="">No persona (default AI)</option>';
        data.personas.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} — ${p.tone}`;
            select.appendChild(opt);
        });
    } catch (e) { }
}

async function loadConversations() {
    try {
        const data = await apiCall('/api/chat/conversations');
        conversations = (data.conversations || []).filter(c => c && c.id);
        renderConversationList();
    } catch (e) { }
}

function renderConversationList() {
    const list = document.getElementById('conversation-list');
    if (!conversations.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>No conversations yet</p></div>';
        return;
    }

    list.innerHTML = conversations.map(c => `
        <div class="conv-item ${currentConversation && currentConversation.id === c.id ? 'active' : ''}" 
             onclick="selectConversation(${c.id})">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4 style="margin:0;">${escapeHtml(c.title)}</h4>
                <button class="btn-icon btn-sm" style="width:24px; height:24px; font-size:0.8rem; background:transparent; border:none; color:var(--danger);" onclick="event.stopPropagation(); deleteConversation(${c.id})" title="Delete Chat">🗑️</button>
            </div>
            <div class="conv-meta" style="margin-top:4px;">
                <span>${formatDate(c.started_at) || 'Recent'}</span>
                <span>•</span>
                <span>${c.message_count || 0} msgs</span>
            </div>
        </div>
    `).join('');
}

async function deleteConversation(id) {
    showConfirm('Delete Chat?', 'Are you sure you want to delete this conversation forever?', async () => {
        try {
            await apiCall(`/api/chat/delete/${id}`, { method: 'DELETE' });
            showToast('Chat deleted', 'success');
            if (currentConversation && currentConversation.id === id) {
                currentConversation = null;
                document.getElementById('chat-active').style.display = 'none';
                document.getElementById('chat-welcome').style.display = 'flex';
            }
            await loadConversations();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

async function newConversation() {
    const personaId = document.getElementById('persona-select').value;
    try {
        const data = await apiCall('/api/chat/new', {
            method: 'POST',
            body: JSON.stringify({ persona_id: personaId || null })
        });
        currentConversation = data.conversation;
        conversations.unshift(currentConversation);
        renderConversationList();
        showChatUI();
        renderMessages([]);

        // Show welcome AI message
        const personaText = personaId ? document.getElementById('persona-select').selectedOptions[0].textContent : 'HeyMira';
        addMessageToUI('ai', `Hey! 😊 I'm ${personaText.split(' — ')[0]}. How are you feeling today? I'm here to listen and chat whenever you need someone.`);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function selectConversation(id) {
    try {
        const data = await apiCall(`/api/chat/history/${id}`);
        currentConversation = data.conversation;
        renderConversationList();
        showChatUI();
        renderMessages(data.messages);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showChatUI() {
    document.getElementById('chat-welcome').style.display = 'none';
    const chatActive = document.getElementById('chat-active');
    chatActive.style.display = 'flex';

    document.getElementById('chat-title').textContent = currentConversation.title || 'New Conversation';

    const personaEl = document.getElementById('chat-persona');
    const headerAvatar = document.getElementById('header-avatar');

    if (currentConversation.persona_id) {
        personaEl.textContent = 'Online';
        fetchPersonaDetails(currentConversation.persona_id).then(persona => {
            if (persona && persona.profile_image) {
                headerAvatar.innerHTML = `<img src="${persona.profile_image}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                headerAvatar.textContent = persona ? persona.name[0].toUpperCase() : '💜';
                headerAvatar.style.background = 'var(--accent-gradient)';
            }
        });
    } else {
        personaEl.textContent = 'HeyMira AI';
        headerAvatar.innerHTML = '💜';
        headerAvatar.style.background = 'var(--accent-gradient)';
        activePersona = null;
    }
}

function showPersonaProfile() {
    if (!activePersona) return;
    const modal = document.getElementById('persona-profile-modal');
    document.getElementById('profile-persona-name').textContent = activePersona.name;
    document.getElementById('profile-persona-meta').textContent = `${activePersona.tone} · ${activePersona.speaking_style}`;
    
    const avatar = document.getElementById('profile-persona-avatar');
    if (activePersona.profile_image) {
        avatar.innerHTML = `<img src="${activePersona.profile_image}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
        avatar.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:white;">${activePersona.name[0]}</div>`;
    }

    const traits = typeof activePersona.personality_traits === 'string' ? JSON.parse(activePersona.personality_traits || '{}') : activePersona.personality_traits;
    const traitDisplay = document.getElementById('persona-traits-display');
    traitDisplay.innerHTML = Object.entries(traits).map(([k, v]) => `
        <div class="trait-item" style="padding:10px; background:var(--bg-input); border-radius:8px;">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${k}</div>
            <div style="font-size:0.9rem; font-weight:600; color:var(--accent);">${v}/10</div>
        </div>
    `).join('');

    document.getElementById('remaster-option').style.display = 'block';
    modal.classList.add('active');
}

function closePersonaProfile() {
    document.getElementById('persona-profile-modal').classList.remove('active');
}

async function remasterPersonaImage() {
    if (!activePersona) return;
    
    const prompt = `A highly detailed, ultra-realistic portrait of a person for a video call avatar. 
Name: ${activePersona.name}
Tone: ${activePersona.tone}
Communication style: ${activePersona.speaking_style}

Image Details:
- 8k resolution, cinematic lighting, professional photography style.
- Perfectly centered face, looking directly into the camera with a warm, empathetic expression.
- Clear, well-defined facial features, sharp focus on eyes.
- Soft, blurred professional background (studio-like).
- Modern aesthetic, slight glassmorphism elements if applicable.
- Ensure the mouth is clearly visible and correctly positioned for procedural animation.
- No distortions, no artifacts, consistent lighting across the face.
- Optimized for high-definition video calls.
- Mirroring the personality of someone trustworthy and supportive.
- Natural skin texture, realistic hair, and expressive eyes that convey understanding.
- Professional portrait lens (85mm f/1.8), shallow depth of field.
- High dynamic range, balanced colors, natural saturation.
- Portrait should be from chest up, allowing for subtle breathing animations.
- The person should appear exactly as someone you'd want to talk to during a stressful moment.
- The image should feel 'alive' and responsive to the user's presence.
- Capture the essence of their unique speaking style through their facial posture.
- Perfectly symmetrical facial framing.
- No text, no watermarks, no borders.`;

    console.log("%c --- REMASTER PROMPT --- ", 'background: #5b21b6; color: white; font-weight: bold;');
    console.log(prompt);
    console.log("%c ----------------------- ", 'background: #5b21b6; color: white;');

    showToast('AI is remastering your companion...', 'success');
    
    // Simulate generation delay
    setTimeout(async () => {
        // High quality placeholder image representing the remastered version
        // In a real implementation, this would be the output of DALL-E/Midjourney
        const remasteredUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80"; // Example high-res portrait
        
        showConfirm('New Avatar Ready', 'I have remastered the companion for high-quality video calls. Would you like to use this new version?', async () => {
            // Store locally in cache first
            activePersona.profile_image = remasteredUrl;
            personaCache[activePersona.id] = activePersona;
            
            // Update UI
            const headerAvatar = document.getElementById('header-avatar');
            headerAvatar.innerHTML = `<img src="${remasteredUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            
            const profileAvatar = document.getElementById('profile-persona-avatar');
            profileAvatar.innerHTML = `<img src="${remasteredUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            
            showToast('Companion remastered for video!', 'success');
            closePersonaProfile();
            
            // Note: In a production app, we would also update this in Firestore via an API call
            console.log("Remastered image stored in session. Permanently saving would require a POST /api/persona/update endpoint.");
        });
    }, 3000);
}

async function fetchPersonaDetails(personaId) {
    if (!personaId) return null;
    if (personaCache[personaId]) {
        activePersona = personaCache[personaId];
        return activePersona;
    }
    try {
        const res = await apiCall(`/api/persona/${personaId}`);
        activePersona = res.persona;
        personaCache[personaId] = activePersona;
        return activePersona;
    } catch (e) {
        activePersona = null;
        return null;
    }
}

function renderMessages(messages) {
    const area = document.getElementById('messages-area');
    area.innerHTML = '';
    messages.forEach(msg => {
        addMessageToUI(msg.role, msg.content, msg.timestamp, msg.is_voice);
    });
    scrollToBottom();
}

function addMessageToUI(role, content, timestamp = null, isVoice = false) {
    const area = document.getElementById('messages-area');
    const time = timestamp ? formatTime(timestamp) : getCurrentTime();

    let aiAvatar = '💜';
    if (activePersona && activePersona.profile_image) {
        aiAvatar = `<img src="${activePersona.profile_image}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }

    const avatar = role === 'ai' ? aiAvatar : (currentUser && currentUser.profile_image ? `<img src="${currentUser.profile_image}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (currentUser ? currentUser.username[0].toUpperCase() : '?'));

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = `
        <div class="msg-avatar">${avatar}</div>
        <div>
            <div class="msg-content">${escapeHtml(content)}</div>
            <div class="msg-time">
                ${isVoice ? '<span class="msg-voice-indicator">🎤 Voice</span> · ' : ''}${time}
            </div>
        </div>
    `;
    area.appendChild(msgDiv);
    scrollToBottom();
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !currentConversation) return;

    input.value = '';
    addMessageToUI('user', content);

    const typing = document.getElementById('typing-indicator');
    typing.classList.add('visible');
    scrollToBottom();

    try {
        const data = await apiCall('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                conversation_id: currentConversation.id,
                content: content,
                is_voice: false
            })
        });

        typing.classList.remove('visible');
        addMessageToUI('ai', data.ai_message.content);

        if (!currentConversation.title || currentConversation.title === 'New Chat' || currentConversation.title === 'New Conversation' || (currentConversation.message_count || 0) <= 2) {
            currentConversation.title = data.user_message.content.substring(0, 80);
            document.getElementById('chat-title').textContent = currentConversation.title;
        }

        currentConversation.message_count = (currentConversation.message_count || 0) + 2;
        renderConversationList();

    } catch (error) {
        typing.classList.remove('visible');
        showToast(error.message, 'error');
    }
}

async function endConversation() {
    showConfirm('End Chat?', 'Are you sure you want to end this conversation and save the report?', async () => {
        try {
            const data = await apiCall(`/api/chat/end/${currentConversation.id}`, { method: 'POST' });
            showToast('Chat ended.', 'success');
            currentConversation = null;
            document.getElementById('chat-active').style.display = 'none';
            document.getElementById('chat-welcome').style.display = 'flex';
            await loadConversations();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function sendVoiceMessage(text) {
    if (!text || !currentConversation) return;

    addMessageToUI('user', text, null, true);
    const typing = document.getElementById('typing-indicator');
    typing.classList.add('visible');
    scrollToBottom();

    apiCall('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
            conversation_id: currentConversation.id,
            content: text,
            is_voice: true
        })
    }).then(data => {
        typing.classList.remove('visible');
        addMessageToUI('ai', data.ai_message.content, null, true);

        if (typeof speakResponse === 'function') {
            speakResponse(data.ai_message.content);
        }
    }).catch(error => {
        typing.classList.remove('visible');
        showToast(error.message, 'error');
        if (typeof isThinking !== 'undefined') isThinking = false;
        if (typeof setCallStatus === 'function') setCallStatus('listening');
        if (typeof recognition !== 'undefined' && recognition && !isMuted) {
            try { recognition.start(); } catch (e) { }
        }
    });
}

function scrollToBottom() {
    const area = document.getElementById('messages-area');
    if (area) {
        setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
