import React, { useState } from 'react';
import { Check, Luggage, Trash2, Pencil, Sparkles } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import { slotForItem, type SlotName } from '../services/stylist';
import AIStylist from './AIStylist';

export interface Outfit {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: number;
  // When false, this outfit is excluded from the AI stylist's taste examples.
  // Optional so outfits saved before this field existed default to seeding.
  seedStylist?: boolean;
  // 'ai' when saved straight from the stylist and never touched since.
  // Cleared the first time Kevin edits the outfit — an edit is his judgment,
  // which turns the outfit into genuine taste. Unedited AI saves are
  // down-weighted as taste examples to avoid a self-reinforcing loop.
  source?: 'ai';
  // Stylist reasoning captured when an AI-generated outfit is saved.
  note?: string;
}

// Slot display order mirrors how an outfit is worn, top to bottom.
const SLOT_ORDER: SlotName[] = ['top', 'layer', 'bottom', 'shoes'];
const SLOT_DISPLAY: Record<SlotName, string> = { top: 'Top', layer: 'Layers', bottom: 'Bottom', shoes: 'Shoes' };

interface SlotGroup { label: string; items: ClosetItem[] }

const groupBySlot = (outfitItems: ClosetItem[]): SlotGroup[] => {
  const groups: SlotGroup[] = SLOT_ORDER.map(slot => ({
    label: SLOT_DISPLAY[slot],
    items: outfitItems.filter(item => slotForItem(item) === slot)
  }));
  const other = outfitItems.filter(item => slotForItem(item) === null);
  if (other.length > 0) groups.push({ label: 'Other', items: other });
  return groups.filter(group => group.items.length > 0);
};

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// One look as a flat-lay collage in a single well. Items arrive slot-ordered
// (top, layer, bottom, shoes), so a 2x2 row-major grid puts the top garment
// upper-left and shoes lower-right when all four slots are present; smaller or
// larger outfits pack the same grid gracefully. Only the first four items are
// composed — the meta line below the well carries the true count.
const LookCollage: React.FC<{ items: ClosetItem[] }> = ({ items }) => {
  const shown = items.slice(0, 4);
  return (
    <div
      className="product-image-container"
      style={{
        aspectRatio: '1',
        backgroundColor: 'var(--well)',
        display: 'grid',
        gridTemplateColumns: shown.length <= 1 ? '1fr' : '1fr 1fr',
        gridTemplateRows: shown.length <= 2 ? '1fr' : '1fr 1fr',
        padding: '12%',
        gap: '6%',
        overflow: 'hidden'
      }}
    >
      {shown.map(item => (
        <div key={item.id} style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              mixBlendMode: 'multiply'
            }}
          />
        </div>
      ))}
    </div>
  );
};

interface OutfitsViewProps {
  outfits: Outfit[];
  items: ClosetItem[];
  onStartEditing: (outfit: Outfit) => void;
  onDeleteOutfit: (outfitId: string) => void;
  onAddOutfitToPackingList: (outfit: Outfit) => void;
  onSaveAIOutfit: (name: string, itemIds: string[], note?: string) => void;
  onToggleSeedStylist: (outfitId: string) => void;
}

