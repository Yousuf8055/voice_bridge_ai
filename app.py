import os
import subprocess
import sys

def main():
    # Hugging Face Spaces with Gradio SDK will automatically run this app.py file.
    # We want to run our Django Daphne server instead of Gradio.
    
    # Change directory to where our Django project is
    os.chdir("backend")
    
    # Start the Daphne server on port 7860 (Hugging Face default)
    print("Starting Daphne server on port 7860...")
    subprocess.run([sys.executable, "-m", "daphne", "-b", "0.0.0.0", "-p", "7860", "core.asgi:application"])

if __name__ == "__main__":
    main()
