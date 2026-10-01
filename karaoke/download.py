"""Download do áudio de um vídeo do YouTube (yt-dlp + ffmpeg).

Como na busca, o yt-dlp fica atrás de uma função trocável (`baixar`), para os
testes rodarem sem internet.
"""

import re
from pathlib import Path

NOME_ORIGINAL = "original"
FORMATO = "wav"  # o audio-separator lê qualquer formato, mas WAV evita reconverter

_ID_VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _baixar_com_yt_dlp(url, modelo_nome, ao_progredir):
    from yt_dlp import YoutubeDL

    def gancho(estado):
        total = estado.get("total_bytes") or estado.get("total_bytes_estimate")
        if estado.get("status") == "downloading" and total:
            ao_progredir(min(estado.get("downloaded_bytes", 0) / total, 1.0))

    opcoes = {
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


def baixar_audio(id_video, pasta, ao_progredir=None, baixar=_baixar_com_yt_dlp):
    """Baixa o áudio para pasta/original.wav e devolve esse caminho.

    `ao_progredir(fracao)` recebe de 0 a 1 enquanto baixa (para a fila mostrar).
    """
    if not _ID_VIDEO.match(id_video):
        raise ValueError(f"Id de vídeo inválido: {id_video!r}.")
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"{NOME_ORIGINAL}.{FORMATO}"

    baixar(
        f"https://www.youtube.com/watch?v={id_video}",
        str(pasta / f"{NOME_ORIGINAL}.%(ext)s"),
        ao_progredir or (lambda fracao: None),
    )
    if not destino.exists():
        raise RuntimeError("O download terminou, mas o áudio não apareceu. O ffmpeg está instalado?")
    return destino
