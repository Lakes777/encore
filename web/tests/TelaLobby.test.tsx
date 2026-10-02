import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { SAIDA_DA_TELA } from '../src/App.tsx'
import { api } from '../src/logica/api.ts'
import type { Musica } from '../src/logica/tipos.ts'
import { TelaInicio } from '../src/telas/TelaInicio.tsx'
import { LINK_GITHUB, TelaLobby } from '../src/telas/TelaLobby.tsx'

// Troca as chamadas de rede por funções falsas; o ErroApi continua o de verdade.
vi.mock('../src/logica/api.ts', async (original) => {
  const modulo = await original<typeof import('../src/logica/api.ts')>()
  const falso = Object.fromEntries(Object.keys(modulo.api).map((nome) => [nome, vi.fn()]))
  return { ...modulo, api: falso }
})

const chamadas = vi.mocked(api)

function musica(id: string): Musica {
  return {
    id,
    id_video: '2Q_ZzBGPdqE',
    titulo: 'Like a Stone',
    artista: 'Audioslave',
    modo: 'rapido',
    duracao: 290,
    tom: 'A',
    escala: 'menor',
    tem_letra: true,
    letra_id: 7,
    faixas: [],
  }
}

beforeEach(() => {
  chamadas.sistema.mockResolvedValue({ dispositivo: 'cpu', modo_padrao: 'rapido', modo_reserva: 'rapido', modos: [] })
  chamadas.fila.mockResolvedValue([])
  chamadas.musicas.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
  window.location.hash = ''
})

describe('lobby', () => {
  it('mostra o nome, os destaques, o Começar e o link do código', async () => {
    render(<TelaLobby />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Karaokê' })).toBeVisible()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /ver o código no github/i })).toHaveAttribute('href', LINK_GITHUB)
    // As pranchas do fundo são decoração: o leitor de tela não as lê
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(document.querySelectorAll('.lobby__prancha').length).toBeGreaterThan(0)
    await act(async () => {})
  })

  it('com músicas prontas, Começar leva para Minhas músicas e mostra quantas são', async () => {
    chamadas.musicas.mockResolvedValue([musica('abcdef123456'), musica('989ba3f6818c')])
    render(<TelaLobby />)
    expect(await screen.findByText('2 músicas prontas para cantar')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/musicas')
  })

  it('sem nenhuma música, Começar leva para a busca', async () => {
    render(<TelaLobby />)
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/buscar')
    expect(screen.queryByText(/prontas para cantar/)).not.toBeInTheDocument()
  })

  it('sem servidor, Começar leva para Minhas músicas (que mostra o erro)', async () => {
    chamadas.musicas.mockRejectedValue(new Error('fora do ar'))
    render(<TelaLobby />)
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/musicas')
  })

  it('o nome no cabeçalho do início volta para o lobby', async () => {
    render(<TelaInicio />)
    expect(screen.getByRole('link', { name: 'Karaokê' })).toHaveAttribute('href', '#/')
    await act(async () => {})
  })
})

describe('rotas do App', () => {
  it.each(['', '#/'])('o lobby aparece no hash "%s"', async (hash) => {
    window.location.hash = hash
    render(<App />)
    expect(screen.getByRole('link', { name: 'Começar' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Seções' })).not.toBeInTheDocument()
    await act(async () => {})
  })

  it('#/musicas abre Minhas músicas, e voltar ao lobby passa pelo fade', async () => {
    window.location.hash = '#/musicas'
    render(<App />)
    expect(screen.getByRole('navigation', { name: 'Seções' })).toBeInTheDocument()
    await act(async () => {})

    vi.useFakeTimers()
    try {
      act(() => {
        window.location.hash = '#/'
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })
      // Durante o fade a tela antiga ainda está lá, saindo
      expect(screen.getByRole('navigation', { name: 'Seções' }).closest('.tela')).toHaveClass('tela--saindo')
      act(() => {
        vi.advanceTimersByTime(SAIDA_DA_TELA)
      })
      expect(screen.getByRole('link', { name: 'Começar' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Seções' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
