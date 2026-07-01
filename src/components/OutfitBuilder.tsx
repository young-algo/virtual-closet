import React, { useState } from 'react';
import { Layers, Plus, X, Check, Luggage, Trash2, AlertCircle } from 'lucide-react';
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
  onStartBuilding: () => void;
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
  onStartBuilding,
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-heading)' }}>Outfits</h2>
          {outfits.length > 0 && (
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-primary)',
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-color)'
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
              border: '1px solid var(--accent-primary)',
              backgroundColor: 'transparent',
              color: 'var(--accent-primary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={16} />
            New Outfit
          </button>
        )}
      </div>

      {/* Build mode panel */}
      {isBuilding && (
        <div style={{
          backgroundColor: 'var(--accent-muted)',
          border: '1px solid var(--accent-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)', color: 'var(--accent-primary)' }}>
                Building an outfit
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Click garments in your closet below to add or remove them. Select at least 2 items.
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
                      borderRadius: '50%',
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
              color: '#ff6b6b',
              backgroundColor: 'rgba(255, 107, 107, 0.1)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              border: '1px solid rgba(255, 107, 107, 0.25)'
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
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '10px 18px',
                borderRadius: 'var(--radius-sm)',
                cursor: canSave ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Check size={16} />
              Save Outfit ({selectedItems.length})
            </button>
          </div>
        </div>
      )}

      {/* Saved outfits shelf */}
      {outfits.length === 0 && !isBuilding ? (
        <div style={{
          padding: '20px',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-color)',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 auto' }}>
            No outfits yet. Click "New Outfit" and pick two or more garments to create your first look.
          </p>
        </div>
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
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: 'var(--shadow-sm)'
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {outfitItems.length} {outfitItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
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
                      alignItems: 'center',
                      flexShrink: 0
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#ff6b6b')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <Trash2 size={15} />
                  </button>
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
                        backgroundColor: '#ff6b6b',
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
                      padding: '9px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      backgroundColor: justPacked ? 'var(--accent-muted)' : 'var(--accent-primary)',
                      color: justPacked ? 'var(--accent-primary)' : 'var(--bg-surface)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
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
