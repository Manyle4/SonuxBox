import { useEffect, useRef, useState } from 'react'
import { speak, type Speech } from '../speech'

export function CopyLink() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: the address bar already has the link
    }
  }
  return (
    <button className="linkbtn" onClick={copy} aria-live="polite">
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  )
}

// Reads the description out (recorded voice when available).
export function ReadAloud({ text, recording }: { text: string; recording?: string }) {
  const [speaking, setSpeaking] = useState(false)
  const speechRef = useRef<Speech | null>(null)

  useEffect(() => () => speechRef.current?.stop(), [text]) // new piece: stop talking about the old one

  const toggle = () => {
    if (speaking) {
      speechRef.current?.stop()
      return
    }
    const sp = speak(text, recording)
    speechRef.current = sp
    setSpeaking(true)
    void sp.done.then(() => setSpeaking(false))
  }

  return (
    <button className="linkbtn" onClick={toggle} aria-pressed={speaking}>
      {speaking ? 'Stop reading' : 'Read aloud'}
    </button>
  )
}
