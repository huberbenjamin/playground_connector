import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    API_BASE_URL = "https://27d3-2001-4ca0-e-49-1cbc-6e9c-e6dd-4c2e.ngrok-free.app" # without the last /
