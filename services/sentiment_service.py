"""HeyMira - Sentiment Analysis (with API key rotation)"""

from services.key_manager import key_manager
import google.generativeai as genai
import json
import re


def analyze_sentiment(text):
    """Analyze sentiment of a message. Returns score, emotion, has_crisis, and risk_level."""
    prompt = f"""Analyze the emotional sentiment of this message. You MUST determine if there is an urgent crisis/emergency (suicidal ideation, self harm, extreme hopelessness). Detect this across ANY language.

Return ONLY a JSON object with these fields:
{{
    "score": <float from -1.0 to 1.0 where -1 is very negative, 0 is neutral, 1 is very positive>,
    "emotion": "<primary emotion: happy, sad, anxious, angry, fearful, hopeful, neutral, distressed>",
    "has_crisis": <boolean, true if there is an immediate risk of self-harm or suicide>,
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
            
        # Parse JSON
        result = json.loads(response_text.strip())
        
        # Fallback check just in case Gemini hallucinates keys
        score = float(result.get('score', 0.0))
        has_crisis = bool(result.get('has_crisis', False))
        
        # Override risk_level mathematically to ensure consistency
        result['risk_level'] = get_risk_level(score, has_crisis)
        
        return result
    except Exception as e:
        print(f"Sentiment Analysis Error: {e}")
        return {"score": 0.0, "emotion": "neutral", "has_crisis": False, "risk_level": "low"}


def get_risk_level(sentiment_score, has_crisis_boolean):
    """Determine risk level based on sentiment and crisis boolean."""
    if has_crisis_boolean:
        return 'critical'
    if sentiment_score <= -0.7:
        return 'high'
    if sentiment_score <= -0.4:
        return 'moderate'
    return 'low'
