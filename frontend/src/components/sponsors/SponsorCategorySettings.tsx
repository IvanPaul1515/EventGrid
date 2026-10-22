import React, { useEffect, useState } from 'react';
import { sponsorsService, SponsorCategory } from '../../services/sponsors.service';
import { CurrencyInput } from '../common/CurrencyInput';
import { SponsorSummary } from '../../types';

export function SponsorCategorySettings({ isAdmin, breakdown, onSaved }: {
  isAdmin: boolean; breakdown: SponsorSummary['byCategory']; onSaved: () => Promise<void>;
}) {
  const [categories, setCategories] = useState<SponsorCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    sponsorsService.getCategories().then(data => { if (active) setCategories(data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <details className="bg-card border border-border rounded-2xl p-4">
    <summary className="text-sm font-bold cursor-pointer">Categorías de patrocinio · valores y desglose</summary>
    <p className="text-xs text-muted-foreground my-3">Valores de referencia de esta edición. No generan compromisos ni pagos automáticamente.</p>
    <div className="space-y-3">
      {categories.map((category, index) => {
        const totals = breakdown?.find(item => item.category === category.name);
        return <div key={category.name} className="flex flex-wrap items-center gap-3 text-xs">
          <strong className="w-24">{category.name}</strong>
          {isAdmin ? <div className="w-40">
            <CurrencyInput aria-label={`Valor ${category.name}`} placeholder="Sin definir" value={category.value ?? ''} onValueChange={value => setCategories(items => items.map((item, i) => i === index ? { ...item, value } : item))} className="w-full rounded-xl px-3 py-2 bg-background border border-border" />
            <label className="flex gap-1 mt-1"><input type="checkbox" checked={category.value === null} onChange={e => setCategories(items => items.map((item, i) => i === index ? { ...item, value: e.target.checked ? null : 0 } : item))} />Sin definir</label>
          </div> : <span>{category.value === null ? 'Sin definir' : `RD$ ${category.value.toLocaleString('es-DO')}`}</span>}
          <span className="text-muted-foreground">{totals?.count ?? 0} registros · Comprometido RD$ {totals?.committed ?? 0} · Recibido RD$ {totals?.received ?? 0} · Pendiente RD$ {totals?.pending ?? 0}</span>
        </div>;
      })}
    </div>
    {isAdmin && <button disabled={saving} onClick={async () => {
      setSaving(true); setMessage('');
      try {
        setCategories(await sponsorsService.configureCategories(Object.fromEntries(categories.map(c => [c.name, c.value]))));
        setMessage('Valores guardados'); await onSaved();
      } catch { setMessage('No fue posible guardar los valores'); }
      finally { setSaving(false); }
    }} className="mt-4 px-4 py-2 rounded-full bg-primary text-white text-xs font-bold disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar valores de esta edición'}</button>}
    <p role="status" className="text-xs mt-2">{message}</p>
  </details>;
}
