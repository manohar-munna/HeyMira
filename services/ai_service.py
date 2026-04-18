"""HeyMira - AI Service (Deep Persona Cloning + Streaming Responses)"""

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

        past_events = persona.get_past_events()
        events_context = ""
        if past_events:
            events_context = "\n- SHARED MEMORIES AND PAST EVENTS you should know about and refer to naturally if they come up:\n  * " + "\n  * ".join(past_events)

        # New deep traits
        psychological_profile = ""
        if hasattr(persona, 'psychological_profile') and persona.psychological_profile:
            try:
                psych = json.loads(persona.psychological_profile) if isinstance(persona.psychological_profile, str) else persona.psychological_profile
                psychological_profile = f"\n- Attachment style: {psych.get('attachment_style', 'unknown')}\n- Conflict resolution: {psych.get('conflict_style', 'unknown')}\n- Love language: {psych.get('love_language', 'unknown')}\n- Emotional regulation: {psych.get('emotional_regulation', 'unknown')}"
            except:
                pass

        grammar_habits = ""
        if hasattr(persona, 'grammar_habits') and persona.grammar_habits:
            grammar_habits = f"\n- Grammar habits: {persona.grammar_habits}"

        texting_speed = ""
        if hasattr(persona, 'texting_speed') and persona.texting_speed:
            texting_speed = f"\n- Texting speed/frequency: {persona.texting_speed}"

        topic_preferences = ""
        if hasattr(persona, 'topic_preferences') and persona.topic_preferences:
            topic_preferences = f"\n- Favorite topics to discuss: {persona.topic_preferences}"

        argument_style = ""
        if hasattr(persona, 'argument_style') and persona.argument_style:
            argument_style = f"\n- How they argue/disagree: {persona.argument_style}"

        affection_style = ""
        if hasattr(persona, 'affection_style') and persona.affection_style:
            affection_style = f"\n- How they show affection: {persona.affection_style}"

        cultural_references = ""
        if hasattr(persona, 'cultural_references') and persona.cultural_references:
            cultural_references = f"\n- Cultural references they use: {persona.cultural_references}"

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
- Emoji usage: {persona.emoji_usage}
- Frequent emojis: {', '.join(persona.get_frequent_emojis()) if persona.get_frequent_emojis() else 'none'}
- Specific word choices/slang: {', '.join(persona.get_word_choices()) if persona.get_word_choices() else 'none'}{events_context}{psychological_profile}{grammar_habits}{texting_speed}{topic_preferences}{argument_style}{affection_style}{cultural_references}
{raw_excerpt}
NEVER break character. Talk EXACTLY like them. Mimic their emoji usage, their exact slang, their tone, everything.
"""

    system_prompt = f"""You are EXACTLY this person having a real text conversation. YOU ARE NOT AN AI. YOU ARE NOT A THERAPIST. {persona_context}

RULES FOR HOW TO TALK:
1. Keep messages SHORT — 1 to 3 sentences max, matching their exact style.
2. Sound like a real person. Use casual language, contractions, and their exact word choices.
3. NEVER use bullet points, numbered lists, or structured formats.
4. Don't give advice unless asked. 
5. Use THEIR frequent emojis: {persona.get_frequent_emojis() if persona and hasattr(persona, 'get_frequent_emojis') else 'match their vibe'}.
6. Match their energy precisely.
7. NEVER say things like "I'm here for you" or "That sounds tough" unless they explicitly use those phrases.
8. Ask ONE follow-up question at most. Don't interrogate.
9. Sometimes just validate with a short reaction before asking anything.
10. ALWAYS refer to the shared memories provided if relevant. NEVER break character to explain you are an AI.
11. If they mention a specific event you know about from past events, reference it naturally like "oh yeah I remember when..."
12. Match their grammar EXACTLY — if they use lowercase, you use lowercase. If they skip punctuation, skip it too.
13. Mirror their texting cadence — if they send short rapid texts, keep yours short. If they write longer paragraphs, do that.
14. Use their cultural references and inside jokes when applicable.

