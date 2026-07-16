import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Sparkles, Key, Check, Loader2, AlertCircle } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';
import type { ClosetItem } from './ClosetGrid';
import { resizeImageToDataUrl } from '../utils/image';

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

  const tagImageWithGemini = async (base64Image: string, key: string): Promise<any> => {
    const base64Data = base64Image.split(',')[1] || base64Image;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Analyze this clothing item image and return a JSON object with: { \"name\": \"Title of item\", \"category\": \"one of (T-Shirts, Polos, Long Sleeves, Pants, Shorts, Hoodies, Sweatshirts, Jerseys)\", \"color\": \"Primary color (single word)\", \"brand\": \"Brand name (e.g. Nike, Adidas, Uniqlo, Generic)\", \"description\": \"Short description of style\" }. Return ONLY raw JSON, no markdown blocks." },
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

  const generateFlatLay = async (base64Image: string, key: string): Promise<string> => {
    const base64Data = base64Image.split(',')[1] || base64Image;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key={key}`.replace('{key}', key), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "A professional flat-lay studio product photo of this exact garment, laid flat, perfectly centered, showing the front, on a solid pure white background, wrinkle-free, no model, no hanger, no shadows."
              },
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
          responseModalities: ["IMAGE"]
        }
      })
    });
    
    if (!response.ok) {
      throw new Error('Gemini Image processing failed. Fallback to isolated original photo.');
    }
    
    const result = await response.json();
    const generatedBase64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!generatedBase64) {
      throw new Error('No image generated from Gemini Image model.');
    }
    
    const mimeType = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'image/jpeg';
    return `data:${mimeType};base64,${generatedBase64}`;
  };

  const runPipeline = async () => {
    if (!selectedFile) return;
    setError('');
    
    let finalImage = '';
    let tags: any = null;

    try {
      // Step 1: Prep raw original image for AI analysis
      const base64Raw = await resizeImageToDataUrl(selectedFile);

      // Step 2: Auto-Tagging & Prompt Generation
      if (apiKey.trim()) {
        setStatusStep('tagging');
        setStatusMessage('Analyzing garment details with Gemini AI...');
        
        try {
          tags = await tagImageWithGemini(base64Raw, apiKey.trim());
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
        // Fallback defaults if no API key
        setName(selectedFile.name.replace(/\.[^/.]+$/, ""));
        setBrand('Generic');
        setCategory('T-Shirts');
        setColor('Unknown');
        setDescription('Manually uploaded clothing item.');
      }

      // Step 3: Gemini Image AI Flattening & Wrinkle Smoothing
      if (apiKey.trim() && enableFlattening) {
        setStatusStep('generating');
        setStatusMessage('Flattening garment layout and smoothing wrinkles...');
        try {
          const generatedFlatLayBase64 = await generateFlatLay(base64Raw, apiKey.trim());
          const generatedResponse = await fetch(generatedFlatLayBase64);
          finalImage = await resizeImageToDataUrl(await generatedResponse.blob());
        } catch (genErr: any) {
          console.error(genErr);
          setError(`Flattening failed: ${genErr.message || genErr}. Proceeding with isolated photo.`);
        }
      }

      // Step 4: Fallback to local background removal if no AI image was generated
      if (!finalImage) {
        setStatusStep('cleaning');
        setStatusMessage('Smoothing wrinkles and isolating garment background...');
        try {
          const cleanedBlob = await removeBackground(selectedFile, {
            device: 'cpu'
          });
          finalImage = await resizeImageToDataUrl(cleanedBlob);
        } catch (cleanErr) {
          console.error(cleanErr);
          // If both AI and background removal fail, use the resized original photo
          finalImage = base64Raw;
        }
      }
      
      setProcessedImageBase64(finalImage);
      setPreviewUrl(finalImage);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--text-primary)' }} />
            <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>Add Garment</h3>
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

          {statusStep === 'idle' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '1px solid transparent',
                padding: '48px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
                backgroundColor: 'var(--well)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--text-primary)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
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
                      padding: '13px 24px',
                      fontWeight: 500,
                      fontSize: '0.68rem',
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
                  backgroundColor: 'var(--well)',
                  border: 'none',
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
                    <option value="Shorts">Shorts</option>
                    <option value="Sweatshirts">Sweatshirts</option>
                    <option value="Jerseys">Jerseys</option>
                    <option value="Hoodies">Hoodies</option>
                    <option value="Shirts">Shirts</option>
                    <option value="Outerwear">Outerwear</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    style={{
                      fontSize: '0.85rem',
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
