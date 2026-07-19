FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code
COPY backend/ .

# Run Daphne ASGI server using the PORT environment variable (Render sets this automatically)
CMD ["sh", "-c", "daphne -b 0.0.0.0 -p ${PORT:-8000} core.asgi:application"]
