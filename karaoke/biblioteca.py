"""As músicas já preparadas, cada uma numa pasta com faixas e musica.json."""

import json
import re
import shutil
from pathlib import Path

from karaoke.faixas import conferir_volume
from karaoke.letras import ler_lrc

ARQUIVO_DADOS = "musica.json"
ARQUIVO_LETRA = "letra.lrc"
DESFOQUE_PADRAO = 12  # pixels
DESFOQUE_MAXIMO = 40
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

    def _gravar(self, id_musica, dados):
        pasta = self._pasta_da(id_musica)
        provisorio = pasta / f"{ARQUIVO_DADOS}.tmp"
        provisorio.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        provisorio.replace(pasta / ARQUIVO_DADOS)

    # ---------- letra ----------

    def salvar_letra(self, id_musica, texto_lrc, id_lrclib):
        """Guarda a letra escolhida (troca a anterior) e devolve os versos."""
        dados = self.obter(id_musica)
        versos = ler_lrc(texto_lrc)
        if not versos:
            raise ValueError("A letra está vazia.")
        pasta = self._pasta_da(id_musica)
        provisorio = pasta / f"{ARQUIVO_LETRA}.tmp"
        provisorio.write_text(texto_lrc, encoding="utf-8")
        provisorio.replace(pasta / ARQUIVO_LETRA)
        dados["tem_letra"] = True
        dados["letra_sincronizada"] = versos[0]["tempo"] is not None
        dados["letra_id"] = id_lrclib
        self._gravar(id_musica, dados)
        return versos

    def letra(self, id_musica):
        self.obter(id_musica)  # 404 se a música não existe
        try:
            return ler_lrc((self._pasta_da(id_musica) / ARQUIVO_LETRA).read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise KeyError("letra") from None

    def apagar_letra(self, id_musica):
        dados = self.obter(id_musica)
        (self._pasta_da(id_musica) / ARQUIVO_LETRA).unlink(missing_ok=True)
        dados["tem_letra"] = False
        for campo in ("letra_sincronizada", "letra_id"):
            dados.pop(campo, None)
        self._gravar(id_musica, dados)

    # ---------- volumes ----------

    def definir_volumes(self, id_musica, volumes):
        """Guarda o volume (0 a 1) de algumas faixas, pelo arquivo, e devolve todas as faixas.

        Confere tudo antes de gravar: um volume errado não deixa os outros pela metade.
        """
        dados = self.obter(id_musica)
        por_arquivo = {faixa["arquivo"]: faixa for faixa in dados["faixas"]}
        novos = {}
        for arquivo, volume in volumes.items():
            if arquivo not in por_arquivo:
                raise ValueError(f"A música não tem a faixa {arquivo!r}.")
            novos[arquivo] = conferir_volume(volume)
        for arquivo, volume in novos.items():
            por_arquivo[arquivo]["volume"] = volume
        self._gravar(id_musica, dados)
        return dados["faixas"]

    # ---------- fundo ----------

    def definir_fundo(self, id_musica, url, desfoque=DESFOQUE_PADRAO):
        """Imagem de fundo da tela da música (url None = sem imagem) e o desfoque dela."""
        if url is not None and not url.startswith("https://"):
            raise ValueError("A imagem precisa ser um endereço https://.")
        if isinstance(desfoque, bool) or not isinstance(desfoque, int) or not 0 <= desfoque <= DESFOQUE_MAXIMO:
            raise ValueError(f"O desfoque precisa ficar entre 0 e {DESFOQUE_MAXIMO}.")
        dados = self.obter(id_musica)
        dados["fundo"] = {"url": url, "desfoque": desfoque}
        self._gravar(id_musica, dados)
        return dados["fundo"]

    def apagar(self, id_musica):
        pasta = self._pasta_da(id_musica)
        if not (pasta / ARQUIVO_DADOS).exists():
            raise KeyError(id_musica)
        shutil.rmtree(pasta)
