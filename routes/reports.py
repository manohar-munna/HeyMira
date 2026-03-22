from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from models.models import Report, User

reports_bp = Blueprint('reports', __name__)


@reports_bp.route('/api/reports/<int:user_id>', methods=['GET'])
@login_required
def get_reports(user_id):
    # Patients can see their own, doctors can see their patients'
    if current_user.role == 'patient' and current_user.id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    if current_user.role == 'doctor':
        patient = User.get_by_id(user_id)
        if not patient or patient.assigned_doctor_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403

    reports = Report.query_by_user_ordered(user_id, ascending=False)
    return jsonify({'reports': [r.to_dict() for r in reports]})


@reports_bp.route('/api/reports/latest/<int:user_id>', methods=['GET'])
@login_required
def get_latest_report(user_id):
    if current_user.role == 'patient' and current_user.id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    reports = Report.query_by_user_ordered(user_id, ascending=False)
    report = reports[0] if reports else None
    if not report:
        return jsonify({'report': None})
    return jsonify({'report': report.to_dict()})
