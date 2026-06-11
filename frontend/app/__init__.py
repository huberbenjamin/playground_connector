from flask import Flask
from dotenv import load_dotenv

from .config import Config
from .routes import main_bp


def create_app():
    load_dotenv()

    app = Flask(__name__)
    app.config.from_object(Config)

    app.register_blueprint(main_bp)

    return app
