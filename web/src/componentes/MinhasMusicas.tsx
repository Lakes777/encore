import { FileText, Image as IconeImagem, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api, urlDaFaixa, urlDaPrevia } from '../logica/api.ts'
import { descricaoTom } from '../logica/formatar.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { linkDaMusica } from '../logica/rota.ts'
import { NOME_ORIGINAL, type Musica } from '../logica/tipos.ts'
import { inicioDaPrevia } from '../logica/youtube.ts'
import { DialogoFundo } from './DialogoFundo.tsx'
import { DialogoLetra } from './DialogoLetra.tsx'
import { Previa } from './Previa.tsx'

interface Props {
  /** null enquanto carrega. */
  musicas: Musica[] | null
  erro: string
  aoMudar: () => void
  previaAberta: string | null
  abrirPrevia: (chave: string | null) => void
}

type Janela = { tipo: 'letra' | 'fundo'; musica: Musica } | null

export function MinhasMusicas({ musicas, erro, aoMudar, previaAberta, abrirPrevia }: Props) {
  const [janela, setJanela] = useState<Janela>(null)
  const [erroApagar, setErroApagar] = useState('')

  async function apagar(musica: Musica) {
    if (!window.confirm(`Apagar "${musica.titulo}"? As faixas separadas também serão apagadas.`)) return
    setErroApagar('')
    try {
      await api.apagarMusica(musica.id)
      if (previaAberta === `musica:${musica.id}`) abrirPrevia(null)
      aoMudar()
    } catch (falha) {
      setErroApagar(mensagemDoErro(falha))
    }
  }

  return (
    <section className="secao" aria-labelledby="titulo-musicas">
      <h2 id="titulo-musicas">Minhas músicas</h2>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {erroApagar && (
        <p className="erro" role="alert">
          {erroApagar}
        </p>
      )}
      {!musicas && !erro && (
        <p className="texto-fraco" role="status">
          Carregando...
        </p>
      )}
      {musicas && musicas.length === 0 && (
        <p className="texto-fraco">Nenhuma música ainda. Busque uma música acima e adicione na fila: quando ficar pronta, ela aparece aqui.</p>
      )}
      {musicas && musicas.length > 0 && (
        <ul className="lista">
          {musicas.map((musica) => {
            const chavePrevia = `musica:${musica.id}`
            const comPrevia = previaAberta === chavePrevia
            const original = musica.faixas.find((faixa) => faixa.nome === NOME_ORIGINAL)
            return (
              <li key={musica.id} className="cartao musica">
                <div className="musica__linha">
                  <div className="musica__texto">
                    <h3 className="musica__titulo">
                      <a href={linkDaMusica(musica.id)}>{musica.titulo}</a>
                    </h3>
                    {musica.artista && <p className="musica__artista">{musica.artista}</p>}
                    <p className="texto-fraco">
                      {descricaoTom(musica)} · {musica.tem_letra ? 'com letra' : 'sem letra'}
                    </p>
                  </div>
                  <div className="musica__acoes">
                    <button
                      type="button"
                      className="botao botao--icone"
                      aria-label={`Ouvir a prévia de ${musica.titulo}`}
                      title="Ouvir a prévia de novo"
                      aria-pressed={comPrevia}
                      onClick={() => abrirPrevia(comPrevia ? null : chavePrevia)}
                    >
                      <Play size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="botao botao--icone"
                      aria-label={`Escolher a letra de ${musica.titulo}`}
                      title="Escolher a letra"
                      onClick={() => setJanela({ tipo: 'letra', musica })}
                    >
                      <FileText size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="botao botao--icone"
                      aria-label={`Trocar a imagem de fundo de ${musica.titulo}`}
                      title="Trocar a imagem de fundo"
                      onClick={() => setJanela({ tipo: 'fundo', musica })}
                    >
                      <IconeImagem size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="botao botao--icone botao--perigo"
                      aria-label={`Apagar ${musica.titulo}`}
                      title="Apagar"
                      onClick={() => apagar(musica)}
                    >
                      <Trash2 size={18} aria-hidden />
                    </button>
                  </div>
                </div>
                {comPrevia && (
                  <Previa
                    url={original ? urlDaFaixa(musica.id, original.arquivo) : urlDaPrevia(musica.id_video)}
                    idVideo={musica.id_video}
                    inicio={inicioDaPrevia(musica.duracao)}
                    titulo={musica.titulo}
                    aoFechar={() => abrirPrevia(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {janela?.tipo === 'letra' && <DialogoLetra musica={janela.musica} aoFechar={() => setJanela(null)} aoMudar={aoMudar} />}
      {janela?.tipo === 'fundo' && <DialogoFundo musica={janela.musica} aoFechar={() => setJanela(null)} aoMudar={aoMudar} />}
    </section>
  )
}
