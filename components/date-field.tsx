"use client";

import { useId, useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { addMonths, monthOf, monthStart, parseIsoDate, romeToday, toDate } from "@/server/cash-flow/dates";
import { localeTags, type Locale } from "@/server/locale";
import { calendarDays } from "./date-picker-days";
import { Icon } from "./icon";
import { Select } from "./select";
import "./date-field.css";

const copy = {
  en: { date: "Choose date", month: "Choose month", monthName: "Month", year: "Year", chooseYear: "Choose year", previousDecade: "Previous decade", nextDecade: "Next decade", previous: "Previous month", next: "Next month", today: "Today", current: "This month", clear: "Clear", close: "Close" },
  it: { date: "Scegli data", month: "Scegli mese", monthName: "Mese", year: "Anno", chooseYear: "Scegli anno", previousDecade: "Decennio precedente", nextDecade: "Decennio successivo", previous: "Mese precedente", next: "Mese successivo", today: "Oggi", current: "Questo mese", clear: "Cancella", close: "Chiudi" },
};

type Props = Omit<ComponentProps<"input">, "type" | "ref" | "value" | "defaultValue" | "min" | "max" | "onChange"> & {
  locale: Locale;
  type?: "date" | "month";
  min?: string;
  max?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

export function DateField({ locale, type = "date", min, max, value, defaultValue, onValueChange, ...props }: Props) {
  const field = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const yearButton = useRef<HTMLButtonElement>(null);
  const yearsGrid = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const [view, setView] = useState<{ month: string; today: string; selected: string; label: string }>();
  const [focusedDate, setFocusedDate] = useState<string>();
  const [decade, setDecade] = useState<number>();
  const choosingYear = decade !== undefined;
  const labels = copy[locale];
  const monthsOnly = type === "month";
  const pickerLabel = monthsOnly ? labels.month : labels.date;
  const first = min ?? (monthsOnly ? "0001-01" : "0001-01-01");
  const last = max ?? (monthsOnly ? "9999-12" : "9999-12-31");
  const firstMonth = monthOf(first);
  const lastMonth = monthOf(last);
  const canPick = (date: string) => date >= first && date <= last;
  const clampMonth = (month: string) => month < firstMonth ? firstMonth : month > lastMonth ? lastMonth : month;

  useLayoutEffect(() => {
    if (choosingYear) {
      (yearsGrid.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
        ?? yearsGrid.current?.querySelector("button"))?.focus();
    }
  }, [choosingYear]);

  function closeYears() {
    setDecade(undefined);
    yearButton.current?.focus();
  }

  function open() {
    if (!field.current || dialog.current?.open) return;
    const today = romeToday();
    const selected = field.current.value;
    const date = parseIsoDate(monthsOnly ? monthStart(selected) : selected) ?? today;
    const label = field.current.labels?.[0]?.textContent?.trim() || pickerLabel;
    setFocusedDate(undefined);
    setView({ month: clampMonth(monthOf(date)), today, selected, label });
  }

  function choose(next: string) {
    if (!field.current || (next && !canPick(next))) return;
    field.current.value = next;
    onValueChange?.(next);
    dialog.current?.close();
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>, columns: number) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const offset = offsets[event.key];
    if (!offset || !(event.target instanceof HTMLButtonElement)) return;
    const buttons = [...event.currentTarget.querySelectorAll("button")];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    for (let target = index + offset; buttons[target]; target += offset) {
      if (!buttons[target].disabled) {
        buttons[target].focus();
        return;
      }
    }
  }

  const tag = localeTags[locale];
  const monthFormat = new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone: "UTC" });
  const weekdayFormat = new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" });
  const monthNames = view ? Array.from({ length: 12 }, (_, index) => monthFormat.format(new Date(Date.UTC(2024, index)))) : [];
  const shownYear = Number(view?.month.slice(0, 4));
  const minYear = Number(firstMonth.slice(0, 4));
  const maxYear = Number(lastMonth.slice(0, 4));
  const firstYearOnPage = Math.max(minYear, decade ?? minYear);
  const lastYearOnPage = Math.min(maxYear, (decade ?? minYear) + 9);
  const shownMonth = Number(view?.month.slice(5));
  const yearMonth = (year: number, month: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const current = view && (monthsOnly ? monthOf(view.today) : view.today);
  const days = view && !monthsOnly ? calendarDays(view.month, first, last) : [];
  const options = monthsOnly
    ? monthNames.map((label, index) => {
      const date = yearMonth(shownYear, index + 1);
      return { date, label, accessible: label, disabled: !canPick(date), outside: false };
    })
    : days.map((day) => ({ ...day, label: Number(day.date.slice(-2)), accessible: day.outside ? undefined : dayFormat.format(toDate(day.date)) }));
  const initial = options.find(({ date, disabled }) => !disabled && date === focusedDate)
    ?? options.find(({ date, disabled }) => !disabled && date === view?.selected)
    ?? options.find(({ date, disabled }) => !disabled && date === current)
    ?? options.find(({ disabled }) => !disabled);

  return (
    <div className="date-field">
      <input {...props} ref={field} type={type} lang={tag} className="field" min={min} max={max} value={value} defaultValue={defaultValue}
        onChange={(event) => onValueChange?.(event.target.value)}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" && event.currentTarget.type === type && !props.readOnly && !props.disabled) {
            event.preventDefault();
            open();
          }
        }}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowDown" && !props.readOnly) {
            event.preventDefault();
            open();
          }
        }} />
      <button ref={trigger} className="date-field-trigger" type="button" disabled={props.disabled || props.readOnly}
        aria-label={pickerLabel} aria-haspopup="dialog" aria-expanded={Boolean(view)} aria-controls={view ? dialogId : undefined} onClick={open}>
        <Icon name="calendar" size={18} />
      </button>
      {view && <dialog id={dialogId} className="confirm-dialog date-picker" aria-labelledby={titleId}
        ref={(node) => {
          dialog.current = node;
          if (node && !node.open) {
            node.showModal();
            node.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
          }
        }}
        onCancel={(event) => {
          event.stopPropagation();
          if (choosingYear) { event.preventDefault(); closeYears(); }
        }}
        onClose={() => { setDecade(undefined); setView(undefined); trigger.current?.focus(); }}
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="date-picker-body">
          <header className="date-picker-header">
            <h2 id={titleId}>{view.label}</h2>
            <button className="date-picker-icon" type="button" aria-label={labels.close} onClick={() => dialog.current?.close()}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="date-picker-navigation">
            {!monthsOnly && !choosingYear && <>
              <button className="date-picker-icon" type="button" aria-label={labels.previous} disabled={view.month <= firstMonth}
                onClick={() => setView({ ...view, month: addMonths(view.month, -1) })}><Icon name="chevronLeft" size={18} /></button>
              <div className="date-picker-select date-picker-month-select">
                <Select id={`${dialogId}-month`} aria-label={labels.monthName} value={view.month}
                  onChange={(month) => setView({ ...view, month })}
                  options={monthNames.map((label, index) => {
                    const month = yearMonth(shownYear, index + 1);
                    return { value: month, label: label.charAt(0).toLocaleUpperCase(tag) + label.slice(1), disabled: month < firstMonth || month > lastMonth };
                  })} />
              </div>
            </>}
            <button ref={yearButton} className="field select-trigger date-picker-year-select" type="button"
              aria-label={`${labels.chooseYear}: ${shownYear}`} aria-expanded={choosingYear} aria-controls={choosingYear ? `${dialogId}-years` : undefined}
              onClick={() => choosingYear ? closeYears() : setDecade(Math.floor(shownYear / 10) * 10)}>
              <span>{shownYear}</span><Icon name="chevron" size={18} />
            </button>
            {!monthsOnly && !choosingYear && <button className="date-picker-icon" type="button" aria-label={labels.next} disabled={view.month >= lastMonth}
              onClick={() => setView({ ...view, month: addMonths(view.month, 1) })}><Icon name="chevronRight" size={18} /></button>}
          </div>
          {decade !== undefined ? <div id={`${dialogId}-years`}>
            <div className="date-picker-decade">
              <button className="date-picker-icon" type="button" aria-label={labels.previousDecade} disabled={firstYearOnPage <= minYear}
                onClick={() => setDecade(decade - 10)}><Icon name="chevronLeft" size={18} /></button>
              <span aria-live="polite">{firstYearOnPage}–{lastYearOnPage}</span>
              <button className="date-picker-icon" type="button" aria-label={labels.nextDecade} disabled={lastYearOnPage >= maxYear}
                onClick={() => setDecade(decade + 10)}><Icon name="chevronRight" size={18} /></button>
            </div>
            <div ref={yearsGrid} className="date-picker-years" role="group" aria-label={labels.year} onKeyDown={(event) => moveFocus(event, 5)}>
              {Array.from({ length: lastYearOnPage - firstYearOnPage + 1 }, (_, index) => firstYearOnPage + index).map((year) => (
                <button key={year} className="date-picker-cell" type="button" aria-pressed={year === shownYear}
                  onClick={() => {
                    setView({ ...view, month: clampMonth(yearMonth(year, shownMonth)) });
                    closeYears();
                  }}>{year}</button>
              ))}
            </div>
          </div> : <div className={monthsOnly ? "date-picker-months" : "date-picker-days"} onKeyDown={(event) => moveFocus(event, monthsOnly ? 3 : 7)}>
            {!monthsOnly && Array.from({ length: 7 }, (_, index) => weekdayFormat.format(new Date(Date.UTC(2024, 0, index + 1))))
              .map((day) => <span className="date-picker-weekday" key={day} aria-hidden="true">{day}</span>)}
            {options.map(({ date, label, accessible, disabled, outside }) => (
              <button key={date} className="date-picker-cell" type="button" disabled={disabled} aria-hidden={outside || undefined}
                aria-label={accessible} aria-current={date === current ? "date" : undefined} onFocus={() => setFocusedDate(date)}
                aria-pressed={date === view.selected} tabIndex={date === initial?.date ? 0 : -1}
                data-initial-focus={date === initial?.date || undefined} onClick={() => choose(date)}>{label}</button>
            ))}
          </div>}
          <footer className="date-picker-actions">
            {!props.required && <button className="button button-quiet" type="button"
              onClick={() => choose("")}>{labels.clear}</button>}
            <button className="button button-quiet" type="button" disabled={!current || !canPick(current)}
              onClick={() => { if (current) choose(current); }}>{monthsOnly ? labels.current : labels.today}</button>
          </footer>
        </div>
      </dialog>}
    </div>
  );
}
