import type { Verso } from './tipos.ts'

/** A letra tem tempo em algum verso? (Sem tempo, a tela mostra o texto inteiro parado.) */
export function letraSincronizada(versos: readonly Verso[]) {
  return versos.some((verso) => verso.tempo != null)
}

/**
 * Índice do verso que está sendo cantado: o último com tempo <= tempo atual.
 * -1 antes do primeiro verso (ou se nenhum tem tempo). Versos com o mesmo tempo:
 * fica o último deles, que é o que aparece por último no arquivo da letra.
 * Versos sem tempo (null) nunca ficam atuais.
 */
export function indiceDoVersoAtual(versos: readonly Verso[], tempo: number) {
  let atual = -1
  versos.forEach((verso, indice) => {
    if (verso.tempo != null && verso.tempo <= tempo) atual = indice
  })
  return atual
}

/** Os versos com o tempo somado ao atraso (positivo = a voz vem depois do que a letra diz). */
export function deslocarVersos(versos: readonly Verso[], atraso: number): Verso[] {
  if (!atraso) return [...versos]
  return versos.map((verso) => (verso.tempo == null ? verso : { ...verso, tempo: Math.max(0, verso.tempo + atraso) }))
}

/** Trecho em que a voz principal está soando: [início, fim] em segundos. */
export type TrechoDeVoz = readonly [number, number]

// A letra do LRCLIB costuma ter sido sincronizada com outra edição da música
// (no Help!, a voz vinha 0,5 s depois em quase todos os versos). Procura o
// deslocamento que põe o maior número de versos em cima de um começo de voz.
const ATRASO_MAXIMO = 3
const PASSO_DO_ATRASO = 0.05
const TOLERANCIA = 0.15 // segundos entre o verso e o começo da voz para contar como "encaixou"
const MINIMO_DE_VERSOS = 4

/**
 * Atraso que melhor encaixa os versos nos começos de voz, arredondado a 0,05 s,
 * ou null se não der para confiar (poucos versos encaixam em qualquer deslocamento).
 * Versos de fundo, como "(Help)", não batem com a voz principal; por isso a conta
 * olha quantos encaixam, e não a média de todos.
 */
export function estimarAtraso(versos: readonly Verso[], trechos: readonly TrechoDeVoz[]): number | null {
  const tempos = versos.map((verso) => verso.tempo).filter((tempo): tempo is number => tempo != null)
  const comecos = trechos.map(([inicio]) => inicio)
  if (tempos.length < MINIMO_DE_VERSOS || comecos.length === 0) return null

  const distancia = (alvo: number) => Math.min(...comecos.map((comeco) => Math.abs(comeco - alvo)))
  let melhor = { encaixes: 0, atraso: 0 }
  const passos = Math.round(ATRASO_MAXIMO / PASSO_DO_ATRASO)
  for (let passo = -passos; passo <= passos; passo++) {
    const atraso = passo * PASSO_DO_ATRASO
    const encaixes = tempos.filter((tempo) => distancia(tempo + atraso) <= TOLERANCIA).length
    // Empate: fica o deslocamento menor (o mais perto de confiar na letra como veio)
    if (encaixes > melhor.encaixes || (encaixes === melhor.encaixes && Math.abs(atraso) < Math.abs(melhor.atraso))) {
      melhor = { encaixes, atraso }
    }
  }
  const minimo = Math.max(MINIMO_DE_VERSOS, Math.ceil(tempos.length * 0.3))
  if (melhor.encaixes < minimo) return null

  // A tolerância faz vários deslocamentos vizinhos encaixarem os mesmos versos;
  // o valor fino é a mediana da diferença entre cada um desses versos e a voz.
  const diferencas = tempos
    .filter((tempo) => distancia(tempo + melhor.atraso) <= TOLERANCIA)
    .map((tempo) => comecoMaisPerto(comecos, tempo + melhor.atraso) - tempo)
    .sort((a, b) => a - b)
  const meio = diferencas.length / 2
  const mediana = diferencas.length % 2 ? diferencas[Math.floor(meio)] : (diferencas[meio - 1] + diferencas[meio]) / 2
  // Menos de 0,1 s ninguém percebe: deixa a letra como veio
  return Math.abs(mediana) < 0.1 ? 0 : arredondar(mediana)
}

function comecoMaisPerto(comecos: readonly number[], alvo: number) {
  return comecos.reduce((perto, comeco) => (Math.abs(comeco - alvo) < Math.abs(perto - alvo) ? comeco : perto))
}

/** De 0,05 em 0,05 s, sem sobras de ponto flutuante (0,55 e não 0,5500000001). */
function arredondar(segundos: number) {
  return Math.round(segundos * 20) / 20
}
