import React, { useEffect, useRef, useState } from 'react'

type Segment = { speaker: string; text: string; start: number; end?: number }
type Media = { id: number; format: string; size: number }
type Recording = { id: number; status: string; media: Media[] }
type Detail = {
  meeting?: { id: number; platform: string; native_meeting_id: string; status: string; title: string; start_time: string | null; end_time: string | null }
  segments: Segment[]
  recordings: Recording[]
  error?: string
}

export type DrawerTarget = { vexa_meeting_id?: number | string; id?: number; title?: string }

const CHUNK = 4_000_000

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`
}

function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round((seconds || 0) * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
}

function fileBase(detail: Detail, fallback: string) {
  const title = detail.meeting?.title || fallback || 'meeting'
  const date = detail.meeting?.start_time ? new Date(detail.meeting.start_time).toISOString().slice(0, 10) : ''
  return `${date ? date + ' ' : ''}${title}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function bytesLabel(n: number) {
  if (!n) return '0 MB'
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`
}

export default function MeetingDrawer({ target, call, onClose }: {
  target: DrawerTarget
  call: (action: string, payload?: Record<string, any>) => Promise<any>
  onClose: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    call('meeting_detail', target.vexa_meeting_id != null ? { vexa_meeting_id: target.vexa_meeting_id } : { id: target.id })
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setDetail({ segments: [], recordings: [], error: String(e?.message || e) }))
    return () => { alive = false }
  }, [target.vexa_meeting_id, target.id])

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  const media = (detail?.recordings || []).flatMap((r) => r.media.map((m) => ({ ...m, recording_id: r.id, status: r.status })))
  const base = detail ? fileBase(detail, target.title || '') : 'meeting'

  async function loadAudio(): Promise<Blob | null> {
    if (audioBlob) return audioBlob
    const file = media[0]
    if (!file) return null
    setAudioError(null)
    setProgress(0)
    try {
      const parts: BlobPart[] = []
      let offset = 0
      let total = file.size || 0
      let type = 'audio/webm'
      for (let guard = 0; guard < 500; guard++) {
        const chunk = await call('audio_chunk', { recording_id: file.recording_id, media_id: file.id, offset, length: CHUNK })
        const bin = atob(chunk.base64 || '')
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        parts.push(bytes)
        offset += bytes.length
        total = chunk.total || total
        type = chunk.content_type || type
        setProgress(total ? Math.min(99, Math.round((offset / total) * 100)) : 50)
        if (chunk.done || bytes.length === 0) break
      }
      const blob = new Blob(parts, { type })
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
      setProgress(null)
      return blob
    } catch (e: any) {
      setAudioError(String(e?.message || e))
      setProgress(null)
      return null
    }
  }

  async function downloadAudio() {
    const blob = await loadAudio()
    if (blob) saveBlob(blob, `${base}.${media[0]?.format || 'webm'}`)
  }

  function downloadTranscript(kind: 'txt' | 'srt' | 'json') {
    if (!detail) return
    const segs = detail.segments
    let body = ''
    let type = 'text/plain'
    if (kind === 'txt') {
      const header = [detail.meeting?.title, detail.meeting?.start_time ? new Date(detail.meeting.start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''].filter(Boolean).join('\n')
      body = header + '\n\n' + segs.map((s) => `[${clock(s.start)}] ${s.speaker || 'Unknown'}: ${s.text}`).join('\n')
    } else if (kind === 'srt') {
      body = segs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end ?? s.start + 3)}\n${s.speaker ? s.speaker + ': ' : ''}${s.text}\n`).join('\n')
    } else {
      body = JSON.stringify({ meeting: detail.meeting, segments: segs }, null, 2)
      type = 'application/json'
    }
    saveBlob(new Blob([body], { type: `${type};charset=utf-8` }), `${base}.${kind}`)
  }

  async function seek(seconds: number) {
    if (!media.length) return
    if (!audioUrl) await loadAudio()
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = seconds
        audioRef.current.play().catch(() => {})
      }
    }, 50)
  }

  const q = query.trim().toLowerCase()
  const segments = (detail?.segments || []).filter((s) => !q || `${s.speaker} ${s.text}`.toLowerCase().includes(q))
  const speakers = Array.from(new Set((detail?.segments || []).map((s) => s.speaker || 'Unknown')))

  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>{detail?.meeting?.title || target.title || 'Meeting'}</h2>
            {detail?.meeting && (
              <small className="muted">
                {detail.meeting.start_time ? new Date(detail.meeting.start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Not started'}
                {' · '}{detail.meeting.status}{' · '}{speakers.length} speaker{speakers.length === 1 ? '' : 's'}
              </small>
            )}
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        {!detail && <p className="empty">Loading…</p>}
        {detail?.error && <p className="err-text">{detail.error}</p>}

        {detail && !detail.error && (
          <>
            <div className="downloads">
              <span className="dl-label">Transcript</span>
              <button disabled={!detail.segments.length} onClick={() => downloadTranscript('txt')}>.txt</button>
              <button disabled={!detail.segments.length} onClick={() => downloadTranscript('srt')}>.srt</button>
              <button disabled={!detail.segments.length} onClick={() => downloadTranscript('json')}>.json</button>
              <span className="dl-label">Audio</span>
              {media.length ? (
                <>
                  {!audioUrl && <button disabled={progress !== null} onClick={loadAudio}>{progress !== null ? `Loading ${progress}%` : 'Play'}</button>}
                  <button className="primary" disabled={progress !== null} onClick={downloadAudio}>
                    {progress !== null ? `${progress}%` : `Download ${media[0].format} · ${bytesLabel(media[0].size)}`}
                  </button>
                </>
              ) : <span className="muted">No recording</span>}
            </div>
            {media[0]?.status === 'in_progress' && <p className="muted">Recording still in progress — audio so far only.</p>}
            {audioError && <p className="err-text">{audioError}</p>}
            {audioUrl && <audio ref={audioRef} controls src={audioUrl} className="player" />}

            {detail.segments.length > 0 && (
              <input className="seg-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${detail.segments.length} lines`} />
            )}
            {detail.segments.length === 0 && <p className="empty">No transcript yet.</p>}
            <div className="segments">
              {segments.map((s, i) => (
                <div key={i} className="seg">
                  <button className="ts" title={media.length ? 'Play from here' : ''} onClick={() => seek(s.start)}>{clock(s.start)}</button>
                  <div><b>{s.speaker || 'Unknown'}</b> {s.text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
