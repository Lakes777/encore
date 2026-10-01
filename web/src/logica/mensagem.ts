/** Texto para mostrar na tela a partir de um erro qualquer (o ErroApi já vem em português). */
export function mensagemDoErro(erro: unknown) {
  return erro instanceof Error && erro.message ? erro.message : 'Algo deu errado. Tente de novo.'
}
