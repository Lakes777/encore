"""Download do áudio de um vídeo do YouTube (yt-dlp + ffmpeg).

Como na busca, o yt-dlp fica atrás de uma função trocável (`baixar`), para os
testes rodarem sem internet.
"""

import re
import time
from pathlib import Path

NOME_ORIGINAL = "original"
FORMATO = "wav"  # o audio-separator lê qualquer formato, mas WAV evita reconverter

# O YouTube pede um JavaScript para liberar os formatos; sem ele o yt-dlp avisa
# "No supported JavaScript runtime" e às vezes leva 403. O padrão é só o deno;
# o node entra como segunda opção (o yt-dlp usa o primeiro que achar no PATH).
OPCOES_YOUTUBE = {"js_runtimes": {"deno": {}, "node": {}}}

TENTATIVAS = 2  # o 403 do YouTube costuma ser passageiro: tenta mais uma vez
ESPERA_ENTRE_TENTATIVAS = 3  # segundos

_ID_VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _baixar_com_yt_dlp(url, modelo_nome, ao_progredir):
    from yt_dlp import YoutubeDL

    def gancho(estado):
        total = estado.get("total_bytes") or estado.get("total_bytes_estimate")
        if estado.get("status") == "downloading" and total:
            ao_progredir(min(estado.get("downloaded_bytes", 0) / total, 1.0))

    opcoes = {
        **OPCOES_YOUTUBE,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": "bestaudio/best",
        "outtmpl": modelo_nome,
        "progress_hooks": [gancho],
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": FORMATO}],
    }
    with YoutubeDL(opcoes) as ydl:
        ydl.download([url])


def _recusado(erro):
    # "HTTP Error 403" e não só "403": o id do vídeo, que vem na mensagem, pode ter "403"
    return "HTTP Error 403" in str(erro) or "Forbidden" in str(erro)


def baixar_audio(id_video, pasta, ao_progredir=None, baixar=_baixar_com_yt_dlp, esperar=time.sleep):
    """Baixa o áudio para pasta/original.wav e devolve esse caminho.

    `ao_progredir(fracao)` recebe de 0 a 1 enquanto baixa (para a fila mostrar).
    Se o YouTube recusar (403), tenta de novo; se recusar sempre, explica o que fazer.
    """
    if not _ID_VIDEO.match(id_video):
        raise ValueError(f"Id de vídeo inválido: {id_video!r}.")
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"{NOME_ORIGINAL}.{FORMATO}"

    for tentativa in range(1, TENTATIVAS + 1):
        try:
            baixar(
                f"https://www.youtube.com/watch?v={id_video}",
                str(pasta / f"{NOME_ORIGINAL}.%(ext)s"),
                ao_progredir or (lambda fracao: None),
            )
            break
        except Exception as erro:
            if not _recusado(erro):
                raise
            if tentativa == TENTATIVAS:
                raise RuntimeError(
                    "O YouTube recusou o download (erro 403). Tente de novo daqui a pouco; se continuar, "
                    "atualize o yt-dlp (pip install -U \"yt-dlp[default]\") e confira se o node ou o deno "
                    "estão instalados."
                ) from erro
            esperar(ESPERA_ENTRE_TENTATIVAS)
    if not destino.exists():
        raise RuntimeError("O download terminou, mas o áudio não apareceu. O ffmpeg está instalado?")
    return destino
