"""Versões prontas (fase 2): usar um instrumental que já existe no YouTube em vez de separar com IA.

Procurar "instrumental" ou "karaoke" acha de tudo: a mesma gravação sem a voz (ótimo),
regravações no mesmo andamento (servem), uploads acelerados para fugir do Content ID,
outras edições e versões em outro tom (não servem). Para separar uma coisa da outra,
cada candidato é comparado com a música original pelo cromagrama (as 12 notas ao longo
do tempo):

1. Em 5 pontos da música, uma janela de 40 s da original é encaixada no candidato. Isso
   dá o atraso do candidato em cada ponto e o quanto as notas batem (semelhança).
2. Os 5 atrasos são ajustados numa reta. Reta deitada = mesmo andamento, só começa em
   outro ponto. Reta inclinada = upload acelerado ou desacelerado (velocidade e tom
   mudam juntos), o que se desfaz reamostrando. Pontos fora da reta = outra edição.
3. Semelhança baixa em algum ponto = outro tom ou outra música.

O candidato aceito é alinhado com a original (velocidade e começo). Assim a letra do
LRCLIB, sincronizada com a original, continua batendo.

Medido em 01/10 no notebook: cada candidato leva de 10 a 30 s (download + cromagrama),
contra ~20 min separando uma música de 4 min com IA na CPU.
"""

import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from karaoke.busca import buscar as buscar_no_youtube
from karaoke.download import baixar_audio
from karaoke.faixas import INSTRUMENTAL, Faixa
from karaoke.letras import limpar_titulo

MODO_PRONTA = "pronta"

TAXA = 22050  # o cromagrama não precisa de mais que isso
SALTO = 2048
QUADRO = SALTO / TAXA  # ~0,093 s por coluna do cromagrama
JANELA = 40.0  # segundos da original encaixados em cada ponto
BUSCA = 30.0  # até quanto o candidato pode estar adiantado ou atrasado
POSICOES = (0.1, 0.3, 0.5, 0.7, 0.9)
MINIMO_DE_PONTOS = 3  # pontos bons para a reta valer
MARGEM_FINAL = 10.0  # segundos do fim que ficam de fora (fade-out)

# Medidos com Help!, Yellow e Bat Country: a mesma gravação dá 0,94-1,00; regravações
# no mesmo andamento 0,89-0,93; a versão em outro tom caiu para 0,80.
SEMELHANCA_MINIMA = 0.85
RESIDUO_MAXIMO = 0.3  # segundos fora da reta; outra edição pulou 2 s
# Até 0,2% de diferença de velocidade não se nota (meio segundo em 4 min): fica como está.
VELOCIDADE_IGNORAVEL = 0.002
VELOCIDADE_MAXIMA = 0.05  # os uploads acelerados medidos ficaram em ~1,6%
# Só a mesma gravação pode ter a velocidade corrigida: num upload acelerado, velocidade e
# tom mudaram juntos e reamostrar desfaz os dois. Numa regravação com outro andamento,
# reamostrar desafinaria a música; essa é recusada.
SEMELHANCA_MESMA_GRAVACAO = 0.95
# Bom o bastante para parar de procurar (economiza os downloads seguintes)
SEMELHANCA_EXCELENTE = 0.95

TERMOS = ("instrumental", "karaoke")
# O cromagrama compara as notas, não diz se tem voz: o clipe oficial da mesma gravação
# (que aparece na busca por "instrumental") bate quase 100%. Por isso o título precisa
# dizer que é uma versão sem a voz principal.
SEM_VOZ = re.compile(r"instrumental|karaok|backing ?track|sem voz|no vocals?|without vocals|minus ?one|playback",
                     re.IGNORECASE)
POR_TERMO = 5
MAX_CANDIDATOS = 6
DIFERENCA_DE_DURACAO = 30  # segundos; mais que isso é outra edição com certeza


@dataclass(frozen=True)
class Comparacao:
    # atraso(t) = inclinacao * t + intercepto, com t em segundos da original e
    # atraso = tempo na original - tempo no candidato
    inclinacao: float
    intercepto: float
    semelhanca: float  # a pior das janelas
    residuo: float  # o ponto mais longe da reta, em segundos

    @property
    def corrigir_velocidade(self):
        return abs(self.inclinacao) > VELOCIDADE_IGNORAVEL

    @property
    def aceitavel(self):
        if self.semelhanca < SEMELHANCA_MINIMA or self.residuo > RESIDUO_MAXIMO:
            return False
        if not self.corrigir_velocidade:
            return True
        return abs(self.inclinacao) <= VELOCIDADE_MAXIMA and self.semelhanca >= SEMELHANCA_MESMA_GRAVACAO

    @property
    def excelente(self):
        return self.aceitavel and self.semelhanca >= SEMELHANCA_EXCELENTE


# ---------- comparação (só numpy: dá para testar sem áudio) ----------


def normalizar(croma):
    """Cada coluna com comprimento 1: a semelhança vira o cosseno entre as colunas."""
    croma = np.asarray(croma, dtype=float)
    return croma / (np.linalg.norm(croma, axis=0, keepdims=True) + 1e-9)


