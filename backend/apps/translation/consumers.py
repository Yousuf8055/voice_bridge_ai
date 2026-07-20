import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from deep_translator import GoogleTranslator

# Note: Whisper STT engine has been removed from backend.
# STT is now handled instantly by the browser natively.
# This backend now solely handles ultra-fast text translation.

class STTStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        print("[CONNECT] Web Speech API Text Translator Connected")

    async def disconnect(self, close_code):
        print(f"[DISCONNECT] Code: {close_code}")

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
            msg_type = data.get("type")
            
            if msg_type == "PING":
                # Handle keepalive ping
                return
                
            if msg_type == "TRANSLATE":
                text = data.get("text", "")
                input_lang = data.get("input", "en")
                target_lang = data.get("target", "en")
                is_final = data.get("isFinal", False)
                
                if not text:
                    return

                # If languages are the same, just return the text
                if input_lang == target_lang:
                    translated_text = text
                else:
                    translated_text = await self.translate_text(text, input_lang, target_lang)

                await self.send(text_data=json.dumps({
                    "status": "final" if is_final else "interim",
                    "transcript": translated_text,
                    "lang": target_lang,
                }))
                
        except Exception as e:
            print(f"[ERROR] {e}")

    async def translate_text(self, text, input_iso, target_lang_iso):
        """Uses deep_translator (Google Translate) for lightning-fast, highly accurate translation."""
        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                lambda: GoogleTranslator(source=input_iso, target=target_lang_iso).translate(text)
            )
            return result if result else text
        except Exception as e:
            print(f"[TRANSLATION ERROR]: {e}")
            return text
