import { useState } from "react";
import { manualIllustrationPath, type ManualIllustrationSource } from "./manualIllustrationPath";

export default function ManualIllustration({ source, appPath }: { source: ManualIllustrationSource; appPath: (path: string) => string }) {
  const path = manualIllustrationPath(source);
  const [enlarged, setEnlarged] = useState(false);
  if (!path) return null;
  const caption = [source.figureNumber ? `Рисунок ${source.figureNumber}` : "Страница руководства", source.illustrationCaption].filter(Boolean).join(" · ");
  const image = appPath(path);
  return <div className="manual-illustration">
    <button type="button" className="manual-illustration-thumb" onClick={() => setEnlarged(true)} aria-label={`Увеличить: ${caption}`}>
      <img src={image} alt={caption} loading="lazy" />
    </button>
    <small>{caption}</small>
    {enlarged && <div className="manual-illustration-overlay" role="dialog" aria-modal="true" aria-label={caption} onClick={() => setEnlarged(false)}>
      <button type="button" onClick={() => setEnlarged(false)}>Закрыть</button>
      <img src={image} alt={caption} onClick={(event) => event.stopPropagation()} />
    </div>}
  </div>;
}
