"""As músicas já preparadas, cada uma numa pasta com faixas e musica.json."""

import json
import re
import shutil
from pathlib import Path

ARQUIVO_DADOS = "musica.json"
_ID = re.compile(r"^[0-9a-f]{12}$")  # mesmo formato dos ids que a fila cria


class Biblioteca:
    def __init__(self, pasta):
        self.pasta = Path(pasta)

    def _pasta_da(self, id_musica):
        if not _ID.match(id_musica):
            raise KeyError(id_musica)  # id fora do formato nunca existe (e não deixa sair da pasta)
        return self.pasta / id_musica

    def listar(self):
        """Músicas prontas, das mais recentes para as mais antigas."""
        if not self.pasta.exists():
            return []
        arquivos = [p for p in self.pasta.glob(f"*/{ARQUIVO_DADOS}") if _ID.match(p.parent.name)]
        arquivos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        musicas = []
        for arquivo in arquivos:
            try:
                musicas.append(json.loads(arquivo.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue  # um JSON estragado não pode derrubar a lista inteira
        return musicas

    def obter(self, id_musica):
        arquivo = self._pasta_da(id_musica) / ARQUIVO_DADOS
        try:
            return json.loads(arquivo.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise KeyError(id_musica) from None

    def caminho_da_faixa(self, id_musica, arquivo):
        """Caminho do arquivo de uma faixa, só se ele for mesmo de uma faixa da música."""
        musica = self.obter(id_musica)
        if arquivo not in {f["arquivo"] for f in musica["faixas"]}:
            raise KeyError(arquivo)
        caminho = self._pasta_da(id_musica) / arquivo
        if not caminho.is_file():
            raise KeyError(arquivo)
        return caminho

    def apagar(self, id_musica):
        pasta = self._pasta_da(id_musica)
        if not (pasta / ARQUIVO_DADOS).exists():
            raise KeyError(id_musica)
        shutil.rmtree(pasta)
