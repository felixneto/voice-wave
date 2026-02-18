from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import io

from faster_whisper import WhisperModel


print('\n\n »» Loading Model')
transcription_model = WhisperModel(
        "small",
        device="cuda", # -> or "cpu"
        compute_type="int8" # -> or "int8_float16"/"float16" depending on device (cpu/gpu usage)
    )
print('\n »» Model Loaded')


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:4200', 'http://localhost:8000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/')
def root():
    return {'msg': "Auth server running"}


VOICE_LANG_MAP = {
    "en": "en-GB",
    "pt": "pt-PT",
    "es": "es-ES",
    "fr": "fr-FR",
    "de": "de-DE",
    "it": "it-IT",
    "nl": "nl-NL",
}


@app.post("/api/handle_transcription")
async def handle_transcription(file: UploadFile = File(...)):
    print('\n\n ?????? ? file: ', file)
    contents = await file.read()

    segments, info = transcription_model.transcribe(
        io.BytesIO(contents),
        beam_size=5
    )

    full_text = " ".join(segment.text for segment in segments).strip()
    
    lang = VOICE_LANG_MAP.get(info.language.lower(), 'en-GB')
    print('\n = language_detected: ', info.language.lower(), 'format: ', lang)

    return {"text": full_text, 'language': lang}
