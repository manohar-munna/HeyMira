import asyncio
import json
import websockets
import ssl
import certifi
from urllib.parse import urlparse, parse_qs
import threading
import os

# Use the standard model for the Live API
MODEL_NAME = "gemini-3.1-flash-live-preview"

async def proxy_gemini(websocket, default_api_key=None):
    # Get API key from the query string
    path = websocket.request.path
    query = urlparse(path).query
    params = parse_qs(query)
    api_key = params.get('key', [None])[0] or default_api_key

    if not api_key:
        await websocket.close(1008, "API Key is missing")
        return

    ws_url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={api_key}"
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    try:
        # Connect to Gemini API using the websockets library
        async with websockets.connect(ws_url, ssl=ssl_context) as gemini_ws:
            print("Connected to Gemini Live API from Backend")

            # 1. Send initial setup config from backend instantly upon connection
            setup_msg = {
                "setup": {
                    "model": f"models/{MODEL_NAME}",
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {"voiceName": "Aoede"}
                            }
                        }
                    },
                    "systemInstruction": {
                        "parts": [{"text": "You are a friendly, witty AI avatar inside a web browser. You support and can speak multiple languages including Telugu, Hindi, and English. Respond in the language the user speaks to you. Give very short, conversational responses."}]
                    }
                }
            }
            await gemini_ws.send(json.dumps(setup_msg))

            async def client_to_gemini():
                try:
                    async for message in websocket:
                        await gemini_ws.send(message)
                except websockets.exceptions.ConnectionClosed:
                    pass
                except Exception as e:
                    print(f"Error in client_to_gemini: {e}")

            async def gemini_to_client():
                try:
                    async for message in gemini_ws:
                        if isinstance(message, bytes):
                            message = message.decode('utf-8')
                        await websocket.send(message)
                except websockets.exceptions.ConnectionClosed:
                    pass
                except Exception as e:
                    print(f"Error in gemini_to_client: {e}")

            await asyncio.gather(client_to_gemini(), gemini_to_client())
            
    except Exception as e:
        print(f"Failed to connect or communicate with Gemini: {e}")
        await websocket.close(1011, "Internal server error connecting to Gemini")

def start_proxy(port=5001, default_api_key=None):
    async def main():
        async with websockets.serve(lambda ws: proxy_gemini(ws, default_api_key), "0.0.0.0", port):
            print(f"WebSocket Proxy running at ws://0.0.0.0:{port}")
            await asyncio.Future()  # run forever

    def run_loop():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main())

    thread = threading.Thread(target=run_loop, daemon=True)
    thread.start()
    return thread
