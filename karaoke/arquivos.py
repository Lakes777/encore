"""Gravação de arquivos que outros podem estar lendo ao mesmo tempo."""

import os
import tempfile
from pathlib import Path


def gravar_de_uma_vez(caminho, texto):
    """Grava num provisório com nome único e troca de uma vez.

    Quem lê nunca vê o arquivo pela metade, e duas gravações ao mesmo tempo (servidor
    e `python -m karaoke.ritmo`, ou dois pedidos do site) não usam o mesmo provisório:
    com um nome fixo, uma apagava ou trocava o provisório da outra no meio.
    """
    caminho = Path(caminho)
    descritor, provisorio = tempfile.mkstemp(dir=caminho.parent, prefix=f".{caminho.name}.", suffix=".tmp")
    try:
        with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
            arquivo.write(texto)
        os.replace(provisorio, caminho)
    except BaseException:
        Path(provisorio).unlink(missing_ok=True)
        raise
