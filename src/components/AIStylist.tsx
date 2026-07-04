// src/components/AIStylist.tsx
import React, { useState } from 'react';
import { Sparkles, Lock, LockOpen, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import {
  generateOutfit, missingSlots,
  type StylistRecommendation, type RejectedCombo, type LockedIds, type SlotName
} from '../services/stylist';

interface AIStylistProps {
  items: ClosetItem[];
  onSaveAIOutfit: (name: string, itemIds: string[]) => void;
}

interface LockState { top: boolean; bottom: boolean; shoes: boolean; layers: boolean }
const NO_LOCKS: LockState = { top: false, bottom: false, shoes: false, layers: false };

const SLOT_LABELS: Record<SlotName, string> = { top: 'Top', bottom: 'Bottom', shoes: 'Shoes', layer: 'Layers' };

export const AIStylist: React.FC<AIStylistProps> = ({ items, onSaveAIOutfit }) => {
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<StylistRecommendation | null>(null);
  const [draftName, setDraftName] = useState('');
  const [locks, setLocks] = useState<LockState>(NO_LOCKS);
  const [rejected, setRejected] = useState<RejectedCombo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);
  const [error, setError] = useState('');

  const apiKey = (localStorage.getItem('gemini_api_key') || '').trim();
  const missing = missingSlots(items);
  const byId = new Map(items.map(item => [item.id, item]));

  const resolve = (id: string): ClosetItem | undefined => byId.get(id);

  const lockedIdsFromState = (current: StylistRecommendation): LockedIds => ({
    topId: locks.top ? current.topId : undefined,
    bottomId: locks.bottom ? current.bottomId : undefined,
    shoeId: locks.shoes ? current.shoeId : undefined,
    layerIds: locks.layers && current.layerIds.length > 0 ? current.layerIds : undefined
  });

  const runGeneration = async (locked: LockedIds, history: RejectedCombo[]) => {
    setIsLoading(true);
    setError('');
    try {
      const rec = await generateOutfit({ apiKey, prompt: prompt.trim(), items, locked, rejected: history });
      setDraft(rec);
      setDraftName(rec.outfitName);
      setHasGeneratedOnce(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    setLocks(NO_LOCKS);
    setRejected([]);
    void runGeneration({}, []);
  };

  const handleRegenerate = () => {
    if (!draft) return;
    const combo: RejectedCombo = {
      topId: draft.topId, bottomId: draft.bottomId, shoeId: draft.shoeId, layerIds: draft.layerIds
    };
    const history = [...rejected, combo].slice(-8);
    setRejected(history);
    void runGeneration(lockedIdsFromState(draft), history);
  };

  const handleSave = () => {
    if (!draft || !draftName.trim()) return;
    onSaveAIOutfit(draftName.trim(), [draft.topId, ...draft.layerIds, draft.bottomId, draft.shoeId]);
    handleDiscard();
    setPrompt('');
  };

  const handleDiscard = () => {
    setDraft(null);
    setDraftName('');
    setLocks(NO_LOCKS);
    setRejected([]);
    setError('');
  };

  // Draft items grouped for display: slot key -> items + lock flag
  const slotGroups = draft ? [
    { key: 'top' as const, ids: [draft.topId], locked: locks.top },
    ...(draft.layerIds.length > 0 ? [{ key: 'layers' as const, ids: draft.layerIds, locked: locks.layers }] : []),
    { key: 'bottom' as const, ids: [draft.bottomId], locked: locks.bottom },
    { key: 'shoes' as const, ids: [draft.shoeId], locked: locks.shoes }
  ] : [];

  const slotHeading = (key: 'top' | 'layers' | 'bottom' | 'shoes'): string =>
    key === 'layers' ? SLOT_LABELS.layer : SLOT_LABELS[key];

  const canGenerate = apiKey !== '' && missing.length === 0 && prompt.trim() !== '' && !isLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Prompt bar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Sparkles size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Describe an occasion or a vibe — beach wedding brunch, preppy streetwear…"
          value={prompt}
          disabled={!apiKey || missing.length > 0 || isLoading}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canGenerate) handleGenerate(); }}
          style={{ flex: '1 1 280px', height: '40px' }}
        />
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="tap-target"
          style={{
            border: '1px solid var(--text-primary)',
            backgroundColor: canGenerate ? 'var(--text-primary)' : 'transparent',
            color: canGenerate ? 'var(--bg-surface)' : 'var(--text-muted)',
            borderColor: canGenerate ? 'var(--text-primary)' : 'var(--border-color)',
            fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em',
            padding: '9px 18px', cursor: canGenerate ? 'pointer' : 'not-allowed'
          }}
        >
          {isLoading ? (hasGeneratedOnce ? 'Styling…' : 'Preparing your closet…') : 'Generate'}
        </button>
      </div>

      {/* Disabled-state hints */}
      {!apiKey && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Add your Gemini API key in the Upload panel to enable the stylist.
        </p>
      )}
      {apiKey && missing.length > 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          The stylist needs at least one top, bottom, and pair of sneakers — your closet is missing:{' '}
          {missing.map(s => SLOT_LABELS[s].toLowerCase()).join(', ')}.
        </p>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '0.85rem', color: 'var(--error)',
          borderTop: '1px solid var(--border-color)', paddingTop: '12px'
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => (draft ? handleRegenerate() : handleGenerate())}
            className="tap-target"
            style={{
              border: '1px solid var(--border-color)', background: 'none',
              color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600,
              padding: '6px 14px', cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Draft card */}
      {draft && (
        <div style={{
          borderTop: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
          padding: '18px 0',
          display: 'flex', flexDirection: 'column', gap: '16px',
          opacity: isLoading ? 0.5 : 1, transition: 'var(--transition-fast)'
        }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {slotGroups.map(group => (
              <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => setLocks(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                  className="tap-target"
                  title={group.locked ? 'Unlock — allow regeneration to change this' : 'Lock — keep this on regenerate'}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: group.locked ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}
                >
                  {group.locked ? <Lock size={11} /> : <LockOpen size={11} />}
                  {slotHeading(group.key)}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {group.ids.map(id => {
                    const item = resolve(id);
                    if (!item) return null;
                    return (
                      <div key={id} title={item.name} style={{
                        width: '86px', height: '86px',
                        border: group.locked ? '1px solid var(--text-primary)' : '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: 'var(--bg-surface)'
                      }}>
                        <img src={item.image} alt={item.name}
                          style={{ width: '88%', height: '88%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '640px' }}>
            {draft.stylistNote}
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Outfit name"
              style={{ flex: '1 1 200px', height: '40px' }}
            />
            <button onClick={handleSave} disabled={!draftName.trim() || isLoading} className="tap-target"
              style={{
                border: 'none', backgroundColor: 'var(--text-primary)', color: 'var(--bg-surface)',
                fontSize: '0.8rem', fontWeight: 600, padding: '10px 18px',
                cursor: draftName.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: '6px',
                opacity: draftName.trim() && !isLoading ? 1 : 0.5
              }}>
              <Check size={14} /> Save to outfits
            </button>
            <button onClick={handleRegenerate} disabled={isLoading} className="tap-target"
              style={{
                border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)',
                fontSize: '0.8rem', fontWeight: 600, padding: '10px 18px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
              <RefreshCw size={14} /> Regenerate
            </button>
            <button onClick={handleDiscard} disabled={isLoading} className="tap-target"
              title="Discard draft"
              style={{
                border: 'none', background: 'none', color: 'var(--text-muted)',
                fontSize: '0.8rem', fontWeight: 500, padding: '10px 12px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
              <X size={14} /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIStylist;
