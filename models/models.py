"""
HeyMira Models — Firebase Firestore Implementation
Each 'model' is a Python class wrapping Firestore document operations.
"""
import firebase_admin
from firebase_admin import credentials, firestore
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json
import os

# ── Firebase Initialisation ──────────────────────────────────────────────────
_firebase_app = None
_firestore_client = None


def init_firebase(credentials_path: str):
    """Initialise the Firebase Admin SDK (called once from app.py)."""
    global _firebase_app, _firestore_client
    if _firebase_app is not None:
        return _firestore_client

    cred = credentials.Certificate(credentials_path)
    _firebase_app = firebase_admin.initialize_app(cred)
    _firestore_client = firestore.client()
    return _firestore_client


def get_db():
    """Return the Firestore client."""
    global _firestore_client
    if _firestore_client is None:
        raise RuntimeError("Firebase has not been initialised. Call init_firebase() first.")
    return _firestore_client


# ── Helper to convert Firestore timestamps ───────────────────────────────────
def _to_iso(val):
    """Convert a datetime or Firestore Timestamp to ISO‑format string."""
    if val is None:
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)


# ── Auto‑increment counter helper ────────────────────────────────────────────
def _next_id(collection_name: str) -> int:
    """
    Generate a sequential integer ID for a collection.
    Uses a 'counters' document to track the next ID.
    """
    db = get_db()
    counter_ref = db.collection('_counters').document(collection_name)
    
    from google.cloud.firestore_v1 import transaction as fs_transaction
    
    @firestore.transactional
    def _increment(txn, ref):
        snapshot = ref.get(transaction=txn)
        if snapshot.exists:
            current = snapshot.to_dict().get('next_id', 1)
        else:
            current = 1
        txn.set(ref, {'next_id': current + 1})
        return current
    
    txn = db.transaction()
    return _increment(txn, counter_ref)


# ══════════════════════════════════════════════════════════════════════════════
#  USER
# ══════════════════════════════════════════════════════════════════════════════
class User:
    COLLECTION = 'users'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id  # Firestore document ID (string)
        self.id = kwargs.get('id')  # integer ID for compatibility
        self.username = kwargs.get('username', '')
        self.email = kwargs.get('email', '')
        self.password_hash = kwargs.get('password_hash', '')
        self.role = kwargs.get('role', 'patient')
        self.age = kwargs.get('age')
        self.gender = kwargs.get('gender')
        self.profile_image = kwargs.get('profile_image')
        self.assigned_doctor_id = kwargs.get('assigned_doctor_id')
        self.theme = kwargs.get('theme', 'calm-night')
        self.created_at = kwargs.get('created_at', datetime.utcnow())

    # --- Flask‑Login integration ---
    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.doc_id)

    # --- Password helpers ---
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # --- Serialisation ---
    def to_dict(self):
        doctor_name = None
        if self.assigned_doctor_id:
            doc = User.get_by_id(self.assigned_doctor_id)
            doctor_name = doc.username if doc else None
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'age': self.age,
            'gender': self.gender,
            'profile_image': self.profile_image,
            'assigned_doctor_id': self.assigned_doctor_id,
            'assigned_doctor_name': doctor_name,
            'theme': self.theme,
            'created_at': _to_iso(self.created_at),
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'password_hash': self.password_hash,
            'role': self.role,
            'age': self.age,
            'gender': self.gender,
            'profile_image': self.profile_image,
            'assigned_doctor_id': self.assigned_doctor_id,
            'theme': self.theme,
            'created_at': self.created_at,
        }

    # --- CRUD helpers ---
    def save(self):
        db = get_db()
        if self.doc_id is None:
            # New document – generate int ID and let Firestore auto‑generate doc ID
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    def delete(self):
        if self.doc_id:
            get_db().collection(self.COLLECTION).document(self.doc_id).delete()

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        return cls(doc_id=snapshot.id, **data)

    @classmethod
    def get_by_doc_id(cls, doc_id):
        snap = get_db().collection(cls.COLLECTION).document(doc_id).get()
        return cls._from_snapshot(snap) if snap.exists else None

    @classmethod
    def get_by_id(cls, int_id):
        """Look up by integer id field."""
        docs = get_db().collection(cls.COLLECTION).where('id', '==', int(int_id)).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def get_by_username(cls, username):
        docs = get_db().collection(cls.COLLECTION).where('username', '==', username).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def get_by_email(cls, email):
        docs = get_db().collection(cls.COLLECTION).where('email', '==', email).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def query_by(cls, **filters):
        """Return list of User objects matching all filters."""
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]


