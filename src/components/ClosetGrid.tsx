import React, { useState, useMemo, useRef } from 'react';
import { Search, Plus, Check, X, Edit2, AlertCircle, Shirt } from 'lucide-react';
import { productImageBlendMode } from '../utils/productImagePresentation';

export interface ClosetItem {
  id: string;
  name: string;
  category: string;
  color: string;
  brand: string;
  image: string;
  description: string;
}

interface ClosetGridProps {
  items: ClosetItem[];
  onAddToPackingList: (item: ClosetItem) => void;
  packedItemIds: string[];
  onUpdateItem: (item: ClosetItem) => void;
  onDeleteItem?: (itemId: string) => void;
  selectionMode?: boolean;
  selectedItemIds?: string[];
  onToggleSelectItem?: (item: ClosetItem) => void;
}

export const ClosetGrid: React.FC<ClosetGridProps> = ({
  items,
  onAddToPackingList,
  packedItemIds,
  onUpdateItem,
  onDeleteItem,
  selectionMode = false,
  selectedItemIds = [],
  onToggleSelectItem
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [selectedColor, setSelectedColor] = useState<string>('All');
  const [activeDetailItem, setActiveDetailItem] = useState<ClosetItem | null>(null);

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [validationError, setValidationError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);

  // Extract unique categories, brands, and colors dynamically from the items prop
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map(item => item.category)))], [items]);
  const brands = useMemo(() => ['All', ...Array.from(new Set(items.map(item => item.brand)))], [items]);
  const colors = useMemo(() => ['All', ...Array.from(new Set(items.map(item => item.color)))], [items]);

  // Filter items based on search and selected filters
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                            item.brand.toLowerCase().includes(search.toLowerCase()) ||
                            item.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesBrand = selectedBrand === 'All' || item.brand === selectedBrand;
      const matchesColor = selectedColor === 'All' || item.color === selectedColor;

      return matchesSearch && matchesCategory && matchesBrand && matchesColor;
    });
  }, [items, search, selectedCategory, selectedBrand, selectedColor]);

  // Check if any filter is active
  const isAnyFilterActive = search !== '' || selectedCategory !== 'All' || selectedBrand !== 'All' || selectedColor !== 'All';

  const clearAllFilters = () => {
    setSearch('');
    setSelectedCategory('All');
    setSelectedBrand('All');
    setSelectedColor('All');
  };

  const handleOpenDetails = (item: ClosetItem) => {
    setActiveDetailItem(item);
    setIsEditing(false); // Reset edit state
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

  // Close details dialog if user clicks on backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (dialogRef.current) {
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
      setEditCategory(activeDetailItem.category);
      setEditColor(activeDetailItem.color);
      setEditDescription(activeDetailItem.description);
      setValidationError('');
      setSaveSuccess(false);
      setIsEditing(true);
    }
  };

  const saveEditing = () => {
    if (!editName.trim()) {
      setValidationError('Garment name cannot be empty.');
      return;
    }
    if (!editBrand.trim()) {
      setValidationError('Brand cannot be empty.');
      return;
    }
    if (!editCategory.trim()) {
      setValidationError('Category cannot be empty.');
      return;
    }
    if (!editColor.trim()) {
      setValidationError('Color cannot be empty.');
      return;
    }

    if (activeDetailItem) {
      const updatedItem: ClosetItem = {
        ...activeDetailItem,
        name: editName.trim(),
        brand: editBrand.trim(),
        category: editCategory.trim(),
        color: editColor.trim(),
        description: editDescription.trim()
      };
      onUpdateItem(updatedItem);
      setActiveDetailItem(updatedItem);
      setValidationError('');
      setIsEditing(false);
      
      // Trigger temporary success state
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setValidationError('');
  };

  const toggleCategoryPill = (category: string) => {
    setSelectedCategory(prev => prev === category ? 'All' : category);
  };

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
          {/* Search Input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{
              position: 'absolute',
              left: '2px',
              color: 'var(--text-muted)'
            }} />
            <input
              type="text"
              placeholder="Search"
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

          {/* Brand Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              style={{ height: '40px', width: '100%', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value="All">All Brands</option>
              {brands.filter(b => b !== 'All').map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Color Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              style={{ height: '40px', width: '100%', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value="All">All Colors</option>
              {colors.filter(c => c !== 'All').map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Category tabs: quiet text, active marked by an underline */}
        <div style={{
          display: 'flex',
          gap: '24px',
          rowGap: '10px',
          flexWrap: 'wrap',
          alignItems: 'baseline'
        }}>
          {categories.map(category => {
            const isActive = selectedCategory === category;
            return (
              <button
                key={category}
                onClick={() => toggleCategoryPill(category)}
                className="tap-target"
                style={{
                  padding: '4px 0',
                  border: 'none',
                  borderBottom: '1px solid',
                  borderBottomColor: isActive ? 'var(--text-primary)' : 'transparent',
                  backgroundColor: 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.68rem',
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                  transition: 'var(--transition-fast)',
                  cursor: 'pointer'
                }}
              >
                {category}
              </button>
            );
          })}
          {isAnyFilterActive && (
            <button
              onClick={clearAllFilters}
              className="tap-target"
              style={{
                marginLeft: 'auto',
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
          )}
        </div>
      </div>

      {/* Closet Grid */}
      {items.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '96px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px'
        }}>
          <Shirt size={40} strokeWidth={1} style={{ color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 500 }}>Your wardrobe is waiting</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto' }}>
            Get started by adding clothes from your computer or dragging new pictures into the uploader.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 32px'
        }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '10px', fontSize: '0.9rem', marginLeft: 'auto', marginRight: 'auto' }}>No items found matching your filters.</p>
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
          {filteredItems.map(item => {
            const isSelected = selectionMode && selectedItemIds.includes(item.id);
            const activateCard = () => selectionMode ? onToggleSelectItem?.(item) : handleOpenDetails(item);
            return (
              <article
                key={item.id}
                className="interactive-card"
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  outline: isSelected ? '1px solid var(--text-primary)' : 'none',
                  outlineOffset: '6px'
                }}
                onClick={activateCard}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateCard();
                  }
                }}
              >
                {/* Image well */}
                <div style={{
                  position: 'relative',
                  aspectRatio: '1',
                  backgroundColor: 'var(--well)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }} className="product-image-container">
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    style={{
                      width: '90%',
                      height: '90%',
                      objectFit: 'contain',
                      mixBlendMode: productImageBlendMode(item.category)
                    }}
                    className="product-image"
                  />

                  {/* Outfit selection indicator — card click toggles, so no stopPropagation */}
                  {selectionMode && (
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
                        boxShadow: 'var(--shadow-sm)',
                        zIndex: 2
                      }}
                    >
                      {isSelected && <Check size={16} strokeWidth={3} />}
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div style={{ padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {item.brand}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {item.category}
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
                    {item.name}
                  </h3>

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
                      {item.color}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Closet Item Details Native Dialog Overlay */}
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
            {/* Header / Dismiss / Edit toggle */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              gap: '12px',
              flexShrink: 0
            }}>
              <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>Garment Details</h3>
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

            {/* Photo & Specs Grid */}
            <div className="dialog-grid" style={{
              backgroundColor: 'var(--bg-surface)',
              overflowY: 'auto',
              flexGrow: 1
            }}>
              {/* Product Photo Box */}
              <div style={{
                backgroundColor: 'var(--well)',
                padding: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                aspectRatio: '1',
                maxHeight: '300px'
              }} className="product-image-container">
                <img
                  src={activeDetailItem.image}
                  alt={activeDetailItem.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    mixBlendMode: productImageBlendMode(activeDetailItem.category)
                  }}
                />
              </div>

              {/* Text Description / Editing Form Box */}
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

                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {activeDetailItem.description}
                    </p>

                    {/* Attributes badges */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <div>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Category</span>
                        <strong style={{ fontSize: '0.9rem', fontWeight: 400 }}>{activeDetailItem.category}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Color</span>
                        <strong style={{ fontSize: '0.9rem', fontWeight: 400 }}>{activeDetailItem.color}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Garment Name</label>
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
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Color</label>
                        <input
                          type="text"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Category</label>
                      <input
                        type="text"
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
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
                      Delete this garment permanently?
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          if (onDeleteItem) {
                            onDeleteItem(activeDetailItem.id);
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
                    
                    {!isEditing && onDeleteItem && (
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
                        Delete Garment
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
};
export default ClosetGrid;
