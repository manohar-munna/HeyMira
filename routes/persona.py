from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models.models import Persona
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

    # Find participants
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
            import base64
            img_data = img_file.read()
            # Basic validation to avoid huge files (keep under ~700kb to stay within Firestore 1MB limit)
            if len(img_data) < 700 * 1024:
                ext = img_file.filename.rsplit('.', 1)[-1].lower()
                mime_type = f"image/{ext}" if ext in ['png', 'jpg', 'jpeg', 'gif', 'webp'] else 'image/jpeg'
                base64_str = base64.b64encode(img_data).decode('utf-8')
                profile_image_url = f"data:{mime_type};base64,{base64_str}"
            else:
                print("Warning: Image too large, skipping base64 encoding to avoid Firestore limits.")

    # Save persona to Firestore
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
        past_events=json.dumps(profile.get('past_events', [])),
        raw_text=person_text_with_dates[:10000]
    )
    persona.save()

    return jsonify({
        'message': 'Persona created successfully',
        'persona': persona.to_dict()
    }), 201


@persona_bp.route('/api/persona/list', methods=['GET'])
@login_required
def list_personas():
    personas = Persona.query_by_user_ordered(current_user.id)
    return jsonify({'personas': [p.to_dict() for p in personas]})


@persona_bp.route('/api/persona/<int:persona_id>', methods=['GET'])
@login_required
def get_persona(persona_id):
    persona = Persona.get_by_id(persona_id)
    if not persona or persona.user_id != current_user.id:
        return jsonify({'error': 'Persona not found'}), 404
    return jsonify({'persona': persona.to_dict()})


@persona_bp.route('/api/persona/<int:persona_id>', methods=['DELETE'])
@login_required
def delete_persona(persona_id):
    persona = Persona.get_by_id(persona_id)
    if not persona or persona.user_id != current_user.id:
        return jsonify({'error': 'Persona not found'}), 404
    persona.delete()
    return jsonify({'message': 'Persona deleted'})
