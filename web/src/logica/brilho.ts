/**
 * Brilho que segue o mouse nos cartões com a classe .spot (o mesmo do portfólio):
 * guarda a posição do ponteiro dentro do cartão em --mx e --my, que o CSS usa
 * para acender o fundo e a borda perto do cursor. Um ouvinte só, para a página toda.
 */
export function ligarBrilho(raiz: Document = document) {
  function aoMover(evento: PointerEvent) {
    if (evento.pointerType !== 'mouse' || !(evento.target instanceof Element)) return
    const cartao = evento.target.closest<HTMLElement>('.spot')
    if (!cartao) return
    const caixa = cartao.getBoundingClientRect()
    cartao.style.setProperty('--mx', `${evento.clientX - caixa.left}px`)
    cartao.style.setProperty('--my', `${evento.clientY - caixa.top}px`)
  }
  raiz.addEventListener('pointermove', aoMover, { passive: true })
  return () => raiz.removeEventListener('pointermove', aoMover)
}
