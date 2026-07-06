import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import PackingList from './PackingList';

interface PackingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  packedItems: ClosetItem[];
  onRemoveItem: (item: ClosetItem) => void;
  onClearList: () => void;
}

// Slide-over shell for the packing list. A dialog-layer surface: scrim plus the
// one permitted shadow. Only transform/opacity are animated. On phones the
// panel becomes a full-screen sheet (see the style tag below).
export const PackingDrawer: React.FC<PackingDrawerProps> = ({
  isOpen,
  onClose,
  packedItems,
  onRemoveItem,
  onClearList
}) => {
  // Escape closes; body scroll locks while open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(17, 17, 17, 0.4)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 100
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Packing list"
        className="packing-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--bg-surface)',
          boxShadow: 'var(--shadow-lg)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        <button
          onClick={onClose}
          className="tap-target"
          title="Close packing list"
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            border: 'none',
            background: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            zIndex: 1
          }}
        >
          <X size={18} />
        </button>
        <PackingList
          packedItems={packedItems}
          onRemoveItem={onRemoveItem}
          onClearList={onClearList}
        />
      </aside>
      <style>{`
        .packing-drawer {
          width: min(420px, 100vw);
          border-left: 1px solid var(--border-color);
        }
        @media (max-width: 700px) {
          .packing-drawer {
            width: 100%;
            border-left: none;
          }
        }
      `}</style>
    </>
  );
};

export default PackingDrawer;