def encaixe(original, candidato, inicio, tamanho, busca):
    """Encaixa original[:, inicio:inicio+tamanho] no candidato (em colunas).

    Devolve (atraso em colunas, semelhança média), ou None se o melhor encaixe ficou
    colado no começo ou no fim do candidato: aí o encaixe certo provavelmente estava
    fora dele (candidato mais curto, fade-out) e o atraso medido seria falso.
    Procura até `busca` colunas para cada lado. As colunas já vêm normalizadas.
    """
    janela = original[:, inicio:inicio + tamanho]
    primeira, ultima = max(0, inicio - busca), min(candidato.shape[1] - tamanho, inicio + busca)
    if ultima < primeira:
        return None  # esse trecho da original nem cabe no candidato
    melhor_semelhanca, melhor_posicao = -1.0, inicio
    for posicao in range(primeira, ultima + 1):
        semelhanca = float(np.mean(np.sum(janela * candidato[:, posicao:posicao + tamanho], axis=0)))
        if semelhanca > melhor_semelhanca:
            melhor_semelhanca, melhor_posicao = semelhanca, posicao
    # A faixa de busca foi cortada pela borda do candidato e o melhor ficou bem nela
    cortada_no_comeco = primeira > inicio - busca
    cortada_no_fim = ultima < inicio + busca
    if (cortada_no_comeco and melhor_posicao == primeira) or (cortada_no_fim and melhor_posicao == ultima):
        return None
    return inicio - melhor_posicao, melhor_semelhanca


