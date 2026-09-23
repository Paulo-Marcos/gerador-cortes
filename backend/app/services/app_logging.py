"""Caminho antigo do logging operacional, que mora em `app.core.logging` (ADR-0015).

É o MESMO módulo, não uma cópia. A fila de escrita, a thread, o contador de
descarte e o `print` original capturado são estado de módulo: duas cópias
partiriam esse estado, e um monkeypatch pelo caminho antigo cairia na cópia
errada. Por isso este caminho aponta, em `sys.modules`, para o objeto do core.

Aqui também se registra de onde vem o nível de log, porque o `core` não pode
importar `services`. O `main.py` importa este caminho no boot, então o registro
acontece antes da primeira requisição. Morre no D-709, quando os importadores
passarem a usar o caminho novo.
"""

import sys

from app.core import logging as _logging_do_core
from app.services.app_settings import AppSettingsService

_logging_do_core.definir_fonte_do_nivel(lambda: AppSettingsService.get().log_level)
sys.modules[__name__] = _logging_do_core
