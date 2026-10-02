import { Download, FileText, Image as IconeImagem, ListMusic, Mic, Play, Search, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { api, ErroApi, urlDaExportacao, urlDaFaixa, urlDaPrevia } from '../logica/api.ts'
import { descricaoTom, nomeDaMusica } from '../logica/formatar.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { LINK_DA_ABA, linkDaMusica } from '../logica/rota.ts'
import { NOME_ORIGINAL, type Musica } from '../logica/tipos.ts'
import { capaDaMusica, inicioDaPrevia } from '../logica/youtube.ts'
import { Capa } from './Capa.tsx'
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
  const [importando, setImportando] = useState(false)
  const [erroImportar, setErroImportar] = useState('')
  const campoArquivo = useRef<HTMLInputElement>(null)

  async function importar(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    evento.target.value = '' // escolher o mesmo arquivo de novo também dispara
    if (!arquivo) return
    setImportando(true)
    setErroImportar('')
    try {
      try {
        await api.importarMusica(arquivo)
      } catch (falha) {
        // Já existe: a mensagem do servidor pergunta se substitui
        if (!(falha instanceof ErroApi && falha.status === 409)) throw falha
        if (!window.confirm(falha.message)) return
        await api.importarMusica(arquivo, true)
      }
      aoMudar()
    } catch (falha) {
      setErroImportar(mensagemDoErro(falha))
    } finally {
      setImportando(false)
    }
  }

  async function apagar(musica: Musica) {
    if (!window.confirm(`Apagar "${nomeDaMusica(musica)}"? As faixas separadas também serão apagadas.`)) return
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
      <div className="secao__cabecalho">
        <div className="secao__nome">
          <h2 id="titulo-musicas">Minhas músicas</h2>
          {musicas && musicas.length > 0 && (
            <span className="contador" aria-label={`${musicas.length} ${musicas.length === 1 ? 'música' : 'músicas'}`}>
              {musicas.length}
            </span>
          )}
        </div>
        <button
          type="button"
          className="botao"
          onClick={() => campoArquivo.current?.click()}
          disabled={importando}
          title="Trazer uma música exportada em outro computador (.zip)"
        >
          <Upload size={16} aria-hidden />
          {importando ? 'Importando…' : 'Importar'}
        </button>
        <input
          ref={campoArquivo}
          type="file"
          accept=".zip,application/zip"
          className="invisivel"
          tabIndex={-1}
          aria-label="Arquivo .zip da música"
          onChange={importar}
        />
      </div>
      {erroImportar && (
        <p className="erro" role="alert">
          {erroImportar}
        </p>
      )}
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
        <>
          <p className="invisivel" role="status">
            Carregando...
          </p>
          <ul className="lista" aria-hidden>
            {[0, 1, 2].map((indice) => (
              <li key={indice} className="cartao musica musica--esqueleto">
                <div className="musica__linha">
                  <div className="capa musica__capa" />
                  <div className="musica__texto">
                    <span className="esqueleto esqueleto--titulo" />
                    <span className="esqueleto" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {musicas && musicas.length === 0 && (
        <div className="cartao vazio">
          <ListMusic size={28} aria-hidden />
          <p>Nenhuma música ainda.</p>
          <p className="texto-fraco">Busque uma música e adicione na fila: quando ficar pronta, ela aparece aqui.</p>
          <a className="botao botao--principal botao--vivo vazio__acao" href={LINK_DA_ABA.buscar}>
            <Search size={16} aria-hidden />
            Buscar uma música
          </a>
        </div>
      )}
      {musicas && musicas.length > 0 && (
        <ul className="lista">
          {musicas.map((musica) => {
            const chavePrevia = `musica:${musica.id}`
            const comPrevia = previaAberta === chavePrevia
            const original = musica.faixas.find((faixa) => faixa.nome === NOME_ORIGINAL)
            const nome = nomeDaMusica(musica)
            return (
              <li key={musica.id} className="cartao musica spot">
                <div className="musica__linha">
                  {/* A capa também abre a música (fora do Tab: o título já é o link) */}
                  <a href={linkDaMusica(musica.id)} className="musica__capa-link" tabIndex={-1} aria-hidden>
                    <Capa url={capaDaMusica(musica)} className="musica__capa" />
                    <span className="musica__cantar">
                      <Mic size={20} aria-hidden />
                    </span>
                  </a>
                  <div className="musica__texto">
                    <h3 className="musica__titulo">
                      <a href={linkDaMusica(musica.id)} title={nome === musica.titulo ? undefined : musica.titulo}>
                        {nome}
                      </a>
                    </h3>
                    {musica.artista && <p className="musica__artista">{musica.artista}</p>}
                    <p className="texto-fraco musica__detalhes">
                      {descricaoTom(musica)} · {musica.tem_letra ? 'com letra' : 'sem letra'}
                      {musica.versao_pronta && (
                        <span title={`Instrumental: ${musica.versao_pronta.titulo} (${musica.versao_pronta.canal})`}>
                          {' '}
                          · versão pronta
                        </span>
                      )}
                      {musica.aviso && (
                        <span title={musica.aviso}>
                          {' '}
                          · sem versão pronta
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="musica__acoes">
                    <button
                      type="button"
                      className="botao botao--icone"
                      aria-label={`Ouvir a prévia de ${nome}`}
                      title="Ouvir a prévia de novo"
                      aria-pressed={comPrevia}
                      onClick={() => abrirPrevia(comPrevia ? null : chavePrevia)}
                    >
                      <Play size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="botao botao--icone"
                      aria-label={`Escolher a letra de ${nome}`}
                      title="Escolher a letra"
                      onClick={() => setJanela({ tipo: 'letra', musica })}
                    >
                      <FileText size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="botao botao--icone"
                      aria-label={`Trocar a imagem de fundo de ${nome}`}
                      title="Trocar a imagem de fundo"
                      onClick={() => setJanela({ tipo: 'fundo', musica })}
                    >
                      <IconeImagem size={18} aria-hidden />
                    </button>
                    <a
                      className="botao botao--icone"
                      href={urlDaExportacao(musica.id)}
                      download
                      aria-label={`Exportar ${nome}`}
                      title="Exportar (.zip, para levar a outro computador)"
                    >
                      <Download size={18} aria-hidden />
                    </a>
                    <button
                      type="button"
                      className="botao botao--icone botao--perigo"
                      aria-label={`Apagar ${nome}`}
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
                    titulo={nome}
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
