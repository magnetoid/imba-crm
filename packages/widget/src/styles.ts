// Shadow-DOM-scoped styles for the widget. Inlined into widget.js so the
// host site doesn't need to load anything extra.
export const STYLES = /* css */ `
  :host { all: initial; }

  *, *::before, *::after { box-sizing: border-box; }

  .root {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111;
  }

  /* Launcher button */
  .launcher {
    width: 56px;
    height: 56px;
    border-radius: 28px;
    border: none;
    background: var(--imba-accent, #0a0a0a);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .launcher:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25); }
  .launcher svg { width: 24px; height: 24px; fill: currentColor; }

  /* Slide-up panel */
  .panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 360px;
    height: 540px;
    max-height: calc(100vh - 48px);
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateY(20px) scale(0.97);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.18s ease, opacity 0.18s ease;
  }
  .panel.open { transform: none; opacity: 1; pointer-events: auto; }

  @media (max-width: 480px) {
    .panel { right: 12px; left: 12px; bottom: 12px; width: auto; height: 80vh; }
    .root { bottom: 16px; right: 16px; }
  }

  /* Header */
  .header {
    background: var(--imba-accent, #0a0a0a);
    color: #fff;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .header h3 { margin: 0; font-size: 15px; font-weight: 600; }
  .header p  { margin: 2px 0 0; font-size: 12px; opacity: 0.75; }
  .close-btn { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 4px; border-radius: 4px; }
  .close-btn:hover { background: rgba(255, 255, 255, 0.12); }
  .close-btn svg { width: 18px; height: 18px; fill: currentColor; }

  /* Identity form */
  .identify {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
  }
  .identify input {
    width: 100%;
    padding: 9px 11px;
    font-size: 13px;
    border: 1px solid #ddd;
    border-radius: 8px;
    outline: none;
    background: #fff;
    color: #111;
  }
  .identify input:focus { border-color: #888; }
  .identify-row { display: flex; gap: 8px; }
  .identify-row input { flex: 1; }
  .identify p { margin: 0; font-size: 11px; color: #666; }

  /* Messages list */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .msg {
    max-width: 85%;
    padding: 9px 12px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
    word-wrap: break-word;
    white-space: pre-wrap;
  }
  .msg.in  { align-self: flex-start; background: #fff; border: 1px solid #ececec; color: #111; }
  .msg.out { align-self: flex-end;   background: var(--imba-accent, #0a0a0a); color: #fff; }
  .msg .ts { display: block; font-size: 10px; opacity: 0.6; margin-top: 2px; }

  /* Empty state */
  .empty {
    text-align: center;
    color: #888;
    font-size: 12px;
    padding: 32px 16px;
  }

  /* Composer */
  .composer {
    border-top: 1px solid #ececec;
    padding: 10px 12px;
    display: flex;
    gap: 8px;
    background: #fff;
  }
  .composer textarea {
    flex: 1;
    padding: 8px 10px;
    font-size: 13px;
    font-family: inherit;
    border: 1px solid #ddd;
    border-radius: 8px;
    outline: none;
    resize: none;
    min-height: 36px;
    max-height: 100px;
    color: #111;
  }
  .composer textarea:focus { border-color: #888; }
  .composer button {
    background: var(--imba-accent, #0a0a0a);
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .composer button:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Footer */
  .footer {
    padding: 6px 12px;
    border-top: 1px solid #f0f0f0;
    text-align: center;
    font-size: 10px;
    color: #999;
    background: #fff;
  }
  .footer a { color: inherit; text-decoration: none; }
  .footer a:hover { color: #555; }
`
