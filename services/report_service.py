import google.generativeai as genai
from config import Config
import json

genai.configure(api_key=Config.GEMINI_API_KEY)


def generate_session_report(messages):
    """Generate a session report from conversation messages."""
    if not messages:
        return {
            'sentiment_score': 0.0,
            'emotional_trend': 'stable',
            'risk_level': 'low',
            'ai_summary': 'No messages in this session.'
        }

    model = genai.GenerativeModel('gemini-2.5-flash')

    conversation_text = ""
    for msg in messages:
        role = "Patient" if msg.get('role') == 'user' else "AI Companion"
        conversation_text += f"{role}: {msg.get('content', '')}\n"

    prompt = f"""Analyze this therapy conversation and provide a clinical summary report.
Return ONLY a JSON object with these fields:

{{
    "sentiment_score": <float -1.0 to 1.0, overall emotional state>,
    "emotional_trend": "<improving, declining, or stable>",
    "risk_level": "<low, moderate, high, or critical>",
    "ai_summary": "<2-3 sentence professional summary of the session, noting key topics discussed, emotional state, and any concerns>"
}}

Conversation:
{conversation_text[:6000]}

Return ONLY the JSON, no other text."""

    try:
        response = model.generate_content(
            [{"role": "user", "parts": [{"text": prompt}]}],
            generation_config=genai.types.GenerationConfig(
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
        # Fallback: compute basic stats
        sentiment_scores = [msg.get('sentiment_score', 0) for msg in messages if msg.get('role') == 'user']
        avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0

        return {
            'sentiment_score': round(avg_sentiment, 2),
            'emotional_trend': 'stable',
            'risk_level': 'low' if avg_sentiment > -0.3 else ('moderate' if avg_sentiment > -0.6 else 'high'),
            'ai_summary': f'Session contained {len(messages)} messages. Average sentiment: {avg_sentiment:.2f}.'
        }
