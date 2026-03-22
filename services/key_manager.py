"""
HeyMira - API Key Manager with Groq Backup
Try all Gemini keys → if all fail → fall back to Groq (free).
"""

import google.generativeai as genai
from openai import OpenAI
import os


class APIKeyManager:
    def __init__(self):
        self._gemini_keys = []
        self._groq_client = None
        self._load_keys()

    def _load_keys(self):
        primary = os.environ.get('GEMINI_API_KEY', '')
        if primary:
            self._gemini_keys.append(primary)
        for i in range(2, 11):
            key = os.environ.get(f'GEMINI_API_KEY_{i}', '')
            if key:
                self._gemini_keys.append(key)

        groq_key = os.environ.get('GROQ_API_KEY', '')
        if groq_key:
            self._groq_client = OpenAI(
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1"
            )

        print(f"[KeyManager] Loaded {len(self._gemini_keys)} Gemini key(s)" +
              (" + Groq backup ✓" if self._groq_client else " (NO backup)"))

        if self._gemini_keys:
            genai.configure(api_key=self._gemini_keys[0])

    def _is_quota_error(self, error):
        s = str(error).lower()
        return any(w in s for w in ['quota', 'rate limit', '429', 'resource exhausted', 'exceeded'])

    def call_with_retry(self, model_name, contents, generation_config):
        """Try all Gemini keys. If ALL fail → use Groq."""
        errors = []

        # Try every Gemini key
        for i, key in enumerate(self._gemini_keys):
            try:
                genai.configure(api_key=key)
                model = genai.GenerativeModel(model_name)
                return model.generate_content(contents, generation_config=generation_config)
            except Exception as e:
                print(f"[KeyManager] Gemini key #{i+1} failed: {str(e)[:80]}")
                errors.append(e)
                continue

        # All Gemini keys failed → Groq
        if self._groq_client:
            print(f"[KeyManager] ⚡ All Gemini keys failed → using Groq backup")
            try:
                return self._call_groq(contents, generation_config)
            except Exception as e:
                print(f"[KeyManager] ❌ Groq also failed: {str(e)[:200]}")
                raise e

        if errors:
            raise errors[-1]
        raise Exception("No AI keys available")

    def _call_groq(self, contents, generation_config):
        """Call Groq API (free, fast) as backup."""
        prompt_text = ""
        if isinstance(contents, list):
            for item in contents:
                if isinstance(item, dict) and 'parts' in item:
                    for part in item['parts']:
                        if isinstance(part, dict) and 'text' in part:
                            prompt_text += part['text']

        max_tokens = 150
        temperature = 0.8
        if generation_config:
            if hasattr(generation_config, 'max_output_tokens') and generation_config.max_output_tokens:
                max_tokens = generation_config.max_output_tokens
            if hasattr(generation_config, 'temperature') and generation_config.temperature is not None:
                temperature = generation_config.temperature

        response = self._groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt_text}],
            max_tokens=max_tokens,
            temperature=temperature
        )

        result = response.choices[0].message.content
        print(f"[KeyManager] ✅ Groq responded ({len(result)} chars)")
        return GroqResponse(result)


class GroqResponse:
    """Makes Groq response look like Gemini response."""
    def __init__(self, text):
        self.text = text


key_manager = APIKeyManager()
