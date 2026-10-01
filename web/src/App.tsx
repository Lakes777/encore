import { useRota } from './logica/rota.ts'
import { TelaInicio } from './telas/TelaInicio.tsx'
import { TelaMusica } from './telas/TelaMusica.tsx'

export default function App() {
  const rota = useRota()
  // key: trocar de música recria a tela (players, letra e volumes começam do zero)
  return rota.tela === 'musica' ? <TelaMusica key={rota.id} id={rota.id} /> : <TelaInicio />
}
