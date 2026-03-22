// HeyMira - Chat Interface

let currentConversation = null;
let currentUser = null;
let conversations = [];
let personaCache = {}; // Cache personas to avoid repeated API calls

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
        conversations = data.conversations;
        renderConversationList();
    } catch (e) { }
}

// --- Connection Requests and SSE removed for new companion theme ---

function renderConversationList() {
    const list = document.getElementById('conversation-list');
    if (!conversations.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>No conversations yet</p></div>';
        return;
    }

    list.innerHTML = conversations.map(c => `
        <div class="conv-item ${currentConversation && currentConversation.id === c.id ? 'active' : ''}" 
             onclick="selectConversation(${c.id})">
            <h4>${escapeHtml(c.title)}</h4>
            <div class="conv-meta">
                <span>${formatDate(c.started_at)}</span>
                <span>•</span>
                <span>${c.message_count} msgs</span>
            </div>
        </div>
    `).join('');
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
        const persona = personaId ? document.getElementById('persona-select').selectedOptions[0].textContent : 'HeyMira';
        addMessageToUI('ai', `Hey! 😊 I'm ${persona.split(' — ')[0]}. How are you feeling today? I'm here to listen and chat whenever you need someone.`);
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
    if (currentConversation.persona_id) {
        const opt = document.querySelector(`#persona-select option[value="${currentConversation.persona_id}"]`);
        personaEl.textContent = opt ? `Speaking as ${opt.textContent.split(' — ')[0]}` : '';
        // Background fetch persona details to render image
        if (!activePersona || activePersona.id !== currentConversation.persona_id) {
            fetchPersonaDetails(currentConversation.persona_id);
        }
    } else {
        personaEl.textContent = '';
        activePersona = null;
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

let activePersona = null;
async function fetchPersonaDetails(personaId) {
    if (!personaId) return;
    
    // Check cache first (improves speed dramatically)
    if (personaCache[personaId]) {
        activePersona = personaCache[personaId];
        return;
    }

    try {
        const res = await apiCall(`/api/persona/${personaId}`);
        activePersona = res.persona;
        personaCache[personaId] = activePersona; // Store in cache
    } catch (e) {
        activePersona = null;
    }
}

function addMessageToUI(role, content, timestamp = null, isVoice = false) {
    const area = document.getElementById('messages-area');
    // Use formatTime for chat message timestamps (shows actual clock time)
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

    // Show typing indicator
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

        // Update conversation in list only if it's the first exchange
        if (!currentConversation.title || currentConversation.title === 'New Chat' || currentConversation.title === 'New Conversation' || currentConversation.message_count <= 2) {
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
    if (!confirm('End this conversation?')) return;

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
}

// Send message from voice
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

        // Speak the AI response
        if (typeof speakResponse === 'function') {
            speakResponse(data.ai_message.content);
        }
    }).catch(error => {
        typing.classList.remove('visible');
        showToast(error.message, 'error');
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
