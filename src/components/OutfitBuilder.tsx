import React, { useState, useEffect } from 'react';
import { Plus, X, Check, Luggage, Trash2, AlertCircle, Pencil } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';

export interface Outfit {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: number;
}

interface OutfitBuilderProps {
  outfits: Outfit[];
  items: ClosetItem[];
  isBuilding: boolean;
  selectedItems: ClosetItem[];
  editingOutfit: Outfit | null;
  onStartBuilding: () => void;
  onStartEditing: (outfit: Outfit) => void;
  onCancelBuilding: () => void;
  onSaveOutfit: (name: string) => void;
  onToggleSelectItem: (item: ClosetItem) => void;
  onDeleteOutfit: (outfitId: string) => void;
  onAddOutfitToPackingList: (outfit: Outfit) => void;
}

export const OutfitBuilder: React.FC<OutfitBuilderProps> = ({
  outfits,
  items,
  isBuilding,
  selectedItems,
  editingOutfit,
  onStartBuilding,
  onStartEditing,
  onCancelBuilding,
  onSaveOutfit,
  onToggleSelectItem,
  onDeleteOutfit,
  onAddOutfitToPackingList
}) => {
  const [outfitName, setOutfitName] = useState('');
  const [nameError, setNameError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [packedFeedbackId, setPackedFeedbackId] = useState<string | null>(null);

  // Pre-fill the name field when the panel opens in edit mode
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
    onSaveOutfit(outfitName.trim());
    setOutfitName('');
    setNameError('');
  };

  const handleCancel = () => {
    setOutfitName('');
    setNameError('');
    onCancelBuilding();
  };

  const handlePackOutfit = (outfit: Outfit) => {
    onAddOutfitToPackingList(outfit);
    setPackedFeedbackId(outfit.id);
    setTimeout(() => setPackedFeedbackId(prev => (prev === outfit.id ? null : prev)), 2000);
  };

  // Resolve outfit item IDs against the live closet, skipping deleted garments
  const resolveOutfitItems = (outfit: Outfit): ClosetItem[] =>
    outfit.itemIds
      .map(id => items.find(item => item.id === id))
      .filter((item): item is ClosetItem => item !== undefined);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline' }}>
          <h2 style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-heading)'
          }}>
            Outfits
          </h2>
          {outfits.length > 0 && (
            <span style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              letterSpacing: '0.08em'
            }}>
              {outfits.length}
            </span>
          )}
        </div>

        {!isBuilding && (
          <button
            onClick={onStartBuilding}
            className="tap-target"
            style={{
              border: '1px solid var(--text-primary)',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '0.68rem',
              fontWeight: 500,
              padding: '10px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={13} strokeWidth={2} />
            New Outfit
          </button>
        )}
      </div>

      {/* Build mode panel */}
      {isBuilding && (
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
                    backgroundColor: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'visible'
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{ width: '85%', height: '85%', objectFit: 'contain', mixBlendMode: 'multiply' }}
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
      )}

      {/* Saved outfits shelf */}
      {outfits.length === 0 && !isBuilding ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '4px 0 8px' }}>
          No outfits yet. Click "New Outfit" and pick two or more garments to create your first look.
        </p>
      ) : outfits.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px'
        }}>
          {outfits.map(outfit => {
            const outfitItems = resolveOutfitItems(outfit);
            const isConfirmingDelete = deleteConfirmId === outfit.id;
            const justPacked = packedFeedbackId === outfit.id;
            return (
              <article
                key={outfit.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <h3 style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {outfit.name}
                    </h3>
                    <span style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {outfitItems.length} {outfitItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    <button
                      onClick={() => onStartEditing(outfit)}
                      disabled={isBuilding}
                      className="tap-target"
                      title={isBuilding ? 'Finish the current outfit first' : 'Edit outfit'}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--text-muted)',
                        cursor: isBuilding ? 'not-allowed' : 'pointer',
                        opacity: isBuilding ? 0.4 : 1,
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onMouseOver={(e) => { if (!isBuilding) e.currentTarget.style.color = 'var(--accent-primary)'; }}
                      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(isConfirmingDelete ? null : outfit.id)}
                      className="tap-target"
                      title="Delete outfit"
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.color = 'var(--error)')}
                      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Garment thumbnails */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {outfitItems.map(item => (
                    <div
                      key={item.id}
                      title={item.name}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        style={{ width: '85%', height: '85%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                      />
                    </div>
                  ))}
                </div>

                {isConfirmingDelete ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        onDeleteOutfit(outfit.id);
                        setDeleteConfirmId(null);
                      }}
                      className="tap-target"
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        backgroundColor: 'var(--error)',
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="tap-target"
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'transparent',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handlePackOutfit(outfit)}
                    disabled={outfitItems.length === 0}
                    className="tap-target"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: 'none',
                      backgroundColor: justPacked ? 'var(--well)' : 'var(--accent-primary)',
                      color: justPacked ? 'var(--text-primary)' : 'var(--bg-surface)',
                      fontSize: '0.68rem',
                      fontWeight: 500,
                      cursor: outfitItems.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'var(--transition-fast)',
                      opacity: outfitItems.length === 0 ? 0.6 : 1
                    }}
                  >
                    {justPacked ? (
                      <>
                        <Check size={16} />
                        Added to packing list!
                      </>
                    ) : (
                      <>
                        <Luggage size={16} />
                        Add all to packing list
                      </>
                    )}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
export default OutfitBuilder;
