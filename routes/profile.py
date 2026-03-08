from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from models.models import db, User
from werkzeug.utils import secure_filename
import os
import uuid

profile_bp = Blueprint('profile', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@profile_bp.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    return jsonify({'user': current_user.to_dict()})

@profile_bp.route('/api/profile/update', methods=['POST'])
@login_required
def update_profile():
    """
    Handles updating text fields (name, age, gender) and an optional image.
    Uses multipart/form-data.
    """
    username = request.form.get('username')
    age = request.form.get('age')
    gender = request.form.get('gender')
    
    # Update text fields
    if username is not None:
        # Check if username exists and is not the current user
        existing = User.query.filter_by(username=username).first()
        if existing and existing.id != current_user.id:
            return jsonify({'error': 'Username already taken'}), 400
        current_user.username = username.strip()
        
    if age is not None:
        try:
            current_user.age = int(age) if age.strip() else None
        except ValueError:
            return jsonify({'error': 'Age must be a number'}), 400
            
    if gender is not None:
        current_user.gender = gender.strip()

    # Handle optional image upload
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and file.filename != '' and allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = secure_filename(f"user_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}")
            
            upload_folder = current_app.config.get('UPLOAD_FOLDER', 'static/uploads')
            os.makedirs(upload_folder, exist_ok=True)
            
            filepath = os.path.join(upload_folder, filename)
            file.save(filepath)
            
            # Optionally delete old image if you want to save space
            if current_user.profile_image:
                old_filepath = os.path.join(upload_folder, current_user.profile_image)
                if os.path.exists(old_filepath):
                    try:
                        os.remove(old_filepath)
                    except:
                        pass
                        
            current_user.profile_image = filename

    db.session.commit()
    return jsonify({
        'message': 'Profile updated successfully',
        'user': current_user.to_dict()
    })
