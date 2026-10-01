"""Música e suas faixas separadas.

Uma música é uma LISTA de faixas genéricas (nome, arquivo, volume), e não
campos fixos como "voz" e "instrumental". Assim, quando o app aprender a
separar guitarra, baixo ou bateria, basta acrescentar faixas novas: o player
e a tela já sabem lidar com qualquer quantidade.
"""

from dataclasses import dataclass, field

VOLUME_MINIMO = 0.0
VOLUME_MAXIMO = 1.0

# Faixas que a separação para karaokê produz (fase 1 do projeto)
VOZ_PRINCIPAL = "voz principal"
VOCAIS_DE_APOIO = "vocais de apoio"
INSTRUMENTAL = "instrumental"

ESCALAS = ("maior", "menor")
NOTAS = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def conferir_volume(volume):
    """Devolve o volume como float ou dá erro se estiver fora de 0 a 1."""
    if isinstance(volume, bool) or not isinstance(volume, (int, float)):
        raise ValueError(f"Volume precisa ser um número, não {volume!r}.")
    if not VOLUME_MINIMO <= volume <= VOLUME_MAXIMO:
        raise ValueError(f"Volume precisa ficar entre 0 e 1, não {volume}.")
    return float(volume)


@dataclass
class Faixa:
    nome: str
    arquivo: str
    volume: float = 1.0

    def __post_init__(self):
        self.nome = self.nome.strip()
        if not self.nome:
            raise ValueError("A faixa precisa de um nome.")
        self.volume = conferir_volume(self.volume)


@dataclass
class Musica:
    titulo: str
    artista: str = ""
    faixas: list = field(default_factory=list)
    tom: str | None = None
    escala: str | None = None
    tem_letra: bool = False

    def __post_init__(self):
        if (self.tom is None) != (self.escala is None):
            raise ValueError("Tom e escala vêm juntos: informe os dois ou nenhum.")
        if self.tom is not None and self.tom not in NOTAS:
            raise ValueError(f"Tom desconhecido: {self.tom!r}.")
        if self.escala is not None and self.escala not in ESCALAS:
            raise ValueError(f"Escala precisa ser 'maior' ou 'menor', não {self.escala!r}.")
        faixas, self.faixas = self.faixas, []
        for faixa in faixas:
            self.adicionar_faixa(faixa)

    def faixa(self, nome):
        """Procura uma faixa pelo nome (sem diferenciar maiúsculas)."""
        procurado = nome.strip().casefold()
        for faixa in self.faixas:
            if faixa.nome.casefold() == procurado:
                return faixa
        raise KeyError(f"A música não tem a faixa {nome!r}.")

    def adicionar_faixa(self, faixa):
        try:
            self.faixa(faixa.nome)
        except KeyError:
            self.faixas.append(faixa)
        else:
            raise ValueError(f"A música já tem a faixa {faixa.nome!r}.")

    def mudar_volume(self, nome, volume):
        self.faixa(nome).volume = conferir_volume(volume)

    def descricao_tom(self):
        """Texto curto que aparece embaixo do nome na lista, ex.: 'A maior'."""
        if self.tom is None:
            return "tom desconhecido"
        return f"{self.tom} {self.escala}"

    def para_dict(self):
        """Converte para um dicionário simples, pronto para virar JSON."""
        return {
            "titulo": self.titulo,
            "artista": self.artista,
            "tom": self.tom,
            "escala": self.escala,
            "tem_letra": self.tem_letra,
            "faixas": [
                {"nome": f.nome, "arquivo": f.arquivo, "volume": f.volume}
                for f in self.faixas
            ],
        }

    @classmethod
    def de_dict(cls, dados):
        """Faz o caminho inverso de para_dict (ex.: ao ler o JSON salvo)."""
        return cls(
            titulo=dados["titulo"],
            artista=dados.get("artista", ""),
            tom=dados.get("tom"),
            escala=dados.get("escala"),
            tem_letra=dados.get("tem_letra", False),
            faixas=[Faixa(**f) for f in dados.get("faixas", [])],
        )
