from flask import Flask, render_template, redirect, url_for, Response, request as flask_request, jsonify
from flask_login import LoginManager, current_user
from flask_cors import CORS
from models.models import init_firebase, User
from config import Config
import os
import json
import time
import threading
from queue import Queue

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# Initialize Firebase
init_firebase(app.config['FIREBASE_CREDENTIALS'])

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'


@login_manager.user_loader
def load_user(user_id):
    """Load user by Firestore document ID (string)."""
    return User.get_by_doc_id(user_id)


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
from routes.profile import profile_bp

app.register_blueprint(auth_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(persona_bp)
app.register_blueprint(profile_bp)


# Page routes
@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.after_request
def add_header(response):
    # Cache static assets aggressively, don't cache API responses
    if flask_request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'public, max-age=3600'
    else:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.route('/')
def landing():
    return render_template('landing.html')


@app.route('/login')
def login_page():
    if current_user.is_authenticated:
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


@app.route('/profile')
def profile_page():
    if not current_user.is_authenticated:
        return redirect(url_for('login_page'))
    return render_template('profile.html')


@app.route('/api/ping')
def ping():
    return jsonify({'status': 'ok'})


# Create upload directory
try:
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

except Exception as e:
    print(f"Warning: Could not initialize upload folder: {e}")


if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)