# ══════════════════════════════════════════════════════════════════════════════
#  PERSONA
# ══════════════════════════════════════════════════════════════════════════════
class Persona:
    COLLECTION = 'personas'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id
        self.id = kwargs.get('id')
        self.user_id = kwargs.get('user_id')
        self.name = kwargs.get('name', '')
        self.personality_traits = kwargs.get('personality_traits', '{}')
        self.speaking_style = kwargs.get('speaking_style', '')
        self.tone = kwargs.get('tone', '')
        self.vocabulary_level = kwargs.get('vocabulary_level', '')
        self.common_phrases = kwargs.get('common_phrases', '[]')
        self.emotional_tone = kwargs.get('emotional_tone', '')
        self.humor_level = kwargs.get('humor_level', '')
        self.supportiveness = kwargs.get('supportiveness', '')
        self.response_length = kwargs.get('response_length', '')
        self.source_filename = kwargs.get('source_filename', '')
        self.profile_image = kwargs.get('profile_image')
        self.raw_text = kwargs.get('raw_text', '')
        self.created_at = kwargs.get('created_at', datetime.utcnow())

    def get_traits(self):
        try:
            return json.loads(self.personality_traits) if isinstance(self.personality_traits, str) else self.personality_traits
        except (json.JSONDecodeError, TypeError):
            return {}

    def get_phrases(self):
        try:
            return json.loads(self.common_phrases) if isinstance(self.common_phrases, str) else self.common_phrases
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
            'profile_image': self.profile_image,
            'created_at': _to_iso(self.created_at),
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'personality_traits': self.personality_traits,
            'speaking_style': self.speaking_style,
            'tone': self.tone,
            'vocabulary_level': self.vocabulary_level,
            'common_phrases': self.common_phrases,
            'emotional_tone': self.emotional_tone,
            'humor_level': self.humor_level,
            'supportiveness': self.supportiveness,
            'response_length': self.response_length,
            'source_filename': self.source_filename,
            'profile_image': self.profile_image,
            'raw_text': self.raw_text,
            'created_at': self.created_at,
        }

    def save(self):
        db = get_db()
        if self.doc_id is None:
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    def delete(self):
        if self.doc_id:
            get_db().collection(self.COLLECTION).document(self.doc_id).delete()

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        return cls(doc_id=snapshot.id, **snapshot.to_dict())

    @classmethod
    def get_by_id(cls, int_id):
        docs = get_db().collection(cls.COLLECTION).where('id', '==', int(int_id)).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def query_by(cls, **filters):
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]

    @classmethod
    def query_by_user_ordered(cls, user_id):
        """Get personas for a user, ordered by created_at descending."""
        docs = cls.query_by(user_id=user_id)
        docs.sort(key=lambda x: x.created_at if x.created_at else datetime.min, reverse=True)
        return docs


# ══════════════════════════════════════════════════════════════════════════════
#  CONVERSATION
# ══════════════════════════════════════════════════════════════════════════════
class Conversation:
    COLLECTION = 'conversations'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id
        self.id = kwargs.get('id')
        self.user_id = kwargs.get('user_id')
        self.persona_id = kwargs.get('persona_id')
        self.title = kwargs.get('title', 'New Conversation')
        self.started_at = kwargs.get('started_at', datetime.utcnow())
        self.ended_at = kwargs.get('ended_at')
        self.summary = kwargs.get('summary', '')
        self.sentiment_score = kwargs.get('sentiment_score', 0.0)
        self.risk_level = kwargs.get('risk_level', 'low')
        self.is_active = kwargs.get('is_active', True)

    def to_dict(self):
        # Get message count
        msgs = Message.query_by(conversation_id=self.id)
        return {
            'id': self.id,
            'user_id': self.user_id,
            'persona_id': self.persona_id,
            'title': self.title,
            'started_at': _to_iso(self.started_at),
            'ended_at': _to_iso(self.ended_at),
            'summary': self.summary,
            'sentiment_score': self.sentiment_score,
            'risk_level': self.risk_level,
            'is_active': self.is_active,
            'message_count': len(msgs),
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'persona_id': self.persona_id,
            'title': self.title,
            'started_at': self.started_at,
            'ended_at': self.ended_at,
            'summary': self.summary,
            'sentiment_score': self.sentiment_score,
            'risk_level': self.risk_level,
            'is_active': self.is_active,
        }

    def save(self):
        db = get_db()
        if self.doc_id is None:
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    def delete(self):
        if self.doc_id:
            get_db().collection(self.COLLECTION).document(self.doc_id).delete()

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        return cls(doc_id=snapshot.id, **snapshot.to_dict())

    @classmethod
    def get_by_id(cls, int_id):
        docs = get_db().collection(cls.COLLECTION).where('id', '==', int(int_id)).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def query_by(cls, **filters):
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]

    @classmethod
    def query_by_user_ordered(cls, user_id):
        docs = cls.query_by(user_id=user_id)
        docs.sort(key=lambda x: x.started_at if x.started_at else datetime.min, reverse=True)
        return docs

    def get_messages(self):
        """Get messages for this conversation, ordered by timestamp."""
        return Message.query_by_conversation_ordered(self.id)


