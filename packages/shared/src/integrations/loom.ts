// Loom — minimal helpers for embedding personalised videos in outbound
// emails. We don't talk to a Loom REST API directly (their recording
// API is gated). Instead the operator records once on loom.com, pastes
// the share URL into the composer, and we transform it into:
//
//   - an `<a>` thumbnail-style preview (gif of the first frame)
//   - the embed URL for inline rendering in the inbox UI
//
// Provider entry exists in crm_provider_credentials.provider='loom' so
// future Loom-API features (auto-record via SDK) can store the workspace
// id without a schema change.

export interface LoomEmbed {
  videoId: string
  shareUrl: string
  embedUrl: string
  thumbnailUrl: string
  gifUrl: string
}

const LOOM_HOST_RX = /^(?:https?:\/\/)?(?:www\.)?(?:loom\.com)\/(?:share|embed|v)\/([a-z0-9]{20,40})/i

export function parseLoomUrl(url: string): LoomEmbed | null {
  if (!url) return null
  const m = url.match(LOOM_HOST_RX)
  if (!m) return null
  const id = m[1]
  return {
    videoId:      id,
    shareUrl:     `https://www.loom.com/share/${id}`,
    embedUrl:     `https://www.loom.com/embed/${id}`,
    thumbnailUrl: `https://cdn.loom.com/sessions/thumbnails/${id}-with-play.gif`,
    gifUrl:       `https://cdn.loom.com/sessions/thumbnails/${id}.gif`,
  }
}

/** Build the HTML snippet the operator pastes into an email composer.
 *  Renders as a clickable thumbnail that works in every mail client. */
export function buildLoomEmailHtml(input: { url: string; intro?: string }): string | null {
  const embed = parseLoomUrl(input.url)
  if (!embed) return null
  const intro = (input.intro ?? '').trim()
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr>
    <td style="padding:0 0 12px 0;font:14px/1.5 Inter,Arial,sans-serif;color:#111;">
      ${escapeHtml(intro)}
    </td>
  </tr>
  <tr>
    <td>
      <a href="${embed.shareUrl}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">
        <img src="${embed.gifUrl}" alt="Watch video" width="480" style="max-width:100%;border-radius:10px;display:block;border:1px solid #e5e7eb;" />
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 0 0 0;font:12px/1.5 Inter,Arial,sans-serif;color:#6b7280;">
      ▶ <a href="${embed.shareUrl}" target="_blank" rel="noopener" style="color:#ea580c;text-decoration:none;">Watch on Loom</a>
    </td>
  </tr>
</table>`.trim()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string))
}
