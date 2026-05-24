import React from 'react'

/**
 * Tiny renderer for the wiki body — keeps things simple so admins don't
 * need to learn markdown. Supports:
 *   - Plain paragraphs (separated by blank lines)
 *   - Headings (lines starting with `# `, `## `, `### `)
 *   - Bullet lists (lines starting with `- ` or `* `)
 *   - Numbered lists (lines starting with `1. `, `2. `, …)
 *   - URLs auto-linked
 *   - Empty lines = paragraph breaks
 *
 * No HTML escaping is needed — React's JSX renders text safely.
 */

const URL_REGEX = /(https?:\/\/[^\s)]+)/g

function renderInline(text: string): React.ReactNode[] {
  // Split on URLs, returning text + anchor nodes.
  const parts: React.ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(URL_REGEX)) {
    const start = m.index ?? 0
    if (start > last) parts.push(text.slice(last, start))
    const url = m[0]
    parts.push(
      <a
        key={`u${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'var(--color-blue, #1e40af)',
          textDecoration: 'underline',
          wordBreak: 'break-all',
        }}
      >
        {url}
      </a>,
    )
    last = start + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function renderWikiBody(body: string): React.ReactNode {
  if (!body.trim()) {
    return (
      <p style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>
        (No content yet.)
      </p>
    )
  }

  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }

    // Heading
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line)
    if (headingMatch) {
      const level = headingMatch[1].length // 1, 2, 3
      const text = headingMatch[2]
      const Tag = (`h${Math.min(level + 1, 4)}` as 'h2' | 'h3' | 'h4')
      const fontSize = level === 1 ? 22 : level === 2 ? 18 : 16
      blocks.push(
        <Tag
          key={`h${key++}`}
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ink)',
            marginTop: 18,
            marginBottom: 6,
            fontSize,
            fontWeight: 600,
          }}
        >
          {renderInline(text)}
        </Tag>,
      )
      i++
      continue
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul
          key={`ul${key++}`}
          style={{
            paddingLeft: 20,
            margin: '8px 0',
            color: 'var(--color-ink)',
          }}
        >
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 4, lineHeight: 1.45 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol
          key={`ol${key++}`}
          style={{
            paddingLeft: 20,
            margin: '8px 0',
            color: 'var(--color-ink)',
          }}
        >
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 4, lineHeight: 1.45 }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // Paragraph (consume consecutive non-empty non-special lines)
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p
        key={`p${key++}`}
        style={{
          margin: '8px 0',
          color: 'var(--color-ink)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {renderInline(para.join('\n'))}
      </p>,
    )
  }

  return <>{blocks}</>
}
