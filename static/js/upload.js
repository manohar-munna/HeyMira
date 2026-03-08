// HeyMira - PDF Upload & Persona Creation

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
        if (file && file.type === 'application/pdf') {
            handleFile(file);
        } else {
            showToast('Please drop a PDF file', 'error');
        }
    });
}

function handleFileSelect(input) {
    if (input.files[0]) {
        handleFile(input.files[0]);
    }
}

function handleFile(file) {
    selectedFile = file;
    const nameEl = document.getElementById('file-name');
    nameEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    nameEl.style.display = 'block';
}

function previewPersonaImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('persona-image-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';

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

async function uploadPersona() {
    const personName = document.getElementById('person-name').value.trim();

    if (!personName) {
        showToast('Please enter the person\'s name', 'error');
        return;
    }

    if (!selectedFile) {
        showToast('Please select a PDF file', 'error');
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
        formData.append('persona_image', imageInput.files[0]);
    }

    try {
        const response = await fetch('/api/persona/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

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
        { label: 'Common Phrases', value: (persona.common_phrases || []).slice(0, 3).join(', ') || 'N/A' }
    ];

    grid.innerHTML = traits.map(t => `
        <div class="trait-item">
            <div class="trait-label">${t.label}</div>
            <div class="trait-value">${t.value || 'N/A'}</div>
        </div>
    `).join('');

    result.style.display = 'block';
    result.scrollIntoView({ behavior: 'smooth' });
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
    if (!confirm('Delete this persona?')) return;
    try {
        await apiCall(`/api/persona/${id}`, { method: 'DELETE' });
        showToast('Persona deleted', 'success');
        await loadExistingPersonas();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
