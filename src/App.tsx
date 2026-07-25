import { useState, useEffect, useCallback, useRef } from 'react';
import ClosetGrid from './components/ClosetGrid';
import type { ClosetItem } from './components/ClosetGrid';
import OutfitsView from './components/OutfitsView';
import type { Outfit } from './components/OutfitsView';
import OutfitBuildTray from './components/OutfitBuildTray';
import UploadModal from './components/UploadModal';
import SneakerGrid from './components/SneakerGrid';
import type { SneakerItem } from './components/SneakerGrid';
import AddSneakerModal from './components/AddSneakerModal';
import PackingDrawer from './components/PackingDrawer';
import DailyOutfitSettings from './features/daily-outfits/DailyOutfitSettings';
import { fillManifestDailyProfiles } from './features/daily-outfits/itemProfile';
import { Download, Mail, Plus, Upload } from 'lucide-react';
import closetData from './data/closet.json';
import sneakerData from './data/sneakers.json';
import outfitData from './data/outfits.json';
import appDefaults from './data/app-defaults.json';

// Tombstone lists of deleted item IDs — distinguishes "user deleted this base item"
// from "this base item is new and should be merged in" on the next launch.
// Garments and sneakers are separate closets with separate storage keys.
const DELETED_IDS_KEY = 'closet_deleted_ids';
const SNEAKER_ITEMS_KEY = 'sneaker_items';
const SNEAKER_DELETED_IDS_KEY = 'sneaker_deleted_ids';

const defaultDeletedIds = (key: string): string[] =>
  key === SNEAKER_DELETED_IDS_KEY ? appDefaults.deletedSneakerIds : appDefaults.deletedItemIds;

const loadDeletedIds = (key: string = DELETED_IDS_KEY): Set<string> => {
  try {
    const saved = localStorage.getItem(key);
    return new Set(saved ? JSON.parse(saved) : defaultDeletedIds(key));
  } catch (e) {
    console.error('Failed to parse deleted item ids from localStorage', e);
    return new Set();
  }
};

