import React, { useState, useMemo, useRef } from 'react';
import { Search, Plus, Check, X, Edit2, AlertCircle, Footprints } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import { resizeImageToDataUrl } from '../utils/image';

// A sneaker is a closet item catalogued by style code, with an optional
// second (top-down) product view. Conforming to ClosetItem lets sneakers
// flow through outfits and the packing list unchanged.
export interface SneakerItem extends ClosetItem {
  styleCode: string;
  imageTop?: string;
}

interface SneakerGridProps {
  sneakers: SneakerItem[];
  onAddToPackingList: (item: ClosetItem) => void;
  packedItemIds: string[];
  onUpdateSneaker: (item: SneakerItem) => void;
  onDeleteSneaker?: (itemId: string) => void;
  selectionMode?: boolean;
  selectedItemIds?: string[];
  onToggleSelectItem?: (item: ClosetItem) => void;
}

export const SneakerGrid: React.FC<SneakerGridProps> = ({
  sneakers,
  onAddToPackingList,
  packedItemIds,
  onUpdateSneaker,
  onDeleteSneaker,
  selectionMode = false,
  selectedItemIds = [],
  onToggleSelectItem
}) => {
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [selectedColor, setSelectedColor] = useState<string>('All');
  const [activeDetailItem, setActiveDetailItem] = useState<SneakerItem | null>(null);
  const [detailView, setDetailView] = useState<'side' | 'top'>('side');

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editStyleCode, setEditStyleCode] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editImageTop, setEditImageTop] = useState('');
  const [validationError, setValidationError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const sideFileRef = useRef<HTMLInputElement>(null);
  const topFileRef = useRef<HTMLInputElement>(null);

  const brands = useMemo(
    () => Array.from(new Set(sneakers.map(s => s.brand).filter(Boolean))),
    [sneakers]
  );
  // Colorways are user-entered and start out blank; only offer the filter once values exist
  const colors = useMemo(
    () => Array.from(new Set(sneakers.map(s => s.color).filter(Boolean))),
    [sneakers]
  );

  const filteredSneakers = useMemo(() => {
    const q = search.toLowerCase();
    return sneakers.filter(s => {
      const matchesSearch =
        s.name.toLowerCase().includes(q) ||
        s.brand.toLowerCase().includes(q) ||
        s.styleCode.toLowerCase().includes(q) ||
        s.color.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      const matchesBrand = selectedBrand === 'All' || s.brand === selectedBrand;
      const matchesColor = selectedColor === 'All' || s.color === selectedColor;
      return matchesSearch && matchesBrand && matchesColor;
    });
  }, [sneakers, search, selectedBrand, selectedColor]);

  const isAnyFilterActive = search !== '' || selectedBrand !== 'All' || selectedColor !== 'All';

  const clearAllFilters = () => {
    setSearch('');
    setSelectedBrand('All');
    setSelectedColor('All');
  };

  const handleOpenDetails = (item: SneakerItem) => {
    setActiveDetailItem(item);
    setDetailView('side');
    setIsEditing(false);
    setValidationError('');
    setSaveSuccess(false);
    setTimeout(() => {
      if (dialogRef.current) {
        dialogRef.current.showModal();
      }
    }, 50);
  };

  const handleCloseDetails = () => {
    if (dialogRef.current) {
      dialogRef.current.close();
    }
  };

  const handleDialogCloseEvent = () => {
    setActiveDetailItem(null);
    setIsEditing(false);
    setValidationError('');
    setSaveSuccess(false);
    setShowDeleteConfirm(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    // Only clicks landing on the dialog element itself can be backdrop clicks.
    // Programmatic clicks (e.g. fileRef.current.click()) bubble up from children
    // with (0,0) coordinates and must not close the dialog.
    if (dialogRef.current && e.target === dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        dialogRef.current.close();
      }
    }
  };

  const startEditing = () => {
    if (activeDetailItem) {
      setEditName(activeDetailItem.name);
      setEditBrand(activeDetailItem.brand);
      setEditColor(activeDetailItem.color);
      setEditStyleCode(activeDetailItem.styleCode);
      setEditDescription(activeDetailItem.description);
      setEditImage(activeDetailItem.image);
      setEditImageTop(activeDetailItem.imageTop ?? '');
      setValidationError('');
      setSaveSuccess(false);
      setIsEditing(true);
    }
  };

  const saveEditing = () => {
    if (!editName.trim()) {
      setValidationError('Sneaker name cannot be empty.');
      return;
    }
    if (!editBrand.trim()) {
      setValidationError('Brand cannot be empty.');
      return;
    }

    if (activeDetailItem) {
      const updatedItem: SneakerItem = {
        ...activeDetailItem,
        name: editName.trim(),
        brand: editBrand.trim(),
        color: editColor.trim(),
        styleCode: editStyleCode.trim(),
        description: editDescription.trim(),
        image: editImage,
        imageTop: editImageTop || undefined
      };
      onUpdateSneaker(updatedItem);
      setActiveDetailItem(updatedItem);
      setValidationError('');
      setIsEditing(false);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setValidationError('');
  };

  const handlePhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setImage: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file after a failed attempt
    e.target.value = '';
    if (!file) return;
    try {
      setImage(await resizeImageToDataUrl(file));
      setValidationError('');
    } catch (err) {
      console.error(err);
      setValidationError('Could not read that image. Try a PNG, JPG or WEBP file.');
    }
  };

  // While editing, the photo box previews pending (unsaved) images
  const currentSideImage = isEditing && activeDetailItem ? editImage : activeDetailItem?.image ?? '';
  const currentTopImage = isEditing && activeDetailItem ? editImageTop : activeDetailItem?.imageTop ?? '';
  const detailImage = detailView === 'top' && currentTopImage ? currentTopImage : currentSideImage;

  return (
    <section className="closet-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px', flexGrow: 1 }}>
      {/* Filter toolbar: hairline-ruled band on the field, no box */}
      <div className="filter-panel" style={{
        borderTop: '1px solid var(--border-color)',
        borderBottom: '1px solid var(--border-color)',
        padding: '18px 0 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '32px',
          alignItems: 'center'
        }}>
          {/* Search input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{
              position: 'absolute',
              left: '2px',
              color: 'var(--text-muted)'
            }} />
            <input
              type="text"
              placeholder="Search name or style code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '26px',
                height: '40px',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Brand selector */}
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            style={{ height: '40px', width: '100%', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            <option value="All">All Brands</option>
            {brands.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>

          {/* Colorway selector — appears once colorways have been entered */}
          {colors.length > 0 && (
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              style={{ height: '40px', width: '100%', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value="All">All Colorways</option>
              {colors.map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          )}
        </div>

        {isAnyFilterActive && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={clearAllFilters}
              className="tap-target"
              style={{
                padding: '4px 0',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.68rem',
                fontWeight: 500,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '3px'
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Sneaker grid */}
      {sneakers.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '96px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px'
        }}>
          <Footprints size={40} strokeWidth={1} style={{ color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 500 }}>The rotation is empty</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto' }}>
            Add your first pair with the Add Sneaker button above — a side-view photo is all it takes.
          </p>
        </div>
      ) : filteredSneakers.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 32px'
        }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '10px', fontSize: '0.9rem', marginLeft: 'auto', marginRight: 'auto' }}>No sneakers found matching your filters.</p>
          <button
            onClick={clearAllFilters}
            className="tap-target"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.7rem',
              letterSpacing: '0.12em'
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: '48px 28px'
        }}>
          {filteredSneakers.map(sneaker => {
            const isPacked = packedItemIds.includes(sneaker.id);
            const isSelected = selectionMode && selectedItemIds.includes(sneaker.id);
            return (
              <article
                key={sneaker.id}
                className="interactive-card sneaker-cell"
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  outline: isSelected ? '1px solid var(--text-primary)' : 'none',
                  outlineOffset: '6px'
                }}
                onClick={() => selectionMode ? onToggleSelectItem?.(sneaker) : handleOpenDetails(sneaker)}
              >
                {/* Image well: lateral view at rest, top view on hover */}
                <div className="sneaker-well" style={{
                  position: 'relative',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}>
                  <img
                    src={sneaker.image}
                    alt={sneaker.name}
                    loading="lazy"
                    className={`sneaker-view-side${sneaker.imageTop ? ' has-top' : ''}`}
                    style={{
                      width: '90%',
                      height: '90%',
                      objectFit: 'contain'
                    }}
                  />
                  {sneaker.imageTop && (
                    <img
                      src={sneaker.imageTop}
                      alt={`${sneaker.name} — top view`}
                      loading="lazy"
                      className="sneaker-view-top"
                      style={{ objectFit: 'contain' }}
                    />
                  )}

                  {selectionMode ? (
                    /* Outfit selection indicator — card click toggles, so no stopPropagation */
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid',
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color-hover)',
                        backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: 'var(--bg-surface)',
                        transition: 'var(--transition-fast)',
                        zIndex: 2
                      }}
                    >
                      {isSelected && <Check size={16} strokeWidth={3} />}
                    </div>
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        display: 'flex',
                        gap: '8px',
                        zIndex: 2
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onAddToPackingList(sneaker)}
                        className="tap-target"
                        title={isPacked ? "Remove from packing list" : "Add to packing list"}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--text-primary)',
                          backgroundColor: isPacked ? 'var(--text-primary)' : 'var(--bg-surface)',
                          color: isPacked ? 'var(--bg-surface)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)',
                          padding: 0
                        }}
                      >
                        {isPacked ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Info block: brand and style code in the garment-tag voice */}
                <div style={{ padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {sneaker.brand}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap'
                    }}>
                      {sneaker.styleCode}
                    </span>
                  </div>

                  <h3 style={{
                    fontSize: '0.95rem',
                    lineHeight: '1.35',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    letterSpacing: '0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {sneaker.name}
                  </h3>

                  {sneaker.color && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '4px'
                    }}>
                      <span style={{
                        fontSize: '0.65rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {sneaker.color}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Sneaker details dialog */}
      <dialog
        ref={dialogRef}
        onClose={handleDialogCloseEvent}
        onClick={handleBackdropClick}
        style={{
          padding: 0,
          border: 'none',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-surface)',
          maxWidth: '680px',
          width: '90%',
          maxHeight: '90vh'
        }}
      >
        {activeDetailItem && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxHeight: '90vh'
          }}>
            {/* Header / dismiss / edit toggle */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              gap: '12px',
              flexShrink: 0
            }}>
              <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>Sneaker Details</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {saveSuccess && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                    Saved successfully!
                  </span>
                )}
                {!isEditing ? (
                  <button
                    onClick={startEditing}
                    className="tap-target"
                    style={{
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'transparent',
                      color: 'var(--accent-primary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Edit2 size={12} />
                    Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={saveEditing}
                      className="tap-target"
                      style={{
                        border: 'none',
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--bg-surface)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="tap-target"
                      style={{
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'transparent',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <button
                  onClick={handleCloseDetails}
                  className="tap-target"
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
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Photo & specs grid */}
            <div className="dialog-grid" style={{
              backgroundColor: 'var(--bg-surface)',
              overflowY: 'auto',
              flexGrow: 1
            }}>
              {/* Product photo box with view toggle */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="sneaker-well" style={{
                  padding: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  aspectRatio: '1',
                  maxHeight: '300px'
                }}>
                  <img
                    src={detailImage}
                    alt={activeDetailItem.name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>

                {/* View toggle: quiet mono tabs, underline marks the active view */}
                {currentTopImage && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', padding: '12px 0 4px' }}>
                    {(['side', 'top'] as const).map(view => {
                      const isActive = detailView === view;
                      return (
                        <button
                          key={view}
                          onClick={() => setDetailView(view)}
                          className="tap-target"
                          style={{
                            padding: '2px 0',
                            border: 'none',
                            borderBottom: '1px solid',
                            borderBottomColor: isActive ? 'var(--text-primary)' : 'transparent',
                            backgroundColor: 'transparent',
                            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontSize: '0.62rem',
                            fontWeight: 500,
                            letterSpacing: '0.12em',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            transition: 'var(--transition-fast)'
                          }}
                        >
                          {view === 'side' ? 'Side' : 'Top'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Photo actions, edit mode only: replace or remove views */}
                {isEditing && (
                  <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 18px', padding: '10px 12px 14px' }}>
                    <input
                      type="file"
                      ref={sideFileRef}
                      onChange={(e) => handlePhotoChange(e, setEditImage)}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                    <input
                      type="file"
                      ref={topFileRef}
                      onChange={(e) => handlePhotoChange(e, setEditImageTop)}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                    {([
                      { label: 'Replace side photo', action: () => sideFileRef.current?.click() },
                      currentTopImage
                        ? { label: 'Replace top photo', action: () => topFileRef.current?.click() }
                        : { label: 'Add top photo', action: () => topFileRef.current?.click() },
                      ...(currentTopImage
                        ? [{
                            label: 'Remove top photo',
                            action: () => {
                              setEditImageTop('');
                              setDetailView('side');
                            }
                          }]
                        : [])
                    ]).map(({ label, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="tap-target"
                        style={{
                          padding: '2px 0',
                          border: 'none',
                          backgroundColor: 'transparent',
                          color: 'var(--text-secondary)',
                          fontSize: '0.62rem',
                          fontWeight: 500,
                          letterSpacing: '0.12em',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: '3px',
                          transition: 'var(--transition-fast)'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Description / editing form */}
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {validationError && (
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
                    <span>{validationError}</span>
                  </div>
                )}

                {!isEditing ? (
                  <>
                    <div>
                      <span style={{
                        fontSize: '0.65rem',
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em'
                      }}>
                        {activeDetailItem.brand}
                      </span>
                      <h2 style={{ fontSize: '1.5rem', marginTop: '6px', fontFamily: 'var(--font-heading)', fontWeight: 400 }}>
                        {activeDetailItem.name}
                      </h2>
                    </div>

                    {activeDetailItem.description && (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {activeDetailItem.description}
                      </p>
                    )}

                    {/* Attributes */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <div>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Style Code</span>
                        <strong style={{ fontSize: '0.9rem', fontWeight: 400, fontFamily: 'var(--font-mono)' }}>{activeDetailItem.styleCode || '—'}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Colorway</span>
                        <strong style={{ fontSize: '0.9rem', fontWeight: 400 }}>{activeDetailItem.color || '—'}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sneaker Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Brand</label>
                        <input
                          type="text"
                          value={editBrand}
                          onChange={(e) => setEditBrand(e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Colorway</label>
                        <input
                          type="text"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Style Code</label>
                      <input
                        type="text"
                        value={editStyleCode}
                        onChange={(e) => setEditStyleCode(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Description</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        style={{
                          width: '100%',
                          fontSize: '0.9rem',
                          resize: 'none'
                        }}
                      />
                    </div>
                  </div>
                )}

                {showDeleteConfirm ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    backgroundColor: 'var(--error-bg)',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--error-border)',
                    marginTop: '12px'
                  }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--error)', fontWeight: 500, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <AlertCircle size={14} />
                      Delete this sneaker permanently?
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          if (onDeleteSneaker) {
                            onDeleteSneaker(activeDetailItem.id);
                          }
                          handleCloseDetails();
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
                        onClick={() => setShowDeleteConfirm(false)}
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
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '12px' }}>
                    <button
                      onClick={() => {
                        onAddToPackingList(activeDetailItem);
                        handleCloseDetails();
                      }}
                      className="tap-target"
                      style={{
                        width: '100%',
                        padding: '14px',
                        border: 'none',
                        backgroundColor: packedItemIds.includes(activeDetailItem.id) ? 'var(--well)' : 'var(--accent-primary)',
                        color: packedItemIds.includes(activeDetailItem.id) ? 'var(--text-primary)' : 'var(--bg-surface)',
                        fontWeight: 500,
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'var(--transition-fast)'
                      }}
                    >
                      {packedItemIds.includes(activeDetailItem.id) ? (
                        <>
                          <Check size={18} />
                          Remove from packing list
                        </>
                      ) : (
                        <>
                          <Plus size={18} />
                          Add to packing list
                        </>
                      )}
                    </button>

                    {!isEditing && onDeleteSneaker && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="tap-target"
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'transparent',
                          color: 'var(--error)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'var(--transition-fast)'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--error-bg)';
                          e.currentTarget.style.borderColor = 'var(--error-border)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                        }}
                      >
                        Delete Sneaker
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </dialog>

      {/* Sneaker wells own their hover behavior: the global product-image rules
          pin transition to transform only, which would break the view cross-fade */}
      <style>{`
        .sneaker-well {
          background-color: var(--well);
        }
        .sneaker-well img {
          mix-blend-mode: multiply;
          opacity: 0.95;
          transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sneaker-well .sneaker-view-top {
          position: absolute;
          inset: 5%;
          width: 90%;
          height: 90%;
          opacity: 0;
        }
        .sneaker-cell:hover .sneaker-well img {
          transform: scale(1.04);
        }
        .sneaker-cell:hover .sneaker-well .sneaker-view-top {
          opacity: 0.95;
        }
        .sneaker-cell:hover .sneaker-well .sneaker-view-side.has-top {
          opacity: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .sneaker-cell:hover .sneaker-well img {
            transform: none;
          }
        }
      `}</style>
    </section>
  );
};
export default SneakerGrid;
