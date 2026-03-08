from flask import Flask, render_template, redirect, url_for, Response, request as flask_request, jsonify
from flask_login import LoginManager, current_user
from flask_cors import CORS
from models.models import db, User
from config import Config
import os
import json
import time
import threading
from queue import Queue

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# Initialize extensions
db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    from flask import request
    if request.path.startswith('/api/'):
        from flask import jsonify
        return jsonify({'error': 'Authentication required'}), 401
    return redirect(url_for('login_page'))


# Register blueprints
from routes.auth import auth_bp
from routes.chat import chat_bp
from routes.persona import persona_bp
from routes.reports import reports_bp
from routes.doctor import doctor_bp

app.register_blueprint(auth_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(persona_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(doctor_bp)


# Page routes
@app.route('/favicon.ico')
def favicon():
    # Return a 204 No Content response for favicon to prevent 500 errors on Vercel
    return '', 204

@app.route('/')
def landing():
    if current_user.is_authenticated:
        if current_user.role == 'doctor':
            return redirect(url_for('doctor_dashboard'))
        return redirect(url_for('chat_page'))
    return render_template('landing.html')


@app.route('/login')
def login_page():
    if current_user.is_authenticated:
        if current_user.role == 'doctor':
            return redirect(url_for('doctor_dashboard'))
        return redirect(url_for('chat_page'))
    return render_template('login.html')


@app.route('/register')
def register_page():
    if current_user.is_authenticated:
        return redirect(url_for('chat_page'))
    return render_template('register.html')


@app.route('/chat')
def chat_page():
    if not current_user.is_authenticated:
        return redirect(url_for('login_page'))
    return render_template('chat.html')


@app.route('/upload')
def upload_page():
    if not current_user.is_authenticated:
        return redirect(url_for('login_page'))
    return render_template('upload.html')


@app.route('/dashboard')
def doctor_dashboard():
    if not current_user.is_authenticated:
        return redirect(url_for('login_page'))
    if current_user.role != 'doctor':
        return redirect(url_for('chat_page'))
    return render_template('doctor_dashboard.html')


# Create tables and upload directory
with app.app_context():
    try:
        db.create_all()
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    except Exception as e:
        print(f"Warning: Could not initialize DB or upload folder (expected on Vercel): {e}")


# ========== Server-Sent Events (SSE) ==========
# Simple in-memory event system for real-time updates
user_event_queues = {}  # user_id -> list of Queue objects
event_lock = threading.Lock()

def push_event(user_id, event_type, data):
    """Push an event to all SSE connections for a user."""
    with event_lock:
        queues = user_event_queues.get(user_id, [])
        for q in queues:
            try:
                q.put_nowait({'type': event_type, 'data': data})
            except:
                pass

# Make push_event available to routes
app.push_event = push_event

@app.route('/api/events/stream')
def event_stream():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401

    user_id = current_user.id
    q = Queue(maxsize=50)

    with event_lock:
        if user_id not in user_event_queues:
            user_event_queues[user_id] = []
        user_event_queues[user_id].append(q)

    def generate():
        try:
            while True:
                try:
                    event = q.get(timeout=30)
                    yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"
                except:
                    # Send keepalive
                    yield f": keepalive\n\n"
        finally:
            with event_lock:
                if user_id in user_event_queues:
                    user_event_queues[user_id].remove(q)
                    if not user_event_queues[user_id]:
                        del user_event_queues[user_id]

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)

