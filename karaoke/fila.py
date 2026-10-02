"""Fila de preparo das músicas: baixar -> separar (ou achar a versão pronta) -> analisar.

Separar é pesado (usa toda a CPU ou a GPU), então a fila prepara UMA música
por vez, numa thread separada, enquanto a API continua respondendo. Cada
tarefa guarda estado e progresso para a tela mostrar.

Cancelar: o pedido só marca a tarefa. Toda atualização de progresso confere a
marca e levanta Cancelada; a separação roda num processo à parte, que é encerrado.

Analisar = tom e escala (obrigatórios) e, de quebra, BPM, batidas e trechos em que a voz
principal soa (karaoke/ritmo.py). Esses extras só enfeitam a tela: se falharem, a música
fica pronta sem eles (e `python -m karaoke.ritmo` completa depois).

Cada música pronta fica numa pasta própria, com as faixas e um musica.json.
"""

import json
import shutil
import threading
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

from karaoke.analise import analisar_tom
from karaoke.cancelamento import Cancelada
from karaoke.download import baixar_audio
from karaoke.faixas import INSTRUMENTAL, VOZ_PRINCIPAL, Faixa, Musica
from karaoke.ritmo import analisar_ritmo, trechos_com_voz
from karaoke.separacao import MODOS, obter_modo, separar_em_processo
from karaoke.versoes import MODO_PRONTA, preparar_versao_pronta

NA_FILA = "na fila"
BAIXANDO = "baixando"
PROCURANDO = "procurando versão pronta"
SEPARANDO = "separando"
ANALISANDO = "analisando"
PRONTA = "pronta"
ERRO = "erro"
CANCELANDO = "cancelando"

NOME_ORIGINAL = "original"  # faixa da música inteira, para o botão "tocar a original"

# Quanto do progresso total cada parte ocupa. A separação é quase tudo, e a
# etapa 1 dela (voz x instrumental) demora perto do dobro da etapa 2.
_FIM_DOWNLOAD = 0.05
_FIM_PROCURA = 0.5  # se nenhuma versão pronta servir, a separação usa o resto
_COMECO_ANALISE = 0.95
_PARTE_DA_ETAPA_1 = 2 / 3


@dataclass
class Tarefa:
    id: str
    id_video: str
    titulo: str
    artista: str
    modo: str
    duracao: int | None = None
    estado: str = NA_FILA
    progresso: float = 0.0
    erro: str | None = None
    aviso: str | None = None  # ex.: nenhuma versão pronta serviu e a música foi separada com IA

    def para_dict(self):
        return asdict(self)


