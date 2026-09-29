"""Onde estão o Chrome e o Edge nesta máquina (D-832).

Moravam separados: o Chrome dentro de `navegador_assistido`, o Edge dentro do
robô do ChatGPT (D-804). Com o operador escolhendo o navegador do TikTok e do
Instagram, os dois robôs passaram a precisar dos dois — e procurar executável
no disco é mundo externo, não regra de robô.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from app.config import settings


def chrome_no_disco() -> Path | None:
    """O Chrome da máquina: o do `CHROME_PATH`, se definido, ou o instalado."""
    if settings.chrome_path:
        # Caminho explícito manda: não cair num Chrome diferente do escolhido.
        configurado = Path(settings.chrome_path)
        return configurado if configurado.is_file() else None
    candidatos = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path.home() / "AppData/Local/Google/Chrome/Application/chrome.exe",
    ]
    for caminho in candidatos:
        if caminho.is_file():
            return caminho
    achado = shutil.which("chrome") or shutil.which("google-chrome")
    return Path(achado) if achado else None


def edge_no_disco() -> Path | None:
    """O Edge da máquina, ou None.

    Para o CDP tanto faz: os dois são Chromium, e porta, perfil e conexão
    seguem iguais.
    """
    candidatos = [
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    ]
    achado = next((c for c in candidatos if c.is_file()), None)
    if achado is None and (no_path := shutil.which("msedge")):
        achado = Path(no_path)
    return achado