function App() {
  const restoreInputRef = useRef<HTMLInputElement>(null);
  // Load clothing items state, merging localStorage with any new base manifest database items
  const [items, setItems] = useState<ClosetItem[]>(() => {
    const deletedIds = loadDeletedIds();
    const savedItems = localStorage.getItem('closet_items');
    if (savedItems) {
      try {
        let localItems: ClosetItem[] = JSON.parse(savedItems);

        // Remove any base manifest items that have been deleted from the base database manifest
        const baseManifestById = new Map((closetData as ClosetItem[]).map(item => [item.id, item]));
        localItems = localItems.filter(item => {
          // If it is a base item (doesn't start with 'user_'), it must exist in the base manifest
          if (!item.id.startsWith('user_')) {
            return baseManifestById.has(item.id);
          }
          return true;
        });
        localItems = fillManifestDailyProfiles(localItems, closetData as ClosetItem[]);

        const localIds = new Set(localItems.map(item => item.id));

        // Find any new items in the base database manifest (closetData) not yet in localStorage,
        // skipping items the user has explicitly deleted
        const newManifestItems = (closetData as ClosetItem[]).filter(
          item => !localIds.has(item.id) && !deletedIds.has(item.id)
        );
        
        const originalSavedCount = JSON.parse(savedItems).length;
        if (newManifestItems.length > 0 || localItems.length !== originalSavedCount) {
          return [...newManifestItems, ...localItems];
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

        const SNEAKER_ID_MIGRATIONS: Record<string, string> = {
          'user_sneaker_1783863184667': 'sneaker_DO9404-400',
          'user_sneaker_1783048231645': 'sneaker_IF0666-400'
        };

        // Migrate legacy IDs from previous catalog versions
        localSneakers = localSneakers.map(item => ({
          ...item,
          id: SNEAKER_ID_MIGRATIONS[item.id] || item.id
        }));

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
        // Manifest metadata (e.g. the AI enrichment pass) fills fields the
        // user hasn't touched: blank color/description, and a name still equal
        // to the style-code placeholder. In-app edits always win.
        localSneakers = localSneakers.map(item => {
          const base = baseManifestById.get(item.id);
          if (!base) {
            return item;
          }
          return {
            ...item,
            name: item.name === item.styleCode && base.name ? base.name : item.name,
            color: item.color || base.color,
            description: item.description || base.description,
            image: item.image.startsWith('data:') ? item.image : base.image,
            imageTop: item.imageTop?.startsWith('data:') ? item.imageTop : base.imageTop
          };
        });
        localSneakers = fillManifestDailyProfiles(localSneakers, sneakerData as SneakerItem[]);

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
        const SNEAKER_ID_MIGRATIONS: Record<string, string> = {
          'user_sneaker_1783863184667': 'sneaker_DO9404-400',
          'user_sneaker_1783048231645': 'sneaker_IF0666-400'
        };
        const rawPackedIds: string[] = JSON.parse(savedPacked);
        const packedIds = rawPackedIds.map(id => SNEAKER_ID_MIGRATIONS[id] || id);
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
    const defaultPackedIds = appDefaults.packedItemIds as string[];
    return [...(closetData as ClosetItem[]), ...(sneakerData as SneakerItem[])]
      .filter(item => defaultPackedIds.includes(item.id));
  });

  // Load saved outfits with localStorage persistence
  const [outfits, setOutfits] = useState<Outfit[]>(() => {
    const savedOutfits = localStorage.getItem('closet_outfits');
    if (savedOutfits) {
      try {
        const SNEAKER_ID_MIGRATIONS: Record<string, string> = {
          'user_sneaker_1783863184667': 'sneaker_DO9404-400',
          'user_sneaker_1783048231645': 'sneaker_IF0666-400'
        };
        const parsedOutfits: Outfit[] = JSON.parse(savedOutfits);
        return parsedOutfits.map(outfit => ({
          ...outfit,
          itemIds: outfit.itemIds.map(id => SNEAKER_ID_MIGRATIONS[id] || id)
        }));
      } catch (e) {
        console.error('Failed to parse outfits from localStorage', e);
      }
    }
    return outfitData as Outfit[];
  });

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAddSneakerOpen, setIsAddSneakerOpen] = useState(false);
  const [isPackingOpen, setIsPackingOpen] = useState(false);
  const [isDailyOutfitsOpen, setIsDailyOutfitsOpen] = useState(false);
  // Stable identity so PackingDrawer's focus-trap effect doesn't rerun (and
  // re-steal focus) on every unrelated App render while the drawer is open.
  const handleClosePacking = useCallback(() => setIsPackingOpen(false), []);

  // Which surface is on the field: garments, the sneaker archive, or the lookbook
  const [view, setView] = useState<'closet' | 'sneakers' | 'outfits'>('closet');

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
    setView('closet');
  };

  // Reuse the build tray to edit an existing outfit, pre-selecting its garments
  const handleStartEditingOutfit = (outfit: Outfit) => {
    setSelectedOutfitItemIds(outfit.itemIds.filter(id => allItems.some(item => item.id === id)));
    setEditingOutfitId(outfit.id);
    setIsBuildingOutfit(true);
    setView('closet');
  };

  const handleCancelBuildingOutfit = () => {
    setSelectedOutfitItemIds([]);
    setEditingOutfitId(null);
    setIsBuildingOutfit(false);
    setView('outfits');
  };

  const handleToggleOutfitItem = (item: ClosetItem) => {
    setSelectedOutfitItemIds(prev =>
      prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
    );
  };

  const handleSaveOutfit = (name: string) => {
    if (editingOutfitId) {
      // source cleared on edit: Kevin reworking an AI-saved outfit makes it
      // genuine taste, so it graduates to full weight as a stylist example.
      setOutfits(prev => prev.map(outfit =>
        outfit.id === editingOutfitId
          ? { ...outfit, name, itemIds: selectedOutfitItemIds, source: undefined }
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
    setView('outfits');
  };

  // AI stylist saves a complete outfit directly — no selection-mode round trip
  const handleSaveAIOutfit = (name: string, itemIds: string[], note?: string) => {
    const newOutfit: Outfit = {
      id: `outfit_${Date.now()}`,
      name,
      itemIds,
      createdAt: Date.now(),
      note,
      source: 'ai'
    };
    setOutfits(prev => [newOutfit, ...prev]);
  };

  // Flip whether an outfit is offered to the AI stylist as a taste example.
  // undefined (pre-toggle outfits) counts as seeding, so the first click excludes.
  const handleToggleSeedStylist = (outfitId: string) => {
    setOutfits(prev => prev.map(outfit =>
      outfit.id === outfitId
        ? { ...outfit, seedStylist: outfit.seedStylist === false }
        : outfit
    ));
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

  const handleDownloadBackup = () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      sneakers,
      outfits,
      packedItemIds,
      deletedItemIds: [...loadDeletedIds()],
      deletedSneakerIds: [...loadDeletedIds(SNEAKER_DELETED_IDS_KEY)]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `virtual-closet-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.version !== 1 || !Array.isArray(backup.items) || !Array.isArray(backup.sneakers) || !Array.isArray(backup.outfits)) {
        throw new Error('Invalid backup');
      }
      const restoredItems = backup.items as ClosetItem[];
      const restoredSneakers = backup.sneakers as SneakerItem[];
      setItems(restoredItems);
      setSneakers(restoredSneakers);
      setOutfits(backup.outfits as Outfit[]);
      setPackedItems([...restoredItems, ...restoredSneakers].filter(item => (backup.packedItemIds ?? []).includes(item.id)));
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(backup.deletedItemIds ?? []));
      localStorage.setItem(SNEAKER_DELETED_IDS_KEY, JSON.stringify(backup.deletedSneakerIds ?? []));
    } catch (error) {
      console.error(error);
      window.alert('That file is not a valid Virtual Closet backup.');
    }
  };

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleRestoreBackup}
            style={{ display: 'none' }}
          />
          <button onClick={handleDownloadBackup} className="tap-target" title="Download closet backup" aria-label="Download closet backup" style={{ border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '12px 0', display: 'flex' }}>
            <Download size={15} />
          </button>
          <button onClick={() => restoreInputRef.current?.click()} className="tap-target" title="Restore closet backup" aria-label="Restore closet backup" style={{ border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '12px 0', display: 'flex' }}>
            <Upload size={15} />
          </button>
          <button
            onClick={() => setIsDailyOutfitsOpen(true)}
            className="tap-target"
            title="Daily outfit email"
            aria-label="Daily outfit email settings"
            style={{ border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '12px 0', display: 'flex' }}
          >
            <Mail size={15} />
          </button>
          {/* Quiet packing trigger — the only persistent trace of the packing feature */}
          <button
            onClick={() => setIsPackingOpen(true)}
            className="tap-target"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.68rem',
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
              padding: '12px 0',
              whiteSpace: 'nowrap'
            }}
          >
            Packing
            {packedItems.length > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em'
              }}>
                — {packedItems.length}
              </span>
            )}
          </button>

          {/* The CTA follows the active closet: garments run the AI pipeline,
              sneakers take hi-fi photos and manual metadata directly */}
          <button
            onClick={() => {
              if (view === 'closet') setIsUploadOpen(true);
              else if (view === 'sneakers') setIsAddSneakerOpen(true);
              else handleStartBuildingOutfit();
            }}
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
            {view === 'closet' ? 'Add Garment' : view === 'sneakers' ? 'Add Sneaker' : 'New Outfit'}
          </button>
        </div>
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
                { key: 'sneakers', label: 'Sneakers' },
                { key: 'outfits', label: 'Outfits' }
              ] as const).map(({ key, label }) => {
                const isActive = view === key;
                // Outfits is unreachable mid-build: the tray owns the flow until save/cancel
                const isDisabled = isBuildingOutfit && key === 'outfits';
                return (
                  <button
                    key={key}
                    onClick={() => { if (!isDisabled) setView(key); }}
                    aria-pressed={isActive}
                    aria-disabled={isDisabled}
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
                      opacity: isDisabled ? 0.35 : 1,
                      cursor: isActive || isDisabled ? 'default' : 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onMouseOver={(e) => { if (!isActive && !isDisabled) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseOut={(e) => { if (!isActive && !isDisabled) e.currentTarget.style.color = 'var(--text-muted)'; }}
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
                : view === 'sneakers'
                  ? `${sneakers.length} ${sneakers.length === 1 ? 'pair' : 'pairs'}`
                  : `${outfits.length} ${outfits.length === 1 ? 'look' : 'looks'}`}
            </span>
          </div>

          {isBuildingOutfit && (
            <OutfitBuildTray
              selectedItems={selectedOutfitItemIds
                .map(id => allItems.find(item => item.id === id))
                .filter((item): item is ClosetItem => item !== undefined)}
              editingOutfit={outfits.find(outfit => outfit.id === editingOutfitId) ?? null}
              onCancel={handleCancelBuildingOutfit}
              onSave={handleSaveOutfit}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          )}

          {view === 'outfits' ? (
            <OutfitsView
              outfits={outfits}
              items={allItems}
              onStartEditing={handleStartEditingOutfit}
              onDeleteOutfit={handleDeleteOutfit}
              onAddOutfitToPackingList={handleAddOutfitToPackingList}
              onSaveAIOutfit={handleSaveAIOutfit}
              onToggleSeedStylist={handleToggleSeedStylist}
            />
          ) : view === 'closet' ? (
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

      <PackingDrawer
        isOpen={isPackingOpen}
        onClose={handleClosePacking}
        packedItems={packedItems}
        onRemoveItem={handleRemovePackingItem}
        onClearList={handleClearList}
      />

      <DailyOutfitSettings
        open={isDailyOutfitsOpen}
        onClose={() => setIsDailyOutfitsOpen(false)}
        items={allItems}
        outfits={outfits}
      />

      {/* CSS layout adjustment style tag for breakpoint responsiveness */}
      <style>{`
        .app-main-layout {
          display: grid;
          grid-template-columns: 1fr;
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
