'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { cn } from './cn';

const CONTROL =
  'block w-full rounded-md border border-border-strong bg-surface px-3 text-base text-foreground ' +
  'placeholder:text-foreground-muted focus:outline-2 focus:outline-offset-1 focus:outline-focus ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted aria-invalid:border-danger';

interface FieldFrameProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean | undefined;
  className?: string | undefined;
}

interface FieldIds {
  id: string;
  hintId: string | undefined;
  errorId: string | undefined;
  describedBy: string | undefined;
}

function useFieldIds(explicitId: string | undefined, hint: ReactNode, error: ReactNode): FieldIds {
  const generated = useId();
  const id = explicitId ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return { id, hintId, errorId, describedBy };
}

function HintAndError({ ids, hint, error }: { ids: FieldIds; hint: ReactNode; error: ReactNode }) {
  return (
    <>
      {hint ? (
        <p id={ids.hintId} className="text-sm text-foreground-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

function FieldFrame({
  label,
  hint,
  error,
  required,
  className,
  ids,
  children,
}: FieldFrameProps & { ids: FieldIds; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={ids.id} className="text-sm font-semibold text-foreground">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>
      {children}
      <HintAndError ids={ids} hint={hint} error={error} />
    </div>
  );
}

function controlAria(ids: FieldIds, error: ReactNode) {
  return { 'aria-invalid': error ? true : undefined, 'aria-describedby': ids.describedBy } as const;
}

export interface TextFieldProps
  extends FieldFrameProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'required'> {}

export function TextField({ label, hint, error, required, className, id, ...rest }: TextFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={className} ids={ids}>
      <input
        id={ids.id}
        required={required}
        {...controlAria(ids, error)}
        className={cn(CONTROL, 'min-h-11')}
        {...rest}
      />
    </FieldFrame>
  );
}

export interface TextareaFieldProps
  extends FieldFrameProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'required'> {}

export function TextareaField({
  label,
  hint,
  error,
  required,
  className,
  id,
  rows = 4,
  ...rest
}: TextareaFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={className} ids={ids}>
      <textarea
        id={ids.id}
        rows={rows}
        required={required}
        {...controlAria(ids, error)}
        className={cn(CONTROL, 'py-2')}
        {...rest}
      />
    </FieldFrame>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps
  extends FieldFrameProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'required'> {
  options: readonly SelectOption[];
  /** Shown as a first, empty choice. */
  placeholder?: string;
}

/** A native select: the most accessible choice on every platform, styled to match. */
export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  id,
  options,
  placeholder,
  ...rest
}: SelectFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={className} ids={ids}>
      <div className="relative">
        <select
          id={ids.id}
          required={required}
          {...controlAria(ids, error)}
          className={cn(CONTROL, 'min-h-11 appearance-none pr-10')}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-foreground-muted"
        >
          <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </div>
    </FieldFrame>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}

export function Checkbox({ label, hint, error, className, id, ...rest }: CheckboxProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <div className={cn('flex gap-3', className)}>
      <input
        id={ids.id}
        type="checkbox"
        {...controlAria(ids, error)}
        className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        {...rest}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={ids.id} className="text-base text-foreground">
          {label}
        </label>
        <HintAndError ids={ids} hint={hint} error={error} />
      </div>
    </div>
  );
}

export interface RadioOption extends SelectOption {
  description?: string;
}

export interface RadioGroupProps {
  legend: ReactNode;
  name: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: ReactNode;
  className?: string;
}

/** A fieldset of native radios: arrow keys move between options without extra code. */
export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  error,
  className,
}: RadioGroupProps) {
  const base = useId();
  const errorId = error ? `${base}-error` : undefined;
  return (
    <fieldset className={cn('flex flex-col gap-2', className)} aria-describedby={errorId}>
      <legend className="mb-1 text-sm font-semibold text-foreground">{legend}</legend>
      {options.map((option, index) => {
        const optionId = `${base}-${index}`;
        return (
          <label
            key={option.value}
            htmlFor={optionId}
            className="flex cursor-pointer gap-3 rounded-md border border-border bg-surface p-3 has-checked:border-primary has-checked:bg-primary-soft has-disabled:cursor-not-allowed has-disabled:opacity-60"
          >
            <input
              id={optionId}
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              {...(value !== undefined ? { checked: value === option.value } : {})}
              {...(defaultValue !== undefined ? { defaultChecked: defaultValue === option.value } : {})}
              {...(onChange ? { onChange: () => onChange(option.value) } : {})}
              className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{option.label}</span>
              {option.description ? (
                <span className="text-sm text-foreground-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
