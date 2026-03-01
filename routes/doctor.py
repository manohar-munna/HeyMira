from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from models.models import db, User, Alert, Report, Conversation

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

        patient_list.append({
            'user': p.to_dict(),
            'latest_report': latest_report.to_dict() if latest_report else None,
            'active_conversations': active_convs,
            'total_conversations': total_convs,
            'unread_alerts': unread_alerts
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
