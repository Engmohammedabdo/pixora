'use client';

interface SettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  dangerous?: boolean;
}

export default function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  dangerous,
}: SettingsToggleProps) {
  return (
    <div className={`flex items-start gap-4 rounded-lg p-4 transition-colors ${
      dangerous && checked ? 'bg-red-50 border border-red-200' : 'hover:bg-slate-50'
    }`}>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          checked
            ? dangerous ? 'bg-red-600' : 'bg-indigo-600'
            : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <div className="flex-1">
        <p className={`text-sm font-medium ${dangerous && checked ? 'text-red-900' : 'text-slate-900'}`}>
          {label}
        </p>
        <p className={`mt-0.5 text-xs ${dangerous && checked ? 'text-red-600' : 'text-slate-500'}`}>
          {description}
        </p>
        {dangerous && checked && (
          <p className="mt-1 text-xs font-medium text-red-700">
            ⚠ This will affect all users immediately
          </p>
        )}
      </div>
    </div>
  );
}
