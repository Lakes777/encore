"""Ritmo (BPM e batidas) e os trechos em que a voz principal está soando.

- O BPM e as batidas saem do INSTRUMENTAL: a bateria está lá, sem a voz atrapalhando.
- Os trechos com voz saem da faixa de VOZ PRINCIPAL e servem para o site acender cada
  palavra da letra só quando a voz soa (o LRC só diz o começo de cada verso).

A conta em cima dos números (energia, trechos, BPM) é numpy puro, testável com sinais
sintéticos; só a leitura do áudio e o detector de batidas usam o librosa.

Também é um comando, para as músicas preparadas antes disto existir:
    python -m karaoke.ritmo <pasta_dados> [--refazer]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from karaoke.faixas import INSTRUMENTAL, VOZ_PRINCIPAL

TAXA = 22050
SALTO = 512  # amostras entre um quadro e o próximo: ~23 ms
JANELA = 1024  # cada quadro mede ~46 ms em volta do seu instante
QUADRO = SALTO / TAXA

# Limiar da voz. A faixa separada nunca fica em silêncio digital: sobra um "vazamento"
# baixinho do instrumental. O limiar fica ACIMA_DO_RUIDO dB acima desse fundo, mas nunca
# mais de ABAIXO_DO_PICO dB abaixo do canto forte (numa faixa limpa, com o fundo em
# silêncio total, o fundo sozinho deixaria passar a respiração e o eco).
# Medido em 01/10:
# - Her Majesty (voz e violão, fundo em -77 dB): com 25 dB abaixo do pico, dois versos
#   viravam um trecho só; com 15, palavras mais fracas sumiam (pior: palavra que nunca
#   acende); 20 separa os versos e as pausas maiores dentro deles.
# - Help! (canto sem respiro, fundo em -49 dB, canto em -15): o fundo + 15 é que manda e
#   cada verso vira um trecho. Entre as palavras a energia só cai 5-10 dB por 50-70 ms,
#   então NENHUM limiar separa essas palavras sem picotar as sílabas; aí o site precisa dividir
#   o trecho entre as palavras.
ACIMA_DO_RUIDO = 15.0
ABAIXO_DO_PICO = 20.0
# E nunca fica a menos disto abaixo do pico: numa faixa com voz do começo ao fim, o
# "fundo" medido é a própria voz, e fundo + 15 dB descartaria tudo.
FOLGA_DO_PICO = 6.0
# Abaixo disto (dB em relação à amplitude máxima do WAV) não se ouve nada: uma faixa só
# com silêncio ou chiado não tem voz nenhuma.
VOZ_MINIMA = -60.0
# Buracos menores que isso são a consoante entre sílabas (um "t", um "k"), não uma pausa.
BURACO_MINIMO = 0.15
# Pedaços menores que isso são estalos ou vazamento da bateria, não canto.
TRECHO_MINIMO = 0.08
_SILENCIO_DB = -100.0  # piso: silêncio digital daria -infinito

# O detector de batidas às vezes conta as colcheias e dá o dobro: o Her Majesty (violão
# dedilhado) saiu com 199 BPM. Acima disso, vale a metade; o Help! (96) fica como está.
BPM_MAXIMO = 180.0


# ---------- trechos com voz (só numpy) ----------


def energia_db(audio, salto=SALTO, janela=JANELA):
    """Energia RMS de cada quadro, em dB. O quadro i fica centrado na amostra i * salto."""
    audio = np.asarray(audio, dtype=float)
    if audio.size == 0:
        return np.zeros(0)
    metade = janela // 2
    preenchido = np.pad(audio, (metade, metade))
    quadros = 1 + len(audio) // salto
    inicios = np.arange(quadros) * salto
    # Soma acumulada dos quadrados: a média de cada janela sai em uma conta só
    acumulado = np.concatenate(([0.0], np.cumsum(preenchido ** 2)))
    fins = np.minimum(inicios + janela, len(preenchido))
    media = (acumulado[fins] - acumulado[inicios]) / janela
    return np.maximum(10 * np.log10(np.maximum(media, 1e-30)), _SILENCIO_DB)


def limiar_da_voz(db, acima_do_ruido=ACIMA_DO_RUIDO, abaixo_do_pico=ABAIXO_DO_PICO):
    """dB a partir do qual o quadro conta como voz (veja ACIMA_DO_RUIDO)."""
    # Percentis em vez de mínimo e máximo: um estalo ou um quadro mudo não mexem neles
    ruido = float(np.percentile(db, 10))
    pico = float(np.percentile(db, 99))
    limiar = min(max(ruido + acima_do_ruido, pico - abaixo_do_pico), pico - FOLGA_DO_PICO)
    return max(limiar, VOZ_MINIMA)


def trechos_da_energia(db, quadro=QUADRO, acima_do_ruido=ACIMA_DO_RUIDO, abaixo_do_pico=ABAIXO_DO_PICO,
                       buraco_minimo=BURACO_MINIMO, trecho_minimo=TRECHO_MINIMO):
    """Recebe a energia (dB) de cada quadro e devolve [[início, fim], ...] em segundos."""
    db = np.asarray(db, dtype=float)
    if db.size == 0:
        return []
    acima = db > limiar_da_voz(db, acima_do_ruido, abaixo_do_pico)
    # Onde a máscara liga (+1) e desliga (-1); os zeros nas pontas fecham os trechos
    mudancas = np.diff(np.concatenate(([0], acima.astype(int), [0])))
    inicios, fins = np.flatnonzero(mudancas == 1), np.flatnonzero(mudancas == -1)
    fins = np.minimum(fins, len(db) - 1)  # o último trecho termina no fim do áudio, não depois

    trechos = []
    for inicio, fim in zip(inicios * quadro, fins * quadro):
        if trechos and inicio - trechos[-1][1] < buraco_minimo:
            trechos[-1][1] = fim  # buraco curto: continua o mesmo trecho
        else:
            trechos.append([inicio, fim])
    return [[round(float(a), 3), round(float(b), 3)] for a, b in trechos if b - a >= trecho_minimo]


# ---------- ritmo (só numpy) ----------


def ritmo_das_batidas(batidas):
    """Recebe os instantes das batidas e devolve {"bpm", "batidas"}.

    O BPM vem da mediana dos intervalos: uma batida perdida ou a mais quase não mexe nele.
    """
    batidas = [round(float(t), 3) for t in batidas]
    if len(batidas) < 2:
        return {"bpm": None, "batidas": []}
    intervalo = float(np.median(np.diff(batidas)))
    if intervalo <= 0:
        return {"bpm": None, "batidas": []}
    return {"bpm": round(60 / intervalo, 1), "batidas": batidas}


def tempo_plausivel(bpm, maximo=BPM_MAXIMO):
    """Corta pela metade o andamento rápido demais (o detector contou as colcheias)."""
    while bpm > maximo:
        bpm /= 2
    return bpm


# ---------- leitura do áudio (librosa) ----------


def _ler_audio(caminho):
    import librosa

    audio, _ = librosa.load(str(caminho), sr=TAXA, mono=True)
    return audio


def _batidas_do_audio(audio):
    import librosa

    onsets = librosa.onset.onset_strength(y=audio, sr=TAXA, hop_length=SALTO)
    tempo, quadros = librosa.beat.beat_track(onset_envelope=onsets, sr=TAXA, hop_length=SALTO)
    tempo = float(np.atleast_1d(tempo)[0])
    if tempo_plausivel(tempo) != tempo:
        # Refaz forçando o andamento certo: o librosa escolhe de novo onde caem as batidas
        # (pegar uma sim, uma não poderia ficar com a metade errada, no contratempo)
        _, quadros = librosa.beat.beat_track(onset_envelope=onsets, sr=TAXA, hop_length=SALTO,
                                             bpm=tempo_plausivel(tempo))
    return librosa.frames_to_time(quadros, sr=TAXA, hop_length=SALTO).tolist()


def _batidas_com_librosa(caminho):
    return _batidas_do_audio(_ler_audio(caminho))


def analisar_ritmo(caminho, batidas=_batidas_com_librosa):
    """Lê o instrumental e devolve {"bpm": 95.7, "batidas": [0.348, 0.975, ...]}."""
    return ritmo_das_batidas(batidas(caminho))


def trechos_com_voz(caminho, ler=_ler_audio):
    """Lê a voz principal e devolve [[início, fim], ...] dos trechos em que ela soa."""
    return trechos_da_energia(energia_db(ler(caminho)))


# ---------- comando: completar as músicas que já existem ----------

ARQUIVO_DADOS = "musica.json"


def _arquivo_da_faixa(dados, nome):
    return next((f["arquivo"] for f in dados.get("faixas", []) if f.get("nome") == nome), None)


def _ler_json(arquivo):
    return json.loads(arquivo.read_text(encoding="utf-8"))


def completar_musica(pasta, refazer=False, ritmo=analisar_ritmo, voz=trechos_com_voz):
    """Calcula o que falta no musica.json de uma pasta e regrava.

    Devolve (dados, feito, erros): o que foi calculado e o que falhou, em texto. Uma
    análise que falha não impede a outra.
    """
    pasta = Path(pasta)
    arquivo = pasta / ARQUIVO_DADOS
    dados = _ler_json(arquivo)
    novos, feito, erros = {}, [], []
    instrumental = _arquivo_da_faixa(dados, INSTRUMENTAL)
    if instrumental and (refazer or "bpm" not in dados):
        try:
            resultado = ritmo(pasta / instrumental)
            novos |= {"bpm": resultado["bpm"], "batidas": resultado["batidas"]}
            feito.append(f"{resultado['bpm']} BPM, {len(resultado['batidas'])} batidas")
        except Exception as erro:
            erros.append(f"ritmo: {erro or type(erro).__name__}")
    voz_principal = _arquivo_da_faixa(dados, VOZ_PRINCIPAL)  # a versão pronta não tem
    if voz_principal and (refazer or "trechos_voz" not in dados):
        try:
            novos["trechos_voz"] = voz(pasta / voz_principal)
            feito.append(f"{len(novos['trechos_voz'])} trechos com voz")
        except Exception as erro:
            erros.append(f"voz: {erro or type(erro).__name__}")
    if novos:
        # Lê de novo antes de gravar: a análise demora, e nesse meio tempo o servidor pode
        # ter salvado um volume ou a letra nesse mesmo arquivo
        dados = _ler_json(arquivo) | novos
        provisorio = pasta / f"{ARQUIVO_DADOS}.tmp"
        provisorio.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        provisorio.replace(arquivo)  # troca de uma vez: o servidor nunca lê um JSON pela metade
    return dados, feito, erros


def completar_pasta(pasta_dados, refazer=False, ritmo=analisar_ritmo, voz=trechos_com_voz, escrever=print):
    """Percorre as músicas da pasta, uma linha por música. Devolve quantas tiveram erro."""
    falhas = 0
    for arquivo in sorted(Path(pasta_dados).glob(f"*/{ARQUIVO_DADOS}")):
        pasta = arquivo.parent
        try:
            dados, feito, erros = completar_musica(pasta, refazer, ritmo, voz)
        except (OSError, ValueError) as erro:  # JSON estragado ou ilegível: segue para a próxima
            dados, feito, erros = {}, [], [str(erro)]
        partes = feito + [f"ERRO {erro}" for erro in erros]
        falhas += bool(erros)
        escrever(f"{pasta.name} {dados.get('titulo', '?')}: {'; '.join(partes) or 'já tinha tudo'}")
    return falhas


def main(argumentos=None):
    leitor = argparse.ArgumentParser(description="Calcula BPM, batidas e trechos com voz das músicas já prontas.")
    leitor.add_argument("pasta_dados", help="pasta com uma subpasta por música (a KARAOKE_DADOS)")
    leitor.add_argument("--refazer", action="store_true", help="recalcula mesmo o que já existe")
    opcoes = leitor.parse_args(argumentos)
    if not Path(opcoes.pasta_dados).is_dir():
        leitor.error(f"a pasta {opcoes.pasta_dados} não existe")
    falhas = completar_pasta(opcoes.pasta_dados, opcoes.refazer, ritmo=analisar_ritmo, voz=trechos_com_voz)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
