from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models.models import db, Persona
from services.persona_service import extract_text_from_pdf, clean_whatsapp_export, extract_person_messages, extract_chat_participants, extract_person_messages_with_dates
from services.ai_service import analyze_persona_from_text, generate_chat_summary
from werkzeug.utils import secure_filename
from flask import current_app
import os
import io
import json

persona_bp = Blueprint('persona', __name__)

@persona_bp.route('/api/persona/analyze_chat', methods=['POST'])
@login_required
def analyze_chat():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']

    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400

    # Extract text from PDF
    text = extract_text_from_pdf(file)
    if not text:
        return jsonify({'error': 'Could not extract text from PDF'}), 400

    # Find participants (before cleaning, as cleaning removes dates that help identifying message boundaries, but our regex works on raw text)
    participants = extract_chat_participants(text)
    
    # Generate summary
    summary = generate_chat_summary(text)

    return jsonify({
        'participants': participants,
        'summary': summary
    }), 200

@persona_bp.route('/api/persona/upload', methods=['POST'])
@login_required
def upload_persona():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    person_name = request.form.get('person_name', '').strip()

    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400

    if not person_name:
        return jsonify({'error': 'Person name is required'}), 400

    # Extract text from PDF
    text = extract_text_from_pdf(file)
    if not text:
        return jsonify({'error': 'Could not extract text from PDF'}), 400

    # Get the raw text with dates for chatting context
    person_text_with_dates = extract_person_messages_with_dates(text, person_name)

    # Clean WhatsApp export format for analysis
    cleaned_text = clean_whatsapp_export(text)

    # Try to extract specific person's messages for analysis (without dates)
    person_text = extract_person_messages(cleaned_text, person_name)

    # Analyze personality using AI
    profile = analyze_persona_from_text(person_text, person_name)

    # Handle optional persona image
    profile_image_url = None
    if 'persona_image' in request.files:
        img_file = request.files['persona_image']
        if img_file and img_file.filename != '':
            filename = secure_filename(img_file.filename)
            unique_filename = f"persona_{current_user.id}_{filename}"
            
            persona_uploads_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'personas')
            os.makedirs(persona_uploads_dir, exist_ok=True)
            
            filepath = os.path.join(persona_uploads_dir, unique_filename)
            img_file.save(filepath)
            profile_image_url = f"/static/uploads/personas/{unique_filename}"

    # Save persona to database
    persona = Persona(
        user_id=current_user.id,
        name=profile.get('name', person_name),
        personality_traits=json.dumps(profile.get('personality_traits', {})),
        speaking_style=profile.get('speaking_style', ''),
        tone=profile.get('tone', ''),
        vocabulary_level=profile.get('vocabulary_level', ''),
        common_phrases=json.dumps(profile.get('common_phrases', [])),
        emotional_tone=profile.get('emotional_tone', ''),
        humor_level=profile.get('humor_level', ''),
        supportiveness=profile.get('supportiveness', ''),
        response_length=profile.get('response_length', ''),
        source_filename=file.filename,
        profile_image=profile_image_url,
        raw_text=person_text_with_dates[:10000]  # Store up to 10k chars with dates for richer AI context
    )
    db.session.add(persona)
    db.session.commit()

    return jsonify({
        'message': 'Persona created successfully',
        'persona': persona.to_dict()
    }), 201


@persona_bp.route('/api/persona/list', methods=['GET'])
@login_required
def list_personas():
    personas = Persona.query.filter_by(user_id=current_user.id).order_by(Persona.created_at.desc()).all()
    return jsonify({'personas': [p.to_dict() for p in personas]})


@persona_bp.route('/api/persona/<int:persona_id>', methods=['GET'])
@login_required
def get_persona(persona_id):
    persona = Persona.query.get(persona_id)
    if not persona or persona.user_id != current_user.id:
        return jsonify({'error': 'Persona not found'}), 404
    return jsonify({'persona': persona.to_dict()})


@persona_bp.route('/api/persona/<int:persona_id>', methods=['DELETE'])
@login_required
def delete_persona(persona_id):
    persona = Persona.query.get(persona_id)
    if not persona or persona.user_id != current_user.id:
        return jsonify({'error': 'Persona not found'}), 404
    db.session.delete(persona)
    db.session.commit()
    return jsonify({'message': 'Persona deleted'})

@persona_bp.route('/api/persona/<int:persona_id>/photo', methods=['POST'])
@login_required
def update_persona_photo(persona_id):
    persona = Persona.query.get(persona_id)
    if not persona or persona.user_id != current_user.id:
        return jsonify({'error': 'Persona not found'}), 404
        
    if 'persona_image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
        
    img_file = request.files['persona_image']
    if img_file and img_file.filename != '':
        filename = secure_filename(img_file.filename)
        unique_filename = f"persona_{current_user.id}_{persona.id}_{filename}"
        
        persona_uploads_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'personas')
        os.makedirs(persona_uploads_dir, exist_ok=True)
        
        filepath = os.path.join(persona_uploads_dir, unique_filename)
        img_file.save(filepath)
        persona.profile_image = f"/static/uploads/personas/{unique_filename}"
        db.session.commit()
        
        return jsonify({'message': 'Photo updated successfully', 'profile_image': persona.profile_image})
        
    return jsonify({'error': 'Invalid file'}), 400
