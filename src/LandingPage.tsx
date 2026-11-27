import { useState } from "react";
import { Activity, Boxes, ClipboardCheck, Moon, Sun, Wrench } from "lucide-react";

const appBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const appPath = (path: string) => `${appBase}${path === "/" ? "/" : path}`;

export default function LandingPage() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("mehay-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const toggleTheme = () => setTheme((current) => {
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("mehay-theme", next);
    return next;
  });

  return <main className={`landing ${theme}`}>
    <header className="landing-header">
      <a className="landing-brand" href={appPath("/")}><Wrench size={21} /><span>Мехай</span><small>Механик с AI</small></a>
      <nav aria-label="Основная навигация"><a href="#workflow">Как устроена работа</a><a href="#boundaries">Принципы</a></nav>
      <div><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}<span>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span></button><a className="landing-login" href={appPath("/login")}>Войти <span aria-hidden="true">⌄</span></a></div>
    </header>
    <section className="landing-hero">
      <div className="landing-copy">
        <p className="landing-kicker">РАБОЧЕЕ МЕСТО МЕХАНИКА</p>
        <h1>Данные автомобиля,<br />осмотр и план работ<br /><em>в одном контексте.</em></h1>
        <p className="landing-intro">Мехай помогает сверить телеметрию с наблюдениями, сохранить историю обслуживания и подготовить заявку на согласование.</p>
        <div className="landing-actions"><a className="landing-primary" href={appPath("/login")}>Войти в рабочее пространство <span aria-hidden="true">→</span></a><span>Доступны демонстрационные записи с явными метками источника</span></div>
      </div>
      <div className="landing-visual" aria-label="Схема выбора зоны автомобиля">
        <div className="landing-visual-head"><span>КАРТОЧКА АВТОМОБИЛЯ</span><b>Наблюдения по зонам</b></div>
        <div className="landing-schematic">
          <span className="landing-front">ПЕРЕД</span>
          <svg viewBox="0 0 240 330" role="img" aria-label="Контур автомобиля сверху, зоны для записи осмотра">
            <path d="M60 40Q60 18 83 15h74q23 3 23 25l18 40v170l-17 42q-5 18-25 21H84q-20-3-25-21l-17-42V80z" />
            <path d="M76 59q2-15 15-17h58q13 2 15 17l12 32H64zM64 103h112v121H64zM64 236h112l-13 39q-3 10-14 11H91q-11-1-14-11z" />
            <path d="M53 98h134M53 229h134M84 104v118m72-118v118" />
            <rect x="31" y="74" width="24" height="59" rx="8" /><rect x="185" y="74" width="24" height="59" rx="8" /><rect x="31" y="207" width="24" height="59" rx="8" /><rect x="185" y="207" width="24" height="59" rx="8" />
          </svg>
          <span className="landing-zone landing-zone-a">Зона осмотра</span><span className="landing-zone landing-zone-b">Нет записи</span>
        </div>
        <p>Схема помогает выбрать область и записать наблюдение. Она не определяет неисправность.</p>
      </div>
    </section>
    <section className="landing-workflow" id="workflow">
      <div className="landing-section-heading"><p className="landing-kicker">РАБОЧИЙ ПРОЦЕСС</p><h2>От факта осмотра к согласованной работе</h2><p>Каждый шаг сохраняет источник данных и оставляет решение специалисту.</p></div>
      <div className="landing-steps">
        <article><span>01</span><ClipboardCheck size={22} /><h3>Зафиксировать факт</h3><p>Выберите зону, пункт чек-листа или добавьте заметку голосом. Статус «подозрение» отделён от подтверждённого наблюдения.</p></article>
        <article><span>02</span><Activity size={22} /><h3>Сверить контекст</h3><p>История работ, пробег и OBD доступны рядом. Расхождения и демонстрационные измерения отмечаются отдельно.</p></article>
        <article><span>03</span><Boxes size={22} /><h3>Подготовить план</h3><p>Совместимость, остаток и срок поставки помогают составить черновик работ и деталей для согласования.</p></article>
      </div>
    </section>
    <section className="landing-boundaries" id="boundaries"><div><h2>Помощь в решении, не автоматический диагноз</h2><p>Мехай собирает данные в удобный контекст. Механик проверяет факты, редактирует план и явно отправляет его на согласование.</p></div><a href={appPath("/login")}>Открыть рабочее место <span>→</span></a></section>
    <footer className="landing-footer"><span>Мехай · Механик с AI</span><span>Демо-данные не являются сведениями об обслуживании реального автопарка.</span></footer>
  </main>;
}
