import { useCallback, useEffect, useRef, useState } from 'react'

// Wraps an <audio> element and reports the current time every frame while playing,
// so the playhead and piano roll move smoothly.
export function usePlayback(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      setTime(0)
      audio.currentTime = 0
    }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.pause()
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  // New track: stop and rewind.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    setTime(0)
    if (src) audio.src = src
    else audio.removeAttribute('src')
  }, [src])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      if (audioRef.current) setTime(audioRef.current.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !src) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [src])

  const seek = useCallback((sec: number) => {
    const audio = audioRef.current
    if (!audio || !src) return
    audio.currentTime = Math.max(0, sec)
    setTime(audio.currentTime)
    if (audio.paused) void audio.play()
  }, [src])

  return { playing, time, toggle, seek }
}
