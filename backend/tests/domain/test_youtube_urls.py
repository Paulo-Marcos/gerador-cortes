import pytest
from app.domain.youtube_urls import extract_youtube_video_id


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("ZcvZLOResPc", "ZcvZLOResPc"),
        ("https://youtu.be/ZcvZLOResPc", "ZcvZLOResPc"),
        ("https://www.youtube.com/watch?v=ZcvZLOResPc&t=12", "ZcvZLOResPc"),
        ("https://youtube.com/shorts/ZcvZLOResPc?feature=share", "ZcvZLOResPc"),
        ("https://www.youtube.com/live/ZcvZLOResPc", "ZcvZLOResPc"),
        ("https://www.youtube-nocookie.com/embed/ZcvZLOResPc", "ZcvZLOResPc"),
    ],
)
def test_extract_youtube_video_id_aceita_formatos_comuns(value: str, expected: str):
    assert extract_youtube_video_id(value) == expected


def test_extract_youtube_video_id_rejeita_url_sem_video_id():
    with pytest.raises(ValueError, match="video_id"):
        extract_youtube_video_id("https://www.youtube.com/watch?list=playlist")