// The styling room: AI stylist strip on top, then the lookbook — a grid of
// collage wells, each expandable (one at a time) into the full look view.
export const OutfitsView: React.FC<OutfitsViewProps> = ({
  outfits,
  items,
  onStartEditing,
  onDeleteOutfit,
  onAddOutfitToPackingList,
  onSaveAIOutfit,
  onToggleSeedStylist
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [packedFeedbackId, setPackedFeedbackId] = useState<string | null>(null);
  // At most one look is expanded into its full-width detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    <section style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <AIStylist
        items={items}
        savedOutfits={outfits.filter(outfit => outfit.seedStylist !== false)}
        onSaveAIOutfit={onSaveAIOutfit}
      />

      {outfits.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '4px 0 8px' }}>
          No outfits yet. Use "New Outfit" above to compose a look from your closet, or ask the stylist.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: '48px 28px'
        }}>
          {outfits.map(outfit => {
            const outfitItems = resolveOutfitItems(outfit);
            const slotGroups = groupBySlot(outfitItems);
            const orderedItems = slotGroups.flatMap(group => group.items);
            const isExpanded = expandedId === outfit.id;
            const isConfirmingDelete = deleteConfirmId === outfit.id;
            const justPacked = packedFeedbackId === outfit.id;
            const seeding = outfit.seedStylist !== false;
            return (
              <React.Fragment key={outfit.id}>
                {/* Lookbook cell */}
                <article
                  className="interactive-card"
                  style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                  onClick={() => setExpandedId(prev => (prev === outfit.id ? null : outfit.id))}
                  aria-expanded={isExpanded}
                >
                  <LookCollage items={orderedItems} />
                  <div style={{ padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{
                      fontSize: '0.9rem',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: isExpanded ? 'underline' : 'none',
                      textUnderlineOffset: '4px'
                    }}>
                      {outfit.name}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em'
                    }}>
                      {outfitItems.length} {outfitItems.length === 1 ? 'item' : 'items'}
                      {' · '}{formatDate(outfit.createdAt)}
                      {outfit.source === 'ai' ? ' · AI' : ''}
                    </span>
                  </div>
                </article>

                {/* Expanded look view — spans the full lookbook row below the cell */}
                {isExpanded && (
                  <div style={{
                    gridColumn: '1 / -1',
                    borderTop: '1px solid var(--border-color)',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '28px 0'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        {slotGroups.map(group => (
                          <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase',
                              color: 'var(--text-muted)'
                            }}>
                              {group.label}
                            </span>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              {group.items.map(item => (
                                <figure key={item.id} style={{ width: '140px', margin: 0 }}>
                                  <div style={{
                                    width: '140px',
                                    height: '140px',
                                    backgroundColor: 'var(--well)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    <img
                                      src={item.image}
                                      alt={item.name}
                                      loading="lazy"
                                      style={{ width: '85%', height: '85%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                                    />
                                  </div>
                                  <figcaption style={{ marginTop: '6px' }}>
                                    <span style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      color: 'var(--text-primary)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {item.name}
                                    </span>
                                    {item.brand && (
                                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {item.brand}
                                      </span>
                                    )}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {outfit.note && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '640px' }}>
                          {outfit.note}
                        </p>
                      )}

                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Delete "{outfit.name}"?
                          </span>
                          <button
                            onClick={() => {
                              onDeleteOutfit(outfit.id);
                              setDeleteConfirmId(null);
                              setExpandedId(null);
                            }}
                            className="tap-target"
                            style={{
                              padding: '8px 16px',
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
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            onClick={() => handlePackOutfit(outfit)}
                            disabled={outfitItems.length === 0}
                            className="tap-target"
                            style={{
                              padding: '11px 20px',
                              border: 'none',
                              backgroundColor: justPacked ? 'var(--well)' : 'var(--accent-primary)',
                              color: justPacked ? 'var(--text-primary)' : 'var(--bg-surface)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: outfitItems.length === 0 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'var(--transition-fast)',
                              opacity: outfitItems.length === 0 ? 0.6 : 1
                            }}
                          >
                            {justPacked ? (
                              <>
                                <Check size={15} />
                                Added to packing list!
                              </>
                            ) : (
                              <>
                                <Luggage size={15} />
                                Add all to packing list
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => onStartEditing(outfit)}
                            className="tap-target"
                            title="Swap the garments in this outfit"
                            style={{
                              border: '1px solid var(--border-color)',
                              background: 'none',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              padding: '10px 18px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                          <button
                            onClick={() => onToggleSeedStylist(outfit.id)}
                            className="tap-target"
                            title={seeding
                              ? 'This outfit teaches the AI stylist your taste — click to exclude'
                              : 'Excluded from the AI stylist — click to include'}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: seeding ? 'var(--text-secondary)' : 'var(--text-muted)',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Sparkles size={13} />
                            Seeds stylist taste · {seeding ? 'on' : 'off'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(outfit.id)}
                            className="tap-target"
                            title="Delete outfit"
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '10px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              marginLeft: 'auto'
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--error)')}
                            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default OutfitsView;
