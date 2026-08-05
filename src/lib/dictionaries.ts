import type { Locale } from "@/lib/i18n-config";

const bg = {
  header: {
    location: "Събития в цяла България",
    benefits: "Сигурни билети · Потвърден имейл · Бързо изтегляне",
    homeAria: "Tiketko — начална страница",
    searchLabel: "Търси събитие, артист или място",
    searchPlaceholder: "Търси събитие, артист или място",
    allEvents: "Всички събития",
    organizer: "Организатор",
    signIn: "Вход",
    signOut: "Изход от профила",
    browseMenu: "Меню за разглеждане",
    eventCategories: "Категории събития",
    upcoming: "Предстоящи събития",
    concerts: "Концерти",
    theatre: "Театър",
    festivals: "Фестивали",
    sports: "Спорт",
    language: "Език",
  },
  footer: {
    description:
      "Билети за най-очакваните концерти, фестивали, театрални постановки и спортни събития в България.",
    protectedOrder: "Защитена покупка",
    emailTicket: "Билет по имейл",
    allEvents: "Всички събития",
    myProfile: "Моят профил",
    calendar: "Календар",
    help: "Помощ",
    helpText:
      "Информация за електронните билети, достъпа до събития и защитата на личните данни.",
    terms: "Условия",
    privacy: "Поверителност",
    rights: "Всички права запазени.",
    termsFull: "Условия за ползване",
    cookies: "Бисквитки",
  },
  card: {
    featured: "Препоръчано",
    ticketsFrom: "Билети от",
  },
  pagination: {
    label: "Страници с резултати",
    previous: "Предишна страница",
    back: "Назад",
    next: "Следваща страница",
    forward: "Напред",
    page: "Страница",
  },
} as const;

type DeepStringShape<T> = {
  [Key in keyof T]: T[Key] extends string
    ? string
    : T[Key] extends Record<string, unknown>
      ? DeepStringShape<T[Key]>
      : never;
};

export type Dictionary = DeepStringShape<typeof bg>;

const en: Dictionary = {
  header: {
    location: "Events across Bulgaria",
    benefits: "Secure tickets · Verified email · Instant download",
    homeAria: "Tiketko — home",
    searchLabel: "Search by event, artist or venue",
    searchPlaceholder: "Search by event, artist or venue",
    allEvents: "All events",
    organizer: "Organizer",
    signIn: "Sign in",
    signOut: "Sign out",
    browseMenu: "Browse menu",
    eventCategories: "Event categories",
    upcoming: "Upcoming events",
    concerts: "Concerts",
    theatre: "Theatre",
    festivals: "Festivals",
    sports: "Sports",
    language: "Language",
  },
  footer: {
    description:
      "Tickets for the most anticipated concerts, festivals, theatre performances and sporting events in Bulgaria.",
    protectedOrder: "Secure booking",
    emailTicket: "Ticket by email",
    allEvents: "All events",
    myProfile: "My account",
    calendar: "Calendar",
    help: "Help",
    helpText:
      "Information about e-tickets, event admission and personal data protection.",
    terms: "Terms",
    privacy: "Privacy",
    rights: "All rights reserved.",
    termsFull: "Terms of use",
    cookies: "Cookies",
  },
  card: {
    featured: "Featured",
    ticketsFrom: "Tickets from",
  },
  pagination: {
    label: "Result pages",
    previous: "Previous page",
    back: "Back",
    next: "Next page",
    forward: "Next",
    page: "Page",
  },
};

const dictionaries: Record<Locale, Dictionary> = { bg, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
