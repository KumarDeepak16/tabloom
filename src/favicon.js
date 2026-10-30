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

// Google's copy of a site's icon, for browsers with no icon cache of their own. Local names stay private.
export function remoteFavicon(pageUrl) {
  const host = new URL(pageUrl).hostname;
  if (!host.includes('.') || /^[\d.]+$/.test(host)) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

async function browserFavicon(pageUrl) {
  try {
    globe ??= await asDataUrl(await fetch(faviconUrl('https://tabula.invalid/')));
    const local = await asDataUrl(await fetch(faviconUrl(pageUrl)));
    return local === globe ? '' : local;
  } catch {
    return ''; // no _favicon support in this browser
  }
}

let globe;

// A copy kept with the link, so the icon shows offline and for sites not visited in this browser.
// Browser cache first; Google's icon service only when the browser has none. Returns '' if neither has one.
export async function saveFavicon(pageUrl) {
  const local = await browserFavicon(pageUrl);
  if (local) return local;
  try {
    const remote = remoteFavicon(pageUrl);
    return remote ? await asDataUrl(await fetch(remote)) : '';
  } catch {
    return '';
  }
}
