from flask import Flask, render_template, redirect, url_for
from flask_login import LoginManager, current_user
from flask_cors import CORS
from models.models import db, User
from config import Config
import os

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
    db.create_all()
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
