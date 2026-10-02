"""Pedido de cancelamento de uma música que está sendo preparada."""


class Cancelada(Exception):
    """Levantada nos pontos de checagem (progresso, troca de etapa) quando o usuário cancelou.

    Não é erro: quem prepara a música apaga o que fez e some da lista. Quem trata
    falhas com `except Exception` precisa deixar esta passar.
    """
