"""HeyMira - AI Service (Natural, human-like responses with API key rotation)"""

from services.key_manager import key_manager
import google.generativeai as genai
import json


def generate_ai_response(persona, conversation_history, user_message):
    """Generate a persona-aware AI response for therapy chat."""

    # Build persona context
    persona_context = ""
    if persona:
        traits = persona.get_traits()
        phrases = persona.get_phrases()

        raw_excerpt = ""
        if hasattr(persona, 'raw_text') and persona.raw_text:
            raw_excerpt = f"""

Here are ACTUAL messages from this person — study how they type:
---
{persona.raw_text[:3000]}
---
Copy their EXACT writing style. Their word choices, abbreviations, emoji use, everything.
"""

        persona_context = f"""
You ARE "{persona.name}". Not an AI pretending — you ARE them.
- Style: {persona.speaking_style}
- Tone: {persona.tone}
- Vocab: {persona.vocabulary_level}
- Vibe: {persona.emotional_tone}
- Humor: {persona.humor_level}
- How supportive: {persona.supportiveness}
- Message length: {persona.response_length}
- Their phrases: {', '.join(phrases) if phrases else 'none'}
{raw_excerpt}
NEVER break character. Talk EXACTLY like them.
"""

    system_prompt = f"""You're a close friend having a real text conversation — NOT a therapist, NOT an AI assistant. {persona_context}

RULES FOR HOW TO TALK:
1. Keep messages SHORT — 1 to 3 sentences max. Like a real text message.
2. Sound like a real person. Use casual language, contractions, lowercase sometimes.
3. Don't use bullet points, numbered lists, or structured formats EVER.
4. Don't give advice unless asked. Just listen, relate, and ask questions.
5. Use emojis sparingly and naturally — don't overdo it.
6. Match the user's energy. If they're chill, be chill. If they're upset, be gentle.
7. NEVER say things like "I'm here for you" or "That sounds tough" — those are robotic. Instead, be specific.
8. Ask ONE follow-up question at most. Don't interrogate.
9. Sometimes just validate with a short reaction before asking anything.
10. If they mention self-harm or suicide, be caring but mention 988 helpline naturally.

BAD (robotic): "I understand that must be really difficult for you. It's completely valid to feel that way. Would you like to talk more about what's been bothering you?"
GOOD (human): "damn that's rough honestly. what happened tho?"

BAD: "I'm here for you. Please know that your feelings are valid and important."
GOOD: "yo that actually sucks. wanna vent about it?"

You're texting a friend. Keep it real."""

    # Build conversation context
    messages_context = ""
    if conversation_history:
        for msg in conversation_history[-15:]:  # Last 15
            role_label = "Them" if msg['role'] == 'user' else "You"
            messages_context += f"{role_label}: {msg['content']}\n"

    prompt = f"{messages_context}Them: {user_message}\nYou:"

    try:
        response = key_manager.call_with_retry(
            'gemini-3.1-flash-lite-preview',
            [{"role": "user", "parts": [{"text": system_prompt + "\n\n" + prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=150,  # Short responses
                temperature=0.9,
            )
        )
        return response.text.strip()
    except Exception as e:
        print(f"AI Service Error: {e}")
        return "hey sorry, having a weird moment rn. what were you saying?"


def analyze_persona_from_text(text, person_name=""):
    """Analyze communication patterns from extracted text to build a persona profile."""
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
        response = key_manager.call_with_retry(
            'gemini-3.1-flash-lite-preview',
            [{"role": "user", "parts": [{"text": prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=800,
                temperature=0.3,
            )
        )
        response_text = response.text.strip()
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
