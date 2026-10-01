import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Previa } from '../src/componentes/Previa.tsx'

const abrir = () =>
  render(<Previa url="/api/previa/2Q_ZzBGPdqE" idVideo="2Q_ZzBGPdqE" inicio={46} titulo="Help!" aoFechar={() => {}} />)

describe('prévia', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('pula para o início da prévia, toca e para depois de 15 s', () => {
    abrir()
    const audio = screen.getByLabelText<HTMLAudioElement>('Prévia de Help!')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando a prévia…')

    fireEvent.loadedMetadata(audio)
    fireEvent.canPlay(audio)
    expect(audio.currentTime).toBe(46)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    audio.currentTime = 60
    fireEvent.timeUpdate(audio)
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
    audio.currentTime = 61
    fireEvent.timeUpdate(audio)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })

  it('avisa quando o áudio não carrega', () => {
    abrir()
    fireEvent.error(screen.getByLabelText('Prévia de Help!'))
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para tocar a prévia')
  })
})
