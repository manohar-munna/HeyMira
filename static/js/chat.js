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
        const menu = document.getElementById('persona-dropdown-menu');

        let html = `
            <div class="custom-dropdown-item active" onclick="selectPersonaOption('', 'Default AI', 'HeyMira Support', null, event)">
                <div class="persona-option-avatar">💜</div>
                <div class="persona-option-info">
                    <span class="persona-option-name">Default AI</span>
                    <span class="persona-option-desc">HeyMira Support</span>
                </div>
            </div>
        `;

        data.personas.forEach(p => {
            const avatarHtml = p.image_filename
                ? `<img src="/static/uploads/${p.image_filename}" alt="${escapeHtml(p.name)}">`
                : `${escapeHtml(p.name[0].toUpperCase())}`;

            const safeName = escapeHtml(p.name).replace(/'/g, "\\'");
            const safeTone = escapeHtml(p.tone || 'AI Assistant').replace(/'/g, "\\'");
            const safeImg = p.image_filename ? `'${p.image_filename}'` : 'null';

            html += `
                <div class="custom-dropdown-item" onclick="selectPersonaOption('${p.id}', '${safeName}', '${safeTone}', ${safeImg}, event)">
                    <div class="persona-option-avatar">${avatarHtml}</div>
                    <div class="persona-option-info">
                        <span class="persona-option-name">${safeName}</span>
                        <span class="persona-option-desc">${safeTone}</span>
                    </div>
                </div>
            `;
        });

        menu.innerHTML = html;
    } catch (e) { console.error('Error loading personas:', e); }
}

function togglePersonaDropdown() {
    document.getElementById('persona-dropdown').classList.toggle('open');
}

function selectPersonaOption(id, name, desc, image, event) {
    if (event) event.stopPropagation();

    // Update hidden input component
    document.getElementById('persona-select').value = id || '';

    // Close dropdown
    document.getElementById('persona-dropdown').classList.remove('open');

    // Update active class
    document.querySelectorAll('.custom-dropdown-item').forEach(el => el.classList.remove('active'));
    if (event) event.currentTarget.classList.add('active');

    // Update selected block
    const avatarHtml = image
        ? `<img src="/static/uploads/${image}" alt="${name}">`
        : (id ? name[0].toUpperCase() : '💜');

    const selectedHtml = `
        <div class="persona-option-avatar">${avatarHtml}</div>
        <div class="persona-option-info">
            <span class="persona-option-name">${name}</span>
            <span class="persona-option-desc">${desc}</span>
        </div>
        <div class="custom-dropdown-arrow">▼</div>
    `;

    document.getElementById('persona-selected').innerHTML = selectedHtml;
}

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('persona-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

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
        const activeOption = document.querySelector('.custom-dropdown-item.active .persona-option-name');
        const personaName = activeOption ? activeOption.textContent : 'HeyMira';
        addMessageToUI('ai', `Hey! 😊 I'm ${personaName}. How are you feeling today? I'm here to listen and chat whenever you need someone.`);
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
        // Try to find the name in the loaded dropdown list
        const items = document.querySelectorAll('.custom-dropdown-item');
        let foundName = 'Persona';
        // Hacky way to find it since we store ID in onclick
        items.forEach(item => {
            if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${currentConversation.persona_id}'`)) {
                const nameSpan = item.querySelector('.persona-option-name');
                if (nameSpan) foundName = nameSpan.textContent;
            }
        });
        personaEl.textContent = `Speaking as ${foundName}`;
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

    // Default avatar logic
    let avatarHtml = role === 'ai' ? '💜' : (currentUser ? currentUser.username[0].toUpperCase() : '?');

    // User profile image
    if (role === 'user' && currentUser && currentUser.profile_image) {
        avatarHtml = `<img src="/static/uploads/${currentUser.profile_image}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = `
        <div class="msg-avatar">${avatarHtml}</div>
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

        currentConversation.message_count = (currentConversation.message_count || 0) + 2;

        // ONLY UPDATE TITLE IF THIS IS THE VERY FIRST MESSAGE
        if (currentConversation.message_count <= 2) {
            currentConversation.title = data.user_message.content.substring(0, 80);
            document.getElementById('chat-title').textContent = currentConversation.title;
        }

        currentConversation.risk_level = data.risk_level;
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

    // The addMessageToUI logic we already updated handles the profile image!
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

        currentConversation.message_count = (currentConversation.message_count || 0) + 2;
        if (currentConversation.message_count <= 2) {
            currentConversation.title = text.substring(0, 80);
            document.getElementById('chat-title').textContent = currentConversation.title;
        }

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

// ========== Mobile Sidebar ==========

function toggleSidebar() {
    const sidebar = document.querySelector('.chat-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Close sidebar on mobile when clicking outside
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.chat-sidebar');
        const menuBtn = document.querySelector('.mobile-menu-btn');
        if (sidebar && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
                sidebar.classList.remove('open');
            }
        }
    }
});

// ========== Profile Modal ==========

function openProfileModal() {
    if (!currentUser) return;

    document.getElementById('profile-username').value = currentUser.username || '';
    document.getElementById('profile-age').value = currentUser.age || '';
    document.getElementById('profile-gender').value = currentUser.gender || '';

    const preview = document.getElementById('profile-preview-avatar');
    if (currentUser.profile_image) {
        preview.innerHTML = `<img src="/static/uploads/${currentUser.profile_image}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        preview.style.background = 'transparent';
    } else {
        preview.innerHTML = currentUser.username ? currentUser.username[0].toUpperCase() : '?';
        preview.style.background = 'var(--accent-gradient)';
    }

    document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

function previewProfileImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('profile-preview-avatar');
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            preview.style.background = 'transparent';
        }
        reader.readAsDataURL(file);
    }
}

async function saveProfile(event) {
    event.preventDefault();

    const btn = event.target.querySelector('button[type="submit"]');
    const orgText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const formData = new FormData();
    formData.append('username', document.getElementById('profile-username').value);
    formData.append('age', document.getElementById('profile-age').value);
    formData.append('gender', document.getElementById('profile-gender').value);

    const fileInput = document.getElementById('profile-image-input');
    if (fileInput.files[0]) {
        formData.append('profile_image', fileInput.files[0]);
    }

    try {
        const response = await fetch('/api/profile/update', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update profile');
        }

        showToast('Profile updated!', 'success');
        closeProfileModal();

        // Reload user info to reflect changes instantly
        await loadUser();

        // Rerender chat messages to show new avatar on existing messages potentially
        if (currentConversation) {
            selectConversation(currentConversation.id);
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.textContent = orgText;
        btn.disabled = false;
    }
}
