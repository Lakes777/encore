"""Busca de músicas no YouTube, pelo nome ou pelo link do vídeo.

Quem conversa com o YouTube é o yt-dlp. Ele fica atrás de uma função
`extrair(alvo)` que pode ser trocada nos testes, assim os testes rodam sem
internet e sem o yt-dlp instalado.
"""

import re
from dataclasses import dataclass

LIMITE_PADRAO = 5
LIMITE_MAXIMO = 20
DURACAO_PREVIA = 15  # segundos

# watch?v=, youtu.be/, shorts/, embed/ e music.youtube.com; o id tem 11 caracteres
_LINK_YOUTUBE = re.compile(
    r"^(?:https?://)?(?:www\.|m\.|music\.)?"
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/)|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})(?:[?&#/].*)?$"
)


@dataclass
class Resultado:
    id: str
    titulo: str
    canal: str
    duracao: int | None  # segundos; None quando o YouTube não informa (ex.: ao vivo)
    miniatura: str | None

    @property
    def url(self):
        return f"https://www.youtube.com/watch?v={self.id}"

    def inicio_previa(self):
        """Segundo em que a prévia começa.

        O começo da música costuma ser só introdução; um terço da duração
        normalmente já cai na voz, às vezes no refrão.
        """
        if not self.duracao or self.duracao <= DURACAO_PREVIA:
            return 0
        return min(self.duracao // 3, self.duracao - DURACAO_PREVIA)

    def para_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "canal": self.canal,
            "duracao": self.duracao,
            "miniatura": self.miniatura,
            "url": self.url,
            "inicio_previa": self.inicio_previa(),
        }


def id_do_link(texto):
    """Devolve o id do vídeo se o texto for um link do YouTube, senão None."""
    achado = _LINK_YOUTUBE.match(texto.strip())
    return achado.group(1) if achado else None


def _extrair_com_yt_dlp(alvo):
    # Importado aqui para o resto do app (e os testes) não depender do yt-dlp
    from yt_dlp import YoutubeDL

    opcoes = {"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "skip_download": True}
    with YoutubeDL(opcoes) as ydl:
        return ydl.extract_info(alvo, download=False)


def _resultado(info):
    if not info.get("id"):
        return None
    miniaturas = info.get("thumbnails") or []
    miniatura = info.get("thumbnail") or (miniaturas[-1].get("url") if miniaturas else None)
    duracao = info.get("duration")
    return Resultado(
        id=info["id"],
        titulo=info.get("title") or "(sem título)",
        canal=info.get("channel") or info.get("uploader") or "",
        duracao=int(duracao) if duracao else None,
        miniatura=miniatura,
    )


def buscar(texto, limite=LIMITE_PADRAO, extrair=_extrair_com_yt_dlp):
    """Busca pelo nome ou abre o link colado. Devolve uma lista de Resultado."""
    texto = texto.strip()
    if not texto:
        raise ValueError("Digite o nome da música ou cole o link do YouTube.")
    if not 1 <= limite <= LIMITE_MAXIMO:
        raise ValueError(f"O limite precisa ficar entre 1 e {LIMITE_MAXIMO}.")

    id_video = id_do_link(texto)
    if id_video:
        # Link colado: só aquele vídeo (o "list=" de playlist é ignorado de propósito)
        info = extrair(f"https://www.youtube.com/watch?v={id_video}")
        resultado = _resultado(info or {})
        return [resultado] if resultado else []

    info = extrair(f"ytsearch{limite}:{texto}") or {}
    resultados = (_resultado(item or {}) for item in info.get("entries") or [])
    return [r for r in resultados if r is not None]
