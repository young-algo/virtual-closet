import React, { useState } from 'react';
import { Plus, Check, Luggage, Trash2, Pencil, Sparkles, ChevronDown } from 'lucide-react';
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

interface OutfitBuilderProps {
  outfits: Outfit[];
  items: ClosetItem[];
  isBuilding: boolean;
  onStartBuilding: () => void;
  onStartEditing: (outfit: Outfit) => void;
  onDeleteOutfit: (outfitId: string) => void;
  onAddOutfitToPackingList: (outfit: Outfit) => void;
  onSaveAIOutfit: (name: string, itemIds: string[], note?: string) => void;
  onToggleSeedStylist: (outfitId: string) => void;
}

export const OutfitBuilder: React.FC<OutfitBuilderProps> = ({
  outfits,
  items,
  isBuilding,
  onStartBuilding,
  onStartEditing,
  onDeleteOutfit,
  onAddOutfitToPackingList,
  onSaveAIOutfit,
  onToggleSeedStylist
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [packedFeedbackId, setPackedFeedbackId] = useState<string | null>(null);
  // Accordion: at most one outfit row is expanded into its look view
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


      {/* AI stylist: prompt-to-outfit, above the saved shelf */}
      {!isBuilding && (
        <AIStylist
          items={items}
          savedOutfits={outfits.filter(outfit => outfit.seedStylist !== false)}
          onSaveAIOutfit={onSaveAIOutfit}
        />
      )}

      {/* Saved outfits shelf: hairline-rule rows on the continuous field,
          each expandable into a full look view (accordion, one at a time) */}
      {outfits.length === 0 && !isBuilding ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '4px 0 8px' }}>
          No outfits yet. Click "New Outfit" and pick two or more garments to create your first look.
        </p>
      ) : outfits.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-color)' }}>
          {outfits.map(outfit => {
            const outfitItems = resolveOutfitItems(outfit);
            const slotGroups = groupBySlot(outfitItems);
            const orderedItems = slotGroups.flatMap(group => group.items);
            const isExpanded = expandedId === outfit.id;
            const isConfirmingDelete = deleteConfirmId === outfit.id;
            const justPacked = packedFeedbackId === outfit.id;
            const seeding = outfit.seedStylist !== false;
            return (
              <article key={outfit.id} className="outfit-row">
                <button
                  onClick={() => setExpandedId(prev => (prev === outfit.id ? null : outfit.id))}
                  aria-expanded={isExpanded}
                  className="tap-target"
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    padding: '14px 0',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    color: 'inherit',
                    // Global button styles speak in tracked caps; the row header
                    // carries the outfit name, which keeps its natural case
                    textTransform: 'none',
                    letterSpacing: 'normal'
                  }}
                >
                  <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {outfit.name}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {outfitItems.length} {outfitItems.length === 1 ? 'item' : 'items'}
                      {' · '}{formatDate(outfit.createdAt)}
                      {outfit.note ? ' · AI styled' : ''}
                    </span>
                  </span>
                  {!isExpanded && (
                    <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {orderedItems.map(item => (
                        <span
                          key={item.id}
                          title={item.name}
                          style={{
                            width: '64px',
                            height: '64px',
                            backgroundColor: 'var(--well)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <img
                            src={item.image}
                            alt={item.name}
                            loading="lazy"
                            style={{ width: '85%', height: '85%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className="accordion-chevron"
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      transform: isExpanded ? 'rotate(180deg)' : 'none'
                    }}
                  />
                </button>

                {/* Look view */}
                <div className={`accordion-body${isExpanded ? ' open' : ''}`}>
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '2px 0 24px' }}>
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
                            disabled={isBuilding}
                            className="tap-target"
                            title={isBuilding ? 'Finish the current outfit first' : 'Swap the garments in this outfit'}
                            style={{
                              border: '1px solid var(--border-color)',
                              background: 'none',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              padding: '10px 18px',
                              cursor: isBuilding ? 'not-allowed' : 'pointer',
                              opacity: isBuilding ? 0.4 : 1,
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
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
export default OutfitBuilder;
