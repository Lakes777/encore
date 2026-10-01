"""Fila de preparo das músicas: baixar -> separar -> analisar o tom.

Separar é pesado (usa toda a CPU ou a GPU), então a fila prepara UMA música
por vez, numa thread separada, enquanto a API continua respondendo. Cada
tarefa guarda estado e progresso para a tela mostrar.

Cada música pronta fica numa pasta própria, com as faixas e um musica.json.
"""

import json
import shutil
import threading
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

from karaoke.analise import analisar_tom
from karaoke.download import baixar_audio
from karaoke.faixas import INSTRUMENTAL, Faixa, Musica
from karaoke.separacao import obter_modo, separar

NA_FILA = "na fila"
BAIXANDO = "baixando"
SEPARANDO = "separando"
ANALISANDO = "analisando"
PRONTA = "pronta"
ERRO = "erro"

NOME_ORIGINAL = "original"  # faixa da música inteira, para o botão "tocar a original"

# Quanto do progresso total cada parte ocupa. A separação é quase tudo, e a
# etapa 1 dela (voz x instrumental) demora perto do dobro da etapa 2.
_FIM_DOWNLOAD = 0.05
_FIM_ETAPA = {1: 0.65, 2: 0.95}


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

    def para_dict(self):
        return asdict(self)


class Fila:
    def __init__(self, pasta, pasta_modelos="modelos", baixar=baixar_audio, separar=separar, analisar=analisar_tom):
        self.pasta = Path(pasta)
        self.pasta_modelos = pasta_modelos
        self._baixar, self._separar, self._analisar = baixar, separar, analisar
        self._tarefas = {}
        self._condicao = threading.Condition()
        self._thread = None

    # ---------- consultas e pedidos (chamados pela API) ----------

    def adicionar(self, id_video, titulo, artista="", modo="rapido", duracao=None):
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
        """Tira da lista uma tarefa pronta ou com erro (não cancela a que está rodando)."""
        with self._condicao:
            tarefa = self._tarefas.get(id_tarefa)
            if tarefa is None:
                raise KeyError(id_tarefa)
            if tarefa.estado not in (PRONTA, ERRO, NA_FILA):
                raise ValueError("Essa música está sendo preparada agora; espere terminar.")
            del self._tarefas[id_tarefa]

    # ---------- trabalho ----------

    def _atualizar(self, tarefa, **campos):
        with self._condicao:
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
            self._atualizar(tarefa, estado=SEPARANDO, progresso=_FIM_DOWNLOAD)

            def ao_mudar_etapa(numero, total):
                inicio = _FIM_DOWNLOAD if numero == 1 else _FIM_ETAPA[numero - 1]
                self._atualizar(tarefa, progresso=inicio)

            faixas = self._separar(original, pasta, tarefa.modo, self.pasta_modelos, ao_mudar_etapa)
            self._atualizar(tarefa, estado=ANALISANDO, progresso=_FIM_ETAPA[2])

            # O instrumental dá um tom mais confiável (a voz desafina, o arranjo não)
            instrumental = next(f for f in faixas if f.nome == INSTRUMENTAL)
            tom, escala = self._analisar(pasta / instrumental.arquivo)

            musica = Musica(tarefa.titulo, tarefa.artista, faixas + [Faixa(NOME_ORIGINAL, original.name, 0.0)],
                            tom, escala)
            self._salvar(pasta, tarefa, musica)
            self._atualizar(tarefa, estado=PRONTA, progresso=1.0)
        except Exception as erro:  # qualquer falha vira mensagem na tela, e a fila segue
            shutil.rmtree(pasta, ignore_errors=True)
            self._atualizar(tarefa, estado=ERRO, erro=str(erro) or type(erro).__name__)

    def _salvar(self, pasta, tarefa, musica):
        dados = musica.para_dict() | {"id": tarefa.id, "id_video": tarefa.id_video, "modo": tarefa.modo,
                                      "duracao": tarefa.duracao}
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
