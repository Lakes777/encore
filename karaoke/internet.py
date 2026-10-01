"""Pedidos às APIs públicas (LRCLIB e iTunes), só com a biblioteca padrão."""

import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# O LRCLIB pede que cada app se identifique
AGENTE = "karaoke-web (projeto de estudo; github.com/Lakes777/karaoke-web)"
TEMPO_LIMITE = 15  # segundos


def pedir_json(url, parametros=None):
    if parametros:
        url = f"{url}?{urlencode(parametros)}"
    with urlopen(Request(url, headers={"User-Agent": AGENTE}), timeout=TEMPO_LIMITE) as resposta:
        return json.load(resposta)
