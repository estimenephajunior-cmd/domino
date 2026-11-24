import { Check, ChevronDown, Palette } from 'lucide-react';
import { useState } from 'react';
import { getTheme, THEMES, type ThemeId } from '../../shared/themes';

export function ThemePicker({ themeId, onChange }: { readonly themeId: ThemeId; readonly onChange: (theme: ThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const selected = getTheme(themeId);
  return (
    <div className="theme-picker">
      <button type="button" className="theme-picker-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${selected.swatch[0]} 50%, ${selected.swatch[1]} 50%)` }} />
        <Palette size={14} /><span className="theme-picker-label">{selected.label}</span><ChevronDown size={13} />
      </button>
      {open ? (
        <div className="theme-picker-menu" role="listbox" aria-label="Table theme">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button" role="option" data-testid={`theme-${theme.id}`} aria-selected={themeId === theme.id} onClick={() => { onChange(theme.id); setOpen(false); }}>
              <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${theme.swatch[0]} 50%, ${theme.swatch[1]} 50%)` }} />
              <span><strong>{theme.label}</strong><small>{theme.description}</small></span>
              {themeId === theme.id ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
