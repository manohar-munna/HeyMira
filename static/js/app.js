// HeyMira - Shared Utilities

// Theme Management
function setTheme(theme) {
    const body = document.getElementById('app-body');
    body.className = `theme-${theme}`;
    localStorage.setItem('heymira-theme', theme);

    // Update active state on theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    // Save to server if logged in
    fetch('/api/auth/update-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme })
    }).catch(() => { });
}

function loadTheme() {
    const saved = localStorage.getItem('heymira-theme') || 'calm-night';
    setTheme(saved);
}

// Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// API Helper
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        
        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error("API Error - Non-JSON response:", text);
            throw new Error(`Server returned an error (${response.status})`);
        }

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }
        return data;
    } catch (error) {
        throw error;
    }
}

// Logout
async function logout() {
    try {
        await apiCall('/api/auth/logout', { method: 'POST' });
    } catch (e) { }
    window.location.href = '/login';
}

// Format date — shows REAL actual time (local timezone)
function formatDate(dateStr) {
    if (!dateStr) return '';
    
    // Fix for potential "Invalid Date"
    let date;
    try {
        // Handle Firebase Timestamp objects {seconds, nanoseconds}
        if (typeof dateStr === 'object' && dateStr.seconds) {
            date = new Date(dateStr.seconds * 1000);
        } else {
            const cleanStr = String(dateStr);
            date = new Date(cleanStr.endsWith('Z') ? cleanStr : cleanStr + 'Z');
            
            if (isNaN(date.getTime())) {
                date = new Date(cleanStr);
            }
        }
    } catch (e) {
        return '';
    }

    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diff = now - date;

    // If within last minute
    if (diff < 60000) return 'Just now';

    // If today, show time
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    // If yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    // Otherwise show full date + time
    return date.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    }) + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Format time only (for chat messages)
function formatTime(dateStr) {
    if (!dateStr) return '';
    try {
        let date;
        if (typeof dateStr === 'object' && dateStr.seconds) {
            date = new Date(dateStr.seconds * 1000);
        } else {
            const cleanStr = String(dateStr);
            date = new Date(cleanStr.endsWith('Z') ? cleanStr : cleanStr + 'Z');
            if (isNaN(date.getTime())) {
                date = new Date(cleanStr);
            }
        }
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
        return '';
    }
}

// Get current real time string
function getCurrentTime() {
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Get risk badge class
function getRiskBadge(level) {
    const classes = {
        low: 'badge-low',
        moderate: 'badge-moderate',
        high: 'badge-high',
        critical: 'badge-critical'
    };
    return classes[level] || 'badge-low';
}

// Get mood emoji
function getMoodEmoji(score) {
    if (score >= 0.5) return '😊';
    if (score >= 0.2) return '🙂';
    if (score >= -0.2) return '😐';
    if (score >= -0.5) return '😔';
    return '😢';
}

// Keep Vercel serverless function warm
setInterval(() => {
    fetch('/api/ping').catch(() => {});
}, 30000); // 30 seconds

// Custom Confirmation
function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
        if (confirm(message)) onConfirm();
        return;
    }
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    
    // Clear old listeners
    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    
    newOk.onclick = () => {
        modal.classList.remove('active');
        onConfirm();
    };
    newCancel.onclick = () => {
        modal.classList.remove('active');
    };
    
    modal.classList.add('active');
}

// Initialize theme on every page
document.addEventListener('DOMContentLoaded', loadTheme);