BAD (robotic): "I understand that must be really difficult for you."
GOOD (human): "damn that's rough honestly. what happened tho?"

You are texting them right now. Keep it 100% real and identical to their writing style."""

    # Build conversation context
    messages_context = ""
    if conversation_history:
        for msg in conversation_history[-15:]:  # Last 15
            role_label = "Them" if msg['role'] == 'user' else "You"
            messages_context += f"{role_label}: {msg['content']}\n"

    prompt = f"{messages_context}Them: {user_message}\nYou:"

    try:
        response = key_manager.call_with_retry(
            'gemini-2.0-flash',
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


def generate_ai_response_stream(persona, conversation_history, user_message):
    """Generate a persona-aware AI response as a stream (yields chunks)."""

    # Build persona context (same as above)
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
Copy their EXACT writing style.
"""

        past_events = persona.get_past_events()
        events_context = ""
        if past_events:
            events_context = "\n- SHARED MEMORIES:\n  * " + "\n  * ".join(past_events)

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
- Emoji usage: {persona.emoji_usage}
- Frequent emojis: {', '.join(persona.get_frequent_emojis()) if persona.get_frequent_emojis() else 'none'}
- Specific word choices/slang: {', '.join(persona.get_word_choices()) if persona.get_word_choices() else 'none'}{events_context}
{raw_excerpt}
NEVER break character. Talk EXACTLY like them.
"""

    system_prompt = f"""You are EXACTLY this person having a real text conversation. YOU ARE NOT AN AI. {persona_context}

RULES: Keep messages SHORT (1-3 sentences). Sound real. No bullet points. Use their emojis and slang. Match their energy.
If they mention a known past event, reference it naturally.
Match their grammar EXACTLY — lowercase if they use lowercase, skip punctuation if they do.

You are texting them right now. Keep it 100% real."""

    messages_context = ""
    if conversation_history:
        for msg in conversation_history[-15:]:
            role_label = "Them" if msg['role'] == 'user' else "You"
            messages_context += f"{role_label}: {msg['content']}\n"

    prompt = f"{messages_context}Them: {user_message}\nYou:"

    try:
        response = key_manager.call_with_retry_stream(
            'gemini-2.0-flash',
            [{"role": "user", "parts": [{"text": system_prompt + "\n\n" + prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=150,
                temperature=0.9,
            )
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        print(f"AI Stream Error: {e}")
        yield "hey sorry, having a weird moment rn. what were you saying?"


def analyze_persona_from_text(text, person_name=""):
    """Analyze communication patterns from extracted text to build a comprehensive persona profile.
    This is the DEEP CLONING engine — 50+ line prompt for maximum accuracy."""
    prompt = f"""You are an expert psycholinguistic analyst and personality profiler. Your job is to deeply study a person's communication patterns from their chat messages and create an EXHAUSTIVE personality clone profile.

ANALYSIS REQUIREMENTS — Be extremely thorough and specific. Do not give generic answers.
Study the text carefully and identify:

1. SPEAKING STYLE: How do they construct sentences? Do they use fragments, run-on sentences, or complete sentences? Do they capitalize properly or use all lowercase? Do they use periods, or skip punctuation entirely?

2. TONE: What is the overall emotional undertone? Are they sarcastic, warm, cold, playful, passive-aggressive, anxious, confident? Give a specific multi-word description, not just one word.

3. VOCABULARY LEVEL: Is their language simple/colloquial, moderate, or sophisticated? Do they use slang heavily? Do they code-switch between languages?

4. COMMON PHRASES: What are their go-to phrases, greetings, sign-offs, reactions? Things they say repeatedly. Include exact spellings they use (e.g., "yaa", "haan", "bruhhh", "ngl", "frfr").

5. EMOTIONAL TONE: What is the dominant emotional undercurrent? Are they anxious-but-hiding-it, genuinely optimistic, melancholic, nonchalant?

6. HUMOR: Do they joke often? Is it dark humor, sarcasm, puns, memes, self-deprecating? Rate from none to very high and describe the TYPE of humor.

