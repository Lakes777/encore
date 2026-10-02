"""Exportar e importar uma música pronta como .zip (ex.: separar no PC com placa de
vídeo e levar para o notebook).

Cada música já é uma pasta completa (<dados>/<id>/ com as faixas, o musica.json e
a letra), então o pacote é só essa pasta num zip. As faixas são WAV, que quase não
encolhem no zip: elas vão sem compressão, para não gastar tempo à toa.
"""

import json
import re
import shutil
import unicodedata
import uuid
import zipfile
from pathlib import Path

from karaoke.biblioteca import ARQUIVO_DADOS, ARQUIVO_LETRA, ATRASO_MAXIMO, DESFOQUE_MAXIMO, PREFIXO_APAGANDO
from karaoke.faixas import Musica

TAMANHO_MAXIMO = 4 * 1024**3  # 4 GB: uma música de 10 min tem ~0,5 GB
TAMANHO_MAXIMO_TEXTO = 1024**2  # o musica.json e a letra são lidos inteiros: 1 MB sobra
PEDACO = 1024 * 1024
EXTENSAO = ".karaoke.zip"

_ID = re.compile(r"^[0-9a-f]{12}$")
# Nome de arquivo simples, sem pasta: o zip não pode escrever fora da pasta da música
_NOME_SEGURO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
PREFIXO_TEMPORARIO = ".importando-"  # a biblioteca ignora pastas fora do formato do id


class JaExiste(Exception):
    """Já há uma música com o mesmo id (o usuário decide se substitui)."""

    def __init__(self, titulo):
        super().__init__(titulo)
        self.titulo = titulo


def arquivos_da_musica(pasta_musica, dados):
    """O que vai no pacote: o musica.json, a letra (se tiver) e as faixas."""
    pasta_musica = Path(pasta_musica)
    nomes = [ARQUIVO_DADOS]
    if (pasta_musica / ARQUIVO_LETRA).is_file():
        nomes.append(ARQUIVO_LETRA)
    nomes += [f["arquivo"] for f in dados["faixas"] if (pasta_musica / f["arquivo"]).is_file()]
    return nomes


class _Saida:
    """Recebe o que o zipfile escreve e entrega aos pedaços (o zip sai enquanto é montado)."""

    def __init__(self):
        self._partes, self._posicao = [], 0

    def write(self, dados):
        self._partes.append(bytes(dados))
        self._posicao += len(dados)
        return len(dados)

    def tell(self):  # sem seek: o zipfile escreve os tamanhos depois de cada arquivo
        return self._posicao

    def flush(self):
        pass

    def tirar(self):
        dados = b"".join(self._partes)
        self._partes = []
        return dados


def exportar(pasta_musica, dados):
    """Gera os bytes do .zip aos pedaços, para mandar sem montar o arquivo inteiro antes."""
    pasta_musica = Path(pasta_musica)
    saida = _Saida()
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_STORED) as pacote:
        for nome in arquivos_da_musica(pasta_musica, dados):
            compressao = zipfile.ZIP_DEFLATED if nome in (ARQUIVO_DADOS, ARQUIVO_LETRA) else zipfile.ZIP_STORED
            info = zipfile.ZipInfo.from_file(pasta_musica / nome, nome)
            info.compress_type = compressao
            with open(pasta_musica / nome, "rb") as origem, pacote.open(info, "w", force_zip64=True) as destino:
                while pedaco := origem.read(PEDACO):
                    destino.write(pedaco)
                    yield saida.tirar()
            yield saida.tirar()
    yield saida.tirar()


def nome_do_pacote(dados):
    """Nome do .zip para baixar, só com letras simples (vai no cabeçalho HTTP)."""
    texto = unicodedata.normalize("NFKD", dados.get("titulo") or "musica").encode("ascii", "ignore").decode()
    texto = re.sub(r"[^A-Za-z0-9]+", "-", texto).strip("-")[:60] or "musica"
    return f"{texto}{EXTENSAO}"


