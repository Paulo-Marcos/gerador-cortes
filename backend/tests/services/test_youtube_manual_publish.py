import pytest
from app.services.youtube import _publication_payload_from_youtube_item


def test_publication_payload_from_youtube_item_retorna_dados_do_video_agendado():
    item = {
        "snippet": {"title": "Capitalismo como sistema-mundo"},
        "status": {
            "privacyStatus": "private",
            "uploadStatus": "processed",
            "publishAt": "2026-05-25T00:45:00Z",
        },
    }

    payload = _publication_payload_from_youtube_item("ZcvZLOResPc", item)

    assert payload == {
        "status": "ok",
        "video_id": "ZcvZLOResPc",
        "url": "https://youtu.be/ZcvZLOResPc",
        "titulo": "Capitalismo como sistema-mundo",
        "privacy_status": "private",
        "upload_status": "processed",
        "scheduled_at": "2026-05-25T00:45:00Z",
        "mensagem": "Video confirmado no YouTube e marcado no banco.",
    }


def test_publication_payload_from_youtube_item_rejeita_upload_falhado():
    item = {"snippet": {"title": "Falhou"}, "status": {"uploadStatus": "failed"}}

    with pytest.raises(ValueError, match="uploadStatus"):
        _publication_payload_from_youtube_item("ZcvZLOResPc", item)
