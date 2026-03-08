from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models.models import db, Persona
from services.persona_service import extract_text_from_pdf, clean_whatsapp_export, extract_person_messages
from services.ai_service import analyze_persona_from_text
from werkzeug.utils import secure_filename
from flask import current_app
import os
import io
import json
import base64

persona_bp = Blueprint('persona', __name__)


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

    try:
        # Extract text from PDF
        text = extract_text_from_pdf(file)
        if not text:
            return jsonify({'error': 'Could not extract text from PDF'}), 400

        # Clean WhatsApp export format
        cleaned_text = clean_whatsapp_export(text)

        # Try to extract specific person's messages
        person_text = extract_person_messages(cleaned_text, person_name)

        # Analyze personality using AI
        profile = analyze_persona_from_text(person_text, person_name)

        # Handle optional persona image (Convert to Base64 for Vercel read-only filesystem support)
        profile_image_url = None
        if 'persona_image' in request.files:
            img_file = request.files['persona_image']
            if img_file and img_file.filename != '':
                image_bytes = img_file.read()
                base64_encoded = base64.b64encode(image_bytes).decode('utf-8')
                mime_type = img_file.mimetype if img_file.mimetype else 'image/jpeg'
                profile_image_url = f"data:{mime_type};base64,{base64_encoded}"

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
            raw_text=person_text[:10000]  # Store up to 10k chars for richer AI context
        )
        db.session.add(persona)
        db.session.commit()

        return jsonify({
            'message': 'Persona created successfully',
            'persona': persona.to_dict()
        }), 201
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Vercel Upload Error: {error_trace}")
        return jsonify({'error': f"Server crashed: {str(e)}", 'trace': error_trace}), 500


@persona_bp.route('/api/persona/list', methods=['GET'])
@login_required
def list_personas():
    try:
        personas = Persona.query.filter_by(user_id=current_user.id).order_by(Persona.created_at.desc()).all()
        return jsonify({'personas': [p.to_dict() for p in personas]})
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Vercel List Error: {error_trace}")
        return jsonify({'error': f"Server crashed: {str(e)}", 'trace': error_trace}), 500


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
