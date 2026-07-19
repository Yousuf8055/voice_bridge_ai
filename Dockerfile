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

# Expose the Hugging Face standard port
EXPOSE 7860

# Run Daphne ASGI server
CMD ["daphne", "-b", "0.0.0.0", "-p", "7860", "core.asgi:application"]
