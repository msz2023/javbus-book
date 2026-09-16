import { useEffect } from 'react'
import { IconChevronLeft, IconChevronRight, IconClose } from './Icons'

interface Props {
  images: string[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}

export function Lightbox({ images, index, onIndex, onClose }: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, images.length, onIndex, onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-8 backdrop-blur"
      onClick={onClose}
    >
      <img
        src={images[index]}
        alt=""
        className="max-h-full max-w-full animate-fade-up rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      <button className="btn-ghost absolute right-4 top-4 h-9 w-9 !px-0" onClick={onClose}>
        <IconClose width={18} height={18} />
      </button>

      {images.length > 1 && (
        <>
          <button
            className="btn-ghost absolute left-4 h-11 w-11 !px-0 disabled:opacity-20"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation()
              onIndex(index - 1)
            }}
          >
            <IconChevronLeft width={22} height={22} />
          </button>
          <button
            className="btn-ghost absolute right-4 h-11 w-11 !px-0 disabled:opacity-20"
            disabled={index === images.length - 1}
            onClick={(e) => {
              e.stopPropagation()
              onIndex(index + 1)
            }}
          >
            <IconChevronRight width={22} height={22} />
          </button>
          <div className="absolute bottom-5 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-300">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  )
}