7. SUPPORTIVENESS: How do they react when the other person shares problems? Do they give advice, just listen, minimize, redirect to themselves, or offer practical help?

8. RESPONSE LENGTH: Do they send short rapid-fire messages (1-5 words each), moderate messages (1-2 sentences), or long detailed paragraphs?

9. EMOJI USAGE: How heavily do they use emojis? Do they use them at the end of every message, only sometimes, or never? Do they use emojis as standalone responses?

10. FREQUENT EMOJIS: List the EXACT emojis they use most, in order of frequency. Include emoticons like :) or xD if used.

11. WORD CHOICES: List specific slang, abbreviations, misspellings, transliterations, or unique words they use (e.g., "gonna", "wanna", "tho", "rn", "nvm", "lol", "haha", "bruh").

12. PERSONALITY TRAITS: Rate each trait on a scale of 1-10 based on the conversation evidence:
    - Warmth, Openness, Empathy, Assertiveness, Positivity, Neuroticism, Agreeableness, Conscientiousness

13. PAST EVENTS: Extract EVERY single memory, event, story, or experience mentioned in the conversation. Include:
    - Trips, outings, hangouts
    - Fights, disagreements, apologies
    - Inside jokes and their context
    - Shared experiences (movies watched, food eaten, places visited)
    - Important life events (birthdays, exams, relationships, breakups, jobs)
    - ANY factual information about their life (where they live, what they study/work, pets, family members)
    Be EXHAUSTIVE. List at least 15-30 events if available. Use natural phrasing like "We went to Goa last summer" or "Had that argument about the party".

14. PSYCHOLOGICAL PROFILE:
    - Attachment style (secure, anxious, avoidant, disorganized)
    - How they handle conflict (confrontational, avoidant, passive-aggressive, collaborative)
    - Primary love language (words of affirmation, quality time, acts of service, physical touch, gifts)
    - Emotional regulation (do they vent openly, suppress, rationalize, or explode?)

15. GRAMMAR HABITS: Do they use proper grammar or break rules purposefully? Do they capitalize "I"? Do they use apostrophes in contractions? Do they type in a specific language pattern or mix languages (e.g., Hinglish)?

16. TEXTING SPEED: Based on message patterns, do they seem like a fast texter who sends many short messages, or a slow texter who sends fewer longer messages?

17. TOPIC PREFERENCES: What subjects do they gravitate toward? (relationships, work/studies, memes, gossip, philosophy, food, travel, etc.)

18. ARGUMENT STYLE: How do they disagree or express displeasure? Do they go silent, use sarcasm, confront directly, or get emotional?

19. AFFECTION STYLE: How do they express care? Pet names, compliments, checking in, sharing things, teasing?

20. CULTURAL REFERENCES: What movies, songs, shows, games, or cultural elements do they reference? What generation/demographic do they seem to belong to?

Return ONLY a valid JSON object (no markdown, no code blocks, no explanation) with exactly these fields:

{{
    "name": "{person_name or 'Unknown'}",
    "speaking_style": "detailed multi-word description",
    "tone": "specific multi-word tone description",
    "vocabulary_level": "simple/moderate/sophisticated with notes",
    "common_phrases": ["exact phrase 1", "exact phrase 2", "exact phrase 3", "exact phrase 4", "exact phrase 5", "phrase 6", "phrase 7", "phrase 8"],
    "emotional_tone": "detailed emotional undercurrent description",
    "humor_level": "none/subtle/moderate/high/very_high — with type description",
    "supportiveness": "low/moderate/high/very_high — with how they show it",
    "response_length": "brief/moderate/detailed — with typical message structure",
    "emoji_usage": "detailed description of emoji behavior",
    "frequent_emojis": ["😂", "💀", "❤️", "🥺", "😭"],
    "word_choices": ["slang1", "slang2", "abbreviation1", "unique_greeting", "unique_spelling"],
    "personality_traits": {{
        "warmth": 1-10,
        "openness": 1-10,
        "empathy": 1-10,
        "assertiveness": 1-10,
        "positivity": 1-10,
        "neuroticism": 1-10,
        "agreeableness": 1-10,
        "conscientiousness": 1-10
    }},
    "past_events": ["Memory 1 in natural phrasing", "Memory 2", "Memory 3", "...at least 15-30 entries if available"],
    "psychological_profile": {{
        "attachment_style": "secure/anxious/avoidant/disorganized — with evidence",
        "conflict_style": "description of how they handle disagreements",
        "love_language": "primary love language with evidence",
        "emotional_regulation": "how they manage emotions"
    }},
    "grammar_habits": "detailed description of their grammar patterns and deviations",
    "texting_speed": "description of their texting cadence and patterns",
    "topic_preferences": "comma-separated list of favorite discussion topics",
    "argument_style": "how they express disagreement or frustration",
    "affection_style": "how they show love and care in text",
    "cultural_references": "movies, music, shows, games, memes they reference"
}}

