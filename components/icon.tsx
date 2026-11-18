const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  cashFlow: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
  netWorth: "M3 20h18M6 16v-4m6 4V8m6 8V4",
  investments: "M21 12a9 9 0 1 1-9-9v9z M16 3.6A9 9 0 0 1 20.4 8H16z",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M9 21v-7h6v7",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm-2 5h18M8 3v4m8-4v4",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  arrowUp: "M7 17 17 7M7 7h10v10",
  arrowDown: "m7 7 10 10M7 17h10V7",
  chevron: "m6 9 6 6 6-6",
  groceries: "M3 4h2l2.5 11h11l2-7H6m2 11h.01m9.99 0H18",
  dining: "M4 3v5a3 3 0 0 0 6 0V3M7 3v18m13-18c-3 2-5 5-5 10h5m0-10v18",
  transport: "M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-3 9h16M8 15h.01m7.99 0H16m-8 3-2 3m10-3 2 3",
  income: "M3 8h18v12H3z M9 8V5h6v3m-12 5h18m-9-1v2",
  bills: "M6 3h8l4 4v14H6zm8 0v5h4M9 12h6m-6 4h6",
  shopping: "M4 8h16l1 13H3zm4 1V7a4 4 0 0 1 8 0v2",
  electricity: "m13 2-8 12h6l-1 8 9-12h-6z",
  water: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z",
  subscription: "M4 5h16v12H4zm4 16h8",
} as const;

type IconName = keyof typeof paths;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
