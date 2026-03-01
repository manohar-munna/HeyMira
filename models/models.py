from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='patient')  # patient or doctor
    assigned_doctor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    theme = db.Column(db.String(30), default='calm-night')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    assigned_doctor = db.relationship('User', remote_side=[id], backref='patients')
    personas = db.relationship('Persona', backref='user', lazy=True, cascade='all, delete-orphan')
    conversations = db.relationship('Conversation', backref='user', lazy=True, cascade='all, delete-orphan')
    reports = db.relationship('Report', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        doctor_name = None
        if self.assigned_doctor_id:
            doc = User.query.get(self.assigned_doctor_id)
            doctor_name = doc.username if doc else None
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'assigned_doctor_id': self.assigned_doctor_id,
            'assigned_doctor_name': doctor_name,
            'theme': self.theme,
            'created_at': self.created_at.isoformat()
        }


class Persona(db.Model):
    __tablename__ = 'personas'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    personality_traits = db.Column(db.Text, default='{}')  # JSON string
    speaking_style = db.Column(db.Text, default='')
    tone = db.Column(db.String(100), default='')
    vocabulary_level = db.Column(db.String(50), default='')
    common_phrases = db.Column(db.Text, default='[]')  # JSON array
    emotional_tone = db.Column(db.String(100), default='')
    humor_level = db.Column(db.String(50), default='')
    supportiveness = db.Column(db.String(50), default='')
    response_length = db.Column(db.String(50), default='')
    source_filename = db.Column(db.String(255), default='')
    raw_text = db.Column(db.Text, default='')  # Store raw extracted text for richer AI context
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    conversations = db.relationship('Conversation', backref='persona', lazy=True)

    def get_traits(self):
        try:
            return json.loads(self.personality_traits)
        except (json.JSONDecodeError, TypeError):
            return {}

    def get_phrases(self):
        try:
            return json.loads(self.common_phrases)
        except (json.JSONDecodeError, TypeError):
            return []

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'personality_traits': self.get_traits(),
            'speaking_style': self.speaking_style,
            'tone': self.tone,
            'vocabulary_level': self.vocabulary_level,
            'common_phrases': self.get_phrases(),
            'emotional_tone': self.emotional_tone,
            'humor_level': self.humor_level,
            'supportiveness': self.supportiveness,
            'response_length': self.response_length,
            'source_filename': self.source_filename,
            'created_at': self.created_at.isoformat()
        }


class Conversation(db.Model):
    __tablename__ = 'conversations'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    persona_id = db.Column(db.Integer, db.ForeignKey('personas.id'), nullable=True)
    title = db.Column(db.String(200), default='New Conversation')
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)
    summary = db.Column(db.Text, default='')
    sentiment_score = db.Column(db.Float, default=0.0)
    risk_level = db.Column(db.String(20), default='low')  # low, moderate, high, critical
    is_active = db.Column(db.Boolean, default=True)

    messages = db.relationship('Message', backref='conversation', lazy=True, cascade='all, delete-orphan',
                               order_by='Message.timestamp')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'persona_id': self.persona_id,
            'title': self.title,
            'started_at': self.started_at.isoformat(),
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'summary': self.summary,
            'sentiment_score': self.sentiment_score,
            'risk_level': self.risk_level,
            'is_active': self.is_active,
            'message_count': len(self.messages)
        }


class Message(db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id'), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # user or ai
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    sentiment_score = db.Column(db.Float, default=0.0)
    is_voice = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.isoformat(),
            'sentiment_score': self.sentiment_score,
            'is_voice': self.is_voice
        }


class Report(db.Model):
    __tablename__ = 'reports'
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    sentiment_score = db.Column(db.Float, default=0.0)
    emotional_trend = db.Column(db.String(50), default='stable')  # improving, declining, stable
    risk_level = db.Column(db.String(20), default='low')
    ai_summary = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    conversation = db.relationship('Conversation', backref='report')

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'user_id': self.user_id,
            'sentiment_score': self.sentiment_score,
            'emotional_trend': self.emotional_trend,
            'risk_level': self.risk_level,
            'ai_summary': self.ai_summary,
            'created_at': self.created_at.isoformat()
        }


class Alert(db.Model):
    __tablename__ = 'alerts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    alert_type = db.Column(db.String(50), nullable=False)  # crisis, high_risk, check_in
    message = db.Column(db.Text, nullable=False)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id'), nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    patient = db.relationship('User', foreign_keys=[user_id], backref='patient_alerts')
    doctor = db.relationship('User', foreign_keys=[doctor_id], backref='doctor_alerts')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'doctor_id': self.doctor_id,
            'alert_type': self.alert_type,
            'message': self.message,
            'conversation_id': self.conversation_id,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat(),
            'patient_name': self.patient.username if self.patient else None
        }


class ConnectionRequest(db.Model):
    __tablename__ = 'connection_requests'
    id = db.Column(db.Integer, primary_key=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, accepted, rejected
    message = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    responded_at = db.Column(db.DateTime, nullable=True)

    doctor = db.relationship('User', foreign_keys=[doctor_id], backref='sent_requests')
    patient = db.relationship('User', foreign_keys=[patient_id], backref='received_requests')

    def to_dict(self):
        return {
            'id': self.id,
            'doctor_id': self.doctor_id,
            'patient_id': self.patient_id,
            'doctor_name': self.doctor.username if self.doctor else None,
            'patient_name': self.patient.username if self.patient else None,
            'status': self.status,
            'message': self.message,
            'created_at': self.created_at.isoformat(),
            'responded_at': self.responded_at.isoformat() if self.responded_at else None
        }
