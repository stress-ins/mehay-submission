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
