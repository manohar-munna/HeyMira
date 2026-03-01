// HeyMira - Doctor Dashboard

let sentimentChart = null;
let alertsVisible = false;

document.addEventListener('DOMContentLoaded', async () => {
    await loadDoctorInfo();
    await loadPatients();
    await loadAlerts();

    // Poll for new alerts every 30 seconds
    setInterval(loadAlerts, 30000);
});

async function loadDoctorInfo() {
    try {
        const data = await apiCall('/api/auth/me');
        document.getElementById('doc-name').textContent = `Dr. ${data.user.username}`;
        document.getElementById('doc-avatar').textContent = data.user.username[0].toUpperCase();
        if (data.user.theme) setTheme(data.user.theme);
    } catch (error) {
        window.location.href = '/login';
    }
}

async function loadPatients() {
    try {
        const data = await apiCall('/api/doctor/patients');
        const list = document.getElementById('patient-list');

        if (!data.patients.length) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No patients assigned yet</p></div>';
            initEmptyChart();
            return;
        }

        list.innerHTML = data.patients.map(p => {
            const risk = p.latest_report ? p.latest_report.risk_level : 'low';
            const sentiment = p.latest_report ? p.latest_report.sentiment_score : 0;
            return `
                <div class="patient-card" onclick="viewPatient(${p.user.id}, '${escapeHtml(p.user.username)}')">
                    <div class="patient-card-left">
                        <div class="patient-avatar">${p.user.username[0].toUpperCase()}</div>
                        <div class="patient-info">
                            <h4>${escapeHtml(p.user.username)}</h4>
                            <p>${p.total_conversations} sessions · ${getMoodEmoji(sentiment)} ${sentiment.toFixed(1)}</p>
                        </div>
                    </div>
                    <div class="patient-card-right">
                        ${p.unread_alerts > 0 ? `<span class="badge badge-critical">⚠ ${p.unread_alerts}</span>` : ''}
                        <span class="badge ${getRiskBadge(risk)}">${risk}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Build sentiment chart from patients
        buildSentimentChart(data.patients);
    } catch (error) {
        showToast('Failed to load patients', 'error');
    }
}

async function loadAlerts() {
    try {
        const data = await apiCall('/api/doctor/alerts');
        const list = document.getElementById('alert-list');
        const countEl = document.getElementById('alert-count');

        const unread = data.alerts.filter(a => !a.is_read);
        if (unread.length > 0) {
            countEl.textContent = unread.length;
            countEl.classList.add('visible');
        } else {
            countEl.classList.remove('visible');
        }

        if (!data.alerts.length) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No alerts — all patients are doing well</p></div>';
            return;
        }

        list.innerHTML = data.alerts.slice(0, 10).map(a => `
            <div class="alert-item ${a.is_read ? '' : 'unread'}">
                <div class="alert-header">
                    <span class="alert-type">🚨 ${a.alert_type}</span>
                    <span class="alert-time">${formatDate(a.created_at)}</span>
                </div>
                <div class="alert-body">
                    <strong>${a.patient_name}</strong>: ${escapeHtml(a.message)}
                </div>
                ${!a.is_read ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="markAlertRead(${a.id})">Mark as Read</button>` : ''}
            </div>
        `).join('');
    } catch (e) { }
}

async function markAlertRead(alertId) {
    try {
        await apiCall(`/api/doctor/alerts/${alertId}/read`, { method: 'POST' });
        await loadAlerts();
        showToast('Alert marked as read', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function viewPatient(patientId, name) {
    const modal = document.getElementById('patient-modal');
    document.getElementById('modal-patient-name').textContent = `${name}'s Reports`;
    modal.classList.add('active');

    try {
        const data = await apiCall(`/api/doctor/patient/${patientId}/reports`);
        const reports = document.getElementById('modal-reports');

        if (!data.reports.length) {
            reports.innerHTML = '<div class="empty-state"><p>No reports available yet</p></div>';
            return;
        }

        reports.innerHTML = data.reports.map(r => `
            <div class="report-item ${r.risk_level === 'high' || r.risk_level === 'critical' ? 'high' : r.risk_level === 'moderate' ? 'moderate' : ''}">
                <div class="report-date">${formatDate(r.created_at)}</div>
                <div class="report-summary">${escapeHtml(r.ai_summary)}</div>
                <div class="report-meta">
                    <span class="badge ${getRiskBadge(r.risk_level)}">${r.risk_level}</span>
                    <span class="mood-indicator">${getMoodEmoji(r.sentiment_score)} ${r.sentiment_score.toFixed(2)}</span>
                    <span style="font-size:0.8rem;color:var(--text-muted);">Trend: ${r.emotional_trend}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function closeModal() {
    document.getElementById('patient-modal').classList.remove('active');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.id === 'patient-modal') closeModal();
});

function buildSentimentChart(patients) {
    const ctx = document.getElementById('sentiment-chart');
    if (!ctx) return;

    // Destroy previous chart
    if (sentimentChart) sentimentChart.destroy();

    const labels = patients.map(p => p.user.username);
    const scores = patients.map(p => p.latest_report ? p.latest_report.sentiment_score : 0);
    const colors = scores.map(s => {
        if (s >= 0.3) return 'rgba(16, 185, 129, 0.8)';
        if (s >= -0.2) return 'rgba(245, 158, 11, 0.8)';
        return 'rgba(239, 68, 68, 0.8)';
    });

    sentimentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sentiment Score',
                data: scores,
                backgroundColor: colors,
                borderRadius: 8,
                barThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1,
                    max: 1,
                    ticks: {
                        color: '#6b6d80',
                        font: { family: 'Inter' }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: {
                        color: '#a7a9be',
                        font: { family: 'Inter' }
                    },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function initEmptyChart() {
    const ctx = document.getElementById('sentiment-chart');
    if (!ctx) return;

    sentimentChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['No data'], datasets: [{ data: [0], backgroundColor: 'rgba(107,109,128,0.3)', borderRadius: 8 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: -1, max: 1, ticks: { color: '#6b6d80' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#6b6d80' }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function toggleAlerts() {
    // Scroll to alerts section
    document.getElementById('alert-list').scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
