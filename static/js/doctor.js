// HeyMira - Doctor Dashboard

let sentimentTimelineChart = null;
let riskDistributionChart = null;
let messageSentimentChart = null;
let currentPatients = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadDoctorInfo();
    await loadPatients();
    await loadAlerts();
    await loadAvailablePatients();

    // Poll for new alerts every 60 seconds
    setInterval(loadAlerts, 60000);
});

// ========== Tab System ==========

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });

    if (tab === 'find') loadAvailablePatients();
    if (tab === 'analytics') populateAnalyticsDropdown();
}

// ========== Doctor Info ==========

async function loadDoctorInfo() {
    try {
        const data = await apiCall('/api/auth/me');
        document.getElementById('doc-name').textContent = `Dr. ${data.user.username}`;
        if (data.user.profile_image) {
            document.getElementById('doc-avatar').innerHTML = `<img src="${data.user.profile_image}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            document.getElementById('doc-avatar').textContent = data.user.username[0].toUpperCase();
        }
        if (data.user.theme) setTheme(data.user.theme);
    } catch (error) {
        window.location.href = '/login';
    }
}

// ========== My Patients ==========

async function loadPatients() {
    try {
        const data = await apiCall('/api/doctor/patients');
        currentPatients = data.patients;
        const list = document.getElementById('patient-list');

        if (!data.patients.length) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No patients connected yet. Go to "Find Patients" to send connection requests.</p></div>';
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
    } catch (error) {
        showToast('Failed to load patients', 'error');
    }
}

// ========== Find & Connect Patients ==========

async function loadAvailablePatients() {
    try {
        const data = await apiCall('/api/doctor/available-patients');
        const list = document.getElementById('available-patients-list');

        if (!data.patients.length) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No patients registered yet</p></div>';
            return;
        }

        list.innerHTML = data.patients.map(p => {
            let statusHtml = '';
            if (p.is_connected) {
                statusHtml = '<span class="badge badge-low">✅ Connected</span>';
            } else if (p.connection_status === 'pending') {
                statusHtml = '<span class="badge badge-moderate">⏳ Pending</span>';
            } else {
                statusHtml = `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); sendRequest(${p.user.id})">Send Request</button>`;
            }

            return `
                <div class="patient-card" style="cursor:default;">
                    <div class="patient-card-left">
                        <div class="patient-avatar">${p.user.username[0].toUpperCase()}</div>
                        <div class="patient-info">
                            <h4>${escapeHtml(p.user.username)}</h4>
                            <p>${p.user.email} · Joined ${formatDate(p.user.created_at)}</p>
                        </div>
                    </div>
                    <div class="patient-card-right">
                        ${statusHtml}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        showToast('Failed to load available patients', 'error');
    }
}

async function sendRequest(patientId) {
    try {
        await apiCall(`/api/doctor/connect/${patientId}`, {
            method: 'POST',
            body: JSON.stringify({ message: 'I would like to help support your mental wellness journey.' })
        });
        showToast('Connection request sent!', 'success');
        await loadAvailablePatients();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ========== Alerts ==========

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

        list.innerHTML = data.alerts.slice(0, 20).map(a => `
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

// ========== Patient Detail Modal ==========

async function viewPatient(patientId, name) {
    const modal = document.getElementById('patient-modal');
    document.getElementById('modal-patient-name').textContent = `${name}'s Details`;
    modal.classList.add('active');

    // Hide messages section initially
    document.getElementById('modal-messages-section').style.display = 'none';

    // Load conversations
    try {
        const convData = await apiCall(`/api/doctor/patient/${patientId}/conversations`);
        const convList = document.getElementById('modal-conversations');

        if (!convData.conversations.length) {
            convList.innerHTML = '<div class="empty-state"><p>No conversations yet</p></div>';
        } else {
            convList.innerHTML = convData.conversations.map(c => `
                <div class="patient-card" style="margin-bottom:8px;cursor:pointer;" onclick="viewConversationMessages(${patientId}, ${c.id}, '${escapeHtml(c.title)}')">
                    <div class="patient-card-left">
                        <div style="font-size:1.2rem;">💬</div>
                        <div class="patient-info">
                            <h4 style="font-size:0.9rem;">${escapeHtml(c.title)}</h4>
                            <p>${formatDate(c.started_at)} · ${c.message_count} messages</p>
                        </div>
                    </div>
                    <div class="patient-card-right">
                        <span class="badge ${getRiskBadge(c.risk_level)}">${c.risk_level}</span>
                        <span style="font-size:0.8rem;color:var(--text-muted);">${getMoodEmoji(c.sentiment_score)} ${c.sentiment_score.toFixed(1)}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        document.getElementById('modal-conversations').innerHTML = '<p style="color:var(--error);">Failed to load conversations</p>';
    }

    // Load reports
    try {
        const repData = await apiCall(`/api/doctor/patient/${patientId}/reports`);
        const reports = document.getElementById('modal-reports');

        if (!repData.reports.length) {
            reports.innerHTML = '<div class="empty-state"><p>No reports available yet</p></div>';
        } else {
            reports.innerHTML = repData.reports.map(r => `
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
        }
    } catch (e) {
        document.getElementById('modal-reports').innerHTML = '<p style="color:var(--error);">Failed to load reports</p>';
    }
}

async function viewConversationMessages(patientId, convId, title) {
    const section = document.getElementById('modal-messages-section');
    const container = document.getElementById('modal-messages');
    section.style.display = 'block';

    container.innerHTML = '<p>Loading messages...</p>';

    try {
        const data = await apiCall(`/api/doctor/patient/${patientId}/conversation/${convId}/messages`);

        if (!data.messages.length) {
            container.innerHTML = '<div class="empty-state"><p>No messages in this conversation</p></div>';
            return;
        }

        container.innerHTML = data.messages.map(m => `
            <div class="msg-bubble ${m.role === 'user' ? 'user-msg' : 'ai-msg'}">
                <div>${escapeHtml(m.content)}</div>
                <div class="msg-meta">
                    ${m.is_voice ? '🎤 ' : ''}${formatTime(m.timestamp)}
                    ${m.role === 'user' && m.sentiment_score ? ` · ${getMoodEmoji(m.sentiment_score)} ${m.sentiment_score.toFixed(1)}` : ''}
                </div>
            </div>
        `).join('');

        section.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        container.innerHTML = '<p style="color:var(--error);">Failed to load messages</p>';
    }
}

function closeModal() {
    document.getElementById('patient-modal').classList.remove('active');
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'patient-modal') closeModal();
});

