import { normalizePlate } from "./plateSearch";
import { getSystemLanguage } from "./systemLanguage";
import { translateSystemText } from "./systemTranslations";

export default function Plate({
  value,
  size = "normal",
}: {
  value: string;
  size?: "normal" | "compact" | "large";
}) {
  const normalized = normalizePlate(value);
  const match = normalized.match(
    /^([АВЕКМНОРСТУХ])(\d{3})([АВЕКМНОРСТУХ]{2})(\d{2,3})$/,
  );
  const main = match ? `${match[1]} ${match[2]} ${match[3]}` : value;
  return (
    <span className={`ru-plate ${size}`} role="img" aria-label={`${translateSystemText("Регистрационный номер", getSystemLanguage())} ${value}`} title={value}>
      <span className="ru-plate-main" aria-hidden="true">{main}</span>
      <span className="ru-plate-region" aria-hidden="true">
        <b>{match?.[4] || "—"}</b>
        <small><i className="ru-flag" />RUS</small>
      </span>
    </span>
  );
}
