"""Caminho antigo do store do settings.db, que mora em `app.infrastructure.settings_store`.

É o MESMO módulo, não uma cópia: o cache de schema já garantido é estado de
módulo, e um monkeypatch pelo caminho antigo precisa cair no objeto certo. Por
isso este caminho aponta, em `sys.modules`, para o módulo da infraestrutura
(ADR-0015: atalho só enquanto há importador que não pode mudar). Quem ainda usa
este caminho é o `main.py` e o `services/app_settings.py`, travados. Morre no
D-709, quando eles passarem ao caminho novo.
"""

import sys

from app.infrastructure import settings_store as _store

sys.modules[__name__] = _store
