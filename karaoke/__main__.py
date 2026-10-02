"""Inicia o karaokê: python -m karaoke -> http://127.0.0.1:8000

Variáveis opcionais: KARAOKE_DADOS (pasta das músicas, padrão "dados"),
KARAOKE_MODELOS (pasta dos modelos de IA, padrão "modelos"), PORT.
O site precisa estar compilado antes (cd web && npm run build); sem ele, só a API funciona.
"""

import os
from pathlib import Path

import uvicorn

from karaoke.api import criar_app
from karaoke.fila import Fila
from karaoke.separacao import detectar_dispositivo, modo_padrao

PASTA_SITE = Path(__file__).resolve().parent.parent / "web" / "dist"


def main():
    pasta_dados = os.environ.get("KARAOKE_DADOS", "dados")
    # Sem versão pronta, separa com o melhor modo que o computador aguenta
    dispositivo = detectar_dispositivo()
    fila = Fila(pasta_dados, os.environ.get("KARAOKE_MODELOS", "modelos"), modo_reserva=modo_padrao(dispositivo))
    fila.iniciar()
    # Só no próprio computador (127.0.0.1): o app não deve ficar aberto na rede
    uvicorn.run(criar_app(pasta_dados, fila, dispositivo=dispositivo, pasta_site=PASTA_SITE), host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))


if __name__ == "__main__":
    main()
