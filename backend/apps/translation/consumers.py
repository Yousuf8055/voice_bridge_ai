import json
import asyncio
import numpy as np
import httpx
from channels.generic.websocket import AsyncWebsocketConsumer
from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator

print("[BOOT] Loading Whisper 'base' model...")
_STT_ENGINE = WhisperModel("base", device="cpu", compute_type="int8")
print("[BOOT] Whisper model ready.")

WHISPER_LANG_TO_ISO = {
    "english": "en", "hindi": "hi", "telugu": "te", "tamil": "ta",
    "kannada": "kn", "malayalam": "ml", "bengali": "bn", "marathi": "mr",
    "gujarati": "gu", "punjabi": "pa", "odia": "or", "urdu": "ur",
    "assamese": "as", "nepali": "ne", "sindhi": "sd", "sanskrit": "sa",
    "maithili": "mai", "konkani": "kok", "kashmiri": "ks",
    "manipuri": "mni", "santhali": "sat", "dogri": "doi", "bodo": "brx",
    "en": "en", "hi": "hi", "te": "te", "ta": "ta", "kn": "kn",
    "ml": "ml", "bn": "bn", "mr": "mr", "gu": "gu", "pa": "pa",
    "or": "or", "ur": "ur", "as": "as", "ne": "ne", "sd": "sd",
    "sa": "sa", "mai": "mai", "kok": "kok", "ks": "ks", "mni": "mni",
    "sat": "sat", "doi": "doi", "brx": "brx",
}

ISO_TO_NAME = {
    "en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil",
    "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali", "mr": "Marathi",
    "gu": "Gujarati", "pa": "Punjabi", "or": "Odia", "ur": "Urdu",
    "as": "Assamese", "ne": "Nepali", "sd": "Sindhi", "sa": "Sanskrit",
    "mai": "Maithili", "kok": "Konkani", "ks": "Kashmiri", "mni": "Manipuri",
    "sat": "Santhali", "doi": "Dogri", "brx": "Bodo"
}

class STTStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.audio_buffer = []
        self.is_connected = True
        self.client_sample_rate = 48000
        
        self.last_finalized_text = ""
        self.last_translated_raw = ""
        self.last_translated_result = ""
        self.translation_task = None
        
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        params = dict(x.split("=") for x in query_string.split("&") if "=" in x)
        self.target_lang_code = params.get("target", "en")
        self.input_lang_code = params.get("input", "en")
        
        print(f"[CONNECT] Target: {self.target_lang_code} | Input: {self.input_lang_code}")
        
        # Start background loop for true real-time streaming
        self.process_task = asyncio.create_task(self.process_audio_loop())

    async def disconnect(self, close_code):
        self.is_connected = False
        self.process_task.cancel()
        self.audio_buffer.clear()
        print(f"[DISCONNECT] Code: {close_code}")

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            try:
                data = json.loads(text_data)
                msg_type = data.get("type")
                if msg_type == "CHANGE_LANGUAGE":
                    self.target_lang_code = data.get("target", self.target_lang_code)
                    self.input_lang_code = data.get("input", self.input_lang_code)
                    print(f"[LANG] Input: {self.input_lang_code} -> Target: {self.target_lang_code}")
                elif msg_type == "SAMPLE_RATE":
                    rate = int(data.get("rate", 48000))
                    self.client_sample_rate = rate
                    print(f"[CALIBRATE] Rate: {rate}Hz")
            except Exception as e:
                pass
            return

        if bytes_data:
            chunk = np.frombuffer(bytes_data, dtype=np.float32).copy()
            self.audio_buffer.extend(chunk.tolist())

    async def process_audio_loop(self):
        while self.is_connected:
            await asyncio.sleep(0.25)  # Wake up every 250ms for ULTRA FAST live updates
            
            # Need at least 0.4s of audio to start making sense
            if len(self.audio_buffer) < int(self.client_sample_rate * 0.4):
                continue
                
            snapshot = list(self.audio_buffer)
            audio_data = np.array(snapshot, dtype=np.float32)
            
            # 1. Determine if this is the 'final' chunk (silence detected at the end)
            is_final = False
            # Check last 0.4s for silence
            tail_samples = int(self.client_sample_rate * 0.4)
            if len(audio_data) > tail_samples:
                tail = audio_data[-tail_samples:]
                if np.max(np.abs(tail)) < 0.015:
                    is_final = True
                    
            # Force final if buffer gets too large (e.g. 15 seconds) to prevent OOM
            if len(audio_data) > self.client_sample_rate * 15.0:
                is_final = True
                
            # If final, clear the buffer so the next sentence starts fresh
            if is_final:
                self.audio_buffer = self.audio_buffer[len(snapshot):]

            # 2. Resample to 16kHz for Whisper
            if self.client_sample_rate != 16000:
                ratio = 16000 / self.client_sample_rate
                target_len = int(len(audio_data) * ratio)
                indices = np.linspace(0, len(audio_data) - 1, target_len)
                audio_data = np.interp(indices, np.arange(len(audio_data)), audio_data).astype(np.float32)

            max_val = np.max(np.abs(audio_data))
            if max_val > 1.0: audio_data = audio_data / max_val
            elif max_val < 1e-4: continue

            # Provide context for phonetic names
            prompt_context = self.last_finalized_text[-200:] if self.last_finalized_text else "Hello, this is Yusuf from Hyderabad."

            # 3. Transcribe
            loop = asyncio.get_running_loop()
            try:
                segments, info = await loop.run_in_executor(
                    None,
                    lambda: _STT_ENGINE.transcribe(
                        audio_data,
                        beam_size=3,            # High accuracy for names
                        language=self.input_lang_code, 
                        vad_filter=True,
                        vad_parameters={"min_silence_duration_ms": 200},
                        condition_on_previous_text=False,
                        initial_prompt=prompt_context
                    ),
                )
            except Exception as e:
                print(f"[ENGINE ERROR]: {e}")
                continue

            new_text = " ".join(seg.text for seg in segments).strip()
            
            if not new_text or len(new_text) < 2:
                continue

            if is_final:
                self.last_finalized_text += " " + new_text
                self.last_finalized_text = self.last_finalized_text[-500:]

            print(f"[{'FINAL' if is_final else 'INTERIM'}] {new_text}")

            # 4. Translate if necessary
            input_iso = WHISPER_LANG_TO_ISO.get(self.input_lang_code.lower(), self.input_lang_code)
            
            if input_iso == self.target_lang_code:
                translated_text = new_text
            else:
                # Cache to prevent unnecessary API calls
                if new_text == self.last_translated_raw and self.last_translated_result:
                    translated_text = self.last_translated_result
                else:
                    translated_text = await self.translate_text(new_text, input_iso, self.target_lang_code)
                    self.last_translated_raw = new_text
                    self.last_translated_result = translated_text
                    
            if not translated_text:
                translated_text = new_text

            # 5. Send to frontend
            try:
                await self.send(text_data=json.dumps({
                    "status": "final" if is_final else "interim",
                    "transcript": translated_text,
                    "lang": self.target_lang_code,
                }))
            except Exception:
                pass

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
