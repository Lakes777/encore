"""Inicia o karaokê: python -m karaoke -> http://127.0.0.1:8000

Variáveis opcionais: KARAOKE_DADOS (pasta das músicas, padrão "dados"),
KARAOKE_MODELOS (pasta dos modelos de IA, padrão "modelos"), PORT.
"""

import os

import uvicorn

from karaoke.api import criar_app
from karaoke.fila import Fila


def main():
    pasta_dados = os.environ.get("KARAOKE_DADOS", "dados")
    fila = Fila(pasta_dados, os.environ.get("KARAOKE_MODELOS", "modelos"))
    fila.iniciar()
    # Só no próprio computador (127.0.0.1): o app não deve ficar aberto na rede
    uvicorn.run(criar_app(pasta_dados, fila), host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))


if __name__ == "__main__":
    main()
