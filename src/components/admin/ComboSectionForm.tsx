import { Plus, Minus } from 'lucide-react';
import { useState, useRef } from 'react';
import type { MenuItem } from '../../types/firebase';
import ProductSelector from './ProductSelector';

const ICONS = ['🍔', '🍕', '🥗', '🍰', '🥤', '🍟', '🍖', '🥩', '🍗', '🥪', '🌮', '🍣'];

interface ComboSectionFormProps {
  section: {
    id: string;
    name: string;
    required: boolean;
    icon?: string;
    image?: string;
    imageFile?: File;
    icon?: string;
    items: Array<{
      id: string;
      name: string;
      price: number;
      image?: string;
      included: boolean;
    }>;
  };
  availableProducts: MenuItem[];
  onUpdate: (sectionId: string, updates: any) => void;
  onRemove: (sectionId: string) => void;
}

export default function ComboSectionForm({ 
  section, 
  availableProducts,
  onUpdate, 
  onRemove 
}: ComboSectionFormProps) {
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('L\'image ne doit pas dépasser 5MB');
        return;
      }

      // Clean up previous object URL if exists
      if (section.image?.startsWith('blob:')) {
        URL.revokeObjectURL(section.image);
      }

      const imageUrl = URL.createObjectURL(file);
      onUpdate(section.id, {
        ...section,
        image: imageUrl,
        icon: undefined,
        imageFile: file
      });
    }
  };

  const handleIconSelect = (icon: string) => {
    // Clean up previous object URL if exists
    if (section.image?.startsWith('blob:')) {
      URL.revokeObjectURL(section.image);
    }

    onUpdate(section.id, {
      ...section,
      icon,
      image: undefined,
      imageFile: undefined
    });
    setShowIconSelector(false);
  };

  const handleAddProduct = (product: MenuItem) => {
    // Empêcher la propagation de l'événement
    const updatedItems = [
      ...section.items,
      { 
        id: product.id,
        name: product.name,
        price: 0,
        image: product.image,
        included: true
      }
    ];

    onUpdate(section.id, {
      ...section,
      items: updatedItems
    });
  };

  const handleRemoveItem = (itemId: string, e: React.MouseEvent) => {
    // Empêcher la propagation de l'événement
    e.preventDefault();
    e.stopPropagation();
    onUpdate(section.id, {
      ...section,
      items: section.items.filter(item => item.id !== itemId)
    });
  };

  const handleItemChange = (itemId: string, field: 'price' | 'included', value: number | boolean, e?: React.ChangeEvent) => {
    // Empêcher la propagation de l'événement si présent
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    onUpdate(section.id, {
      ...section,
      items: section.items.map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onUpdate(section.id, { ...section, name: e.target.value });
  };

  const handleRequiredChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onUpdate(section.id, { ...section, required: e.target.checked });
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex gap-4 mb-4">
        <div className="flex-shrink-0">
          {section.image ? (
            <div className="relative w-16 h-16">
              <img
                src={section.image}
                alt={section.name}
                className="w-full h-full object-cover rounded-lg"
              />
              <button
                onClick={() => onUpdate(section.id, { ...section, image: undefined })}
                className="absolute -top-2 -right-2 p-1 bg-white rounded-full shadow-md"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ) : section.icon ? (
            <div className="relative w-16 h-16">
              <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                {section.icon}
              </div>
              <button
                onClick={() => onUpdate(section.id, { ...section, icon: undefined })}
                className="absolute -top-2 -right-2 p-1 bg-white rounded-full shadow-md"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => setShowIconSelector(true)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Icône
              </button>
              <span className="text-gray-300">ou</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={section.name}
              onChange={handleNameChange}
              placeholder="Nom de la section"
              className="flex-1 px-3 py-2 border rounded-lg mr-4"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(section.id);
              }}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
            >
              <Minus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Icon selector modal */}
      {showIconSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Choisir une icône</h3>
            <div className="grid grid-cols-6 gap-2">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => handleIconSelect(icon)}
                  className="p-3 text-2xl rounded-lg hover:bg-gray-100"
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowIconSelector(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <label className="flex items-center mb-4">
        <input
          type="checkbox"
          checked={section.required}
          onChange={handleRequiredChange}
          className="rounded border-gray-300 text-emerald-500"
        />
        <span className="ml-2 text-sm">Section obligatoire</span>
      </label>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {section.items.map((item, index) => (
            <div key={`${item.id}-${index}`} className="border rounded-lg p-3">
              <div className="flex items-center gap-3 mb-3">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <div className="flex-1">
                  <h4 className="font-medium">{item.name}</h4>
                  <label className="flex items-center mt-1">
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={(e) => handleItemChange(item.id, 'included', e.target.checked, e)}
                      className="rounded border-gray-300 text-emerald-500"
                    />
                    <span className="ml-2 text-sm">Inclus</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleRemoveItem(item.id, e)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Minus className="h-5 w-5" />
                </button>
              </div>

              {!item.included && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Supplément :</span>
                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => handleItemChange(item.id, 'price', parseFloat(e.target.value) || 0, e)}
                    className="w-24 px-3 py-1 border rounded-lg text-sm"
                    min="0"
                    step="0.01"
                    placeholder="0.00 €"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowProductSelector(true);
          }}
          className="w-full px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Ajouter un produit
        </button>
      </div>

      {showProductSelector && (
        <ProductSelector
          products={availableProducts}
          onSelect={(product) => {
            handleAddProduct(product);
            setShowProductSelector(false);
          }}
          onClose={() => setShowProductSelector(false)}
          title="Sélectionner un produit"
        />
      )}
    </div>
  );
}