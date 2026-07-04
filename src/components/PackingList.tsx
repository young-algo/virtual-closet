import React, { useState } from 'react';
import { Trash2, Check, Share2, AlertCircle } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';

interface PackingListProps {
  packedItems: ClosetItem[];
  onRemoveItem: (item: ClosetItem) => void;
  onClearList: () => void;
}

export const PackingList: React.FC<PackingListProps> = ({ packedItems, onRemoveItem, onClearList }) => {
  const [tripName, setTripName] = useState('Vacation Trip');
  const [physicallyPacked, setPhysicallyPacked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const togglePhysicallyPacked = (id: string) => {
    setPhysicallyPacked(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleExportList = () => {
    const header = `Packing List: ${tripName}\n\n`;
    const body = packedItems.map(item => {
      const isPhysicallyPacked = physicallyPacked.includes(item.id) ? '[x]' : '[ ]';
      return `${isPhysicallyPacked} ${item.name} (${item.brand} / ${item.color})`;
    }).join('\n');

    navigator.clipboard.writeText(header + (body || 'No items added yet.'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group packed items by category
  const groupedItems = packedItems.reduce((groups, item) => {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }
    groups[item.category].push(item);
    return groups;
  }, {} as Record<string, ClosetItem[]>);

  const totalItems = packedItems.length;
  const packedCount = packedItems.filter(item => physicallyPacked.includes(item.id)).length;
  const progressPercent = totalItems > 0 ? Math.round((packedCount / totalItems) * 100) : 0;

  return (
    <aside style={{
      width: '100%',
      backgroundColor: 'var(--bg-surface)',
      padding: '40px 32px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Trip metadata inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <input
            type="text"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            placeholder="Trip Name"
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              letterSpacing: '-0.01em',
              fontFamily: 'var(--font-heading)',
              border: 'none',
              borderBottom: '1px solid transparent',
              backgroundColor: 'transparent',
              padding: '4px 0',
              borderRadius: 0,
              width: '100%',
              color: 'var(--text-primary)'
            }}
            onFocus={(e) => (e.currentTarget.style.borderBottom = '1px solid var(--accent-primary)')}
            onBlur={(e) => (e.currentTarget.style.borderBottom = '1px solid transparent')}
          />
        </div>
      </div>

      {/* Checklist Header and Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)' }}>Packing List</h3>
          {totalItems > 0 && progressPercent === 100 ? (
            <span style={{
              fontSize: '0.7rem',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Check size={12} strokeWidth={3} />
              Fully packed
            </span>
          ) : (
            <span style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {packedCount} / {totalItems} packed
            </span>
          )}
        </div>

        {totalItems > 0 && (
          <div style={{
            width: '100%',
            height: '2px',
            backgroundColor: 'var(--border-color)',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'var(--accent-primary)',
              transform: `scaleX(${progressPercent / 100})`,
              transformOrigin: 'left',
              transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }} />
          </div>
        )}
      </div>

      {/* Items Checklist Scroll Panel */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '150px' }}>
        {totalItems === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '8px',
            margin: 'auto',
            textAlign: 'center',
            color: 'var(--text-muted)',
            padding: '24px'
          }}>
            <p style={{ fontSize: '0.85rem' }}>Nothing packed yet. Add garments from your closet to start a list.</p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 500,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: 'var(--font-mono)',
                paddingBottom: '4px',
                borderBottom: '1px solid var(--border-color)'
              }}>
                {category}
              </span>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map(item => {
                  const isChecked = physicallyPacked.includes(item.id);
                  return (
                    <li
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'var(--transition-fast)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        {/* Custom checkbox */}
                        <button
                          onClick={() => togglePhysicallyPacked(item.id)}
                          className="tap-target"
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '0',
                            border: '1px solid',
                            borderColor: isChecked ? 'var(--accent-primary)' : 'var(--text-muted)',
                            backgroundColor: isChecked ? 'var(--accent-primary)' : 'transparent',
                            color: 'var(--bg-surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </button>

                        <span style={{
                          fontSize: '0.85rem',
                          textDecoration: isChecked ? 'line-through' : 'none',
                          color: isChecked ? 'var(--text-muted)' : 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.name}
                        </span>
                      </div>

                      <button
                        onClick={() => onRemoveItem(item)}
                        className="tap-target"
                        style={{
                          border: 'none',
                          background: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.color = 'var(--error)')}
                        onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Suitcase Controls Footer */}
      {totalItems > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          {!showClearConfirm ? (
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                onClick={handleExportList}
                className="tap-target"
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'var(--transition-fast)'
                }}
              >
                {copied ? <Check size={16} style={{ color: 'var(--accent-primary)' }} /> : <Share2 size={16} />}
                {copied ? 'Copied!' : 'Export List'}
              </button>

              <button
                onClick={() => setShowClearConfirm(true)}
                className="tap-target"
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid transparent',
                  backgroundColor: 'var(--error-bg)',
                  color: 'var(--error)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'var(--transition-fast)'
                }}
                title="Clear packing list"
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--error-border)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--error-bg)')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: 'var(--error-bg)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--error-border)'
            }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 500, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <AlertCircle size={14} />
                Are you sure you want to clear your suitcase?
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    onClearList();
                    setShowClearConfirm(false);
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
                  Yes, Clear All
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
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
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
export default PackingList;
