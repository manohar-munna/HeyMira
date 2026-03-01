import google.generativeai as genai
from config import Config
import json

# Configure Gemini
genai.configure(api_key=Config.GEMINI_API_KEY)


def get_model():
    return genai.GenerativeModel('gemini-2.5-flash')


def generate_ai_response(persona, conversation_history, user_message):
    """Generate a persona-aware AI response for therapy chat."""
    model = get_model()

    # Build persona context
    persona_context = ""
    if persona:
        traits = persona.get_traits()
        phrases = persona.get_phrases()
        persona_context = f"""
You are roleplaying as a person named "{persona.name}" with these characteristics:
- Speaking style: {persona.speaking_style}
- Tone: {persona.tone}
- Vocabulary level: {persona.vocabulary_level}
- Emotional tone: {persona.emotional_tone}
- Humor level: {persona.humor_level}
- Supportiveness: {persona.supportiveness}
- Typical response length: {persona.response_length}
- Common phrases they use: {', '.join(phrases) if phrases else 'None specified'}
- Personality traits: {json.dumps(traits) if traits else 'None specified'}

You must speak EXACTLY like this person would - use their phrases, match their tone, and mirror their communication style.
"""

    system_prompt = f"""You are HeyMira, an AI therapy support companion. {persona_context}

CRITICAL RULES:
1. Always be empathetic, warm, and supportive
2. If the person expresses suicidal thoughts, self-harm, or is in crisis, gently encourage them to reach out to a professional or call a helpline. Include: "If you're in crisis, please call 988 (Suicide & Crisis Lifeline)"
3. Never provide medical diagnoses or prescribe medication
4. Remember and reference previous parts of the conversation
5. Keep responses natural and conversational, not clinical
6. If you detect severe distress, acknowledge it compassionately
7. Encourage professional help when appropriate, but don't force it
8. Be a good listener - ask follow-up questions and show genuine interest

You are having a conversation with someone who needs emotional support. Respond naturally and caringly."""

    # Build conversation context
    messages_context = ""
    if conversation_history:
        for msg in conversation_history[-20:]:  # Last 20 messages for context
            role_label = "Patient" if msg['role'] == 'user' else "You"
            messages_context += f"{role_label}: {msg['content']}\n"

    prompt = f"{messages_context}Patient: {user_message}\nYou:"

    try:
        response = model.generate_content(
            [{"role": "user", "parts": [{"text": system_prompt + "\n\n" + prompt}]}],
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=500,
                temperature=0.8,
            )
        )
        return response.text.strip()
    except Exception as e:
        print(f"AI Service Error: {e}")
        return "I'm here for you. Could you tell me more about how you're feeling? Sometimes just talking about it can help."


def analyze_persona_from_text(text, person_name=""):
    """Analyze communication patterns from extracted text to build a persona profile."""
    model = get_model()

    prompt = f"""Analyze the following conversation text and extract the communication personality profile of the main speaker. 
Return ONLY a valid JSON object (no markdown, no code blocks) with exactly these fields:

{{
    "name": "{person_name or 'Unknown'}",
    "speaking_style": "description of how they speak (e.g., casual and warm, formal and measured, energetic and expressive)",
    "tone": "overall tone (e.g., supportive, sarcastic, cheerful, calm, intense)",
    "vocabulary_level": "simple/moderate/sophisticated",
    "common_phrases": ["phrase1", "phrase2", "phrase3", "phrase4", "phrase5"],
    "emotional_tone": "dominant emotional undertone (e.g., caring, anxious, optimistic, melancholic)",
    "humor_level": "none/subtle/moderate/high",
    "supportiveness": "low/moderate/high/very_high",
    "response_length": "brief/moderate/detailed",
    "personality_traits": {{
        "warmth": 1-10,
        "openness": 1-10,
        "empathy": 1-10,
        "assertiveness": 1-10,
        "positivity": 1-10
    }}
}}

Conversation text to analyze:
{text[:8000]}"""

    try:
        response = model.generate_content(
            [{"role": "user", "parts": [{"text": prompt}]}],
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=800,
                temperature=0.3,
            )
        )
        response_text = response.text.strip()
        # Clean up markdown code block markers if present
        if response_text.startswith('```'):
            response_text = response_text.split('\n', 1)[1]
        if response_text.endswith('```'):
            response_text = response_text.rsplit('```', 1)[0]
        response_text = response_text.strip()
        
        return json.loads(response_text)
    except Exception as e:
        print(f"Persona Analysis Error: {e}")
        return {
            "name": person_name or "Unknown",
            "speaking_style": "warm and conversational",
            "tone": "supportive",
            "vocabulary_level": "moderate",
            "common_phrases": [],
            "emotional_tone": "caring",
            "humor_level": "subtle",
            "supportiveness": "high",
            "response_length": "moderate",
            "personality_traits": {
                "warmth": 7, "openness": 7, "empathy": 8, "assertiveness": 5, "positivity": 7
            }
        }
