"""HeyMira - Sentiment Analysis (with API key rotation)"""

from services.key_manager import key_manager
import google.generativeai as genai
import json
import re

# Crisis keywords for emergency detection
CRISIS_KEYWORDS = [
    'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die',
    'self harm', 'self-harm', 'cutting myself', 'hurt myself',
    'no reason to live', 'better off dead', 'ending it all',
    'overdose', 'jump off', 'hang myself', 'not worth living',
    'goodbye forever', 'final goodbye', 'last message',
    'can\'t go on', 'can\'t take it anymore', 'no way out',
    'hopeless', 'worthless', 'nobody cares', 'all alone',
]


def analyze_sentiment(text):
    """Analyze sentiment of a message. Returns score from -1 (very negative) to 1 (very positive)."""
    prompt = f"""Analyze the emotional sentiment of this message and return ONLY a JSON object with these fields:
{{
    "score": <float from -1.0 to 1.0 where -1 is very negative, 0 is neutral, 1 is very positive>,
    "emotion": "<primary emotion: happy, sad, anxious, angry, fearful, hopeful, neutral, distressed>",
    "risk_level": "<low, moderate, high, critical>"
}}

Message: "{text}"

Return ONLY the JSON, no other text."""

    try:
        response = key_manager.call_with_retry(
            'gemini-3.1-flash-lite-preview',
            [{"role": "user", "parts": [{"text": prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=200,
                temperature=0.1,
            )
        )
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('\n', 1)[1]
        if response_text.endswith('```'):
            response_text = response_text.rsplit('```', 1)[0]

        return json.loads(response_text.strip())
    except Exception as e:
        print(f"Sentiment Analysis Error: {e}")
        return {"score": 0.0, "emotion": "neutral", "risk_level": "low"}


def detect_crisis(text):
    """Check if message contains crisis indicators."""
    text_lower = text.lower()

    for keyword in CRISIS_KEYWORDS:
        if keyword in text_lower:
            return True

    return False


def get_risk_level(sentiment_score, has_crisis_keywords):
    """Determine risk level based on sentiment and crisis detection."""
    if has_crisis_keywords:
        return 'critical'
    if sentiment_score <= -0.7:
        return 'high'
    if sentiment_score <= -0.4:
        return 'moderate'
    return 'low'
