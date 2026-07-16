import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import type { Outfit } from './OutfitsView';
import { productImageBlendMode } from '../utils/productImagePresentation';

interface OutfitBuildTrayProps {
  selectedItems: ClosetItem[];
  editingOutfit: Outfit | null;
  onCancel: () => void;
  onSave: (name: string) => void;
  onToggleSelectItem: (item: ClosetItem) => void;
}

// The outfit build panel, pinned above the closet grids while selection mode is
// active. Grey-well surface is sanctioned: DESIGN.md's Well Rule covers the
// build panel explicitly.
export const OutfitBuildTray: React.FC<OutfitBuildTrayProps> = ({
  selectedItems,
  editingOutfit,
  onCancel,
  onSave,
  onToggleSelectItem
}) => {
  const [outfitName, setOutfitName] = useState('');
  const [nameError, setNameError] = useState('');

  // Pre-fill the name field when the tray opens in edit mode
  useEffect(() => {
    if (editingOutfit) {
      setOutfitName(editingOutfit.name);
      setNameError('');
    }
  }, [editingOutfit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = selectedItems.length >= 2;

  const handleSave = () => {
    if (!outfitName.trim()) {
      setNameError('Give your outfit a name before saving.');
      return;
    }
    onSave(outfitName.trim());
    setOutfitName('');
    setNameError('');
  };

  const handleCancel = () => {
    setOutfitName('');
    setNameError('');
    onCancel();
  };

  return (
    <div style={{
      backgroundColor: 'var(--well)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            {editingOutfit ? `Editing "${editingOutfit.name}"` : 'Building an outfit'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Click items below to add or remove them — switch between Closet and Sneakers to mix both. Select at least 2 items.
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="tap-target"
          title="Cancel outfit"
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Selected item thumbnails */}
      {selectedItems.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {selectedItems.map(item => (
            <div
              key={item.id}
              title={item.name}
              style={{
                position: 'relative',
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--well)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible'
              }}
            >
              <img
                src={item.image}
                alt={item.name}
                style={{
                  width: '85%',
                  height: '85%',
                  objectFit: 'contain',
                  mixBlendMode: productImageBlendMode(item.category)
                }}
              />
              <button
                onClick={() => onToggleSelectItem(item)}
                className="tap-target"
                title={`Remove ${item.name}`}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '0',
                  border: 'none',
                  backgroundColor: 'var(--text-primary)',
                  color: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X size={11} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {nameError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--error)',
          backgroundColor: 'var(--error-bg)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          border: '1px solid var(--error-border)'
        }}>
          <AlertCircle size={16} />
          <span>{nameError}</span>
        </div>
      )}

      {/* Name + actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Outfit name (e.g. Golf Sunday)"
          value={outfitName}
          onChange={(e) => {
            setOutfitName(e.target.value);
            if (nameError) setNameError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) handleSave();
          }}
          style={{ flex: '1 1 220px', height: '42px' }}
        />
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="tap-target"
          title={canSave ? 'Save outfit' : 'Select at least 2 items to save'}
          style={{
            border: 'none',
            backgroundColor: canSave ? 'var(--accent-primary)' : 'var(--border-color)',
            color: canSave ? 'var(--bg-surface)' : 'var(--text-muted)',
            fontSize: '0.68rem',
            fontWeight: 500,
            padding: '13px 22px',
            cursor: canSave ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Check size={16} />
          {editingOutfit ? 'Update Outfit' : 'Save Outfit'} ({selectedItems.length})
        </button>
      </div>
    </div>
  );
};

export default OutfitBuildTray;
