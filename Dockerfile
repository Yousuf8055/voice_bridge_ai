FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Whisper tiny model at BUILD TIME so it's baked into the image
# This eliminates the 3-5 minute download delay on every cold start
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8'); print('Model pre-downloaded successfully!')"

# Copy the backend code
COPY backend/ .

# Run Daphne ASGI server using the PORT environment variable (Render sets this automatically)
CMD ["sh", "-c", "daphne -b 0.0.0.0 -p ${PORT:-8000} core.asgi:application"]