# ══════════════════════════════════════════════════════════════════════════════
#  MESSAGE
# ══════════════════════════════════════════════════════════════════════════════
class Message:
    COLLECTION = 'messages'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id
        self.id = kwargs.get('id')
        self.conversation_id = kwargs.get('conversation_id')
        self.role = kwargs.get('role', 'user')
        self.content = kwargs.get('content', '')
        self.timestamp = kwargs.get('timestamp', datetime.utcnow())
        self.sentiment_score = kwargs.get('sentiment_score', 0.0)
        self.is_voice = kwargs.get('is_voice', False)

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'timestamp': _to_iso(self.timestamp),
            'sentiment_score': self.sentiment_score,
            'is_voice': self.is_voice,
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp,
            'sentiment_score': self.sentiment_score,
            'is_voice': self.is_voice,
        }

    def save(self):
        db = get_db()
        if self.doc_id is None:
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        return cls(doc_id=snapshot.id, **snapshot.to_dict())

    @classmethod
    def query_by(cls, **filters):
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]

    @classmethod
    def query_by_conversation_ordered(cls, conversation_id):
        docs = cls.query_by(conversation_id=conversation_id)
        docs.sort(key=lambda x: x.timestamp if x.timestamp else datetime.min)
        return docs


# ══════════════════════════════════════════════════════════════════════════════
#  REPORT
# ══════════════════════════════════════════════════════════════════════════════
class Report:
    COLLECTION = 'reports'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id
        self.id = kwargs.get('id')
        self.conversation_id = kwargs.get('conversation_id')
        self.user_id = kwargs.get('user_id')
        self.sentiment_score = kwargs.get('sentiment_score', 0.0)
        self.emotional_trend = kwargs.get('emotional_trend', 'stable')
        self.risk_level = kwargs.get('risk_level', 'low')
        self.ai_summary = kwargs.get('ai_summary', '')
        self.created_at = kwargs.get('created_at', datetime.utcnow())

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'user_id': self.user_id,
            'sentiment_score': self.sentiment_score,
            'emotional_trend': self.emotional_trend,
            'risk_level': self.risk_level,
            'ai_summary': self.ai_summary,
            'created_at': _to_iso(self.created_at),
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'user_id': self.user_id,
            'sentiment_score': self.sentiment_score,
            'emotional_trend': self.emotional_trend,
            'risk_level': self.risk_level,
            'ai_summary': self.ai_summary,
            'created_at': self.created_at,
        }

    def save(self):
        db = get_db()
        if self.doc_id is None:
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        return cls(doc_id=snapshot.id, **snapshot.to_dict())

    @classmethod
    def get_by_id(cls, int_id):
        docs = get_db().collection(cls.COLLECTION).where('id', '==', int(int_id)).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def query_by(cls, **filters):
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]

    @classmethod
    def query_by_user_ordered(cls, user_id, ascending=True):
        docs = cls.query_by(user_id=user_id)
        docs.sort(key=lambda x: x.created_at if x.created_at else datetime.min, reverse=not ascending)
        return docs


