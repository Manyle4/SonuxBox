import { useEffect, useState } from 'react'

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

// Reads the description out with the browser's own voice, for people without a screen reader.
export function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => () => { if (supported) speechSynthesis.cancel() }, [supported, text])

  if (!supported) return null
  const toggle = () => {
    if (speaking) {
      speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
    setSpeaking(true)
  }
  return (
    <button className="linkbtn" onClick={toggle} aria-pressed={speaking}>
      {speaking ? 'Stop reading' : 'Read aloud'}
    </button>
  )
}
