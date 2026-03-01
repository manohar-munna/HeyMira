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
    }).catch(() => {});
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
        const data = await response.json();
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
    } catch (e) {}
    window.location.href = '/login';
}

// Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

// Initialize theme on every page
document.addEventListener('DOMContentLoaded', loadTheme);
