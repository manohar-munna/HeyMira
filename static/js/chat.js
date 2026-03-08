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
        document.getElementById('user-avatar').textContent = currentUser.username[0].toUpperCase();

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
                <span class="badge ${getRiskBadge(c.risk_level)}" style="margin-left:auto;">${c.risk_level}</span>
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
    } else {
        personaEl.textContent = '';
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
    // Use formatTime for chat message timestamps (shows actual clock time)
    const time = timestamp ? formatTime(timestamp) : getCurrentTime();
    const avatar = role === 'ai' ? '💜' : (currentUser ? currentUser.username[0].toUpperCase() : '?');

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

        // Update conversation in list
        currentConversation.title = data.user_message.content.substring(0, 80);
        currentConversation.risk_level = data.risk_level;
        currentConversation.message_count = (currentConversation.message_count || 0) + 2;
        document.getElementById('chat-title').textContent = currentConversation.title;
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
        updateMood(data.sentiment);

        // Speak the AI response
        if (typeof speakResponse === 'function') {
            speakResponse(data.ai_message.content);
        }

        if (data.alert_triggered) {
            showToast('⚠️ Your therapist has been notified.', 'warning');
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
