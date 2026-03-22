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


def init_firebase(credentials_data: str):
    """Initialise the Firebase Admin SDK (called once from app.py).
    Accepts either a file path to the JSON key or the raw JSON string itself (for Vercel)."""
    global _firebase_app, _firestore_client
    if _firebase_app is not None:
        return _firestore_client

    import json
    
    # If the setup string looks like a JSON object, parse it directly
    if credentials_data.strip().startswith('{'):
        try:
            cred_dict = json.loads(credentials_data)
            cred = credentials.Certificate(cred_dict)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse Firebase JSON from environment variable: {e}")
    else:
        # Otherwise, treat it as a path to a file
        if not os.path.exists(credentials_data):
            raise FileNotFoundError(f"Firebase credentials file not found at: {credentials_data}")
        cred = credentials.Certificate(credentials_data)

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
        self.age = kwargs.get('age')
        self.gender = kwargs.get('gender')
        self.profile_image = kwargs.get('profile_image')
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
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'age': self.age,
            'gender': self.gender,
            'profile_image': self.profile_image,
            'theme': self.theme,
            'created_at': _to_iso(self.created_at),
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'password_hash': self.password_hash,
            'age': self.age,
            'gender': self.gender,
            'profile_image': self.profile_image,
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
        self.past_events = kwargs.get('past_events', '[]')
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

    def get_past_events(self):
        try:
            return json.loads(self.past_events) if isinstance(self.past_events, str) else self.past_events
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
            'past_events': self.get_past_events(),
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
            'past_events': self.past_events,
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
        self.is_voice = kwargs.get('is_voice', False)

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'timestamp': _to_iso(self.timestamp),
            'is_voice': self.is_voice,
        }

    def _to_firestore(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp,
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