# ══════════════════════════════════════════════════════════════════════════════
#  ALERT
# ══════════════════════════════════════════════════════════════════════════════
class Alert:
    COLLECTION = 'alerts'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id
        self.id = kwargs.get('id')
        self.user_id = kwargs.get('user_id')
        self.doctor_id = kwargs.get('doctor_id')
        self.alert_type = kwargs.get('alert_type', '')
        self.message = kwargs.get('message', '')
        self.conversation_id = kwargs.get('conversation_id')
        self.is_read = kwargs.get('is_read', False)
        self.created_at = kwargs.get('created_at', datetime.utcnow())

    def to_dict(self):
        # Get patient name
        patient = User.get_by_id(self.user_id) if self.user_id else None
        return {
            'id': self.id,
            'user_id': self.user_id,
            'doctor_id': self.doctor_id,
            'alert_type': self.alert_type,
            'message': self.message,
            'conversation_id': self.conversation_id,
            'is_read': self.is_read,
            'created_at': _to_iso(self.created_at),
            'patient_name': patient.username if patient else None,
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'doctor_id': self.doctor_id,
            'alert_type': self.alert_type,
            'message': self.message,
            'conversation_id': self.conversation_id,
            'is_read': self.is_read,
            'created_at': self.created_at,
        }

    def save(self):
        db = get_db()
        if self.doc_id is None:
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        return cls(doc_id=snapshot.id, **snapshot.to_dict())

    @classmethod
    def get_by_id(cls, int_id):
        docs = get_db().collection(cls.COLLECTION).where('id', '==', int(int_id)).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def query_by(cls, **filters):
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]

    @classmethod
    def query_by_doctor_ordered(cls, doctor_id):
        docs = cls.query_by(doctor_id=doctor_id)
        docs.sort(key=lambda x: x.created_at if x.created_at else datetime.min, reverse=True)
        return docs

    @classmethod
    def count_by(cls, **filters):
        """Count matching documents."""
        return len(cls.query_by(**filters))


# ══════════════════════════════════════════════════════════════════════════════
#  CONNECTION REQUEST
# ══════════════════════════════════════════════════════════════════════════════
class ConnectionRequest:
    COLLECTION = 'connection_requests'

    def __init__(self, doc_id=None, **kwargs):
        self.doc_id = doc_id
        self.id = kwargs.get('id')
        self.doctor_id = kwargs.get('doctor_id')
        self.patient_id = kwargs.get('patient_id')
        self.status = kwargs.get('status', 'pending')
        self.message = kwargs.get('message', '')
        self.created_at = kwargs.get('created_at', datetime.utcnow())
        self.responded_at = kwargs.get('responded_at')

    def to_dict(self):
        doctor = User.get_by_id(self.doctor_id) if self.doctor_id else None
        patient = User.get_by_id(self.patient_id) if self.patient_id else None
        return {
            'id': self.id,
            'doctor_id': self.doctor_id,
            'patient_id': self.patient_id,
            'doctor_name': doctor.username if doctor else None,
            'patient_name': patient.username if patient else None,
            'status': self.status,
            'message': self.message,
            'created_at': _to_iso(self.created_at),
            'responded_at': _to_iso(self.responded_at),
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'doctor_id': self.doctor_id,
            'patient_id': self.patient_id,
            'status': self.status,
            'message': self.message,
            'created_at': self.created_at,
            'responded_at': self.responded_at,
        }

    def save(self):
        db = get_db()
        if self.doc_id is None:
            if self.id is None:
                self.id = _next_id(self.COLLECTION)
            doc_ref = db.collection(self.COLLECTION).document()
            self.doc_id = doc_ref.id
            doc_ref.set(self._to_firestore())
        else:
            db.collection(self.COLLECTION).document(self.doc_id).set(self._to_firestore())

    @classmethod
    def _from_snapshot(cls, snapshot):
        if not snapshot.exists:
            return None
        return cls(doc_id=snapshot.id, **snapshot.to_dict())

    @classmethod
    def get_by_id(cls, int_id):
        docs = get_db().collection(cls.COLLECTION).where('id', '==', int(int_id)).limit(1).stream()
        for doc in docs:
            return cls._from_snapshot(doc)
        return None

    @classmethod
    def query_by(cls, **filters):
        ref = get_db().collection(cls.COLLECTION)
        for key, val in filters.items():
            ref = ref.where(key, '==', val)
        return [cls._from_snapshot(doc) for doc in ref.stream()]
