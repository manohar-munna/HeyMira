from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user
from models.models import db, User, Alert, Report, Conversation, Message, ConnectionRequest
from datetime import datetime

doctor_bp = Blueprint('doctor', __name__)


def doctor_required(f):
    """Decorator to ensure only doctors can access."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'doctor':
            return jsonify({'error': 'Doctor access required'}), 403
        return f(*args, **kwargs)
    return decorated


# ========== Connection Requests ==========

@doctor_bp.route('/api/doctor/available-patients', methods=['GET'])
@login_required
@doctor_required
def get_available_patients():
    """Get all patients (for sending connection requests)."""
    all_patients = User.query.filter_by(role='patient').all()
    result = []
    for p in all_patients:
        # Check if already connected or request pending
        existing = ConnectionRequest.query.filter_by(
            doctor_id=current_user.id, patient_id=p.id
        ).filter(ConnectionRequest.status.in_(['pending', 'accepted'])).first()

        result.append({
            'user': p.to_dict(),
            'connection_status': existing.status if existing else 'none',
            'is_connected': p.assigned_doctor_id == current_user.id
        })
    return jsonify({'patients': result})


@doctor_bp.route('/api/doctor/connect/<int:patient_id>', methods=['POST'])
@login_required
@doctor_required
def send_connection_request(patient_id):
    """Send a connection request to a patient."""
    patient = User.query.get(patient_id)
    if not patient or patient.role != 'patient':
        return jsonify({'error': 'Patient not found'}), 404

    # Check if already connected
    if patient.assigned_doctor_id == current_user.id:
        return jsonify({'error': 'Already connected to this patient'}), 400

    # Check for existing pending request
    existing = ConnectionRequest.query.filter_by(
        doctor_id=current_user.id, patient_id=patient_id, status='pending'
    ).first()
    if existing:
        return jsonify({'error': 'Request already pending'}), 400

    data = request.get_json() or {}
    req = ConnectionRequest(
        doctor_id=current_user.id,
        patient_id=patient_id,
        message=data.get('message', f'Dr. {current_user.username} would like to connect with you for therapy support.')
    )
    db.session.add(req)
    db.session.commit()

    # Push real-time SSE event to patient
    try:
        current_app.push_event(patient_id, 'connection_request', req.to_dict())
    except:
        pass

    return jsonify({'message': 'Connection request sent', 'request': req.to_dict()}), 201


# ========== Patient-side connection endpoints ==========

@doctor_bp.route('/api/patient/connection-requests', methods=['GET'])
@login_required
def get_patient_connection_requests():
    """Get pending connection requests for a patient."""
    requests = ConnectionRequest.query.filter_by(
        patient_id=current_user.id, status='pending'
    ).order_by(ConnectionRequest.created_at.desc()).all()
    return jsonify({'requests': [r.to_dict() for r in requests]})


@doctor_bp.route('/api/patient/connection-requests/<int:request_id>/respond', methods=['POST'])
@login_required
def respond_to_connection(request_id):
    """Accept or reject a connection request."""
    conn_req = ConnectionRequest.query.get(request_id)
    if not conn_req or conn_req.patient_id != current_user.id:
        return jsonify({'error': 'Request not found'}), 404

    data = request.get_json()
    action = data.get('action', '')  # 'accept' or 'reject'

    if action == 'accept':
        conn_req.status = 'accepted'
        conn_req.responded_at = datetime.utcnow()
        # Assign doctor to patient
        current_user.assigned_doctor_id = conn_req.doctor_id
        db.session.commit()

        # Push SSE event to doctor (patient connected)
        try:
            current_app.push_event(conn_req.doctor_id, 'connection_accepted', {
                'patient_id': current_user.id,
                'patient_name': current_user.username
            })
        except:
            pass

        return jsonify({
            'message': f'Connected with Dr. {conn_req.doctor.username}',
            'doctor_name': conn_req.doctor.username
        })
    elif action == 'reject':
        conn_req.status = 'rejected'
        conn_req.responded_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'message': 'Request rejected'})
    else:
        return jsonify({'error': 'Invalid action. Use accept or reject.'}), 400


# ========== Doctor Dashboard ==========

@doctor_bp.route('/api/doctor/patients', methods=['GET'])
@login_required
@doctor_required
def get_patients():
    patients = User.query.filter_by(assigned_doctor_id=current_user.id, role='patient').all()
    patient_list = []
    for p in patients:
        latest_report = Report.query.filter_by(user_id=p.id).order_by(Report.created_at.desc()).first()
        active_convs = Conversation.query.filter_by(user_id=p.id, is_active=True).count()
        total_convs = Conversation.query.filter_by(user_id=p.id).count()
        unread_alerts = Alert.query.filter_by(user_id=p.id, doctor_id=current_user.id, is_read=False).count()

        # Get all reports for trend data
        all_reports = Report.query.filter_by(user_id=p.id).order_by(Report.created_at.asc()).all()

        patient_list.append({
            'user': p.to_dict(),
            'latest_report': latest_report.to_dict() if latest_report else None,
            'active_conversations': active_convs,
            'total_conversations': total_convs,
            'unread_alerts': unread_alerts,
            'report_history': [r.to_dict() for r in all_reports]
        })

    return jsonify({'patients': patient_list})


@doctor_bp.route('/api/doctor/patient/<int:patient_id>/reports', methods=['GET'])
@login_required
@doctor_required
def get_patient_reports(patient_id):
    patient = User.query.get(patient_id)
    if not patient or patient.assigned_doctor_id != current_user.id:
        return jsonify({'error': 'Patient not found'}), 404

    reports = Report.query.filter_by(user_id=patient_id).order_by(Report.created_at.desc()).all()
    return jsonify({
        'patient': patient.to_dict(),
        'reports': [r.to_dict() for r in reports]
    })


@doctor_bp.route('/api/doctor/patient/<int:patient_id>/conversations', methods=['GET'])
@login_required
@doctor_required
def get_patient_conversations(patient_id):
    patient = User.query.get(patient_id)
    if not patient or patient.assigned_doctor_id != current_user.id:
        return jsonify({'error': 'Patient not found'}), 404

    convs = Conversation.query.filter_by(user_id=patient_id).order_by(Conversation.started_at.desc()).all()
    return jsonify({
        'patient': patient.to_dict(),
        'conversations': [c.to_dict() for c in convs]
    })


@doctor_bp.route('/api/doctor/patient/<int:patient_id>/conversation/<int:conv_id>/messages', methods=['GET'])
@login_required
@doctor_required
def get_patient_conversation_messages(patient_id, conv_id):
    """Let doctor view full conversation messages of a connected patient."""
    patient = User.query.get(patient_id)
    if not patient or patient.assigned_doctor_id != current_user.id:
        return jsonify({'error': 'Patient not found'}), 404

    conv = Conversation.query.get(conv_id)
    if not conv or conv.user_id != patient_id:
        return jsonify({'error': 'Conversation not found'}), 404

    messages = [m.to_dict() for m in conv.messages]
    return jsonify({
        'conversation': conv.to_dict(),
        'messages': messages
    })


# ========== Analytics API ==========

@doctor_bp.route('/api/doctor/patient/<int:patient_id>/analytics', methods=['GET'])
@login_required
@doctor_required
def get_patient_analytics(patient_id):
    """Get comprehensive analytics for a patient (graphs data)."""
    patient = User.query.get(patient_id)
    if not patient or patient.assigned_doctor_id != current_user.id:
        return jsonify({'error': 'Patient not found'}), 404

    # All reports (sentiment over time)
    reports = Report.query.filter_by(user_id=patient_id).order_by(Report.created_at.asc()).all()

    # All messages with sentiment scores
    conversations = Conversation.query.filter_by(user_id=patient_id).all()
    all_messages = []
    crisis_count = 0
    total_messages = 0
    sentiment_sum = 0

    risk_distribution = {'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}

    for conv in conversations:
        for msg in conv.messages:
            if msg.role == 'user':
                total_messages += 1
                sentiment_sum += msg.sentiment_score
                all_messages.append({
                    'timestamp': msg.timestamp.isoformat(),
                    'sentiment_score': msg.sentiment_score,
                    'content_preview': msg.content[:50]
                })

        # Count risk levels
        risk_distribution[conv.risk_level] = risk_distribution.get(conv.risk_level, 0) + 1

    # Count crisis alerts
    crisis_count = Alert.query.filter_by(user_id=patient_id, alert_type='crisis').count()

    avg_sentiment = sentiment_sum / total_messages if total_messages > 0 else 0

    # Sentiment timeline from reports
    sentiment_timeline = [{
        'date': r.created_at.isoformat(),
        'score': r.sentiment_score,
        'risk_level': r.risk_level,
        'trend': r.emotional_trend
    } for r in reports]

    # Message-level sentiment timeline (for finer granularity)
    message_sentiments = [{
        'timestamp': m['timestamp'],
        'score': m['sentiment_score']
    } for m in all_messages[-50:]]  # Last 50 messages

    return jsonify({
        'patient': patient.to_dict(),
        'summary': {
            'total_sessions': len(conversations),
            'total_messages': total_messages,
            'average_sentiment': round(avg_sentiment, 3),
            'crisis_alerts': crisis_count,
            'current_risk': reports[-1].risk_level if reports else 'low',
            'current_trend': reports[-1].emotional_trend if reports else 'stable'
        },
        'risk_distribution': risk_distribution,
        'sentiment_timeline': sentiment_timeline,
        'message_sentiments': message_sentiments
    })


# ========== Alerts ==========

@doctor_bp.route('/api/doctor/alerts', methods=['GET'])
@login_required
@doctor_required
def get_alerts():
    alerts = Alert.query.filter_by(doctor_id=current_user.id).order_by(Alert.created_at.desc()).all()
    return jsonify({'alerts': [a.to_dict() for a in alerts]})


@doctor_bp.route('/api/doctor/alerts/unread', methods=['GET'])
@login_required
@doctor_required
def get_unread_alerts():
    alerts = Alert.query.filter_by(doctor_id=current_user.id, is_read=False).order_by(
        Alert.created_at.desc()).all()
    return jsonify({'alerts': [a.to_dict() for a in alerts], 'count': len(alerts)})


@doctor_bp.route('/api/doctor/alerts/<int:alert_id>/read', methods=['POST'])
@login_required
@doctor_required
def mark_alert_read(alert_id):
    alert = Alert.query.get(alert_id)
    if not alert or alert.doctor_id != current_user.id:
        return jsonify({'error': 'Alert not found'}), 404
    alert.is_read = True
    db.session.commit()
    return jsonify({'message': 'Alert marked as read'})
