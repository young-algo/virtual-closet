import { useState, useEffect } from 'react';
import ClosetGrid from './components/ClosetGrid';
import type { ClosetItem } from './components/ClosetGrid';
import PackingList from './components/PackingList';
import OutfitBuilder from './components/OutfitBuilder';
import type { Outfit } from './components/OutfitBuilder';
import UploadModal from './components/UploadModal';
import SneakerGrid from './components/SneakerGrid';
import type { SneakerItem } from './components/SneakerGrid';
import AddSneakerModal from './components/AddSneakerModal';
import { Plus } from 'lucide-react';
import closetData from './data/closet.json';
import sneakerData from './data/sneakers.json';

// Tombstone lists of deleted item IDs — distinguishes "user deleted this base item"
// from "this base item is new and should be merged in" on the next launch.
// Garments and sneakers are separate closets with separate storage keys.
const DELETED_IDS_KEY = 'closet_deleted_ids';
const SNEAKER_ITEMS_KEY = 'sneaker_items';
const SNEAKER_DELETED_IDS_KEY = 'sneaker_deleted_ids';

const loadDeletedIds = (key: string = DELETED_IDS_KEY): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch (e) {
    console.error('Failed to parse deleted item ids from localStorage', e);
    return new Set();
  }
};

function App() {
  // Load clothing items state, merging localStorage with any new base manifest database items
  const [items, setItems] = useState<ClosetItem[]>(() => {
    const deletedIds = loadDeletedIds();
    const savedItems = localStorage.getItem('closet_items');
    if (savedItems) {
      try {
        let localItems: ClosetItem[] = JSON.parse(savedItems);

        // Remove any base manifest items that have been deleted from the base database manifest
        const baseManifestIds = new Set((closetData as ClosetItem[]).map(item => item.id));
        localItems = localItems.filter(item => {
          // If it is a base item (doesn't start with 'user_'), it must exist in the base manifest
          if (!item.id.startsWith('user_')) {
            return baseManifestIds.has(item.id);
          }
          return true;
        });

        const localIds = new Set(localItems.map(item => item.id));

        // Find any new items in the base database manifest (closetData) not yet in localStorage,
        // skipping items the user has explicitly deleted
        const newManifestItems = (closetData as ClosetItem[]).filter(
          item => !localIds.has(item.id) && !deletedIds.has(item.id)
        );
        
        const originalSavedCount = JSON.parse(savedItems).length;
        if (newManifestItems.length > 0 || localItems.length !== originalSavedCount) {
          const merged = [...newManifestItems, ...localItems];
          localStorage.setItem('closet_items', JSON.stringify(merged));
          return merged;
        }
        return localItems;
      } catch (e) {
        console.error('Failed to parse closet items from localStorage', e);
      }
    }
    return (closetData as ClosetItem[]).filter(item => !deletedIds.has(item.id));
  });

  // Load the sneaker closet, merging localStorage edits with the base manifest.
  // Sneakers have no upload pipeline: the manifest is the only source of new pairs.
  const [sneakers, setSneakers] = useState<SneakerItem[]>(() => {
    const deletedIds = loadDeletedIds(SNEAKER_DELETED_IDS_KEY);
    const savedSneakers = localStorage.getItem(SNEAKER_ITEMS_KEY);
    if (savedSneakers) {
      try {
        let localSneakers: SneakerItem[] = JSON.parse(savedSneakers);

        // Drop entries removed from the base manifest, then merge in new manifest
        // pairs the user hasn't explicitly deleted. User-added pairs ('user_'
        // prefix) live only in localStorage and are always kept.
        const baseManifestById = new Map((sneakerData as SneakerItem[]).map(item => [item.id, item]));
        localSneakers = localSneakers.filter(item => {
          if (!item.id.startsWith('user_')) {
            return baseManifestById.has(item.id);
          }
          return true;
        });

        // Adopt updated manifest image paths for manifest pairs. In-app photo
        // replacements are data URLs and always win over the manifest.
        localSneakers = localSneakers.map(item => {
          const base = baseManifestById.get(item.id);
          if (item.id.startsWith('user_') || !base) {
            return item;
          }
          return {
            ...item,
            image: item.image.startsWith('data:') ? item.image : base.image,
            imageTop: item.imageTop?.startsWith('data:') ? item.imageTop : base.imageTop
          };
        });

        const localIds = new Set(localSneakers.map(item => item.id));
        const newManifestItems = (sneakerData as SneakerItem[]).filter(
          item => !localIds.has(item.id) && !deletedIds.has(item.id)
        );
        return [...newManifestItems, ...localSneakers];
      } catch (e) {
        console.error('Failed to parse sneakers from localStorage', e);
      }
    }
    return (sneakerData as SneakerItem[]).filter(item => !deletedIds.has(item.id));
  });

  // Load packed items state with localStorage persistence
  const [packedItems, setPackedItems] = useState<ClosetItem[]>(() => {
    const savedPacked = localStorage.getItem('closet_packed_items');
    if (savedPacked) {
      try {
        const packedIds: string[] = JSON.parse(savedPacked);
        // Map saved IDs back to our active items state, across both closets
        const savedItems = localStorage.getItem('closet_items');
        const activeItems: ClosetItem[] = savedItems ? JSON.parse(savedItems) : closetData;
        const savedSneakers = localStorage.getItem(SNEAKER_ITEMS_KEY);
        const activeSneakers: ClosetItem[] = savedSneakers ? JSON.parse(savedSneakers) : sneakerData;
        return [...activeItems, ...activeSneakers].filter(item => packedIds.includes(item.id));
      } catch (e) {
        console.error('Failed to parse packed items from localStorage', e);
      }
    }
    return [];
  });

  // Load saved outfits with localStorage persistence
  const [outfits, setOutfits] = useState<Outfit[]>(() => {
    const savedOutfits = localStorage.getItem('closet_outfits');
    if (savedOutfits) {
      try {
        return JSON.parse(savedOutfits);
      } catch (e) {
        console.error('Failed to parse outfits from localStorage', e);
      }
    }
    return [];
  });

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAddSneakerOpen, setIsAddSneakerOpen] = useState(false);

  // Which closet is on the field: garments or the sneaker archive
  const [view, setView] = useState<'closet' | 'sneakers'>('closet');

  // Outfits and the packing list draw from both closets
  const allItems: ClosetItem[] = [...items, ...sneakers];

  // Outfit builder selection mode state; editingOutfitId is set when the
  // builder panel is repurposed to edit an existing outfit instead of creating one
  const [isBuildingOutfit, setIsBuildingOutfit] = useState(false);
  const [selectedOutfitItemIds, setSelectedOutfitItemIds] = useState<string[]>([]);
  const [editingOutfitId, setEditingOutfitId] = useState<string | null>(null);

  // Sync items to localStorage
  useEffect(() => {
    localStorage.setItem('closet_items', JSON.stringify(items));
  }, [items]);

  // Sync sneakers to localStorage
  useEffect(() => {
    localStorage.setItem(SNEAKER_ITEMS_KEY, JSON.stringify(sneakers));
  }, [sneakers]);

  // Sync packed items IDs to localStorage
  useEffect(() => {
    const packedIds = packedItems.map(item => item.id);
    localStorage.setItem('closet_packed_items', JSON.stringify(packedIds));
  }, [packedItems]);

  // Sync outfits to localStorage
  useEffect(() => {
    localStorage.setItem('closet_outfits', JSON.stringify(outfits));
  }, [outfits]);

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
    const deletedIds = loadDeletedIds();
    deletedIds.add(itemId);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...deletedIds]));
    setItems(prev => prev.filter(item => item.id !== itemId));
    setPackedItems(prev => prev.filter(item => item.id !== itemId));
    // Keep saved outfits consistent when a garment is removed from the closet
    setOutfits(prev => prev.map(outfit => ({
      ...outfit,
      itemIds: outfit.itemIds.filter(id => id !== itemId)
    })));
    setSelectedOutfitItemIds(prev => prev.filter(id => id !== itemId));
  };

  // --- Sneaker closet handlers (separate storage, same outfit/packing plumbing) ---

  const handleUpdateSneaker = (updatedSneaker: SneakerItem) => {
    setSneakers(prev => prev.map(item => item.id === updatedSneaker.id ? updatedSneaker : item));
    setPackedItems(prev => prev.map(item => item.id === updatedSneaker.id ? updatedSneaker : item));
  };

  const handleDeleteSneaker = (itemId: string) => {
    const deletedIds = loadDeletedIds(SNEAKER_DELETED_IDS_KEY);
    deletedIds.add(itemId);
    localStorage.setItem(SNEAKER_DELETED_IDS_KEY, JSON.stringify([...deletedIds]));
    setSneakers(prev => prev.filter(item => item.id !== itemId));
    setPackedItems(prev => prev.filter(item => item.id !== itemId));
    setOutfits(prev => prev.map(outfit => ({
      ...outfit,
      itemIds: outfit.itemIds.filter(id => id !== itemId)
    })));
    setSelectedOutfitItemIds(prev => prev.filter(id => id !== itemId));
  };

  // --- Outfit builder handlers ---

  const handleStartBuildingOutfit = () => {
    setSelectedOutfitItemIds([]);
    setEditingOutfitId(null);
    setIsBuildingOutfit(true);
  };

  // Reuse the build panel to edit an existing outfit, pre-selecting its garments
  const handleStartEditingOutfit = (outfit: Outfit) => {
    setSelectedOutfitItemIds(outfit.itemIds.filter(id => allItems.some(item => item.id === id)));
    setEditingOutfitId(outfit.id);
    setIsBuildingOutfit(true);
  };

  const handleCancelBuildingOutfit = () => {
    setSelectedOutfitItemIds([]);
    setEditingOutfitId(null);
    setIsBuildingOutfit(false);
  };

  const handleToggleOutfitItem = (item: ClosetItem) => {
    setSelectedOutfitItemIds(prev =>
      prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
    );
  };

  const handleSaveOutfit = (name: string) => {
    if (editingOutfitId) {
      setOutfits(prev => prev.map(outfit =>
        outfit.id === editingOutfitId
          ? { ...outfit, name, itemIds: selectedOutfitItemIds }
          : outfit
      ));
    } else {
      const newOutfit: Outfit = {
        id: `outfit_${Date.now()}`,
        name,
        itemIds: selectedOutfitItemIds,
        createdAt: Date.now()
      };
      setOutfits(prev => [newOutfit, ...prev]);
    }
    setSelectedOutfitItemIds([]);
    setEditingOutfitId(null);
    setIsBuildingOutfit(false);
  };

  const handleDeleteOutfit = (outfitId: string) => {
    setOutfits(prev => prev.filter(outfit => outfit.id !== outfitId));
    if (editingOutfitId === outfitId) {
      handleCancelBuildingOutfit();
    }
  };

  // Add every garment in an outfit to the packing list, skipping already-packed ones
  const handleAddOutfitToPackingList = (outfit: Outfit) => {
    setPackedItems(prev => {
      const packedIds = new Set(prev.map(item => item.id));
      const itemsToAdd = outfit.itemIds
        .filter(id => !packedIds.has(id))
        .map(id => allItems.find(item => item.id === id))
        .filter((item): item is ClosetItem => item !== undefined);
      return [...prev, ...itemsToAdd];
    });
  };

  const handleAddGarment = (newItem: ClosetItem) => {
    setItems(prev => [newItem, ...prev]);
  };

  const handleAddSneaker = (newItem: SneakerItem) => {
    setSneakers(prev => [newItem, ...prev]);
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
      {/* Masthead: a single typographic wordmark on the field */}
      <header className="app-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <h1 style={{
          fontSize: '0.95rem',
          fontWeight: 600,
          fontFamily: 'var(--font-heading)',
          letterSpacing: '0.32em',
          textTransform: 'uppercase'
        }}>
          Wardrobe
        </h1>

        {/* The CTA follows the active closet: garments run the AI pipeline,
            sneakers take hi-fi photos and manual metadata directly */}
        <button
          onClick={() => view === 'closet' ? setIsUploadOpen(true) : setIsAddSneakerOpen(true)}
          className="tap-target"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--bg-surface)',
            border: 'none',
            fontSize: '0.68rem',
            fontWeight: 500,
            padding: '12px 26px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={13} strokeWidth={2} />
          {view === 'closet' ? 'Add Garment' : 'Add Sneaker'}
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
        <div className="closet-pane" style={{
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px'
        }}>
          {/* Closet switcher: two display-voice words, the active one in ink.
              Pure typographic navigation — no tabs, no boxes on the field. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ display: 'flex', gap: '28px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              {([
                { key: 'closet', label: 'Closet' },
                { key: 'sneakers', label: 'Sneakers' }
              ] as const).map(({ key, label }) => {
                const isActive = view === key;
                return (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    aria-pressed={isActive}
                    className="tap-target"
                    style={{
                      fontSize: '3rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 400,
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                      textTransform: 'none',
                      padding: 0,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      cursor: isActive ? 'default' : 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onMouseOver={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseOut={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    {label}
                  </button>
                );
              })}
            </h2>
            <span style={{
              color: 'var(--text-muted)',
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em'
            }}>
              {view === 'closet'
                ? `${items.length} ${items.length === 1 ? 'garment' : 'garments'}`
                : `${sneakers.length} ${sneakers.length === 1 ? 'pair' : 'pairs'}`}
            </span>
          </div>

          <OutfitBuilder
            outfits={outfits}
            items={allItems}
            isBuilding={isBuildingOutfit}
            selectedItems={selectedOutfitItemIds
              .map(id => allItems.find(item => item.id === id))
              .filter((item): item is ClosetItem => item !== undefined)}
            editingOutfit={outfits.find(outfit => outfit.id === editingOutfitId) ?? null}
            onStartBuilding={handleStartBuildingOutfit}
            onStartEditing={handleStartEditingOutfit}
            onCancelBuilding={handleCancelBuildingOutfit}
            onSaveOutfit={handleSaveOutfit}
            onToggleSelectItem={handleToggleOutfitItem}
            onDeleteOutfit={handleDeleteOutfit}
            onAddOutfitToPackingList={handleAddOutfitToPackingList}
          />

          {view === 'closet' ? (
            <ClosetGrid
              items={items}
              onAddToPackingList={handleTogglePackingItem}
              packedItemIds={packedItemIds}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              selectionMode={isBuildingOutfit}
              selectedItemIds={selectedOutfitItemIds}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          ) : (
            <SneakerGrid
              sneakers={sneakers}
              onAddToPackingList={handleTogglePackingItem}
              packedItemIds={packedItemIds}
              onUpdateSneaker={handleUpdateSneaker}
              onDeleteSneaker={handleDeleteSneaker}
              selectionMode={isBuildingOutfit}
              selectedItemIds={selectedOutfitItemIds}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          )}
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

      <AddSneakerModal
        isOpen={isAddSneakerOpen}
        onClose={() => setIsAddSneakerOpen(false)}
        onAddSneaker={handleAddSneaker}
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
        .app-header {
          padding: 22px 48px;
        }
        .closet-pane {
          padding: 56px 48px 48px;
        }
        @media (max-width: 700px) {
          .app-header {
            padding: 16px 20px;
          }
          .app-header h1 {
            font-size: 0.8rem !important;
            letter-spacing: 0.22em !important;
          }
          .closet-pane {
            padding: 36px 20px 32px;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
