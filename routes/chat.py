from flask import Blueprint, request, jsonify, Response
from flask_login import login_required, current_user
from models.models import Conversation, Message, Persona, User
from services.ai_service import generate_ai_response, generate_ai_response_stream
from datetime import datetime
import json

chat_bp = Blueprint('chat', __name__)


@chat_bp.route('/api/chat/new', methods=['POST'])
@login_required
def new_conversation():
    data = request.get_json(force=True, silent=True) or {}
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
    data = request.get_json(force=True, silent=True) or {}
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

@chat_bp.route('/api/chat/delete/<int:conversation_id>', methods=['DELETE'])
@login_required
def delete_conversation(conversation_id):
    conv = Conversation.get_by_id(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    conv.delete()
    
    return jsonify({
        'message': 'Conversation deleted successfully'
    })


@chat_bp.route('/api/chat/send_stream', methods=['POST'])
@login_required
def send_message_stream():
    """Stream AI response via Server-Sent Events for instant typing effect."""
    data = request.get_json(force=True, silent=True) or {}
    conversation_id = data.get('conversation_id')
    content = data.get('content', '').strip()
    is_voice = data.get('is_voice', False)

    if not conversation_id or not content:
        return jsonify({'error': 'conversation_id and content are required'}), 400

    conv = Conversation.get_by_id(conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Save user message
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

    # Update title on first message
    existing_msgs = conv.get_messages()
    if len(existing_msgs) <= 1:
        conv.title = content[:80] + ('...' if len(content) > 80 else '')
        conv.save()

    def generate():
        full_response = ""
        try:
            # Send user message ID first
            yield f"data: {json.dumps({'type': 'user_msg', 'message': user_msg.to_dict()})}\n\n"

            for chunk in generate_ai_response_stream(persona, history, content):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

            # Save the complete AI message
            ai_msg = Message(
                conversation_id=conv.id,
                role='ai',
                content=full_response.strip(),
                is_voice=is_voice
            )
            ai_msg.save()

            yield f"data: {json.dumps({'type': 'done', 'ai_message': ai_msg.to_dict()})}\n\n"
        except Exception as e:
            fallback = "hey sorry, having a weird moment rn. what were you saying?"
            ai_msg = Message(
                conversation_id=conv.id,
                role='ai',
                content=fallback,
                is_voice=is_voice
            )
            ai_msg.save()
            yield f"data: {json.dumps({'type': 'chunk', 'text': fallback})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'ai_message': ai_msg.to_dict()})}\n\n"

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })
