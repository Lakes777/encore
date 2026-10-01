import type { EstadoTarefa, NomeModo, Sistema } from './tipos.ts'

export const TEXTO_DO_ESTADO: Record<EstadoTarefa, string> = {
  'na fila': 'Na fila',
  baixando: 'Baixando',
  separando: 'Separando as vozes',
  analisando: 'Descobrindo o tom',
  pronta: 'Pronta',
  erro: 'Erro',
}

/** Tarefas que ainda vão mudar sozinhas (a tela consulta a fila enquanto houver uma). */
export function emAndamento(estado: EstadoTarefa) {
  return estado === 'na fila' || estado === 'baixando' || estado === 'separando' || estado === 'analisando'
}

/** Só dá para tirar da fila o que não está rodando (o backend responde 409). */
export function podeRemover(estado: EstadoTarefa) {
  return estado === 'na fila' || estado === 'pronta' || estado === 'erro'
}

// Se o /api/sistema ainda não respondeu, usa os nomes de sempre.
const NOME_DO_MODO: Record<NomeModo, string> = { rapido: 'Rápida', qualidade: 'Alta' }

/** "Rápida" / "Alta": a descrição que o backend manda, ou o nome de sempre. */
export function nomeDoModo(modo: NomeModo, sistema: Sistema | null) {
  return sistema?.modos.find((m) => m.nome === modo)?.descricao ?? NOME_DO_MODO[modo] ?? modo
}
