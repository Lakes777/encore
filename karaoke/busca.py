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

# Clipe: o áudio do vídeo costuma ter introdução falada, cenas ou outra edição, e
# aí a letra do LRCLIB e o instrumental pronto não batem com ele.
_CLIPE = re.compile(
    r"official\s+(?:\w+\s+)?v[ií]deo|music\s+v[ií]deo|v[ií]deo\s*clip|videoclipe|\bclipe\b|\bclip\s+oficial"
    r"|v[ií]deo\s+oficial|[(\[]\s*(?:official\s+)?(?:v[ií]deo|mv)\s*[)\]]|\bofficial\s+mv\b",
    re.IGNORECASE,
)
# Áudio da música: o mesmo do disco, que é o que a letra e o instrumental seguem
_AUDIO = re.compile(r"official\s+audio|[aá]udio\s+oficial|[(\[]\s*[aá]udio\s*[)\]]", re.IGNORECASE)
# Vídeo com a letra (lyric video): usa o áudio do disco. Só entre parênteses ou
# colchetes, porque "Letra" ou "Lyric" podem ser parte do nome da música.
_LETRA = re.compile(r"[(\[][^)\]]*\b(?:lyrics?|letra)\b", re.IGNORECASE)
# Ao vivo: outra gravação, com andamento e partes diferentes do disco. "Live" e
# "Ao Vivo" soltos não bastam, porque aparecem em nome de música ("Show Me How to
# Live", "The World We Live In", "Ao Vivo e a Cores"): só entre parênteses ou
# colchetes, depois de um separador ("- Live", "| Live in Cuba") ou com onde foi.
_AO_VIVO = re.compile(
    r"[(\[][^)\]]*\b(?:live|ao\s+vivo|en\s+vivo|unplugged|ac[uú]stico|acoustic)\b"
    r"|[-–—]\s*live\b\s*(?:[(\[!]|\d{4}|$|at\b|from\b)"
    r"|\|\s*live\b"
    r"|\blive\s+(?:at|from)\b"
    r"|\b(?:ao|en)\s+vivo\s*(?:$|[(\[!]|n[oa]\b|em\b|en\b)"
    r"|\bunplugged\b|\bac[uú]stico\s+mtv\b|\btiny\s+desk\b|\bsessions?\s+@",
    re.IGNORECASE,
)

CLIPE, AUDIO, AO_VIVO = "clipe", "audio", "ao_vivo"


def tipo_do_video(titulo, canal):
    """"audio" (o áudio do disco), "clipe" (pode ter partes a mais), "ao_vivo" (outra
    gravação) ou None (não dá para saber)."""
    if _AO_VIVO.search(titulo):  # antes do Topic: disco ao vivo também sai no canal Topic
        return AO_VIVO
    if canal.endswith(" - Topic"):  # canal automático do YouTube Music: sempre o áudio do disco
        return AUDIO
    if _LETRA.search(titulo):  # antes do clipe: "(Official Lyric Video)" é áudio do disco
        return AUDIO
    if _CLIPE.search(titulo):
        return CLIPE
    if _AUDIO.search(titulo):
        return AUDIO
    return None


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

    @property
    def tipo(self):
        return tipo_do_video(self.titulo, self.canal)

    def para_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "canal": self.canal,
            "duracao": self.duracao,
            "miniatura": self.miniatura,
            "url": self.url,
            "inicio_previa": self.inicio_previa(),
            "tipo": self.tipo,
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
    # Áudio da música primeiro, depois clipes e por último ao vivo; no resto, a ordem do YouTube
    ordem = {AUDIO: 0, None: 1, CLIPE: 2, AO_VIVO: 3}
    return sorted((r for r in resultados if r is not None), key=lambda r: ordem[r.tipo])
