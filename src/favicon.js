// Live browser favicon for a page. Works in the new tab, the popup and the service worker.
export function faviconUrl(pageUrl, size = 64) {
  const src = new URL(chrome.runtime.getURL('/_favicon/'));
  src.searchParams.set('pageUrl', pageUrl);
  src.searchParams.set('size', String(size));
  return src.href;
}

async function asDataUrl(response) {
  if (!response.ok) throw new Error(`favicon ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get('content-type') || 'image/png';
  return `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`;
}

let globe;

// A copy kept with the link, so the icon shows offline and for sites not visited in this browser.
// Browser cache first; Google's icon service only when the browser has none. Returns '' if neither has one.
export async function saveFavicon(pageUrl) {
  try {
    globe ??= await asDataUrl(await fetch(faviconUrl('https://tabula.invalid/')));
    const local = await asDataUrl(await fetch(faviconUrl(pageUrl)));
    if (local !== globe) return local;

    const host = new URL(pageUrl).hostname;
    if (!host.includes('.') || /^[\d.]+$/.test(host)) return ''; // localhost and LAN names stay private
    return await asDataUrl(await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`));
  } catch {
    return '';
  }
}
