import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    API_BASE_URL = "https://82a9-2a09-80c0-192-0-655d-4c30-ccdc-f278.ngrok-free.app" # without the last /
