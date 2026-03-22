import os
from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from models.models import User

profile_bp = Blueprint('profile', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@profile_bp.route('/profile')
@login_required
def profile_page():
    return render_template('profile.html')

@profile_bp.route('/api/profile/update', methods=['POST'])
@login_required
def update_profile():
    # Update text fields
    username = request.form.get('username')
    age = request.form.get('age')
    gender = request.form.get('gender')
    
    if username:
        # Check if username exists and is not the current user
        existing_user = User.get_by_username(username)
        if existing_user and existing_user.id != current_user.id:
            return jsonify({'error': 'Username already taken'}), 400
        current_user.username = username
        
    if age:
        try:
            current_user.age = int(age)
        except ValueError:
            return jsonify({'error': 'Age must be a number'}), 400
            
    if gender:
        current_user.gender = gender

    # Handle profile image upload
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and file.filename != '':
            if allowed_file(file.filename):
                filename = secure_filename(file.filename)
                # Generate a unique filename using user ID to prevent overwrites
                unique_filename = f"user_{current_user.id}_{filename}"
                
                # Ensure profile uploads directory exists
                profile_uploads_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'profiles')
                os.makedirs(profile_uploads_dir, exist_ok=True)
                
                filepath = os.path.join(profile_uploads_dir, unique_filename)
                file.save(filepath)
                
                # Save the relative URL
                current_user.profile_image = f"/static/uploads/profiles/{unique_filename}"
            else:
                return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, gif, webp'}), 400

    current_user.save()
    
    return jsonify({
        'message': 'Profile updated successfully',
        'user': current_user.to_dict()
    }), 200