// ========== Analytics ==========

function populateAnalyticsDropdown() {
    const select = document.getElementById('analytics-patient-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="">Select a patient...</option>';
    currentPatients.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.user.id;
        opt.textContent = p.user.username;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

async function loadPatientAnalytics(patientId) {
    if (!patientId) {
        document.getElementById('analytics-content').style.display = 'none';
        document.getElementById('analytics-empty').style.display = 'block';
        return;
    }

    try {
        const data = await apiCall(`/api/doctor/patient/${patientId}/analytics`);

        document.getElementById('analytics-empty').style.display = 'none';
        document.getElementById('analytics-content').style.display = 'block';

        // Render summary cards
        const summary = data.summary;
        const riskColor = summary.current_risk === 'critical' ? 'var(--error)' :
            summary.current_risk === 'high' ? '#f59e0b' :
                summary.current_risk === 'moderate' ? '#eab308' : 'var(--success)';

        document.getElementById('analytics-summary').innerHTML = `
            <div class="summary-card">
                <div class="card-value">${summary.total_sessions}</div>
                <div class="card-label">Sessions</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${summary.total_messages}</div>
                <div class="card-label">Messages</div>
            </div>
            <div class="summary-card">
                <div class="card-value" style="color:${riskColor};">${getMoodEmoji(summary.average_sentiment)} ${summary.average_sentiment.toFixed(2)}</div>
                <div class="card-label">Avg Sentiment</div>
            </div>
            <div class="summary-card">
                <div class="card-value" style="color:var(--error);">${summary.crisis_alerts}</div>
                <div class="card-label">Crisis Alerts</div>
            </div>
            <div class="summary-card">
                <div class="card-value" style="color:${riskColor};">${summary.current_risk.toUpperCase()}</div>
                <div class="card-label">Current Risk</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${summary.current_trend === 'improving' ? '📈' : summary.current_trend === 'declining' ? '📉' : '➡️'}</div>
                <div class="card-label">${summary.current_trend}</div>
            </div>
        `;

        // Build charts
        buildSentimentTimelineChart(data.sentiment_timeline);
        buildRiskDistributionChart(data.risk_distribution);
        buildMessageSentimentChart(data.message_sentiments);

    } catch (error) {
        showToast('Failed to load analytics: ' + error.message, 'error');
    }
}

function buildSentimentTimelineChart(timeline) {
    const ctx = document.getElementById('sentiment-timeline-chart');
    if (sentimentTimelineChart) sentimentTimelineChart.destroy();

    if (!timeline.length) {
        sentimentTimelineChart = null;
        return;
    }

    const labels = timeline.map(t => {
        const d = new Date(t.date + (t.date.endsWith('Z') ? '' : 'Z'));
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    });
    const scores = timeline.map(t => t.score);

    sentimentTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Sentiment Score',
                data: scores,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: scores.map(s => s < -0.3 ? '#ef4444' : s < 0 ? '#f59e0b' : '#10b981'),
                pointBorderColor: 'transparent',
                pointRadius: 6,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1, max: 1,
                    ticks: { color: '#6b6d80', font: { family: 'Inter' } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#a7a9be', font: { family: 'Inter' } },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (context) => {
                            const t = timeline[context.dataIndex];
                            return `Risk: ${t.risk_level} | Trend: ${t.trend}`;
                        }
                    }
                }
            }
        }
    });
}

function buildRiskDistributionChart(distribution) {
    const ctx = document.getElementById('risk-distribution-chart');
    if (riskDistributionChart) riskDistributionChart.destroy();

    const labels = ['Low', 'Moderate', 'High', 'Critical'];
    const values = [distribution.low || 0, distribution.moderate || 0, distribution.high || 0, distribution.critical || 0];
    const colors = ['#10b981', '#eab308', '#f59e0b', '#ef4444'];

    riskDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#a7a9be', font: { family: 'Inter', size: 11 }, padding: 12 }
                }
            }
        }
    });
}

function buildMessageSentimentChart(messages) {
    const ctx = document.getElementById('message-sentiment-chart');
    if (messageSentimentChart) messageSentimentChart.destroy();

    if (!messages.length) {
        messageSentimentChart = null;
        return;
    }

    const labels = messages.map((m, i) => `#${i + 1}`);
    const scores = messages.map(m => m.score);

    messageSentimentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Sentiment',
                data: scores,
                backgroundColor: scores.map(s => {
                    if (s >= 0.3) return 'rgba(16, 185, 129, 0.7)';
                    if (s >= -0.2) return 'rgba(234, 179, 8, 0.7)';
                    return 'rgba(239, 68, 68, 0.7)';
                }),
                borderRadius: 4,
                barThickness: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1, max: 1,
                    ticks: { color: '#6b6d80', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.03)' }
                },
                x: {
                    ticks: { color: '#6b6d80', font: { size: 9 }, maxRotation: 0 },
                    grid: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function toggleAlerts() {
    switchTab('alerts');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
