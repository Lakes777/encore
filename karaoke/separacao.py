"""Separação das faixas com IA (audio-separator), em duas etapas.

1. Voz x instrumental.
2. A voz da etapa 1 vira voz principal x vocais de apoio.

Há dois modos, para atender computadores diferentes:
- "rapido": modelos MDX leves, viáveis até na CPU de um notebook;
- "qualidade": modelos Roformer, bem melhores, mas pensados para placa de vídeo.

O audio-separator usa a GPU sozinho quando o PyTorch enxerga CUDA. Aqui só
detectamos o dispositivo para escolher o modo padrão e estimar o tempo.
"""

import shutil
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from karaoke.faixas import INSTRUMENTAL, VOCAIS_DE_APOIO, VOZ_PRINCIPAL, Faixa


@dataclass(frozen=True)
class Modo:
    nome: str
    descricao: str
    modelo_voz: str       # etapa 1: voz x instrumental
    modelo_karaoke: str   # etapa 2: voz principal x vocais de apoio
    # Segundos de processamento por segundo de música, medidos no notebook
    # (i5-7200U, sem GPU). None = ainda não medido.
    fator_cpu: float | None
    fator_cuda: float | None = None


MODOS = {
    "rapido": Modo(
        nome="rapido",
        descricao="Rápida",
        modelo_voz="UVR-MDX-NET-Inst_HQ_3.onnx",
        modelo_karaoke="UVR_MDXNET_KARA_2.onnx",
        fator_cpu=7.0,     # 4,7x a 7x nos testes; fica o pior caso
    ),
    "qualidade": Modo(
        nome="qualidade",
        descricao="Alta",
        modelo_voz="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        modelo_karaoke="mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt",
        fator_cpu=61.0,    # 47x (BS-Roformer) + 14x (Mel-Roformer karaokê)
    ),
}

# Nas duas etapas os modelos chamam as saídas de "Vocals" e "Instrumental".
# Na etapa 2 (modelos de karaokê), "Vocals" é a voz principal e
# "Instrumental" é o que sobrou da voz: os vocais de apoio.
_SAIDAS_ETAPA_1 = {"Vocals": "voz", "Instrumental": "instrumental"}
_SAIDAS_ETAPA_2 = {"Vocals": "voz-principal", "Instrumental": "vocais-de-apoio"}
_FORMATO = "wav"

# Músicas mais longas que isso são separadas em pedaços e coladas no fim.
# Inteira, uma música de 4 min passa dos ~3,8 GB de RAM do WSL no notebook.
PEDACO_SEGUNDOS = 60


def detectar_dispositivo():
    """'cuda' se o PyTorch enxerga uma placa NVIDIA, senão 'cpu'."""
    try:
        import torch
    except ImportError:
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


def modo_padrao(dispositivo):
    return "qualidade" if dispositivo == "cuda" else "rapido"


def obter_modo(nome):
    try:
        return MODOS[nome]
    except KeyError:
        raise ValueError(f"Modo desconhecido: {nome!r}. Use {' ou '.join(MODOS)}.") from None


def estimar_segundos(nome_modo, dispositivo, duracao):
    """Tempo aproximado de separação, ou None se não houver medição."""
    modo = obter_modo(nome_modo)
    fator = modo.fator_cuda if dispositivo == "cuda" else modo.fator_cpu
    if fator is None or not duracao:
        return None
    return round(duracao * fator)


def _criar_separador(pasta_saida, pasta_modelos):
    from audio_separator.separator import Separator

    return Separator(output_dir=str(pasta_saida), model_file_dir=str(pasta_modelos), output_format=_FORMATO.upper(),
                     chunk_duration=PEDACO_SEGUNDOS)


@contextmanager
def _temporarios_em(pasta):
    """Faz o tempfile usar uma subpasta de `pasta` enquanto separa, e apaga no fim.

    O audio-separator grava os pedaços com tempfile.mkdtemp(), que cai no /tmp.
    No WSL o /tmp fica na RAM (tmpfs) — justamente o que os pedaços querem poupar.
    O PyTorch também deixa cache lá, por isso a subpasta inteira é apagada.
    Cuidado: tempfile.tempdir vale para o processo inteiro. Funciona porque a fila
    separa uma música por vez e nenhuma rota da API usa tempfile; se isso mudar,
    trocar por outra forma de escolher a pasta dos pedaços.
    """
    temporarios = Path(pasta) / "temporarios"
    temporarios.mkdir(exist_ok=True)
    anterior = tempfile.tempdir
    tempfile.tempdir = str(temporarios)
    try:
        yield
    finally:
        tempfile.tempdir = anterior
        shutil.rmtree(temporarios, ignore_errors=True)


def _etapa(separador, modelo, entrada, saidas, pasta):
    separador.load_model(model_filename=modelo)
    separador.separate(str(entrada), custom_output_names=saidas)
    caminhos = {nome: pasta / f"{arquivo}.{_FORMATO}" for nome, arquivo in saidas.items()}
    faltando = [str(c.name) for c in caminhos.values() if not c.exists()]
    if faltando:
        raise RuntimeError(f"A separação com {modelo} não gerou: {', '.join(faltando)}.")
    return caminhos


def separar(audio, pasta, nome_modo="rapido", pasta_modelos="modelos", ao_mudar_etapa=None,
            criar_separador=_criar_separador):
    """Separa o áudio nas três faixas do karaokê e devolve a lista de Faixa.

    `ao_mudar_etapa(numero, total)` avisa quando cada etapa começa (para a fila).
    """
    modo = obter_modo(nome_modo)
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    avisar = ao_mudar_etapa or (lambda numero, total: None)
    separador = criar_separador(pasta, Path(pasta_modelos))

    with _temporarios_em(pasta):
        avisar(1, 2)
        etapa_1 = _etapa(separador, modo.modelo_voz, audio, _SAIDAS_ETAPA_1, pasta)
        avisar(2, 2)
        etapa_2 = _etapa(separador, modo.modelo_karaoke, etapa_1["Vocals"], _SAIDAS_ETAPA_2, pasta)

    # A voz inteira já virou principal + apoio; não precisa ficar ocupando espaço
    etapa_1["Vocals"].unlink()

    return [
        Faixa(VOZ_PRINCIPAL, etapa_2["Vocals"].name),
        Faixa(VOCAIS_DE_APOIO, etapa_2["Instrumental"].name),
        Faixa(INSTRUMENTAL, etapa_1["Instrumental"].name),
    ]
