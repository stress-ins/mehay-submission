export type ManualIllustrationSource = {
  url?: string;
  manualId?: string;
  illustrationPage?: number;
  figureNumber?: string;
  illustrationCaption?: string;
};

export function manualIllustrationPath(source: ManualIllustrationSource): string | null {
  const { manualId, illustrationPage } = source;
  if (!manualId || !/^[a-zA-Z0-9_-]+$/.test(manualId) || !Number.isSafeInteger(illustrationPage) || (illustrationPage as number) < 1) return null;
  if (source.url) {
    try {
      const manualUrl = new URL(source.url, "http://localhost");
      const pathId = manualUrl.pathname.match(/\/api\/manuals\/([a-zA-Z0-9_-]+)\.pdf$/)?.[1];
      if (pathId !== manualId) return null;
    } catch { return null; }
  }
  return `/api/manuals/${encodeURIComponent(manualId)}/pages/${illustrationPage}.png`;
}

export function sourceHref(source: { url: string; pdfPage?: number }, origin: string, appPath: (path: string) => string): string | null {
  try {
    const absolute = /^https?:\/\//i.test(source.url);
    if (!absolute && (!source.url.startsWith("/") || source.url.startsWith("//"))) return null;
    const url = new URL(source.url, origin);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const manualPath = url.pathname.match(/\/api\/manuals\/[a-zA-Z0-9_-]+\.pdf$/)?.[0];
    if (url.origin === origin && manualPath && [manualPath, appPath(manualPath)].includes(url.pathname)) {
      url.pathname = appPath(manualPath);
    } else if (!absolute) return null;
    if (source.pdfPage && Number.isSafeInteger(source.pdfPage) && source.pdfPage > 0 && /\.pdf$/i.test(url.pathname)) url.hash = `page=${source.pdfPage}`;
    return url.href;
  } catch { return null; }
}