def _conferir(pacote):
    """Confere o zip e devolve (dados do musica.json, nomes que vão para a pasta)."""
    infos = {info.filename: info for info in pacote.infolist() if not info.is_dir()}
    for nome in infos:
        if not _NOME_SEGURO.match(nome):
            raise ValueError(f"O pacote tem um arquivo com nome inválido: {nome!r}.")
    if ARQUIVO_DADOS not in infos:
        raise ValueError("Esse .zip não é de uma música do karaokê (falta o musica.json).")
    if sum(info.file_size for info in infos.values()) > TAMANHO_MAXIMO:
        raise ValueError("O pacote é grande demais.")
    if any(infos[nome].file_size > TAMANHO_MAXIMO_TEXTO for nome in (ARQUIVO_DADOS, ARQUIVO_LETRA) if nome in infos):
        raise ValueError("O musica.json ou a letra do pacote é grande demais.")
    try:
        dados = json.loads(pacote.read(ARQUIVO_DADOS).decode("utf-8"))
        Musica.de_dict(dados)  # dá erro se faltar título ou se uma faixa estiver errada
        id_musica = dados["id"]
    except (ValueError, KeyError, TypeError) as erro:
        raise ValueError("O musica.json do pacote está estragado.") from erro
    if not isinstance(id_musica, str) or not _ID.match(id_musica):
        raise ValueError("O musica.json do pacote tem um id inválido.")
    faixas = [f["arquivo"] for f in dados["faixas"]]
    for arquivo in faixas:
        if not _NOME_SEGURO.match(arquivo) or arquivo in (ARQUIVO_DADOS, ARQUIVO_LETRA):
            raise ValueError(f"O musica.json do pacote tem uma faixa com nome inválido: {arquivo!r}.")
        if arquivo not in infos:
            raise ValueError(f"Falta a faixa {arquivo} no pacote.")
    _descartar_ajustes_invalidos(dados)
    # Só o que a música usa: arquivo a mais no zip fica de fora
    nomes = [ARQUIVO_DADOS] + ([ARQUIVO_LETRA] if ARQUIVO_LETRA in infos else []) + faixas
    return dados, nomes


def _descartar_ajustes_invalidos(dados):
    """Fundo e atraso da letra são só ajustes: se vierem fora do que as rotas aceitam,
    a música entra sem eles (os volumes a Faixa já confere)."""
    fundo = dados.get("fundo")
    if fundo is not None:
        url, desfoque = (fundo.get("url"), fundo.get("desfoque")) if isinstance(fundo, dict) else (0, None)
        url_ok = url is None or (isinstance(url, str) and url.startswith("https://") and not set(url) & set('"\\()'))
        desfoque_ok = type(desfoque) is int and 0 <= desfoque <= DESFOQUE_MAXIMO
        if not (url_ok and desfoque_ok):
            del dados["fundo"]
    atraso = dados.get("atraso_letra")
    if atraso is not None and (type(atraso) not in (int, float) or not abs(atraso) <= ATRASO_MAXIMO):
        del dados["atraso_letra"]


def limpar_temporarios(pasta_dados):
    """Apaga o que sobrou de uma importação ou troca interrompida (ex.: o servidor caiu
    no meio). Chamada quando o servidor sobe, antes de qualquer importação."""
    pasta_dados = Path(pasta_dados)
    if not pasta_dados.is_dir():
        return
    for caminho in pasta_dados.iterdir():
        if caminho.name.startswith((PREFIXO_TEMPORARIO, PREFIXO_APAGANDO)):
            if caminho.is_dir() and not caminho.is_symlink():
                shutil.rmtree(caminho, ignore_errors=True)
            else:
                caminho.unlink(missing_ok=True)


def importar(biblioteca, caminho_zip, substituir=False):
    """Põe a música do .zip na biblioteca e devolve os dados dela.

    Levanta ValueError se o pacote não servir e JaExiste se o id já está na
    biblioteca (a não ser que `substituir`). Nada fica pela metade: tudo é
    extraído numa pasta temporária e só no fim vira a pasta da música.
    """
    pasta_dados = biblioteca.pasta
    try:
        pacote = zipfile.ZipFile(caminho_zip)
    except (zipfile.BadZipFile, OSError) as erro:
        raise ValueError("O arquivo enviado não é um .zip válido.") from erro
    with pacote:
        dados, nomes = _conferir(pacote)
        # Pergunta antes de extrair (pode ser 1 GB); a troca no fim confere de novo
        if (pasta_dados / dados["id"]).exists() and not substituir:
            try:
                titulo = biblioteca.obter(dados["id"]).get("titulo", "")
            except (KeyError, ValueError):  # pasta sem musica.json ou com ele estragado
                titulo = ""
            raise JaExiste(titulo)

        pasta_dados.mkdir(parents=True, exist_ok=True)
        temporaria = pasta_dados / f"{PREFIXO_TEMPORARIO}{uuid.uuid4().hex}"
        temporaria.mkdir()
        try:
            for nome in nomes:
                with pacote.open(nome) as origem, open(temporaria / nome, "wb") as copia:
                    shutil.copyfileobj(origem, copia, PEDACO)
            # O musica.json vai como foi conferido (sem os ajustes inválidos)
            (temporaria / ARQUIVO_DADOS).write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
            biblioteca.colocar_pasta(dados["id"], temporaria, substituir)
        except FileExistsError as erro:  # outra importação igual chegou primeiro
            shutil.rmtree(temporaria, ignore_errors=True)
            raise JaExiste(str(erro)) from None
        except (zipfile.BadZipFile, EOFError) as erro:  # ex.: zip cortado no meio do envio
            shutil.rmtree(temporaria, ignore_errors=True)
            raise ValueError("O .zip está corrompido.") from erro
        except BaseException:
            shutil.rmtree(temporaria, ignore_errors=True)
            raise
    return dados
