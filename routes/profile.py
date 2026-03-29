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
                import base64
                img_data = file.read()
                if len(img_data) < 700 * 1024: # Keep under ~700kb
                    ext = file.filename.rsplit('.', 1)[-1].lower()
                    mime_type = f"image/{ext}" if ext in ['png', 'jpg', 'jpeg', 'gif', 'webp'] else 'image/jpeg'
                    base64_str = base64.b64encode(img_data).decode('utf-8')
                    current_user.profile_image = f"data:{mime_type};base64,{base64_str}"
                else:
                    return jsonify({'error': 'Image too large. Please upload an image smaller than 700KB'}), 400
            else:
                return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, gif, webp'}), 400

    current_user.save()
    
    return jsonify({
        'message': 'Profile updated successfully',
        'user': current_user.to_dict()
    }), 200
