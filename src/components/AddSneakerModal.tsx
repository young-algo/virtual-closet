import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Check, AlertCircle } from 'lucide-react';
import type { SneakerItem } from './SneakerGrid';
import { resizeImageToDataUrl } from '../utils/image';

interface AddSneakerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSneaker: (item: SneakerItem) => void;
}

// Sneakers skip the AI pipeline entirely: the user supplies hi-fidelity
// product photos (side view required, top view optional) and metadata by hand.
export const AddSneakerModal: React.FC<AddSneakerModalProps> = ({ isOpen, onClose, onAddSneaker }) => {
  const [sideImage, setSideImage] = useState('');
  const [topImage, setTopImage] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('Nike');
  const [color, setColor] = useState('');
  const [styleCode, setStyleCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const sideInputRef = useRef<HTMLInputElement>(null);
  const topInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSideImage('');
      setTopImage('');
      setName('');
      setBrand('Nike');
      setColor('');
      setStyleCode('');
      setDescription('');
      setError('');
    }
  }, [isOpen]);

  const handleImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setImage: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file after a failed attempt
    e.target.value = '';
    if (!file) return;
    try {
      setImage(await resizeImageToDataUrl(file));
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not read that image. Try a PNG, JPG or WEBP file.');
    }
  };

  const handleSave = () => {
    if (!sideImage) {
      setError('A side-view photo is required.');
      return;
    }
    if (!name.trim()) {
      setError('Sneaker name cannot be empty.');
      return;
    }
    if (!brand.trim()) {
      setError('Brand cannot be empty.');
      return;
    }

    const newItem: SneakerItem = {
      // The user_ prefix marks items that live only in localStorage, so the
      // base-manifest merge on launch leaves them alone
      id: `user_sneaker_${Date.now()}`,
      name: name.trim(),
      category: 'Sneakers',
      color: color.trim(),
      brand: brand.trim(),
      image: sideImage,
      description: description.trim(),
      styleCode: styleCode.trim(),
      ...(topImage ? { imageTop: topImage } : {})
    };

    onAddSneaker(newItem);
    onClose();
  };

  if (!isOpen) return null;

  const imageSlot = (
    label: string,
    required: boolean,
    image: string,
    inputRef: React.RefObject<HTMLInputElement | null>,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onClear?: () => void
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          {label}{required ? '' : ' — optional'}
        </label>
        {image && onClear && (
          <button
            onClick={onClear}
            className="tap-target"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--text-secondary)',
              fontSize: '0.6rem',
              fontWeight: 500,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              padding: 0
            }}
          >
            Remove
          </button>
        )}
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        className="sneaker-upload-well"
        style={{
          backgroundColor: 'var(--well)',
          aspectRatio: '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: 'pointer',
          border: '1px solid transparent',
          transition: 'var(--transition-fast)',
          overflow: 'hidden'
        }}
        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--text-primary)'; }}
        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
      >
        <input
          type="file"
          ref={inputRef}
          onChange={onChange}
          accept="image/*"
          style={{ display: 'none' }}
        />
        {image ? (
          <img
            src={image}
            alt={label}
            style={{ width: '90%', height: '90%', objectFit: 'contain' }}
          />
        ) : (
          <>
            <Upload size={22} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click to upload</span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(17, 17, 17, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: 'none',
        width: '100%',
        maxWidth: '550px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>Add Sneaker</h3>
          <button
            onClick={onClose}
            className="tap-target"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1 }}>
          {error && (
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
              <span>{error}</span>
            </div>
          )}

          {/* Photo wells: side view required, top view optional */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {imageSlot('Side view', true, sideImage, sideInputRef,
              (e) => handleImageChange(e, setSideImage))}
            {imageSlot('Top view', false, topImage, topInputRef,
              (e) => handleImageChange(e, setTopImage),
              () => setTopImage(''))}
          </div>

          {/* Metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sneaker Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Air Jordan 4 Retro"
                style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Brand</label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Colorway</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Bred"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Style Code — optional</label>
              <input
                type="text"
                value={styleCode}
                onChange={(e) => setStyleCode(e.target.value)}
                placeholder="e.g. FQ7860-101"
                style={{ width: '100%', padding: '6px 10px', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Description — optional</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                style={{ width: '100%', fontSize: '0.9rem', resize: 'none' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <button
              onClick={handleSave}
              className="tap-target"
              style={{
                width: '100%',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--bg-surface)',
                border: 'none',
                padding: '13px 16px',
                fontWeight: 500,
                fontSize: '0.68rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Check size={16} />
              Add to Sneakers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default AddSneakerModal;