Conversation text to analyze:
{text[:25000]}"""

    try:
        response = key_manager.call_with_retry(
            'gemini-2.0-flash',
            [{"role": "user", "parts": [{"text": prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=4000,
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
            "emoji_usage": "moderate",
            "frequent_emojis": [],
            "word_choices": [],
            "past_events": [],
            "personality_traits": {
                "warmth": 7, "openness": 7, "empathy": 8, "assertiveness": 5, "positivity": 7,
                "neuroticism": 4, "agreeableness": 7, "conscientiousness": 5
            },
            "psychological_profile": {
                "attachment_style": "unknown",
                "conflict_style": "unknown",
                "love_language": "unknown",
                "emotional_regulation": "unknown"
            },
            "grammar_habits": "standard",
            "texting_speed": "moderate",
            "topic_preferences": "general",
            "argument_style": "unknown",
            "affection_style": "unknown",
            "cultural_references": "unknown"
        }


def generate_chat_summary(text):
    """Generate a brief summary of the events/topics discussed in the chat."""
    prompt = f"""Analyze the following conversation text and provide a brief summary of the main events, topics, or themes discussed. 
Keep it concise, around 2-3 sentences. Do not mention the dates, just the events and context.

Conversation text:
{text[:8000]}"""

    try:
        response = key_manager.call_with_retry(
            'gemini-2.0-flash',
            [{"role": "user", "parts": [{"text": prompt}]}],
            genai.types.GenerationConfig(
                max_output_tokens=150,
                temperature=0.5,
            )
        )
        return response.text.strip()
    except Exception as e:
        print(f"Chat Summary Error: {e}")
        return "Could not generate summary at this time."


def detect_lip_coordinates(image_data_base64):
    """Detect mouth coordinates (percentage x, y) using Gemini multimodal."""
    prompt = """Identify the exact center of the person's mouth (the horizontal line where the upper and lower lips meet) in this portrait.
Return ONLY a valid JSON object with:
{
    "x": percentage_from_left_edge,
    "y": percentage_from_top_edge,
    "found": true
}
Important:
- Use a scale of 0 to 100.
- x=50 is the horizontal center.
- y=50 is the vertical center.
- Be extremely precise. The point must be exactly where the lips part when speaking.
- If no face or mouth is visible, return {"found": false, "x": 50, "y": 75}."""

    try:
        # Prepare multimodal part
        if ',' in image_data_base64:
            mime_type = image_data_base64.split(';')[0].split(':')[1]
            data = image_data_base64.split(',')[1]
        else:
            mime_type = "image/jpeg"
            data = image_data_base64

        response = key_manager.call_with_retry(
            'gemini-2.0-flash', 
            [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime_type, "data": data}}
                    ]
                }
            ],
            genai.types.GenerationConfig(
                max_output_tokens=100,
                temperature=0.1,
            )
        )
        
        response_text = response.text.strip()
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        
        return json.loads(response_text.strip())
    except Exception as e:
        print(f"Lip Detection Error: {e}")
        return {"x": 50, "y": 75, "found": False}
