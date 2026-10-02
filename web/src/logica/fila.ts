import type { EstadoTarefa, NomeModo, Sistema } from './tipos.ts'

export const TEXTO_DO_ESTADO: Record<EstadoTarefa, string> = {
  'na fila': 'Na fila',
  baixando: 'Baixando',
  'procurando versão pronta': 'Procurando versão pronta',
  separando: 'Separando as vozes',
  analisando: 'Descobrindo o tom',
  pronta: 'Pronta',
  erro: 'Erro',
  cancelando: 'Cancelando',
}

/** Tarefas que ainda vão mudar sozinhas (a tela consulta a fila enquanto houver uma). */
export function emAndamento(estado: EstadoTarefa) {
  return estado !== 'pronta' && estado !== 'erro'
}

/** Sendo preparada agora: tirar da fila é cancelar (o backend para o trabalho e apaga o que fez). */
export function rodando(estado: EstadoTarefa) {
  return ESTADOS_RODANDO.includes(estado)
}

const ESTADOS_RODANDO: EstadoTarefa[] = ['baixando', 'procurando versão pronta', 'separando', 'analisando']

// Se o /api/sistema ainda não respondeu, usa os nomes de sempre.
const NOME_DO_MODO: Record<NomeModo, string> = { pronta: 'Versão pronta', rapido: 'Rápida', qualidade: 'Alta' }

/** "Rápida" / "Alta": a descrição que o backend manda, ou o nome de sempre. */
export function nomeDoModo(modo: NomeModo, sistema: Sistema | null) {
  return sistema?.modos.find((m) => m.nome === modo)?.descricao ?? NOME_DO_MODO[modo] ?? modo
}
