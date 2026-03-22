// HeyMira - Chat Interface

let currentConversation = null;
let currentUser = null;
let conversations = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadPersonas();
    await loadConversations();
    await checkConnectionRequests();
    connectSSE();
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

        // Show doctor connection status
        const docStatus = document.getElementById('doctor-status');
        if (docStatus) {
            if (currentUser.assigned_doctor_id) {
                docStatus.innerHTML = `<span style="color:var(--success);">● Connected to Dr. ${currentUser.assigned_doctor_name || 'Doctor'}</span>`;
            } else {
                docStatus.innerHTML = `<span style="color:var(--warning);">○ No doctor connected</span>`;
            }
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

async function checkConnectionRequests() {
    try {
        const data = await apiCall('/api/patient/connection-requests');
        if (data.requests && data.requests.length > 0) {
            showConnectionRequests(data.requests);
        }
    } catch (e) { }
}

function showConnectionRequests(requests) {
    const container = document.getElementById('connection-requests');
    if (!container) return;

    container.innerHTML = requests.map(r => `
        <div class="glass-card" style="padding:14px 18px;margin-bottom:10px;border-left:3px solid var(--accent);">
            <div style="font-size:0.9rem;font-weight:600;margin-bottom:4px;">
                Dr. ${escapeHtml(r.doctor_name)} wants to connect
            </div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:10px;">
                ${escapeHtml(r.message)}
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" onclick="respondToRequest(${r.id}, 'accept')">Accept</button>
                <button class="btn btn-secondary btn-sm" onclick="respondToRequest(${r.id}, 'reject')">Decline</button>
            </div>
        </div>
    `).join('');
    container.style.display = 'block';
}

async function respondToRequest(requestId, action) {
    try {
        const data = await apiCall(`/api/patient/connection-requests/${requestId}/respond`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });
        showToast(data.message, 'success');

        // Smoothly remove the request card (no reload!)
        const container = document.getElementById('connection-requests');
        const cards = container.querySelectorAll('.glass-card');
        cards.forEach(card => {
            card.style.transition = 'opacity 0.3s, transform 0.3s';
            card.style.opacity = '0';
            card.style.transform = 'translateX(-20px)';
            setTimeout(() => card.remove(), 300);
        });

        // Hide container after animation
        setTimeout(() => {
            container.style.display = 'none';
        }, 350);

        // Update doctor status instantly (no reload)
        if (action === 'accept' && data.doctor_name) {
            updateDoctorStatus(data.doctor_name);
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function updateDoctorStatus(doctorName) {
    const docStatus = document.getElementById('doctor-status');
    if (docStatus) {
        docStatus.innerHTML = `<span style="color:var(--success);">● Connected to Dr. ${escapeHtml(doctorName)}</span>`;
        docStatus.style.transition = 'opacity 0.3s';
        docStatus.style.opacity = '0';
        setTimeout(() => { docStatus.style.opacity = '1'; }, 50);
    }
}

// ========== Server-Sent Events (SSE) ==========

function connectSSE() {
    const evtSource = new EventSource('/api/events/stream');

    evtSource.addEventListener('connection_request', (e) => {
        const data = JSON.parse(e.data);
        const container = document.getElementById('connection-requests');
        if (container) {
            container.style.display = 'block';
            container.innerHTML += `
                <div class="glass-card" style="padding:14px 18px;margin-bottom:10px;border-left:3px solid var(--accent);animation:slideIn 0.3s ease;">
                    <div style="font-size:0.9rem;font-weight:600;margin-bottom:4px;">
                        Dr. ${escapeHtml(data.doctor_name)} wants to connect
                    </div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:10px;">
                        ${escapeHtml(data.message)}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="respondToRequest(${data.id}, 'accept')">Accept</button>
                        <button class="btn btn-secondary btn-sm" onclick="respondToRequest(${data.id}, 'reject')">Decline</button>
                    </div>
                </div>
            `;
            showToast('New request from Dr. ' + data.doctor_name, 'success');
        }
    });

    evtSource.addEventListener('alert', (e) => {
        const data = JSON.parse(e.data);
        showToast('⚠️ ' + data.message, 'warning');
    });

    evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectSSE, 5000);
    };
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
            <h4>${escapeHtml(c.title)}</h4>
            <div class="conv-meta">
                <span>${formatDate(c.started_at)}</span>
                <span>•</span>
                <span>${c.message_count} msgs</span>
                <span class="badge ${getRiskBadge(c.risk_level)}" style="margin-left:auto; display:none;">${c.risk_level}</span>
                <button class="delete-conv-btn" onclick="event.stopPropagation(); deleteConversation(${c.id})" title="Delete Chat">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteConversation(id) {
    if (!confirm('Are you sure you want to delete this chat?')) return;
    try {
        await apiCall(`/api/chat/${id}`, { method: 'DELETE' });
        if (currentConversation && currentConversation.id === id) {
            currentConversation = null;
            document.getElementById('chat-active').style.display = 'none';
            document.getElementById('chat-welcome').style.display = 'flex';
        }
        await loadConversations();
    } catch (error) {
        showToast(error.message, 'error');
    }
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

function updateHeaderDP() {
    let dpHtml = '💜';
    if (activePersona && activePersona.profile_image) {
        dpHtml = `<img src="${activePersona.profile_image}" alt="DP">`;
    }
    document.getElementById('wa-chat-dp').innerHTML = dpHtml;
    
    const waCallDp = document.getElementById('voice-avatar-wa');
    if (waCallDp) {
        waCallDp.innerHTML = dpHtml;
    }
}

function triggerPhotoUpload() {
    if (!currentConversation || !currentConversation.persona_id) {
        showToast('You can only set a photo for a saved Persona', 'error');
        return;
    }
    document.getElementById('persona-photo-input').click();
}

async function uploadPersonaPhoto(input) {
    if (!input.files || !input.files[0]) return;
    if (!currentConversation || !currentConversation.persona_id) return;
    
    const formData = new FormData();
    formData.append('persona_image', input.files[0]);
    
    try {
        const res = await fetch(`/api/persona/${currentConversation.persona_id}/photo`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        
        if (activePersona) {
            activePersona.profile_image = data.profile_image;
        }
        updateHeaderDP();
        showToast('Photo updated', 'success');
        
        // Re-render messages to update avatars
        if (currentConversation) {
            const histData = await apiCall(`/api/chat/history/${currentConversation.id}`);
            renderMessages(histData.messages);
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
    
    input.value = ''; // Reset
}

function showChatUI() {
    document.getElementById('chat-welcome').style.display = 'none';
    const chatActive = document.getElementById('chat-active');
    chatActive.style.display = 'flex';

    document.getElementById('chat-title').textContent = currentConversation.title || 'New Conversation';

    const personaEl = document.getElementById('chat-persona');
    const waCallName = document.getElementById('wa-call-name');
    
    if (currentConversation.persona_id) {
        const opt = document.querySelector(`#persona-select option[value="${currentConversation.persona_id}"]`);
        const pName = opt ? opt.textContent.split(' — ')[0] : 'Someone';
        personaEl.textContent = `Speaking as ${pName}`;
        if (waCallName) waCallName.textContent = pName;
        
        // Background fetch persona details to render image
        if (!activePersona || activePersona.id !== currentConversation.persona_id) {
            fetchPersonaDetails(currentConversation.persona_id);
        } else {
            updateHeaderDP();
        }
    } else {
        personaEl.textContent = '';
        if (waCallName) waCallName.textContent = 'HeyMira';
        activePersona = null;
        updateHeaderDP();
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
    try {
        const res = await apiCall(`/api/persona/${personaId}`);
        activePersona = res.persona;
        updateHeaderDP();
    } catch (e) {
        activePersona = null;
        updateHeaderDP();
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

        // Update mood indicator
        updateMood(data.sentiment);

        // Update conversation in list only if it's the first exchange
        if (!currentConversation.title || currentConversation.title === 'New Conversation' || currentConversation.message_count <= 2) {
            currentConversation.title = data.user_message.content.substring(0, 80);
            document.getElementById('chat-title').textContent = currentConversation.title;
        }

        currentConversation.risk_level = data.risk_level;
        currentConversation.message_count = (currentConversation.message_count || 0) + 2;
        renderConversationList();

        // Show alert notification if crisis detected
        if (data.alert_triggered) {
            showToast('⚠️ Your therapist has been notified. You are not alone.', 'warning');
        }
    } catch (error) {
        typing.classList.remove('visible');
        showToast(error.message, 'error');
    }
}

function updateMood(sentiment) {
    if (!sentiment) return;
    const emoji = getMoodEmoji(sentiment.score);
    const text = sentiment.emotion || 'neutral';
    document.getElementById('mood-indicator').innerHTML = `
        <span>${emoji}</span>
        <span id="mood-text">${text}</span>
    `;
}

async function endConversation() {
    if (!currentConversation) return;
    if (!confirm('End this session? A report will be generated for your doctor.')) return;

    try {
        const data = await apiCall(`/api/chat/end/${currentConversation.id}`, { method: 'POST' });
        showToast('Session ended. Report generated.', 'success');
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
    if (!text || !currentConversation) return Promise.reject("No text or conversation");

    addMessageToUI('user', text, null, true);
    const typing = document.getElementById('typing-indicator');
    typing.classList.add('visible');
    scrollToBottom();

    return apiCall('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
            conversation_id: currentConversation.id,
            content: text,
            is_voice: true
        })
    }).then(data => {
        typing.classList.remove('visible');
        addMessageToUI('ai', data.ai_message.content, null, true);
        updateMood(data.sentiment);

        // Speak the AI response
        if (typeof speakResponse === 'function') {
            speakResponse(data.ai_message.content);
        }

        if (data.alert_triggered) {
            showToast('⚠️ Your therapist has been notified.', 'warning');
        }
        return data;
    }).catch(error => {
        typing.classList.remove('visible');
        showToast(error.message, 'error');
        throw error;
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
