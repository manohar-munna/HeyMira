"""HeyMira - Report Generation (with API key rotation)"""

from services.key_manager import key_manager
import google.generativeai as genai
import json


def generate_session_report(messages):
    """Generate a summary report for a therapy session."""
    if not messages:
        return {
            'sentiment_score': 0,
            'emotional_trend': 'stable',
            'risk_level': 'low',
            'ai_summary': 'No messages in this session.'
        }

    conversation_text = ""
    for msg in messages:
        role = "Patient" if msg.get('role') == 'user' else "AI"
        conversation_text += f"{role}: {msg.get('content', '')}\n"

    prompt = f"""Analyze this therapy conversation and return ONLY a JSON object:
{{
    "sentiment_score": <float -1.0 to 1.0>,
    "emotional_trend": "<improving/declining/stable>",
    "risk_level": "<low/moderate/high/critical>",
    "ai_summary": "<2-3 sentence summary of the session, the patient's state, and key topics discussed>"
}}

Conversation:
{conversation_text[:6000]}

Return ONLY valid JSON."""

    try:
        response = key_manager.call_with_retry(
            'gemini-3.1-flash-lite-preview',
            [{"role": "user", "parts": [{"text": prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=400,
                temperature=0.2,
            )
        )
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('\n', 1)[1]
        if response_text.endswith('```'):
            response_text = response_text.rsplit('```', 1)[0]

        return json.loads(response_text.strip())
    except Exception as e:
        print(f"Report Generation Error: {e}")
        return {
            'sentiment_score': 0,
            'emotional_trend': 'stable',
            'risk_level': 'low',
            'ai_summary': 'Unable to generate session summary.'
        }
