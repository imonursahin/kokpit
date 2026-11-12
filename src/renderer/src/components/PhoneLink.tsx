import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Icon, Spinner } from './primitives'

const button = { height: 28, padding: '0 12px', borderRadius: 7, border: '1px solid var(--line)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' } as const

export function PhoneLink({ url }: { url: string }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    if (!url) return
    let alive = true
    void QRCode.toDataURL(url, { margin: 1, width: 240 }).then((d) => alive && setQr(d))
    return () => {
      alive = false
    }
  }, [url])
  if (!url)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Spinner size={11} />
        Starting Remote Control. If Claude asks you to trust the folder, answer it above.
      </span>
    )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {qr && <img src={qr} alt="QR code for this session" width={96} height={96} style={{ borderRadius: 6, background: '#fff' }} />}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ color: 'var(--tx)', fontWeight: 500 }}>Scan the code with your phone, or open the session in the Claude app.</span>
        <a href={url} target="_blank" rel="noreferrer" className="selectable" style={{ color: 'var(--tx)', textDecoration: 'underline', textDecorationColor: 'var(--tx3)', textUnderlineOffset: 2, wordBreak: 'break-all' }}>
          {url}
        </a>
        <span>You can hide this window. The session keeps running until you bring it back to Kokpit.</span>
      </span>
    </span>
  )
}

export function PhoneBanner({ url, onShow, onBringBack }: { url: string; onShow?: () => void; onBringBack?: () => void }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel)', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
      <Icon name="mobile_friendly" size={18} color="var(--ok)" />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0, fontSize: 12.5 }}>
        <span style={{ fontWeight: 500 }}>This session is on your phone</span>
        <span style={{ color: 'var(--tx3)' }}>{url ? 'Continue it in the Claude app. Bring it back here to write from Kokpit again.' : 'Starting Remote Control…'}</span>
      </span>
      {onShow && (
        <button onClick={onShow} style={button}>
          Show terminal
        </button>
      )}
      {onBringBack && (
        <button onClick={onBringBack} style={button}>
          Bring back to Kokpit
        </button>
      )}
    </div>
  )
}
