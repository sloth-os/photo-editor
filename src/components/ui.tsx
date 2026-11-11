import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { X, RotateCcw, type LucideIcon } from "lucide-react";
import type { Control } from "../lib/catalog";

export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  className = "",
  active = false,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  active?: boolean;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""} ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      <Icon size={18} strokeWidth={1.7} />
    </button>
  );
}

export function Slider({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: number;
  onChange: (n: number) => void;
}) {
  const id = useId(),
    { min, max, label, step = 1 } = control;
  const percent = ((value - min) / (max - min)) * 100,
    zero = ((0 - min) / (max - min)) * 100;
  const style = {
    "--fill-start": `${Math.min(min < 0 ? zero : 0, percent)}%`,
    "--fill-end": `${Math.max(min < 0 ? zero : 0, percent)}%`,
    "--thumb": `${percent}%`,
  } as CSSProperties;
  return (
    <div
      className={`slider-control ${value !== control.value ? "changed" : ""}`}
    >
      <div className="slider-label">
        <label htmlFor={id}>{label}</label>
        <button
          className="slider-value"
          onClick={() => onChange(control.value)}
          title={`Reset ${label}`}
        >
          {value > 0 && min < 0 ? "+" : ""}
          {control.key === "exposure" ? `${(value / 50).toFixed(2)} EV` : value}
          {label === "Straighten" || label === "Direction" ? "°" : ""}
        </button>
      </div>
      <div className="range-wrap" style={style}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        {min < 0 && (
          <span className="range-zero" style={{ left: `${zero}%` }} />
        )}
      </div>
    </div>
  );
}

export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    id = useId(),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      root = ref.current;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex="0"]',
        ) || [],
      ).filter((e) => e.offsetParent !== null);
    (focusables()[0] || root)?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const els = focusables(),
          first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={`modal ${className}`}
      >
        <div className="modal-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id={id}>{title}</h2>
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Histogram({ bins }: { bins: number[] }) {
  const path = `M 0 72 ${bins.map((v, i) => `L ${(i / 63) * 260} ${72 - v * 62}`).join(" ")} L 260 72 Z`;
  return (
    <div
      className="histogram"
      aria-label="Image luminance histogram"
      role="img"
    >
      <svg viewBox="0 0 260 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hist-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#68735b" />
            <stop offset=".5" stopColor="#a3b18c" />
            <stop offset="1" stopColor="#d1d8c2" />
          </linearGradient>
        </defs>
        <path d={path} fill="url(#hist-gradient)" opacity=".65" />
        {[65, 130, 195].map((x) => (
          <path
            key={x}
            d={`M ${x} 0 V 75`}
            stroke="#ffffff"
            strokeOpacity=".05"
          />
        ))}
      </svg>
      <div className="hist-labels">
        <span>SHADOWS</span>
        <span>HIGHLIGHTS</span>
      </div>
    </div>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="text-button subtle" onClick={onClick}>
      <RotateCcw size={13} /> Reset
    </button>
  );
}
