"""Prévia dos resultados da busca, tocada pelo próprio site.

O player embutido do YouTube recusa muitas músicas de gravadora quando o site é
local (127.0.0.1). Então o yt-dlp descobre o endereço do áudio do vídeo e o
servidor repassa só os pedaços que o navegador pede (cabeçalho Range): a prévia
começa na hora, sem baixar a música inteira.

Como no resto do app, o yt-dlp e a internet ficam atrás de funções trocáveis,
para os testes rodarem sem rede.
"""

import re
import threading
import time
from urllib.request import Request, urlopen

from karaoke.download import OPCOES_YOUTUBE

_ID_VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")

# O endereço do YouTube vale algumas horas; guardado por menos que isso, ele
# serve para todos os pedaços da mesma prévia sem chamar o yt-dlp de novo.
VALIDADE = 30 * 60  # segundos
TAMANHO_DO_PEDACO = 64 * 1024
TEMPO_LIMITE = 15  # segundos

# Cabeçalhos da resposta do YouTube que o navegador precisa para tocar e pular
CABECALHOS_REPASSADOS = ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges")


def _extrair_com_yt_dlp(id_video):
    from yt_dlp import YoutubeDL

    # m4a (AAC) toca em todos os navegadores; o opus/webm não toca em todos
    opcoes = {**OPCOES_YOUTUBE, "quiet": True, "no_warnings": True, "noplaylist": True,
              "format": "bestaudio[ext=m4a]/bestaudio"}
    info = YoutubeDL(opcoes).extract_info(f"https://www.youtube.com/watch?v={id_video}", download=False)
    return info["url"], info.get("http_headers") or {}


def _abrir_com_urllib(url, cabecalhos):
    return urlopen(Request(url, headers=cabecalhos), timeout=TEMPO_LIMITE)


class Previas:
    def __init__(self, extrair=_extrair_com_yt_dlp, abrir=_abrir_com_urllib, relogio=time.monotonic):
        self._extrair, self._abrir, self._relogio = extrair, abrir, relogio
        self._enderecos = {}  # id_video -> (url, cabeçalhos, vale_até)
        self._trava = threading.Lock()

    def _endereco(self, id_video):
        agora = self._relogio()
        with self._trava:
            guardado = self._enderecos.get(id_video)
            if guardado and guardado[2] > agora:
                return guardado[0], guardado[1]
            # Esquece os vencidos para a memória não crescer sem fim
            self._enderecos = {k: v for k, v in self._enderecos.items() if v[2] > agora}
        url, cabecalhos = self._extrair(id_video)
        with self._trava:
            self._enderecos[id_video] = (url, cabecalhos, agora + VALIDADE)
        return url, cabecalhos

    def abrir(self, id_video, faixa_de_bytes=None):
        """Abre o áudio do vídeo e devolve (status, cabeçalhos, pedaços).

        `faixa_de_bytes` é o cabeçalho Range do navegador (ex.: "bytes=0-"), repassado
        como veio. `pedaços` é um gerador que fecha a conexão quando acaba.
        """
        if not _ID_VIDEO.match(id_video):
            raise ValueError(f"Id de vídeo inválido: {id_video!r}.")
        url, cabecalhos = self._endereco(id_video)
        pedido = dict(cabecalhos)
        if faixa_de_bytes:
            pedido["Range"] = faixa_de_bytes
        resposta = self._abrir(url, pedido)
        repassar = {nome: resposta.headers[nome] for nome in CABECALHOS_REPASSADOS if resposta.headers.get(nome)}

        def pedacos():
            try:
                while pedaco := resposta.read(TAMANHO_DO_PEDACO):
                    yield pedaco
            finally:
                resposta.close()

        return getattr(resposta, "status", 200), repassar, pedacos()
