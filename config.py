import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'heymira-secret-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///heymira.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max upload
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

    @staticmethod
    def get_all_api_keys():
        keys = []
        primary = os.environ.get('GEMINI_API_KEY', '')
        if primary:
            keys.append(primary)
        for i in range(2, 11):
            key = os.environ.get(f'GEMINI_API_KEY_{i}', '')
            if key:
                keys.append(key)
        return keys
