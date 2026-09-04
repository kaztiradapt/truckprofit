import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import styles from "./landing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "fleet-economics.vercel.app";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialCard = `${protocol}://${host}/truckprofit-social-card.png`;

  return {
    title: "TruckProfit — экономика автопарка без таблиц",
    description:
      "Рейсы, расходы, маршруты, водители и управленческая прибыль автопарка в одном кабинете и Telegram-боте.",
    openGraph: {
      title: "TruckProfit — прибыль каждого рейса под контролем",
      description:
        "Водитель передаёт факты через Telegram. Владелец видит рейсы, расходы, статусы и реальную экономику автопарка.",
      type: "website",
      images: [{ url: socialCard, width: 1732, height: 908, alt: "TruckProfit — прибыль каждого рейса под контролем" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "TruckProfit — прибыль каждого рейса под контролем",
      description: "Кабинет владельца и Telegram водителя в едином контуре управления перевозками.",
      images: [socialCard],
    },
  };
}

const capabilities = [
  {
    number: "01",
    title: "Рейсы и маршруты",
    text: "Создавайте рейс с адресами погрузки и выгрузки, километражем, доходом, автомобилем и водителем.",
    accent: "Маршрут на карте",
  },
  {
    number: "02",
    title: "Расходы с чеками",
    text: "Топливо, платные дороги, стоянки и другие затраты сразу привязываются к нужному рейсу.",
    accent: "Чек внутри кабинета",
  },
  {
    number: "03",
    title: "Контроль водителей",
    text: "Текущий статус, история отметок и геопозиции доступны владельцу без звонков и лишних сообщений.",
    accent: "Обновления в реальном времени",
  },
  {
    number: "04",
    title: "Экономика автопарка",
    text: "Доход, расходы, прибыль, маржа, стоимость километра и порожний пробег собраны в едином отчёте.",
    accent: "Фильтры по авто и водителю",
  },
];

const workflow = [
  {
    label: "Владелец",
    title: "Создаёт рейс",
    text: "Выбирает машину и водителя, маршрут, километраж, заказчика, доход и валюту.",
  },
  {
    label: "Водитель",
    title: "Передаёт факты",
    text: "Через Telegram отправляет статус, геометку, пробег, расход и фотографию чека.",
  },
  {
    label: "TruckProfit",
    title: "Собирает экономику",
    text: "Обновляет кабинет и считает показатели рейса, автомобиля и всей компании.",
  },
  {
    label: "Команда",
    title: "Принимает решение",
    text: "Видит отклонения, сравнивает машины и водителей, разбирает результат вместе с ИИ-аналитиком.",
  },
];

const roles = [
  ["Владелец", "Вся экономика и управление компанией"],
  ["Управляющий", "Редактирование операций без критических удалений"],
  ["Диспетчер", "Рейсы, водители, машины и статусы"],
  ["Водитель", "Только свой рейс и быстрые действия в Telegram"],
];

const faqs = [
  [
    "Нужно ли водителю устанавливать отдельное приложение?",
    "Нет. Водитель работает в привычном Telegram-боте: смотрит назначенный рейс, меняет статус, передаёт геопозицию, пробег, расходы и чеки.",
  ],
  [
    "Можно ли учитывать разные валюты?",
    "Да. Компания выбирает основную валюту учёта, а доходы и расходы можно фиксировать в KZT, RUB, USD, CNY и UZS с курсом к валюте компании.",
  ],
  [
    "Подойдёт ли сервис владельцу одной машины?",
    "Да. Владелец может включить режим «я сам водитель» и вести рейсы без добавления отдельного сотрудника.",
  ],
  [
    "Кто видит финансовые показатели?",
    "Доступ определяется ролью. Водитель не видит внутреннюю прибыль компании, а финансовые разделы открываются только сотрудникам с соответствующими правами.",
  ],
  [
    "Что умеет ИИ-аналитик?",
    "Он отвечает на вопросы только по данным и функциям TruckProfit: помогает найти изменения расходов, сравнить машины и объяснить показатели отчёта. На посторонние темы он не отвечает.",
  ],
];

function Brand() {
  return (
    <span className={styles.brand}>
      <Image src="/truckprofit-bot-avatar.png" width={42} height={42} alt="" priority />
      <span>TruckProfit</span>
    </span>
  );
}

export default function Home() {
  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#content">Перейти к содержанию</a>

      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Навигация по презентации">
          <Link href="/" aria-label="TruckProfit — главная"><Brand /></Link>
          <div className={styles.navLinks}>
            <a href="#product">Возможности</a>
            <a href="#workflow">Как работает</a>
            <a href="#reports">Отчёты</a>
            <a href="#security">Доступ</a>
          </div>
          <div className={styles.navActions}>
            <Link className={styles.loginLink} href="/login">Войти</Link>
            <a className={styles.compactCta} href="https://t.me/mxxxn4k" target="_blank" rel="noreferrer">
              Запросить доступ
            </a>
          </div>
        </nav>
      </header>

      <section className={styles.hero} id="content">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span /> Экономика автопарка в реальном времени</p>
          <h1>Знайте прибыль<br />каждого рейса<br /><em>до его закрытия.</em></h1>
          <p className={styles.heroLead}>
            TruckProfit связывает кабинет владельца и Telegram водителя. Рейсы, маршруты,
            расходы, чеки и статусы собираются в одном месте — без разрозненных таблиц и чатов.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryCta} href="https://t.me/mxxxn4k" target="_blank" rel="noreferrer">
              Получить бета-доступ <span>↗</span>
            </a>
            <a className={styles.textCta} href="#product">Посмотреть возможности <span>↓</span></a>
          </div>
          <div className={styles.heroNotes} aria-label="Ключевые преимущества">
            <span><i>✓</i> Водителю достаточно Telegram</span>
            <span><i>✓</i> Данные каждой компании изолированы</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="Пример интерфейса TruckProfit">
          <div className={styles.browserMockup}>
            <div className={styles.browserBar}>
              <span className={styles.browserDots}><i /><i /><i /></span>
              <span className={styles.browserAddress}>app.truckprofit · Обзор</span>
              <span className={styles.browserMenu}>•••</span>
            </div>
            <div className={styles.dashboardMockup}>
              <aside className={styles.mockSidebar}>
                <Brand />
                <span className={styles.mockNavActive}>Обзор</span>
                <span>Рейсы</span>
                <span>Автомобили</span>
                <span>Водители</span>
                <span>Отчёты</span>
                <span>Расходы</span>
                <small>ТОО VECTOR LOGISTICS<br />8 авто · KZT</small>
              </aside>
              <div className={styles.mockContent}>
                <div className={styles.mockHeading}>
                  <div><small>ЭКОНОМИКА АВТОПАРКА</small><strong>Управленческий обзор</strong></div>
                  <span><i /> Онлайн</span>
                </div>
                <div className={styles.mockMetrics}>
                  <span><small>Выручка</small><b>18,4 млн ₸</b><em>1 237 ₸ / км</em></span>
                  <span><small>Все расходы</small><b>12,1 млн ₸</b><em>814 ₸ / км</em></span>
                  <span className={styles.mockProfit}><small>Результат</small><b>6,3 млн ₸</b><em>34,2% маржа</em></span>
                  <span><small>Порожний пробег</small><b>12,8%</b><em>1 903 км</em></span>
                </div>
                <div className={styles.mockTrip}>
                  <div className={styles.mockTripTitle}>
                    <div><small>АКТИВНЫЙ РЕЙС</small><b>Караганда → Ушарал</b><span>Volvo FH · Алексей · сегодня</span></div>
                    <em>В пути</em>
                  </div>
                  <div className={styles.mockTripBody}>
                    <div className={styles.mockRoute}>
                      <span><i /><b>Караганда</b><small>Погрузка · 08:40</small></span>
                      <span><i /><b>Аягоз</b><small>Геометка водителя · 14:25</small></span>
                      <span><i /><b>Ушарал</b><small>Выгрузка</small></span>
                    </div>
                    <div className={styles.mockMap}>
                      <span className={styles.mapLabelOne}>Караганда</span>
                      <span className={styles.mapLabelTwo}>Аягоз</span>
                      <span className={styles.mapLabelThree}>Ушарал</span>
                      <i className={styles.routeOne} />
                      <i className={styles.routeTwo} />
                      <b className={styles.mapPinOne}>A</b>
                      <b className={styles.mapPinTwo}>2</b>
                      <b className={styles.mapPinThree}>B</b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.phoneMockup}>
            <div className={styles.phoneTop}><span>9:41</span><span>● ◔ ▰</span></div>
            <div className={styles.telegramTitle}>
              <Image src="/truckprofit-bot-avatar.png" width={28} height={28} alt="" />
              <span><b>TruckProfit</b><small>бот</small></span>
            </div>
            <div className={styles.telegramChat}>
              <span className={styles.botBubble}>Рейс Караганда → Ушарал<br /><small>Volvo FH · 1 317 км</small></span>
              <span className={styles.userBubble}>Статус: в пути <small>14:24 ✓✓</small></span>
              <span className={styles.botBubble}>Геопозиция сохранена.<br /><small>Комментарий: остановка на отдых</small></span>
            </div>
            <div className={styles.telegramButtons}>
              <span>🚛 Мой рейс</span><span>📍 Геопозиция</span><span>🧾 Добавить расход</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.factStrip} aria-label="Кратко о продукте">
        <span><b>1–20</b><small>машин в небольшом парке</small></span>
        <span><b>5 валют</b><small>KZT · RUB · USD · CNY · UZS</small></span>
        <span><b>2 интерфейса</b><small>кабинет владельца + Telegram</small></span>
        <span><b>1 картина</b><small>от рейса до прибыли</small></span>
      </section>

      <section className={styles.section} id="product">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}><span /> Всё необходимое для контроля рейса</p>
          <h2>Факты появляются там,<br />где вы принимаете решения.</h2>
          <p>Не ещё одна сложная CRM, а понятный рабочий контур для ежедневного управления перевозками.</p>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map((item) => (
            <article className={styles.capabilityCard} key={item.number}>
              <div><span>{item.number}</span><i>↗</i></div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <small>{item.accent}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.workflowSection}`} id="workflow">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}><span /> Один рейс — единая цепочка данных</p>
          <h2>От назначения водителя<br />до управленческой прибыли.</h2>
        </div>
        <div className={styles.workflowGrid}>
          {workflow.map((item, index) => (
            <article key={item.label}>
              <div><span>{String(index + 1).padStart(2, "0")}</span>{index < workflow.length - 1 ? <i /> : null}</div>
              <small>{item.label}</small>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.reportSection}`} id="reports">
        <div className={styles.reportCopy}>
          <p className={styles.kicker}><span /> Отчётность без ручной сборки</p>
          <h2>Смотрите не оборот,<br />а результат.</h2>
          <p>
            Отчёты TruckProfit помогают сравнивать рейсы, машины и водителей, видеть структуру
            расходов и находить отклонения до конца месяца.
          </p>
          <ul>
            <li><i>✓</i><span><b>Прибыль и маржа</b><small>по компании, машине и отдельному рейсу</small></span></li>
            <li><i>✓</i><span><b>Стоимость и прибыль на километр</b><small>с учётом фактического пробега</small></span></li>
            <li><i>✓</i><span><b>Расход топлива и порожняк</b><small>для поиска потерь в операционной работе</small></span></li>
            <li><i>✓</i><span><b>ИИ-аналитик TruckProfit</b><small>отвечает только по данным вашего кабинета</small></span></li>
          </ul>
        </div>
        <div className={styles.reportVisual}>
          <div className={styles.reportVisualTop}>
            <span><small>Период</small><b>Последние 30 дней⌄</b></span>
            <span><small>Автомобиль</small><b>Все автомобили⌄</b></span>
            <span><small>Водитель</small><b>Все водители⌄</b></span>
          </div>
          <div className={styles.reportChart}>
            <div className={styles.chartScale}><span>6 млн</span><span>4 млн</span><span>2 млн</span><span>0</span></div>
            <div className={styles.bars}>
              {[42, 58, 48, 73, 62, 88].map((height, index) => (
                <span key={height} style={{ "--bar-height": `${height}%` } as React.CSSProperties}>
                  <i /><b>{["Апр", "Май", "Июн", "Июл", "Авг", "Сен"][index]}</b>
                </span>
              ))}
            </div>
          </div>
          <div className={styles.aiCard}>
            <span className={styles.aiMark}>AI</span>
            <div><small>ИИ-АНАЛИТИК</small><b>Что изменилось в расходах?</b></div>
            <p>Расход топлива на километр вырос на 8% у двух автомобилей. Основное отклонение — Volvo FH.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.rolesSection}`} id="security">
        <div className={styles.rolesCard}>
          <div className={styles.rolesHeading}>
            <p className={styles.kicker}><span /> Роли и доступы</p>
            <h2>Каждый видит только то,<br />что нужно для его работы.</h2>
          </div>
          <div className={styles.rolesList}>
            {roles.map(([role, description], index) => (
              <div key={role}><span>{String(index + 1).padStart(2, "0")}</span><b>{role}</b><p>{description}</p><i>→</i></div>
            ))}
          </div>
        </div>
        <div className={styles.securityAside}>
          <span className={styles.securityIcon}>⌁</span>
          <h3>Закрытая бета</h3>
          <p>Новые компании подключаются только по персональному приглашению на email или Telegram.</p>
          <ul>
            <li>Изоляция данных компаний</li>
            <li>Настраиваемые права сотрудников</li>
            <li>История ключевых действий</li>
            <li>Поддержка внутри кабинета</li>
          </ul>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}><span /> Частые вопросы</p>
          <h2>Коротко о главном.</h2>
        </div>
        <div className={styles.faqList}>
          {faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>{question}</span><i>+</i></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p className={styles.kicker}><span /> Принимаем первые компании в бету</p>
          <h2>Соберите экономику<br />автопарка в одном месте.</h2>
          <p>Покажем продукт, поможем перенести первые машины и провести тестовый рейс.</p>
        </div>
        <div className={styles.finalActions}>
          <a className={styles.limeCta} href="https://t.me/mxxxn4k" target="_blank" rel="noreferrer">Обсудить подключение <span>↗</span></a>
          <Link href="/login">Уже есть доступ? Войти</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <Brand />
        <p>Управленческая экономика рейсов и автопарка.</p>
        <div><a href="https://t.me/mxxxn4k" target="_blank" rel="noreferrer">Telegram</a><Link href="/login">Личный кабинет</Link></div>
      </footer>
    </main>
  );
}
