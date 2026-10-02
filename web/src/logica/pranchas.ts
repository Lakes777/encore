/** Pranchas do fundo do lobby (desenhos próprios em web/public/pranchas). */
export const PRANCHAS = ['onda', 'microfone', 'letra', 'mixer', 'partitura', 'metronomo']

/** Cada faixa começa numa prancha diferente, para as três não ficarem alinhadas. */
export const FAIXAS = [0, 2, 4].map((inicio) => [...PRANCHAS.slice(inicio), ...PRANCHAS.slice(0, inicio)])

/** Largura de cada prancha mais o espaço até a próxima, em px (as mesmas do TelaLobby.css). */
const PASSO = { largo: 360 + 28, estreito: 220 + 18 }

/**
 * Quantas vezes o conjunto de pranchas vai em cada metade do trilho: cada metade
 * precisa ser mais larga que a tela (2560 px, ultrawide, zoom reduzido), senão
 * abre um vão no fim de cada volta.
 */
export function repeticoesDoConjunto(larguraDaTela: number, estreita: boolean) {
  const conjunto = PRANCHAS.length * (estreita ? PASSO.estreito : PASSO.largo)
  return Math.max(1, Math.ceil(larguraDaTela / conjunto))
}

/** As repetições para a janela de agora (a maior entre a tela e a janela: zoom reduzido aumenta a janela). */
export function medirRepeticoes() {
  const estreita = window.matchMedia?.('(max-width: 640px)').matches ?? false
  return repeticoesDoConjunto(Math.max(window.screen?.width ?? 0, window.innerWidth), estreita)
}
