import asyncio
import sys
from pathlib import Path

from googleapiclient.discovery import build

# Add backend directory to sys.path so we can import from app
sys.path.append(str(Path(__file__).parent))
from app.services.youtube import YouTubeService


async def main():
    if len(sys.argv) < 2:
        print("Uso: python check_video.py <VIDEO_ID>")
        return

    video_id = sys.argv[1]

    creds, msg = YouTubeService._get_credentials()
    if not creds:
        print(f"Erro credenciais: {msg}")
        return

    youtube = build("youtube", "v3", credentials=creds)

    print(f"Buscando status do video {video_id}...")
    request = youtube.videos().list(part="snippet,status,processingDetails", id=video_id)
    response = request.execute()

    if not response.get("items"):
        print("Video não encontrado!")
        return

    item = response["items"][0]
    print("\n--- STATUS DO YOUTUBE ---")
    print(f"Título: {item['snippet']['title']}")
    print(f"Status Upload: {item['status']['uploadStatus']}")
    print(f"Status Privacidade: {item['status']['privacyStatus']}")

    if "processingDetails" in item:
        proc = item["processingDetails"]
        print(f"Status Processamento: {proc.get('processingStatus')}")
        print(f"Status Partes: {proc.get('partsTotal')} total, {proc.get('partsProcessed')} feitas")
        print(f"Progresso: {proc.get('processingProgress', {}).get('partsProcessed', 0)}")
    else:
        print("processingDetails está ausente (isso significa que parou ou falhou brutalmente)")
        print("Motivo falha:", item["status"].get("failureReason", "N/A"))
        print("Motivo rejeição:", item["status"].get("rejectionReason", "N/A"))


if __name__ == "__main__":
    asyncio.run(main())
