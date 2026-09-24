"""Metadados de overlay — estrutura de dados para composição FFmpeg.

Serve como fonte de verdade entre o Remotion (que gera os overlays)
e o FFmpeg (que os compõe sobre o vídeo tratado).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class OverlayEntry:
    """Um overlay renderizado pronto para composição."""

    id: str  # Ex: "001"
    start_sec: float
    end_sec: float
    tipo: str
    cena_dict: dict

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec

    @property
    def duration_frames(self) -> int:
        """Calcula duração em frames (assumindo 30fps por padrão)."""
        return int(round(self.duration_sec * 30))

    def to_dict(self) -> dict:
        """Retorna os dados da cena para as props do Remotion."""
        return self.cena_dict


def build_overlay_entries(
    cenas: list[dict],
    fps: int = 30,
) -> list[OverlayEntry]:
    """Converte lista de cenas do banco em OverlayEntry ordenados.

    D-186: coalesce as chaves legadas do mascote (``sapo*`` → ``mascot*``) na
    fronteira de leitura do render, para que um corte gerado antes do rename
    renderize igual (o schema do video-renderer só conhece as chaves novas).
    """
    entries: list[OverlayEntry] = []
    from app.domain.corte_mapper import coalescer_chaves_mascote
    from app.domain.time_convert import to_seg

    # Ordena por inicio para garantir sequência temporal no FFmpeg
    cenas_ordenadas = sorted(cenas, key=lambda c: to_seg(c.get("inicio", 0)))

    for idx, cena in enumerate(cenas_ordenadas):
        tipo = cena.get("tipo", "")
        inicio = to_seg(cena.get("inicio", 0))
        fim = to_seg(cena.get("fim", 0))

        if not tipo or fim <= inicio:
            continue

        entries.append(
            OverlayEntry(
                id=f"{idx + 1:03d}",
                start_sec=inicio,
                end_sec=fim,
                tipo=tipo,
                cena_dict=coalescer_chaves_mascote(cena),
            )
        )

    return entries
