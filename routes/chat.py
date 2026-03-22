from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models.models import db, Conversation, Message, Persona, Alert
from services.ai_service import generate_ai_response
from services.sentiment_service import analyze_sentiment, detect_crisis, get_risk_level
from services.report_service import generate_session_report
from models.models import Report
from datetime import datetime

chat_bp = Blueprint('chat', __name__)


@chat_bp.route('/api/chat/new', methods=['POST'])
@login_required
def new_conversation():
    data = request.get_json() or {}
    persona_id = data.get('persona_id')

    conv = Conversation(
        user_id=current_user.id,
        persona_id=persona_id,
        title='New Conversation'
    )
    db.session.add(conv)
    db.session.commit()
    return jsonify({'conversation': conv.to_dict()}), 201


@chat_bp.route('/api/chat/send', methods=['POST'])
@login_required
def send_message():
    data = request.get_json()
    conversation_id = data.get('conversation_id')
    content = data.get('content', '').strip()
    is_voice = data.get('is_voice', False)
    language = data.get('language', 'English')

    if not conversation_id or not content:
        return jsonify({'error': 'conversation_id and content are required'}), 400

    conv = Conversation.query.get(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Analyze sentiment of user message
    sentiment = analyze_sentiment(content)
    has_crisis = detect_crisis(content)
    risk = get_risk_level(sentiment.get('score', 0), has_crisis)

    # Save user message
    user_msg = Message(
        conversation_id=conv.id,
        role='user',
        content=content,
        sentiment_score=sentiment.get('score', 0),
        is_voice=is_voice
    )
    db.session.add(user_msg)

    # Get conversation history
    history = [{'role': m.role, 'content': m.content} for m in conv.messages]

    # Get persona if assigned
    persona = Persona.query.get(conv.persona_id) if conv.persona_id else None

    # Generate AI response
    ai_text = generate_ai_response(persona, history, content, language)

    # Save AI message
    ai_msg = Message(
        conversation_id=conv.id,
        role='ai',
        content=ai_text,
        is_voice=is_voice
    )
    db.session.add(ai_msg)

    # Update conversation title from first message
    if len(conv.messages) <= 1:
        conv.title = content[:80] + ('...' if len(content) > 80 else '')

    # Update conversation risk level
    conv.sentiment_score = sentiment.get('score', 0)
    conv.risk_level = risk

    # Handle crisis detection
    alert_triggered = False
    if has_crisis or risk == 'critical':
        alert_triggered = True
        if current_user.assigned_doctor_id:
            alert = Alert(
                user_id=current_user.id,
                doctor_id=current_user.assigned_doctor_id,
                alert_type='crisis',
                message=f'CRISIS DETECTED: Patient {current_user.username} expressed concerning thoughts. Message: "{content[:200]}"',
                conversation_id=conv.id
            )
            db.session.add(alert)
            conv.risk_level = 'critical'

    db.session.commit()

    return jsonify({
        'user_message': user_msg.to_dict(),
        'ai_message': ai_msg.to_dict(),
        'sentiment': sentiment,
        'risk_level': risk,
        'alert_triggered': alert_triggered
    })


@chat_bp.route('/api/chat/history/<int:conversation_id>', methods=['GET'])
@login_required
def get_history(conversation_id):
    conv = Conversation.query.get(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    messages = [m.to_dict() for m in conv.messages]
    return jsonify({'conversation': conv.to_dict(), 'messages': messages})


@chat_bp.route('/api/chat/conversations', methods=['GET'])
@login_required
def list_conversations():
    convs = Conversation.query.filter_by(user_id=current_user.id).order_by(
        Conversation.started_at.desc()).all()
    return jsonify({'conversations': [c.to_dict() for c in convs]})


@chat_bp.route('/api/chat/<int:conversation_id>', methods=['DELETE'])
@login_required
def delete_conversation(conversation_id):
    conv = Conversation.query.get(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    db.session.delete(conv)
    db.session.commit()
    return jsonify({'message': 'Conversation deleted'})

@chat_bp.route('/api/chat/end/<int:conversation_id>', methods=['POST'])
@login_required
def end_conversation(conversation_id):
    conv = Conversation.query.get(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    conv.is_active = False
    conv.ended_at = datetime.utcnow()

    # Generate session report
    messages = [m.to_dict() for m in conv.messages]
    report_data = generate_session_report(messages)

    report = Report(
        conversation_id=conv.id,
        user_id=current_user.id,
        sentiment_score=report_data.get('sentiment_score', 0),
        emotional_trend=report_data.get('emotional_trend', 'stable'),
        risk_level=report_data.get('risk_level', 'low'),
        ai_summary=report_data.get('ai_summary', '')
    )
    db.session.add(report)

    conv.summary = report_data.get('ai_summary', '')
    conv.sentiment_score = report_data.get('sentiment_score', 0)
    conv.risk_level = report_data.get('risk_level', 'low')

    db.session.commit()

    return jsonify({
        'message': 'Conversation ended',
        'report': report.to_dict()
    })