def comparar(original, candidato, quadro=QUADRO):
    """Compara dois cromagramas normalizados. None se a original for curta demais."""
    # As janelas ficam só no trecho que as duas têm: um candidato com fade-out mais
    # cedo não tem o fim da original, e encaixar o fim ali daria um atraso falso.
    # (Candidato sem um pedaço grande já foi barrado pela diferença de duração.)
    comum = min(original.shape[1], candidato.shape[1]) - int(MARGEM_FINAL / quadro)
    tamanho = min(int(JANELA / quadro), comum // 3)
    if tamanho < 20:
        return None
    busca = int(BUSCA / quadro)
    centros, atrasos, semelhancas = [], [], []
    for posicao in POSICOES:
        inicio = int(posicao * (comum - tamanho))
        medida = encaixe(original, candidato, inicio, tamanho, busca)
        if medida is None:
            continue
        atraso, semelhanca = medida
        # O atraso medido vale para o meio da janela, não para o começo dela
        centros.append((inicio + tamanho / 2) * quadro)
        atrasos.append(atraso * quadro)
        semelhancas.append(semelhanca)
    if len(atrasos) < MINIMO_DE_PONTOS:
        return Comparacao(0.0, 0.0, 0.0, float("inf"))  # não deu para medir: recusa
    centros, atrasos = np.array(centros), np.array(atrasos)
    inclinacao, intercepto = np.polyfit(centros, atrasos, 1)
    residuo = float(np.max(np.abs(atrasos - (inclinacao * centros + intercepto))))
    return Comparacao(float(inclinacao), float(intercepto), float(min(semelhancas)), residuo)


# ---------- alinhamento ----------


def _reamostrar_com_librosa(amostras, de, para):
    import librosa

    return librosa.resample(amostras, orig_sr=de, target_sr=para, axis=0)


def alinhar_amostras(amostras, taxa, comparacao, reamostrar=_reamostrar_com_librosa):
    """Põe o candidato no tempo da original. `amostras` tem uma linha por amostra.

    Na original, o instante t corresponde no candidato a t * (1 - inclinacao) - intercepto.
    Esticar o candidato por 1 / (1 - inclinacao) desfaz a diferença de velocidade (e de
    tom, que num upload acelerado muda junto); o que sobra é um deslocamento fixo.
    """
    fator = 1 - comparacao.inclinacao if comparacao.corrigir_velocidade else 1.0
    if comparacao.corrigir_velocidade:
        amostras = reamostrar(amostras, taxa, round(taxa / fator))
    deslocamento = round(comparacao.intercepto / fator * taxa)
    if deslocamento > 0:  # a original começa antes: silêncio no começo do candidato
        silencio = np.zeros((deslocamento,) + amostras.shape[1:], dtype=amostras.dtype)
        return np.concatenate([silencio, amostras])
    return amostras[-deslocamento:]


def _alinhar_arquivo(entrada, saida, comparacao):
    import soundfile

    amostras, taxa = soundfile.read(entrada, always_2d=True, dtype="float32")
    soundfile.write(saida, alinhar_amostras(amostras, taxa, comparacao), taxa)


def _cromagrama_com_librosa(caminho):
    import librosa

    sinal, _ = librosa.load(caminho, sr=TAXA, mono=True)
    # Só a parte harmônica: a bateria espalha energia por todas as notas
    return normalizar(librosa.feature.chroma_cens(y=librosa.effects.harmonic(sinal), sr=TAXA, hop_length=SALTO))


# ---------- busca e escolha ----------


# Palavras soltas que atrapalham a busca ("Coldplay - Yellow - Remastered")
# Palavras de enfeite que sobram soltas NO FIM do título ("Coldplay - Yellow - Remastered",
# "Yellow - Coldplay HQ Audio"). Só no fim: "Video Killed the Radio Star" e "1999" são nomes.
_ENFEITE_FINAL = re.compile(
    r"(\s*[-–|]\s*|\s+)(remaster(ed)?(\s+\d{4})?|official|oficial|music|video|v[ií]deo|audio|[aá]udio|lyrics?|letra"
    r"|hd|hq|4k)\s*$",
    re.IGNORECASE,
)


def _sem_enfeites_no_fim(titulo):
    while (sem := _ENFEITE_FINAL.sub("", titulo)) != titulo:
        titulo = sem
    return re.sub(r"(\s*[-–|]\s*)+$", "", titulo).strip()


def texto_da_busca(titulo, artista=""):
    """'The Beatles - Help! (Remastered 2009)' -> 'The Beatles Help!'."""
    titulo, artista = limpar_titulo(titulo, artista)
    titulo = _sem_enfeites_no_fim(titulo)
    # Se o título ainda tem "X - Y", o canal não era o artista: o título basta
    return titulo if " - " in titulo or not artista else f"{artista} {titulo}"


def procurar_candidatos(titulo, artista, duracao, id_original, buscar=buscar_no_youtube):
    """Vídeos que podem ser a versão sem voz, sem repetir e com duração parecida."""
    base = texto_da_busca(titulo, artista)
    vistos, candidatos = {id_original}, []
    for termo in TERMOS:
        for resultado in buscar(f"{base} {termo}", POR_TERMO):
            if resultado.id in vistos or resultado.duracao is None or not SEM_VOZ.search(resultado.titulo):
                continue
            vistos.add(resultado.id)
            if duracao and abs(resultado.duracao - duracao) > DIFERENCA_DE_DURACAO:
                continue
            candidatos.append(resultado)
    return candidatos[:MAX_CANDIDATOS]


def estimar_segundos(duracao):
    """O pior caso: baixar e comparar todos os candidatos (na prática para antes)."""
    if not duracao:
        return None
    por_candidato = 5 + 0.08 * duracao  # download + cromagrama, medido no notebook
    return round((MAX_CANDIDATOS + 1) * por_candidato)


@dataclass(frozen=True)
class VersaoPronta:
    faixa: Faixa
    id_video: str
    titulo: str
    canal: str
    comparacao: Comparacao

    @property
    def velocidade_corrigida(self):
        """% que o upload estava acelerado (negativo = desacelerado); 0 se nada foi corrigido."""
        if not self.comparacao.corrigir_velocidade:
            return 0.0
        return round((1 / (1 - self.comparacao.inclinacao) - 1) * 100, 1)

    def para_dict(self):
        """O que vai para o musica.json, para a tela mostrar de onde veio o instrumental."""
        return {
            "id_video": self.id_video, "titulo": self.titulo, "canal": self.canal,
            "semelhanca": round(self.comparacao.semelhanca, 3),
            # % de velocidade corrigida (positivo = o upload estava acelerado)
            "velocidade_corrigida": self.velocidade_corrigida,
        }


def preparar_versao_pronta(original, pasta, titulo, artista, duracao, id_original, ao_progredir=None,
                           buscar=buscar_no_youtube, baixar=baixar_audio, cromagrama=_cromagrama_com_librosa,
                           alinhar=_alinhar_arquivo):
    """Procura, compara e alinha. Devolve uma VersaoPronta ou None se nenhuma serviu.

    `ao_progredir(fracao)` vai de 0 a 1 conforme os candidatos são conferidos.
    O instrumental fica em pasta/instrumental.wav; os candidatos baixados são apagados.
    """
    avisar = ao_progredir or (lambda fracao: None)
    pasta = Path(pasta)
    candidatos = procurar_candidatos(titulo, artista, duracao, id_original, buscar)
    if not candidatos:
        return None
    referencia = cromagrama(original)
    temporarios = pasta / "candidatos"
    aceitos = []
    try:
        for numero, candidato in enumerate(candidatos):
            avisar(numero / len(candidatos))
            try:
                audio = baixar(candidato.id, temporarios / candidato.id)
                comparacao = comparar(referencia, cromagrama(audio))
            except Exception:
                continue  # vídeo indisponível ou áudio estragado: tenta o próximo
            if comparacao is not None and comparacao.aceitavel:
                aceitos.append((comparacao, candidato, audio))
                if comparacao.excelente:
                    break
        avisar(1.0)
        if not aceitos:
            return None
        comparacao, candidato, audio = max(aceitos, key=lambda aceito: aceito[0].semelhanca)
        destino = pasta / "instrumental.wav"
        alinhar(audio, destino, comparacao)
        return VersaoPronta(Faixa(INSTRUMENTAL, destino.name), candidato.id, candidato.titulo, candidato.canal,
                            comparacao)
    finally:
        shutil.rmtree(temporarios, ignore_errors=True)
