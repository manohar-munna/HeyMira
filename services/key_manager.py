"""
HeyMira - API Key Manager with Groq Backup + Fail-Fast for Vercel
Try all Gemini keys → if all fail → fall back to Groq (free).
Optimized: tracks failed keys to avoid retrying them within a cooldown window.
"""

import google.generativeai as genai
from openai import OpenAI
import os
import time


class APIKeyManager:
    def __init__(self):
        self._gemini_keys = []
        self._groq_client = None
        self._failed_keys = {}  # key_index -> timestamp of failure (for cooldown)
        self._COOLDOWN_SECONDS = 60  # Skip failed keys for 60s
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

    def _is_key_cooled_down(self, key_index):
        """Check if a failed key has finished its cooldown period."""
        if key_index not in self._failed_keys:
            return True
        elapsed = time.time() - self._failed_keys[key_index]
        if elapsed >= self._COOLDOWN_SECONDS:
            del self._failed_keys[key_index]
            return True
        return False

    def get_working_key(self):
        """Return the first key that isn't in cooldown. Used for streaming."""
        for i, key in enumerate(self._gemini_keys):
            if self._is_key_cooled_down(i):
                return key
        # All in cooldown, just return the first one
        return self._gemini_keys[0] if self._gemini_keys else None

    def call_with_retry(self, model_name, contents, generation_config):
        """Try all Gemini keys (skip cooled-down ones). If ALL fail → use Groq."""
        errors = []

        for i, key in enumerate(self._gemini_keys):
            # Skip keys that recently failed (fail-fast)
            if not self._is_key_cooled_down(i):
                continue

            try:
                genai.configure(api_key=key)
                model = genai.GenerativeModel(model_name)
                result = model.generate_content(contents, generation_config=generation_config)
                # Success — clear any old failure record
                self._failed_keys.pop(i, None)
                return result
            except Exception as e:
                print(f"[KeyManager] Gemini key #{i+1} failed: {str(e)[:80]}")
                if self._is_quota_error(e):
                    self._failed_keys[i] = time.time()
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

    def call_with_retry_stream(self, model_name, contents, generation_config):
        """Try all Gemini keys (skip cooled-down ones) with streaming. If ALL fail → use Groq."""
        errors = []

        for i, key in enumerate(self._gemini_keys):
            if not self._is_key_cooled_down(i):
                continue

            try:
                genai.configure(api_key=key)
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(contents, generation_config=generation_config, stream=True)
                
                # Check if it works by iterating. Wait, we can't fully iterate before returning.
                # However, if it fails due to quota, it usually fails immediately when the stream starts.
                # We can try to yield the response. If the FIRST chunk fails, we catch it and retry.
                # But yielding inside a try-catch for a generator requires careful handling.
                def generator():
                    try:
                        for chunk in response:
                            self._failed_keys.pop(i, None)
                            yield chunk
                    except Exception as e:
                        print(f"[KeyManager] Gemini key #{i+1} failed during stream: {str(e)[:80]}")
                        if self._is_quota_error(e):
                            self._failed_keys[i] = time.time()
                        raise e
                
                # Try getting the first chunk to test if the key works
                stream_iter = iter(generator())
                first_chunk = next(stream_iter)
                
                def chained_generator():
                    yield first_chunk
                    yield from stream_iter
                
                return chained_generator()

            except StopIteration:
                return iter([])
            except Exception as e:
                print(f"[KeyManager] Gemini key #{i+1} failed: {str(e)[:80]}")
                if self._is_quota_error(e):
                    self._failed_keys[i] = time.time()
                errors.append(e)
                continue

        # All Gemini keys failed → Groq
        if self._groq_client:
            print(f"[KeyManager] ⚡ All Gemini keys failed → using Groq backup for stream")
            try:
                # Groq stream
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
                    temperature=temperature,
                    stream=True
                )

                def groq_generator():
                    for chunk in response:
                        if chunk.choices[0].delta.content is not None:
                            yield GroqChunk(chunk.choices[0].delta.content)
                return groq_generator()
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


class GroqChunk:
    """Makes Groq stream chunk look like Gemini chunk."""
    def __init__(self, text):
        self.text = text


key_manager = APIKeyManager()
