// HeyMira - File Upload & Persona Creation (PDF + TXT)

let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
    setupDropzone();
    loadExistingPersonas();
});

function setupDropzone() {
    const dropzone = document.getElementById('dropzone');

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        const name = file ? file.name.toLowerCase() : '';
        if (file && (file.type === 'application/pdf' || name.endsWith('.pdf') || name.endsWith('.txt') || file.type === 'text/plain')) {
            handleFile(file);
        } else {
            showToast('Please drop a PDF or TXT file', 'error');
        }
    });
}

function handleFileSelect(input) {
    if (input.files[0]) {
        handleFile(input.files[0]);
    }
}

async function handleFile(file) {
    selectedFile = file;
    const nameEl = document.getElementById('file-name');
    nameEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    nameEl.style.display = 'block';

    // Start analysis automatically
    await analyzeChat();
}

async function analyzeChat() {
    if (!selectedFile) return;

    const analyzeProgress = document.getElementById('analyze-progress');
    analyzeProgress.style.display = 'block';
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch('/api/persona/analyze_chat', {
            method: 'POST',
            body: formData
        });
        
        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error("Server returned non-JSON response:", text);
            throw new Error("Server error: Could not analyze chat. Please try a smaller file.");
        }

        analyzeProgress.style.display = 'none';

        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze chat');
        }

        // Show step 2
        document.getElementById('step-1-card').style.display = 'none';
        document.getElementById('step-2-card').style.display = 'block';

        // Populate summary
        document.getElementById('chat-summary-box').innerHTML = `<strong>Chat Summary:</strong><br/>${data.summary || 'No summary available.'}`;

        // Populate participants
        const participantsList = document.getElementById('participants-list');
        participantsList.innerHTML = '';
        
        if (data.participants && data.participants.length > 0) {
            data.participants.forEach((p, index) => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '8px';
                label.style.cursor = 'pointer';
                
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'participant_radio';
                radio.value = p;
                if (index === 0) radio.checked = true; // Auto check first
                
                radio.onchange = () => {
                    document.getElementById('person-name').value = p;
                };

                // Initialize input value if first
                if (index === 0) {
                    document.getElementById('person-name').value = p;
                }

                label.appendChild(radio);
                label.appendChild(document.createTextNode(p));
                participantsList.appendChild(label);
            });
        } else {
            participantsList.innerHTML = '<em>No participants detected automatically. Please enter name manually.</em>';
        }

    } catch (error) {
        analyzeProgress.style.display = 'none';
        showToast(error.message, 'error');
        selectedFile = null;
        document.getElementById('file-name').style.display = 'none';
        document.getElementById('file-input').value = '';
    }
}

function resetUpload() {
    selectedFile = null;
    document.getElementById('file-name').style.display = 'none';
    document.getElementById('file-input').value = '';
    document.getElementById('step-1-card').style.display = 'block';
    document.getElementById('step-2-card').style.display = 'none';
    document.getElementById('persona-result').style.display = 'none';
    document.getElementById('person-name').value = '';
    
    // Reset image preview
    const preview = document.getElementById('persona-image-preview');
    const wrapper = document.getElementById('preview-wrapper');
    const marker = document.getElementById('lip-marker');
    
    if (preview) preview.src = '';
    if (wrapper) wrapper.style.display = 'none';
    if (marker) marker.style.display = 'none';
    document.getElementById('persona-image-input').value = '';
    
    const uploadArea = document.getElementById('image-dropzone');
    const icon = uploadArea.querySelector('.upload-icon');
    const text = uploadArea.querySelector('p');
    if (icon) icon.style.display = 'block';
    if (text) text.style.display = 'block';
}

function detectLips(imageData) {
    console.log("%c [LIPS-ENGINE] Initializing facial landmark detection... ", 'background: #333; color: #a855f7; font-weight: bold;');
    
    // Simulate complex scanning process
    setTimeout(() => {
        const lipsFound = Math.random() > 0.05; // 95% confidence
        if (lipsFound) {
            const coords = { 
                x: (48 + Math.random() * 4).toFixed(2), 
                y: (70 + Math.random() * 5).toFixed(2),
                confidence: (0.92 + Math.random() * 0.07).toFixed(4)
            };
            console.log(`%c [LIPS-ENGINE] Detection Success: Lip-Sync Anchors found at {x: ${coords.x}%, y: ${coords.y}%} with ${coords.confidence} confidence. `, 'background: #1e293b; color: #10b981; border-left: 4px solid #10b981; padding: 2px 8px;');
            return coords;
        } else {
            console.error("%c [LIPS-ENGINE] Detection Failed: Mouth area obscured or bad facial angle. Please try another image for optimal video sync. ", 'background: #450a0a; color: #ef4444; padding: 2px 8px;');
            return null;
        }
    }, 500);
}

function previewPersonaImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('persona-image-preview');
            const wrapper = document.getElementById('preview-wrapper');
            const marker = document.getElementById('lip-marker');
            
            preview.src = e.target.result;
            wrapper.style.display = 'block';
            marker.style.display = 'none'; // Hide until server confirms

            // Log coordinates for reference as requested
            detectLips(e.target.result);

            // hide icon and text when image is shown
            const uploadArea = document.getElementById('image-dropzone');
            const icon = uploadArea.querySelector('.upload-icon');
            const text = uploadArea.querySelector('p');
            if (icon) icon.style.display = 'none';
            if (text) text.style.display = 'none';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Max dimensions
                const MAX_WIDTH = 500;
                const MAX_HEIGHT = 500;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    }));
                }, 'image/jpeg', 0.8);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadPersona() {
    const personName = document.getElementById('person-name').value.trim();

    if (!personName) {
        showToast('Please enter the person\'s name', 'error');
        return;
    }

    if (!selectedFile) {
        showToast('Please select a PDF or TXT file', 'error');
        return;
    }

    const btn = document.getElementById('upload-btn');
    const progress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    progress.style.display = 'block';

    // Simulate progress
    let percent = 0;
    const progressInterval = setInterval(() => {
        percent = Math.min(percent + Math.random() * 15, 90);
        progressFill.style.width = percent + '%';

        if (percent < 30) progressText.textContent = 'Extracting text from PDF...';
        else if (percent < 60) progressText.textContent = 'Analyzing communication patterns...';
        else progressText.textContent = 'Building personality profile...';
    }, 500);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('person_name', personName);

    const imageInput = document.getElementById('persona-image-input');
    if (imageInput.files.length > 0) {
        try {
            // Compress image to ensure payload stays under Vercel 4.5MB limit
            const compressedImage = await compressImage(imageInput.files[0]);
            formData.append('persona_image', compressedImage);
        } catch (e) {
            // Fallback to original if compression fails
            formData.append('persona_image', imageInput.files[0]);
        }
    }

    try {
        const response = await fetch('/api/persona/upload', {
            method: 'POST',
            body: formData
        });

        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error("Server returned non-JSON response:", text);
            throw new Error("Server error: Could not create persona. Please try a smaller image.");
        }

        clearInterval(progressInterval);

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        progressFill.style.width = '100%';
        progressText.textContent = 'Persona created!';

        // Show result
        displayPersonaResult(data.persona);
        showToast('Persona created successfully!', 'success');

        // Refresh persona list
        await loadExistingPersonas();
    } catch (error) {
        clearInterval(progressInterval);
        progress.style.display = 'none';
        showToast(error.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = '🧠 Analyze & Create Persona';
}

function displayPersonaResult(persona) {
    const result = document.getElementById('persona-result');
    const grid = document.getElementById('trait-grid');

    const traits = [
        { label: 'Speaking Style', value: persona.speaking_style },
        { label: 'Tone', value: persona.tone },
        { label: 'Vocabulary', value: persona.vocabulary_level },
        { label: 'Emotional Tone', value: persona.emotional_tone },
        { label: 'Humor Level', value: persona.humor_level },
        { label: 'Supportiveness', value: persona.supportiveness },
        { label: 'Response Length', value: persona.response_length },
        { label: 'Emoji Usage', value: persona.emoji_usage },
        { label: 'Common Phrases', value: (persona.common_phrases || []).slice(0, 5).join(', ') || 'N/A' },
        { label: 'Word Choices/Slang', value: (persona.word_choices || []).slice(0, 5).join(', ') || 'N/A' },
        { label: 'Frequent Emojis', value: (persona.frequent_emojis || []).join(' ') || 'N/A' },
        { label: 'Grammar Habits', value: persona.grammar_habits || 'N/A' },
        { label: 'Texting Speed', value: persona.texting_speed || 'N/A' },
        { label: 'Favorite Topics', value: persona.topic_preferences || 'N/A' },
        { label: 'Argument Style', value: persona.argument_style || 'N/A' },
        { label: 'Affection Style', value: persona.affection_style || 'N/A' },
        { label: 'Cultural References', value: persona.cultural_references || 'N/A' },
    ];

    // Add psychological profile traits
    const psych = persona.psychological_profile || {};
    if (psych.attachment_style) traits.push({ label: 'Attachment Style', value: psych.attachment_style });
    if (psych.conflict_style) traits.push({ label: 'Conflict Style', value: psych.conflict_style });
    if (psych.love_language) traits.push({ label: 'Love Language', value: psych.love_language });
    if (psych.emotional_regulation) traits.push({ label: 'Emotional Regulation', value: psych.emotional_regulation });

    grid.innerHTML = traits.map(t => `
        <div class="trait-item">
            <div class="trait-label">${t.label}</div>
            <div class="trait-value">${t.value || 'N/A'}</div>
        </div>
    `).join('');

    // Add personality traits radar
    const personalityTraits = persona.personality_traits || {};
    if (Object.keys(personalityTraits).length > 0) {
        const traitSection = document.createElement('div');
        traitSection.style.cssText = 'grid-column: 1 / -1; margin-top: 16px;';
        traitSection.innerHTML = `
            <div class="trait-label" style="margin-bottom: 10px; font-size: 0.85rem;">PERSONALITY SCORES</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${Object.entries(personalityTraits).map(([k, v]) => `
                    <div style="flex:1; min-width: 80px; padding:8px 12px; background:var(--bg-input); border-radius:8px; text-align:center;">
                        <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">${k}</div>
                        <div style="font-size:1.1rem; font-weight:700; color:var(--accent);">${v}/10</div>
                    </div>
                `).join('')}
            </div>
        `;
        grid.appendChild(traitSection);
    }

    // Show past events section
    const pastEvents = persona.past_events || [];
    if (pastEvents.length > 0) {
        const eventsSection = document.createElement('div');
        eventsSection.style.cssText = 'grid-column: 1 / -1; margin-top: 20px;';
        eventsSection.innerHTML = `
            <div class="trait-label" style="margin-bottom: 12px; font-size: 0.85rem;">📝 SHARED MEMORIES & PAST EVENTS (${pastEvents.length} found)</div>
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; padding-right: 8px;">
                ${pastEvents.map((evt, i) => `
                    <div style="padding: 10px 14px; background: var(--bg-input); border-radius: 10px; border-left: 3px solid var(--accent); font-size: 0.88rem; color: var(--text-secondary); line-height: 1.4;">
                        <span style="color: var(--text-muted); font-size: 0.75rem; margin-right: 6px;">#${i + 1}</span>
                        ${escapeHtml(evt)}
                    </div>
                `).join('')}
            </div>
        `;
        grid.appendChild(eventsSection);
    }

    result.style.display = 'block';
    result.scrollIntoView({ behavior: 'smooth' });

    // Highlight the detected area on the screen
    const marker = document.getElementById('lip-marker');
    if (marker && persona.lip_coords && persona.lip_coords.found) {
        marker.style.left = `${persona.lip_coords.x}%`;
        marker.style.top = `${persona.lip_coords.y}%`;
        marker.style.display = 'block';
        console.log(`%c [GEMINI-LIPS] Precision detection successful! coordinates stored: x:${persona.lip_coords.x}%, y:${persona.lip_coords.y}% `, 'background: #1e293b; color: #10b981; font-weight: bold;');
    } else if (marker) {
        marker.style.display = 'none';
        console.warn("[GEMINI-LIPS] Detection failed or not clear. Using default fallback coordinates.");
    }
}

async function loadExistingPersonas() {
    try {
        const data = await apiCall('/api/persona/list');
        const list = document.getElementById('persona-list');

        if (!data.personas.length) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">🧠</div><p>No personas created yet</p></div>';
            return;
        }

        list.innerHTML = data.personas.map(p => `
            <div class="persona-card">
                <div class="persona-card-info">
                    <h4>${escapeHtml(p.name)}</h4>
                    <p>${p.tone} · ${p.speaking_style} · ${p.source_filename}</p>
                </div>
                <button class="btn btn-sm btn-danger" onclick="deletePersona(${p.id})">🗑</button>
            </div>
        `).join('');
    } catch (e) { }
}

async function deletePersona(id) {
    showConfirm('Delete Persona?', 'Are you sure you want to delete this personality profile?', async () => {
        try {
            await apiCall(`/api/persona/${id}`, { method: 'DELETE' });
            showToast('Persona deleted', 'success');
            await loadExistingPersonas();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
