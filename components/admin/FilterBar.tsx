'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

interface FilterOption {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

interface FilterBarProps {
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  filters?: FilterOption[];
  children?: React.ReactNode;
}

export default function FilterBar({
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchValue: controlledSearch,
  filters,
  children,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(controlledSearch || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (controlledSearch !== undefined) setLocalSearch(controlledSearch);
  }, [controlledSearch]);

  function handleSearchChange(value: string) {
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(value);
    }, 300);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative min-w-[240px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Filters */}
      {filters?.map((filter) => (
        <select
          key={filter.key}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">{filter.label}</option>
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {children}
    </div>
  );
}
