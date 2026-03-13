"""
Configurações do CortadorLive (via variáveis de ambiente)
"""

from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    # Backend
    projetos_dir: str = "./projetos"
    assets_dir: str = "./assets"

    # n8n
    n8n_base_url: str = "http://localhost:5678"
    n8n_webhook_analise: str = ""   # ID do webhook de análise de transcrição
    n8n_webhook_metadados: str = "" # ID do webhook de geração de metadados

    # Gemini (para thumbnails)
    gemini_api_key: str = ""

    # yt-dlp
    ytdlp_format: str = "bestvideo+bestaudio/best"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