class Fila:
    def __init__(self, pasta, pasta_modelos="modelos", baixar=baixar_audio, separar=separar_em_processo, analisar=analisar_tom,
                 preparar_versao=preparar_versao_pronta, modo_reserva="rapido", ritmo=analisar_ritmo,
                 voz=trechos_com_voz):
        """`modo_reserva`: com que modo separar quando nenhuma versão pronta serve."""
        self.pasta = Path(pasta)
        self.pasta_modelos = pasta_modelos
        self._baixar, self._separar, self._analisar = baixar, separar, analisar
        self._preparar_versao = preparar_versao
        self._ritmo, self._voz = ritmo, voz
        self.modo_reserva = obter_modo(modo_reserva).nome
        self._tarefas = {}
        self._canceladas = set()  # ids que o usuário mandou parar
        self._condicao = threading.Condition()
        self._thread = None

    # ---------- consultas e pedidos (chamados pela API) ----------

    def adicionar(self, id_video, titulo, artista="", modo="rapido", duracao=None):
        if modo != MODO_PRONTA:
            obter_modo(modo)  # dá erro se o modo não existir
        tarefa = Tarefa(uuid.uuid4().hex[:12], id_video, titulo.strip() or "(sem título)", artista.strip(), modo, duracao)
        with self._condicao:
            self._tarefas[tarefa.id] = tarefa
            self._condicao.notify()
        return tarefa

    def tarefas(self):
        """Cópia da lista, na ordem em que foram pedidas."""
        with self._condicao:
            return [Tarefa(**asdict(t)) for t in self._tarefas.values()]

    def esquecer(self, id_tarefa):
        """Tira da lista. Se a música estiver sendo preparada, cancela: ela fica "cancelando"
        até o trabalho parar, e aí a pasta é apagada e a tarefa some."""
        with self._condicao:
            tarefa = self._tarefas.get(id_tarefa)
            if tarefa is None:
                raise KeyError(id_tarefa)
            if tarefa.estado in (PRONTA, ERRO, NA_FILA):
                del self._tarefas[id_tarefa]
            else:
                self._canceladas.add(id_tarefa)
                tarefa.estado = CANCELANDO

    # ---------- trabalho ----------

    def _atualizar(self, tarefa, **campos):
        """Muda os campos; é também o ponto onde o cancelamento é percebido."""
        with self._condicao:
            if tarefa.id in self._canceladas:
                raise Cancelada()
            for nome, valor in campos.items():
                setattr(tarefa, nome, valor)

    def _proxima(self):
        return next((t for t in self._tarefas.values() if t.estado == NA_FILA), None)

    def processar_proxima(self):
        """Prepara a próxima música da fila. Devolve False se a fila estiver vazia."""
        with self._condicao:
            tarefa = self._proxima()
            if tarefa is None:
                return False
            tarefa.estado = BAIXANDO
        self._preparar(tarefa)
        return True

    def _preparar(self, tarefa):
        pasta = self.pasta / tarefa.id
        try:
            original = self._baixar(
                tarefa.id_video, pasta,
                lambda fracao: self._atualizar(tarefa, progresso=round(fracao * _FIM_DOWNLOAD, 3)),
            )
            self._atualizar(tarefa)  # cancelada no fim do download (sem aviso de progresso)?
            faixas, extras = None, {"modo": tarefa.modo}
            if tarefa.modo == MODO_PRONTA:
                faixas, extras = self._procurar_versao_pronta(tarefa, original, pasta)
            if faixas is None:
                faixas = self._separar_com_ia(tarefa, original, pasta, extras["modo"])
            self._atualizar(tarefa, estado=ANALISANDO, progresso=_COMECO_ANALISE)

            # O instrumental dá um tom mais confiável (a voz desafina, o arranjo não)
            instrumental = next(f for f in faixas if f.nome == INSTRUMENTAL)
            tom, escala = self._analisar(pasta / instrumental.arquivo)
            extras |= self._analisar_extras(pasta, faixas, instrumental)

            musica = Musica(tarefa.titulo, tarefa.artista, faixas + [Faixa(NOME_ORIGINAL, original.name, 0.0)],
                            tom, escala)
            self._salvar(pasta, tarefa, musica, extras)
            self._atualizar(tarefa, estado=PRONTA, progresso=1.0)
        except Exception as erro:  # qualquer falha vira mensagem na tela, e a fila segue
            shutil.rmtree(pasta, ignore_errors=True)
            with self._condicao:
                if tarefa.id in self._canceladas:  # Cancelada, ou falhou enquanto parava: tanto faz
                    self._canceladas.discard(tarefa.id)
                    del self._tarefas[tarefa.id]
                else:
                    tarefa.estado, tarefa.erro = ERRO, str(erro) or type(erro).__name__

    def _procurar_versao_pronta(self, tarefa, original, pasta):
        """Devolve (faixas, extras) com a versão pronta, ou (None, extras) para separar com IA."""
        self._atualizar(tarefa, estado=PROCURANDO, progresso=_FIM_DOWNLOAD)
        motivo = "Nenhuma versão pronta serviu"
        try:
            versao = self._preparar_versao(
                original, pasta, tarefa.titulo, tarefa.artista, tarefa.duracao, tarefa.id_video,
                lambda fracao: self._atualizar(
                    tarefa, progresso=round(_FIM_DOWNLOAD + fracao * (_FIM_PROCURA - _FIM_DOWNLOAD), 3)),
            )
        except Cancelada:
            raise
        except Exception:
            # YouTube recusou a busca, internet caiu...: a original já está baixada, então
            # separa com IA em vez de perder tudo
            versao, motivo = None, "A procura da versão pronta falhou"
        if versao is not None:
            return [versao.faixa], {"modo": MODO_PRONTA, "versao_pronta": versao.para_dict()}
        reserva = MODOS[self.modo_reserva]
        aviso = f"{motivo}; separada com IA (modo {reserva.descricao})."
        self._atualizar(tarefa, aviso=aviso)
        return None, {"modo": reserva.nome, "aviso": aviso}

    def _separar_com_ia(self, tarefa, original, pasta, modo):
        inicio = max(tarefa.progresso, _FIM_DOWNLOAD)  # o download pode não ter avisado 100%
        self._atualizar(tarefa, estado=SEPARANDO, progresso=inicio)

        def ao_mudar_etapa(numero, total):
            # A etapa 1 fica com 2/3 do que falta até a análise, a etapa 2 com o resto
            parte = 0 if numero == 1 else _PARTE_DA_ETAPA_1
            self._atualizar(tarefa, progresso=round(inicio + (_COMECO_ANALISE - inicio) * parte, 3))

        return self._separar(original, pasta, modo, self.pasta_modelos, ao_mudar_etapa,
                             verificar=lambda: self._atualizar(tarefa))

    def _analisar_extras(self, pasta, faixas, instrumental):
        """BPM e batidas (do instrumental) e trechos com voz (da voz principal, se houver).

        Cada análise que falhar fica de fora do musica.json, sem derrubar a música.
        """
        extras = {}
        try:
            ritmo = self._ritmo(pasta / instrumental.arquivo)
            extras |= {"bpm": ritmo["bpm"], "batidas": ritmo["batidas"]}
        except Cancelada:
            raise
        except Exception:
            pass  # fica ausente; `python -m karaoke.ritmo` tenta de novo depois
        # Na versão pronta não existe faixa só com a voz
        voz = next((f for f in faixas if f.nome == VOZ_PRINCIPAL), None)
        if voz is not None:
            try:
                extras["trechos_voz"] = self._voz(pasta / voz.arquivo)
            except Cancelada:
                raise
            except Exception:
                pass
        return extras

    def _salvar(self, pasta, tarefa, musica, extras):
        dados = musica.para_dict() | {"id": tarefa.id, "id_video": tarefa.id_video, "duracao": tarefa.duracao} | extras
        provisorio = pasta / "musica.json.tmp"
        provisorio.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        provisorio.replace(pasta / "musica.json")  # troca de uma vez: nunca fica um JSON pela metade

    def iniciar(self):
        """Começa a thread que processa a fila em segundo plano."""
        if self._thread is None:
            self._thread = threading.Thread(target=self._trabalhar, name="fila-karaoke", daemon=True)
            self._thread.start()

    def _trabalhar(self):
        while True:
            with self._condicao:
                self._condicao.wait_for(lambda: self._proxima() is not None)
            self.processar_proxima()
