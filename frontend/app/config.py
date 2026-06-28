import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    API_BASE_URL = "https://22c3-2a02-810d-2b99-2200-3178-3c22-770b-3cf6.ngrok-free.app"
