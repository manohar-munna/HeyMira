from flask import Blueprint, request, jsonify, redirect, url_for
from flask_login import login_user, logout_user, login_required, current_user
from models.models import db, User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'patient')

    if not username or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    if role not in ('patient', 'doctor'):
        return jsonify({'error': 'Invalid role'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 400

    user = User(username=username, email=email, role=role)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    login_user(user)
    return jsonify({'message': 'Registration successful', 'user': user.to_dict()}), 201


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid username or password'}), 401

    login_user(user, remember=True)
    return jsonify({'message': 'Login successful', 'user': user.to_dict()})


@auth_bp.route('/api/auth/me', methods=['GET'])
@login_required
def me():
    return jsonify({'user': current_user.to_dict()})


@auth_bp.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logged out successfully'})


@auth_bp.route('/api/auth/update-theme', methods=['POST'])
@login_required
def update_theme():
    data = request.get_json()
    theme = data.get('theme', 'calm-night')
    valid_themes = ['calm-night', 'warm-sunset', 'ocean-breeze', 'blossom', 'forest', 'cloudy']
    if theme not in valid_themes:
        return jsonify({'error': 'Invalid theme'}), 400
    current_user.theme = theme
    db.session.commit()
    return jsonify({'message': 'Theme updated', 'theme': theme})
