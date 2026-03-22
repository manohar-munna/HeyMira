from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models.models import Conversation, Message, Persona, User
from services.ai_service import generate_ai_response
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
        title='New Chat'
    )
    conv.save()
    return jsonify({'conversation': conv.to_dict()}), 201


@chat_bp.route('/api/chat/send', methods=['POST'])
@login_required
def send_message():
    data = request.get_json()
    conversation_id = data.get('conversation_id')
    content = data.get('content', '').strip()
    is_voice = data.get('is_voice', False)

    if not conversation_id or not content:
        return jsonify({'error': 'conversation_id and content are required'}), 400

    conv = Conversation.get_by_id(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Save user message (Removed Sentiment & Risk scoring)
    user_msg = Message(
        conversation_id=conv.id,
        role='user',
        content=content,
        is_voice=is_voice
    )
    user_msg.save()

    # Get conversation history
    messages = conv.get_messages()
    history = [{'role': m.role, 'content': m.content} for m in messages]

    # Get persona if assigned
    persona = Persona.get_by_id(conv.persona_id) if conv.persona_id else None

    # Generate AI response
    ai_text = generate_ai_response(persona, history, content)

    # Save AI message
    ai_msg = Message(
        conversation_id=conv.id,
        role='ai',
        content=ai_text,
        is_voice=is_voice
    )
    ai_msg.save()

    # Update conversation title from first message
    existing_msgs = conv.get_messages()
    if len(existing_msgs) <= 2:  # Just the user msg + ai msg we added
        conv.title = content[:80] + ('...' if len(content) > 80 else '')
        conv.save()

    return jsonify({
        'user_message': user_msg.to_dict(),
        'ai_message': ai_msg.to_dict(),
        'alert_triggered': False
    })


@chat_bp.route('/api/chat/history/<int:conversation_id>', methods=['GET'])
@login_required
def get_history(conversation_id):
    conv = Conversation.get_by_id(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    messages = [m.to_dict() for m in conv.get_messages()]
    return jsonify({'conversation': conv.to_dict(), 'messages': messages})


@chat_bp.route('/api/chat/conversations', methods=['GET'])
@login_required
def list_conversations():
    convs = Conversation.query_by_user_ordered(current_user.id)
    return jsonify({'conversations': [c.to_dict() for c in convs]})


@chat_bp.route('/api/chat/end/<int:conversation_id>', methods=['POST'])
@login_required
def end_conversation(conversation_id):
    conv = Conversation.get_by_id(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    conv.is_active = False
    conv.ended_at = datetime.utcnow()
    conv.save()

    return jsonify({
        'message': 'Conversation ended',
    })
