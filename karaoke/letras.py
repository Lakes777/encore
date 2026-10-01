"""Letras sincronizadas: busca no LRCLIB (lrclib.net) e leitura do formato .lrc.

Uma linha .lrc é "[mm:ss.xx] texto": o momento em que o verso começa. A
mesma linha pode ter vários tempos (refrão repetido) e o arquivo pode ter
"[offset:+500]", que adianta ou atrasa tudo em milissegundos.
"""

import re
from dataclasses import dataclass

from karaoke.internet import pedir_json

URL_BUSCA = "https://lrclib.net/api/search"
URL_LETRA = "https://lrclib.net/api/get/{id}"

# Pedaços que o YouTube põe no título e que atrapalham a busca da letra
_ENFEITES = re.compile(
    r"\s*[\(\[][^\)\]]*\b(remaster|official|oficial|video|vídeo|audio|áudio|lyric|letra|hd|4k|live|ao vivo|mono|stereo)"
    r"[^\)\]]*[\)\]]",
    re.IGNORECASE,
)
_TEMPO = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
_OFFSET = re.compile(r"^\[offset:\s*([+-]?\d+)\]", re.IGNORECASE)


def limpar_titulo(titulo, artista=""):
    """'The Beatles - Help! (Remastered 2015)' -> ('Help!', 'The Beatles')."""
    titulo = _ENFEITES.sub("", titulo).strip()
    if " - " in titulo:
        antes, depois = (parte.strip() for parte in titulo.split(" - ", 1))
        # "Artista - Título": se o artista já é conhecido, confere; senão, confia no formato
        if not artista or antes.casefold() == artista.casefold():
            artista, titulo = antes, depois
            if " - " in titulo and titulo.split(" - ", 1)[0].strip().casefold() == artista.casefold():
                titulo = titulo.split(" - ", 1)[1].strip()  # "The Beatles - The Beatles - Help!"
    return titulo, artista


@dataclass
class VersaoLetra:
    id: int
    titulo: str
    artista: str
    album: str
    duracao: float | None
    sincronizada: bool
    instrumental: bool

    def diferenca(self, duracao_musica):
        """Quantos segundos a versão da letra difere da música (None se não der para saber)."""
        if not duracao_musica or self.duracao is None:
            return None
        return round(abs(self.duracao - duracao_musica), 1)

    def para_dict(self, duracao_musica=None):
        return {
            "id": self.id, "titulo": self.titulo, "artista": self.artista, "album": self.album,
            "duracao": self.duracao, "sincronizada": self.sincronizada, "instrumental": self.instrumental,
            "diferenca": self.diferenca(duracao_musica),
        }


def _versao(item):
    return VersaoLetra(
        id=item["id"],
        titulo=item.get("trackName") or "",
        artista=item.get("artistName") or "",
        album=item.get("albumName") or "",
        duracao=item.get("duration"),
        sincronizada=bool(item.get("syncedLyrics")),
        instrumental=bool(item.get("instrumental")),
    )


def buscar_versoes(titulo, artista="", duracao=None, pedir=pedir_json):
    """Versões da letra no LRCLIB, as mais úteis primeiro.

    Ordem: sincronizadas antes das só de texto, e entre elas a de duração mais
    próxima da música (duração diferente = letra fora do tempo).
    """
    titulo, artista = limpar_titulo(titulo, artista)
    if not titulo:
        raise ValueError("A música precisa de um título para procurar a letra.")
    parametros = {"track_name": titulo}
    if artista:
        parametros["artist_name"] = artista
    itens = pedir(URL_BUSCA, parametros) or []
    if not itens and artista:
        itens = pedir(URL_BUSCA, {"q": f"{artista} {titulo}"}) or []  # busca mais solta

    versoes = [_versao(i) for i in itens if i.get("id") and not i.get("instrumental")]

    def ordem(versao):
        diferenca = versao.diferenca(duracao)
        return (not versao.sincronizada, diferenca if diferenca is not None else float("inf"))

    return sorted(versoes, key=ordem)


def baixar_letra(id_lrclib, pedir=pedir_json):
    """Texto .lrc da versão escolhida (ou a letra simples, se não houver sincronia)."""
    item = pedir(URL_LETRA.format(id=int(id_lrclib)))
    texto = item.get("syncedLyrics") or item.get("plainLyrics")
    if not texto:
        raise ValueError("Essa versão não tem letra.")
    return texto


def ler_lrc(texto):
    """Converte o .lrc em [{"tempo": segundos, "texto": verso}], em ordem de tempo.

    Letra sem nenhum tempo (só texto) volta com "tempo": None em cada verso.
    """
    deslocamento = 0.0
    versos = []
    sem_tempo = []
    for linha in texto.splitlines():
        linha = linha.strip()
        offset = _OFFSET.match(linha)
        if offset:
            # offset positivo = a letra aparece ANTES
            deslocamento = -int(offset.group(1)) / 1000
            continue
        tempos = list(_TEMPO.finditer(linha))
        verso = _TEMPO.sub("", linha).strip()
        if not tempos:
            if linha and not re.match(r"^\[[a-z]+:", linha, re.IGNORECASE):  # ignora [ar:], [ti:]...
                sem_tempo.append(verso)
            continue
        for tempo in tempos:
            minutos, segundos = int(tempo.group(1)), float(tempo.group(2).replace(":", "."))
            versos.append({"tempo": round(max(minutos * 60 + segundos + deslocamento, 0.0), 3), "texto": verso})
    if not versos:
        return [{"tempo": None, "texto": v} for v in sem_tempo]
    return sorted(versos, key=lambda v: v["tempo"])
