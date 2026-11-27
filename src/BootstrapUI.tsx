import { Children, createContext, useContext, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" };
export function PButton({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className}`.trim()} {...props} />;
}

type TagProps = HTMLAttributes<HTMLSpanElement> & { variant?: string };
export function PTag({ variant = "secondary", className = "", ...props }: TagProps) {
  const color = variant.startsWith("success") ? "success" : variant.startsWith("warning") ? "warning" : variant.startsWith("error") ? "danger" : "secondary";
  return <span className={`badge text-bg-${color} ${className}`.trim()} {...props} />;
}

export function PSpinner({ size = "md", aria }: { size?: "xs" | "sm" | "md"; aria?: Record<string, string> }) {
  const dimensions = size === "xs" ? "0.8rem" : size === "sm" ? "1rem" : "1.5rem";
  return <span className="spinner-border" role="status" aria-label={aria?.["aria-label"] || "Загрузка"} style={{ width: dimensions, height: dimensions, verticalAlign: "middle" }} />;
}

type TabsContextValue = { active: number; select: (index: number) => void; index: number };
const TabsContext = createContext<TabsContextValue | null>(null);
export function PTabs({ activeTabIndex, onUpdate, children, className = "" }: {
  activeTabIndex: number; onUpdate: (event: { detail: { activeTabIndex: number } }) => void; children: ReactNode; className?: string; size?: string;
}) {
  return <div className={className}><div className="nav nav-tabs" role="tablist">{Children.map(children, (child, index) => <TabsContext.Provider key={index} value={{ active: activeTabIndex, index, select: (next) => onUpdate({ detail: { activeTabIndex: next } }) }}>{child}</TabsContext.Provider>)}</div></div>;
}
export function PTabsItem({ label }: { label: string }) {
  const tabs = useContext(TabsContext);
  if (!tabs) return null;
  return <button className={`nav-link ${tabs.index === tabs.active ? "active" : ""}`} type="button" role="tab" aria-selected={tabs.index === tabs.active} onClick={() => tabs.select(tabs.index)}>{label}</button>;
}

export function BootstrapProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
