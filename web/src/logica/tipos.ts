// Formatos que a API (karaoke/api.py) devolve. Os nomes seguem o JSON dela.

/** 'pronta' = procurar um instrumental pronto no YouTube antes de separar com IA. */
export type NomeModo = 'pronta' | 'rapido' | 'qualidade'
export type ModoDeSeparacao = Exclude<NomeModo, 'pronta'>

export interface Sistema {
  dispositivo: 'cpu' | 'cuda'
  /** Modo de separação que este computador aguenta bem. */
  modo_padrao: ModoDeSeparacao
  /** Com que modo separar quando nenhuma versão pronta serve. */
  modo_reserva: ModoDeSeparacao
  modos: { nome: NomeModo; descricao: string }[]
}

export interface ResultadoBusca {
  id: string
  titulo: string
  canal: string
  duracao: number | null
  miniatura: string | null
  url: string
  /** Segundo do vídeo em que a prévia de 15 s começa. */
  inicio_previa: number
  /** Segundos que a separação deve levar em cada modo (null = sem medição). */
  estimativas: Record<NomeModo, number | null>
}

export type EstadoTarefa =
  | 'na fila'
  | 'baixando'
  | 'procurando versão pronta'
  | 'separando'
  | 'analisando'
  | 'pronta'
  | 'erro'
  | 'cancelando'

export interface Tarefa {
  id: string
  id_video: string
  titulo: string
  artista: string
  modo: NomeModo
  duracao: number | null
  estado: EstadoTarefa
  /** De 0 a 1. */
  progresso: number
  erro: string | null
  /** Ex.: nenhuma versão pronta serviu e a música foi separada com IA. */
  aviso: string | null
}

/**
 * Uma faixa da música. A lista é genérica de propósito: hoje vem voz principal,
 * vocais de apoio, instrumental e original; nas próximas fases virão guitarra,
 * baixo etc. A tela não deve depender de nomes fixos, só de NOME_ORIGINAL.
 */
export interface Faixa {
  nome: string
  arquivo: string
  /** De 0 a 1. */
  volume: number
}

/** A faixa com a música inteira, para o botão "tocar a original" (vem com volume 0). */
export const NOME_ORIGINAL = 'original'

export interface Fundo {
  url: string | null
  /** Pixels de desfoque, de 0 a DESFOQUE_MAXIMO. */
  desfoque: number
}

export const DESFOQUE_MAXIMO = 40
export const DESFOQUE_PADRAO = 12

export interface Musica {
  id: string
  id_video: string
  titulo: string
  artista: string
  modo: NomeModo
  duracao: number | null
  tom: string | null
  escala: 'maior' | 'menor' | null
  tem_letra: boolean
  letra_sincronizada?: boolean
  letra_id?: number
  fundo?: Fundo
  /** De onde veio o instrumental, quando é uma versão pronta. */
  versao_pronta?: VersaoPronta
  aviso?: string
  faixas: Faixa[]
  /** Segundos somados aos tempos da letra, salvos pelo usuário (ausente = automático). */
  atraso_letra?: number
  bpm?: number | null
  /** Segundos de cada batida (para o metrônomo). */
  batidas?: number[]
  /** [início, fim] em segundos onde a voz principal soa (não existe na versão pronta). */
  trechos_voz?: [number, number][]
}

export interface VersaoPronta {
  id_video: string
  titulo: string
  canal: string
  semelhanca: number
  /** % de velocidade corrigida (positivo = o upload estava acelerado). */
  velocidade_corrigida: number
}

export interface VersaoLetra {
  id: number
  titulo: string
  artista: string
  album: string
  duracao: number | null
  sincronizada: boolean
  instrumental: boolean
  /** Segundos de diferença para a duração da música (null = não dá para comparar). */
  diferenca: number | null
}

/** Um verso da letra. `tempo` em segundos; null quando a letra não é sincronizada. */
export interface Verso {
  tempo: number | null
  texto: string
}

export interface Capa {
  album: string
  artista: string
  url: string
}
