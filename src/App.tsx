import { useState, useEffect } from 'react';
import ClosetGrid from './components/ClosetGrid';
import type { ClosetItem } from './components/ClosetGrid';
import PackingList from './components/PackingList';
import UploadModal from './components/UploadModal';
import { Shirt, Plus } from 'lucide-react';
import closetData from './data/closet.json';

function App() {
  // Load clothing items state, merging localStorage with any new base manifest database items
  const [items, setItems] = useState<ClosetItem[]>(() => {
    const savedItems = localStorage.getItem('closet_items');
    if (savedItems) {
      try {
        const localItems: ClosetItem[] = JSON.parse(savedItems);
        const localIds = new Set(localItems.map(item => item.id));
        
        // Find any new items in the base database manifest (closetData) not yet in localStorage
        const newManifestItems = (closetData as ClosetItem[]).filter(
          item => !localIds.has(item.id)
        );
        
        if (newManifestItems.length > 0) {
          const merged = [...newManifestItems, ...localItems];
          localStorage.setItem('closet_items', JSON.stringify(merged));
          return merged;
        }
        return localItems;
      } catch (e) {
        console.error('Failed to parse closet items from localStorage', e);
      }
    }
    return closetData as ClosetItem[];
  });

  // Load packed items state with localStorage persistence
  const [packedItems, setPackedItems] = useState<ClosetItem[]>(() => {
    const savedPacked = localStorage.getItem('closet_packed_items');
    if (savedPacked) {
      try {
        const packedIds: string[] = JSON.parse(savedPacked);
        // Map saved IDs back to our active items state
        const savedItems = localStorage.getItem('closet_items');
        const activeItems: ClosetItem[] = savedItems ? JSON.parse(savedItems) : closetData;
        return activeItems.filter(item => packedIds.includes(item.id));
      } catch (e) {
        console.error('Failed to parse packed items from localStorage', e);
      }
    }
    return [];
  });

  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Sync items to localStorage
  useEffect(() => {
    localStorage.setItem('closet_items', JSON.stringify(items));
  }, [items]);

  // Sync packed items IDs to localStorage
  useEffect(() => {
    const packedIds = packedItems.map(item => item.id);
    localStorage.setItem('closet_packed_items', JSON.stringify(packedIds));
  }, [packedItems]);

  const handleTogglePackingItem = (item: ClosetItem) => {
    setPackedItems(prev => {
      const isAlreadyPacked = prev.some(i => i.id === item.id);
      if (isAlreadyPacked) {
        return prev.filter(i => i.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleRemovePackingItem = (item: ClosetItem) => {
    setPackedItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handleClearList = () => {
    setPackedItems([]);
  };

  // Callback to update garment specs and keep items / packedItems states aligned
  const handleUpdateItem = (updatedItem: ClosetItem) => {
    setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    setPackedItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  const handleDeleteItem = (itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
    setPackedItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleAddGarment = (newItem: ClosetItem) => {
    setItems(prev => [newItem, ...prev]);
  };

  const packedItemIds = packedItems.map(item => item.id);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      width: '100%',
      backgroundColor: 'var(--bg-primary)'
    }}>
      {/* Premium Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--bg-surface)',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Shirt size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Wardrobe
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '-2px' }}>
              Premium Virtual Closet
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="tap-target"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--bg-primary)',
            border: 'none',
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
          Add Garment
        </button>
      </header>

      {/* Main Workspace Layout */}
      <main style={{
        minHeight: 'calc(100vh - 81px)',
        alignItems: 'stretch',
        width: '100%',
        margin: '0 auto',
      }} className="app-main-layout">
        {/* Left Side: Closet Explorer */}
        <div style={{
          padding: '32px 40px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Your Closet Collection</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Select items to pack, edit details, or filters to find specific garments.
            </p>
          </div>

          <ClosetGrid
            items={items}
            onAddToPackingList={handleTogglePackingItem}
            packedItemIds={packedItemIds}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
          />
        </div>

        {/* Right Side: Packing list sidebar */}
        <div style={{
          borderLeft: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }} className="packing-sidebar">
          <PackingList
            packedItems={packedItems}
            onRemoveItem={handleRemovePackingItem}
            onClearList={handleClearList}
          />
        </div>
      </main>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAddGarment={handleAddGarment}
      />

      {/* CSS layout adjustment style tag for breakpoint responsiveness */}
      <style>{`
        .app-main-layout {
          display: grid;
          grid-template-columns: 1fr;
        }
        @media (min-width: 1024px) {
          .app-main-layout {
            grid-template-columns: 1fr 400px;
          }
        }
        .packing-sidebar {
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}

export default App;
