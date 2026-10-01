import { LINK_INICIO } from '../logica/rota.ts'

// Provisória: o subagente da tela da música substitui (player, letra, volumes).
export function TelaMusica({ id }: { id: string }) {
  return (
    <main className="pagina">
      <a href={LINK_INICIO}>Voltar</a>
      <h1>Música {id}</h1>
    </main>
  )
}
