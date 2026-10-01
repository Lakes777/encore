"""Capas de álbum pela iTunes Search API (gratuita, sem chave)."""

from karaoke.internet import pedir_json
from karaoke.letras import leituras

URL_BUSCA = "https://itunes.apple.com/search"
TAMANHO = 1200  # pixels: a capa vira fundo de tela cheia


def buscar_capas(titulo, artista="", limite=8, pedir=pedir_json):
    """Lista de capas [{"album", "artista", "url"}], sem repetir a mesma imagem."""
    opcoes = leituras(titulo, artista)
    if not opcoes:
        raise ValueError("A música precisa de um título para procurar a capa.")
    resposta = {}
    for titulo, artista in opcoes:  # tenta cada jeito de ler o título até achar
        resposta = pedir(URL_BUSCA, {"term": f"{artista} {titulo}".strip(), "entity": "song", "limit": limite}) or {}
        if resposta.get("results"):
            break

    capas, vistas = [], set()
    for item in resposta.get("results", []):
        pequena = item.get("artworkUrl100")
        if not pequena or pequena in vistas:
            continue
        vistas.add(pequena)
        # A API devolve 100x100, mas o mesmo endereço serve outros tamanhos
        capas.append({
            "album": item.get("collectionName") or "",
            "artista": item.get("artistName") or "",
            "url": pequena.replace("100x100bb", f"{TAMANHO}x{TAMANHO}bb"),
        })
    return capas
