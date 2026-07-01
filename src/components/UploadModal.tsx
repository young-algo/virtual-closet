import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Sparkles, Key, Check, Loader2, AlertCircle } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';
import type { ClosetItem } from './ClosetGrid';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGarment: (item: ClosetItem) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onAddGarment }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  
  // Pipeline States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [statusStep, setStatusStep] = useState<'idle' | 'cleaning' | 'tagging' | 'generating' | 'review'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  
  // Garment Details Form
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('T-Shirts');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [processedImageBase64, setProcessedImageBase64] = useState('');
  const [enableFlattening, setEnableFlattening] = useState(true);
  
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      resetPipeline();
    }
  }, [isOpen]);

  const resetPipeline = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setStatusStep('idle');
    setStatusMessage('');
    setName('');
    setBrand('');
    setCategory('T-Shirts');
    setColor('');
    setDescription('');
    setProcessedImageBase64('');
    setError('');
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey.trim());
    setShowKeyInput(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError('');
    }
  };

  const processAndResizeImage = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 500;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }
        
        canvas.width = maxDim;
        canvas.height = maxDim;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw solid white background to match existing items
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, maxDim, maxDim);
          
          // Draw centered image
          const xOffset = (maxDim - width) / 2;
          const yOffset = (maxDim - height) / 2;
          ctx.drawImage(img, xOffset, yOffset, width, height);
          
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          reject(new Error('Canvas context failed'));
        }
      };
      img.onerror = (e) => reject(e);
    });
  };

  const tagImageWithGemini = async (base64Image: string, key: string): Promise<any> => {
    const base64Data = base64Image.split(',')[1] || base64Image;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Analyze this clothing item image and return a JSON object with: { \"name\": \"Title of item\", \"category\": \"one of (T-Shirts, Polos, Long Sleeves, Pants, Shorts, Hoodies, Sweatshirts, Jerseys)\", \"color\": \"Primary color (single word)\", \"brand\": \"Brand name (e.g. Nike, Adidas, Uniqlo, Generic)\", \"description\": \"Short description of style\", \"generationPrompt\": \"A detailed prompt to generate a flat-lay product photo of this exact garment on a solid pure white background, centered, with no model, no hanger, and no wrinkles (e.g., 'A professional flat-lay studio product photo of a blue knit long-sleeve polo shirt with white stripes... laid flat, perfectly centered, showing the front, on a solid pure white background, wrinkle-free')\" }. Return ONLY raw JSON, no markdown blocks." },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    
    if (!response.ok) {
      throw new Error('Gemini API request failed. Please check your API key.');
    }
    
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No description details returned from Gemini.');
    }
    
    return JSON.parse(text);
  };

  const generateFlatLay = async (prompt: string, key: string): Promise<string> => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [
          { prompt: prompt }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1"
        }
      })
    });
    
    if (!response.ok) {
      throw new Error('Imagen 4 generation failed. Fallback to isolated original photo.');
    }
    
    const result = await response.json();
    const base64Data = result.predictions?.[0]?.bytesBase64Encoded;
    if (!base64Data) {
      throw new Error('No image generated from Imagen.');
    }
    
    const mimeType = result.predictions?.[0]?.mimeType || 'image/jpeg';
    return `data:${mimeType};base64,${base64Data}`;
  };

  const runPipeline = async () => {
    if (!selectedFile) return;
    setError('');
    
    try {
      // Step 1: Background Removal
      setStatusStep('cleaning');
      setStatusMessage('Smoothing wrinkles and isolating garment background...');
      
      const cleanedBlob = await removeBackground(selectedFile);
      const base64Jpeg = await processAndResizeImage(cleanedBlob);
      setProcessedImageBase64(base64Jpeg);
      setPreviewUrl(base64Jpeg);
      
      // Step 2: Auto-Tagging
      let tags: any = null;
      if (apiKey.trim()) {
        setStatusStep('tagging');
        setStatusMessage('Analyzing garment details with Gemini AI...');
        
        try {
          tags = await tagImageWithGemini(base64Jpeg, apiKey.trim());
          setName(tags.name || '');
          setBrand(tags.brand || '');
          setCategory(tags.category || 'T-Shirts');
          setColor(tags.color || '');
          setDescription(tags.description || '');
        } catch (tagErr) {
          console.error(tagErr);
          setError('AI tagging failed. You can fill out the metadata manually.');
        }
      } else {
        // Fallback defaults
        setName(selectedFile.name.replace(/\.[^/.]+$/, ""));
        setBrand('Generic');
        setCategory('T-Shirts');
        setColor('Unknown');
        setDescription('Manually uploaded clothing item.');
      }

      // Step 3: Imagen AI Flattening & Wrinkle Smoothing
      if (apiKey.trim() && enableFlattening && tags && tags.generationPrompt) {
        setStatusStep('generating');
        setStatusMessage('Flattening garment layout and smoothing wrinkles...');
        try {
          const generatedFlatLayBase64 = await generateFlatLay(tags.generationPrompt, apiKey.trim());
          setProcessedImageBase64(generatedFlatLayBase64);
          setPreviewUrl(generatedFlatLayBase64);
        } catch (genErr: any) {
          console.error(genErr);
          setError(`Flattening failed: ${genErr.message || genErr}. Proceeding with isolated photo.`);
        }
      }
      
      setStatusStep('review');
      setStatusMessage('');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to process image.');
      setStatusStep('idle');
    }
  };

  const handleSaveGarment = () => {
    if (!name.trim() || !brand.trim() || !color.trim()) {
      setError('Name, Brand, and Color are required.');
      return;
    }

    const newItem: ClosetItem = {
      id: `user_${Date.now()}`,
      name: name.trim(),
      brand: brand.trim(),
      category: category,
      color: color.trim(),
      image: processedImageBase64 || previewUrl,
      description: description.trim() || `${brand} ${category} in ${color}`
    };

    onAddGarment(newItem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(30, 32, 34, 0.45)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>Add New Garment</h3>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* API Key configuration bar */}
        <div style={{
          backgroundColor: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-color)',
          padding: '10px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={12} />
            {apiKey ? 'Gemini AI Tagging: Active' : 'Gemini AI Tagging: Inactive (using manual fallback)'}
          </span>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-primary)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            {showKeyInput ? 'Hide settings' : 'Configure key'}
          </button>
        </div>

        {showKeyInput && (
          <div style={{
            padding: '12px 24px',
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Gemini API Key</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
              />
              <button
                onClick={handleSaveApiKey}
                style={{
                  border: 'none',
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--bg-surface)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Content panel */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1 }}>
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#ff6b6b',
              backgroundColor: 'rgba(255, 107, 107, 0.08)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              border: '1px solid rgba(255, 107, 107, 0.2)'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {statusStep === 'idle' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
                backgroundColor: 'var(--bg-primary)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              {selectedFile ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)'
                  }}>
                    <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{selectedFile.name}</span>
                  
                  {apiKey.trim() && (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        marginTop: '4px',
                        padding: '6px 10px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-primary)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enableFlattening}
                        onChange={(e) => setEnableFlattening(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Flatten & smooth wrinkles using Imagen AI</span>
                    </label>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runPipeline();
                    }}
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--bg-surface)',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '8px'
                    }}
                  >
                    <Sparkles size={16} />
                    Run Clean & Tag Pipeline
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                  <Upload size={32} style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Click to upload</span> or drag and drop
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PNG, JPG or WEBP up to 10MB</span>
                </div>
              )}
            </div>
          )}

          {(statusStep === 'cleaning' || statusStep === 'tagging' || statusStep === 'generating') && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              gap: '16px'
            }}>
              <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {statusMessage}
              </p>
            </div>
          )}

          {statusStep === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px' }}>
                {/* Visual Preview */}
                <div style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  maxHeight: '180px'
                }}>
                  <img src={previewUrl} alt="Processed result" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>

                {/* Form Specs details editor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Brand</label>
                      <input
                        type="text"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Color</label>
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.85rem', width: '100%' }}
                  >
                    <option value="T-Shirts">T-Shirts</option>
                    <option value="Polos">Polos</option>
                    <option value="Long Sleeves">Long Sleeves</option>
                    <option value="Pants">Pants</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.85rem',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: 'var(--radius-sm)',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button
                  onClick={handleSaveGarment}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--bg-surface)',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Check size={16} />
                  Add to Closet
                </button>
                <button
                  onClick={resetPipeline}
                  style={{
                    padding: '10px 16px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Simple rotate/animation CSS overrides */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};
export default UploadModal;
