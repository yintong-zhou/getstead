"use client";

import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

type Option = { value: string; label: string };
export type SelectGroup = { label: string; options: Option[] };
type Props = {
  id: string;
  disabled?: boolean;
  "aria-describedby"?: string;
} & ({ options: Option[]; groups?: never } | { groups: SelectGroup[]; options?: never }) & (
  { value: string; onChange: (value: string) => void; name?: never; defaultValue?: never }
  | { name: string; defaultValue?: string; value?: never; onChange?: never }
);

/** Select-only combobox. Focus stays on the labelled trigger while its active option changes. */
export function Select(props: Props) {
  const popupId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const groups = props.groups ?? [{ label: "", options: props.options }];
  const options = groups.flatMap((group) => group.options);
  const initial = props.defaultValue ?? options[0]?.value ?? "";
  const [stored, setStored] = useState(initial);
  // Like a native select, an uncontrolled field falls back when its selected option is removed.
  const value = props.value ?? (options.some((option) => option.value === stored) ? stored : options[0]?.value ?? "");
  const selected = options.findIndex((option) => option.value === value);
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const [open, setOpen] = useState(false);
  const [popupLabel, setPopupLabel] = useState<string>();
  const [position, setPosition] = useState<CSSProperties>({});
  const expanded = open && !props.disabled && options.length > 0;

  function place() {
    const rect = trigger.current!.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = (viewport?.offsetTop ?? 0) + 12;
    let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 12;
    const navigation = document.querySelector<HTMLElement>(".navigation");
    if (navigation && getComputedStyle(navigation).position === "fixed") {
      bottom = Math.min(bottom, navigation.getBoundingClientRect().top - 8);
    }
    const below = Math.max(0, bottom - rect.bottom - 6);
    const above = Math.max(0, rect.top - top - 6);
    const upward = below < 280 && above > below;
    const width = Math.min(rect.width, window.innerWidth - 24);
    setPosition({
      position: "fixed", width,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(upward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      maxHeight: Math.min(280, upward ? above : below),
    });
  }

  function show(index = Math.max(0, selected)) {
    if (props.disabled || options.length === 0) return;
    trigger.current?.focus();
    setPopupLabel(trigger.current?.labels?.[0]?.textContent?.trim() || undefined);
    place();
    search.current = { text: "", time: 0 };
    setActive(index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) {
      if (props.value === undefined) setStored(option.value);
      props.onChange?.(option.value);
    }
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    const form = trigger.current?.form;
    if (!form || props.value !== undefined) return;
    const reset = () => { setStored(initial); setOpen(false); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initial, props.value]);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded) document.getElementById(`${popupId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex, popupId]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") {
      if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      return;
    }
    const now = Date.now();
    const continuingSearch = search.current.text !== "" && now - search.current.time < 700;
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key) && !(event.key === " " && continuingSearch)) {
      event.preventDefault();
      if (!options.length) return;
      if (event.key === "Home" || event.key === "End") {
        const index = event.key === "Home" ? 0 : options.length - 1;
        if (expanded) setActive(index); else show(index);
      } else if (!expanded) {
        show();
      } else if (event.key === "Enter" || event.key === " ") {
        choose(activeIndex);
      } else {
        setActive(Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === "ArrowDown" ? 1 : -1))));
      }
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const text = (continuingSearch ? search.current.text : "") + event.key.toLocaleLowerCase();
    const prefix = [...text].every((letter) => letter === text[0]) ? text[0] : text;
    const current = expanded ? activeIndex : selected;
    // Extending a prefix keeps the current match; single/repeated letters cycle to the next.
    const start = prefix.length > 1 ? current - 1 : current;
    const match = options.findIndex((_, offset) => options[(start + offset + 1 + options.length) % options.length].label.toLocaleLowerCase().startsWith(prefix));
    if (match >= 0) {
      const index = (start + match + 1 + options.length) % options.length;
      if (expanded) setActive(index); else show(index);
    }
    search.current = { text, time: now };
  }

  let offset = 0;
  return (
    <>
      {props.name && <input type="hidden" name={props.name} value={value} disabled={props.disabled} />}
      <button
        ref={trigger} id={props.id} className="field select-trigger" type="button" role="combobox"
        disabled={props.disabled} aria-expanded={expanded} aria-haspopup="listbox" aria-controls={expanded ? popupId : undefined}
        aria-activedescendant={expanded ? `${popupId}-${activeIndex}` : undefined} aria-describedby={props["aria-describedby"]}
        onClick={() => expanded ? setOpen(false) : show()} onKeyDown={keyDown}
        onBlur={() => setOpen(false)}
      >
        <span>{options[selected]?.label ?? "\u2014"}</span><Icon name="chevron" size={18} />
      </button>
      {expanded && createPortal(
        <div ref={popup} id={popupId} role="listbox" aria-label={popupLabel} aria-labelledby={popupLabel ? undefined : props.id} className="select-popup" style={position}
          onPointerDown={(event) => event.preventDefault()}>
          {groups.map((group, groupIndex) => {
            const items = group.options.map((option) => {
              const index = offset++;
              return <div
                key={option.value} id={`${popupId}-${index}`} role="option" aria-selected={value === option.value}
                className={`select-option${index === activeIndex ? " is-active" : ""}`}
                onClick={() => choose(index)}
              >{option.label}</div>;
            });
            return group.label ? <div key={groupIndex} role="group" aria-labelledby={`${popupId}-group-${groupIndex}`}>
              <div id={`${popupId}-group-${groupIndex}`} className="select-group-label">{group.label}</div>{items}
            </div> : <Fragment key={groupIndex}>{items}</Fragment>;
          })}
        </div>, document.body,
      )}
    </>
  );
}
