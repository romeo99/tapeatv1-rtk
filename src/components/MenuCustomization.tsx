import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { availableIngredients } from '../data/ingredients';

interface MenuCustomizationProps {
  item: {
    id: string;
    name: string;
    price: number;
    image: string;
    description?: string;
    mainProductId?: string;
    sections?: Array<{
      id: string;
      name: string;
      required: boolean;
      items: Array<{
        id: string;
        name: string;
        price: number;
        image?: string;
        included: boolean;
      }>;
    }>;
  };
  onClose: () => void;
  themeColor: string;
}

export default function MenuCustomization({ item, onClose, themeColor }: MenuCustomizationProps) {
  const { addItem } = useCart();
  const { restaurant } = useRestaurantContext();
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const [excludedIngredients, setExcludedIngredients] = useState<string[]>([]);
  const [showAnimation, setShowAnimation] = useState(false);
  const [productIngredients, setProductIngredients] = useState<Array<{id: string; name: string; icon: string}>>([]);
  const [remarks, setRemarks] = useState('');
  const [modalHeight, setModalHeight] = useState('85vh');
  const [mainProduct, setMainProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch main product data when component mounts
  useEffect(() => {
    const fetchMainProduct = async () => {
      if (!item.mainProductId || !restaurant?.id) return;

      try {
        setLoading(true);
        const mainProductRef = doc(db, 'restaurants', restaurant.id, 'menuItems', item.mainProductId);
        const mainProductDoc = await getDoc(mainProductRef);
        
        if (mainProductDoc.exists()) {
          const data = mainProductDoc.data();
          // Map ingredient IDs to full ingredient objects from availableIngredients
          const ingredients = data.ingredients?.map((ingredientId: string) => {
            return availableIngredients.find(ing => ing.id === ingredientId);
          }).filter(Boolean) || [];

          setMainProduct({
            id: mainProductDoc.id,
            ...data,
            ingredients
          });
        }
      } catch (err) {
        console.error('Error fetching main product:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMainProduct();
  }, [item.mainProductId, restaurant?.id]);

  // Adjust modal height based on screen size
  useEffect(() => {
    const adjustModalHeight = () => {
      if (window.innerHeight < 700) {
        setModalHeight('92vh');
      } else {
        setModalHeight('85vh');
      }
    };

    adjustModalHeight();
    window.addEventListener('resize', adjustModalHeight);
    return () => window.removeEventListener('resize', adjustModalHeight);
  }, []);

  // Scroll to top when step changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  const toggleIngredient = (ingredientId: string) => {
    setExcludedIngredients(prev =>
      prev.includes(ingredientId)
        ? prev.filter(id => id !== ingredientId)
        : [...prev, ingredientId]
    );
  };

  const handleOptionSelect = (sectionId: string, itemId: string, included: boolean) => {
    setSelectedOptions(prev => {
      const currentSection = prev[sectionId] || {};
      const isCurrentlySelected = currentSection[itemId]?.selected;

      if (isCurrentlySelected) {
        const { [itemId]: _, ...restItems } = currentSection;
        return {
          ...prev,
          [sectionId]: restItems
        };
      }

      return {
        ...prev,
        [sectionId]: {
          ...currentSection,
          [itemId]: {
            selected: true,
            included
          }
        }
      };
    });
  };

  const handleAddToCart = () => {
    let totalPrice = item.price;
    const selectedItems: Record<string, any> = {};

    Object.entries(selectedOptions).forEach(([sectionId, items]) => {
      const section = item.sections?.find(s => s.id === sectionId);
      if (section) {
        Object.entries(items).forEach(([itemId, details]: [string, any]) => {
          const sectionItem = section.items.find(i => i.id === itemId);
          if (sectionItem && details.selected) {
            selectedItems[section.name] = {
              choice: sectionItem.name,
              included: sectionItem.included
            };
            if (!sectionItem.included) {
              totalPrice += sectionItem.price;
            }
          }
        });
      }
    });

    const excludedNames = mainProduct?.ingredients
      ? mainProduct.ingredients
          .filter((ing: any) => excludedIngredients.includes(ing.id))
          .map((ing: any) => ing.name)
      : undefined;

    addItem({
      ...item,
      price: totalPrice,
      restaurantId: restaurant?.id || '',
      sections: Object.entries(selectedOptions).map(([sectionId, items]) => {
        const section = item.sections?.find(s => s.id === sectionId);
        const selectedItem = section?.items.find(i => items[i.id]?.selected);
        return {
          name: section?.name || '',
          choice: selectedItem?.name || '',
          included: selectedItem?.included || false
        };
      }),
      remarks: remarks ? remarks.trim() : null,
      excludedIngredients: excludedNames,
      quantity: 1
    });

    onClose();
  };

  const canAddToCart = () => {
    return item.sections?.every(section => {
      if (!section.required) return true;
      const sectionSelections = selectedOptions[section.id] || {};
      return Object.values(sectionSelections).some((item: any) => item.selected);
    }) ?? true;
  };

  const steps = [
    { id: 'ingredients', name: 'Ingrédients', icon: '🥗' },
    ...(item.sections?.map(section => ({
      id: section.id,
      name: section.name,
      icon: section.icon || '🍽️',
      required: section.required
    })) || [])
  ];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div 
        ref={modalRef} 
        className="relative w-full sm:w-[600px] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: modalHeight }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 border-b">
          <div className="p-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Composer votre menu</h2>
            {currentStep === 0 && (
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Steps navigation */}
          <div className="flex px-4 pb-4 overflow-x-auto hide-scrollbar">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`flex-shrink-0 flex-1 min-w-[80px] text-center py-2 ${
                  currentStep === index
                    ? 'border-b-2 text-emerald-500'
                    : 'border-b border-gray-200 text-gray-500'
                }`}
                style={currentStep === index ? {
                  borderColor: themeColor,
                  color: themeColor
                } : undefined}
              >
                {step.id === 'ingredients' ? (
                  <span className="block text-xl mb-1">{step.icon}</span>
                ) : (
                  <div className="mx-auto w-8 h-8 mb-1">
                    {item.sections?.[index - 1]?.image ? (
                      <img
                        src={item.sections[index - 1].image}
                        alt={step.name}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : item.sections?.[index - 1]?.icon ? (
                      <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-xl">{item.sections[index - 1].icon}</span>
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-xl">{step.icon}</span>
                      </div>
                    )}
                  </div>
                )}
                <span className="text-sm whitespace-nowrap">{step.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div 
          ref={contentRef}
          className="overflow-y-auto pb-safe"
          style={{ maxHeight: 'calc(100% - 140px)' }}
        >
          <div className="p-4 space-y-4">
            {/* Ingredients section */}
            {currentStep === 0 && (
              <>
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={mainProduct?.image || item.image}
                    alt={mainProduct?.name || item.name}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                  <div>
                    <h3 className="font-medium">{mainProduct?.name || item.name}</h3>
                    <p className="text-emerald-500">{item.price.toFixed(2)} €</p>
                  </div>
                </div>

                {mainProduct?.ingredients?.length > 0 ? (
                  <>
                    <h4 className="font-medium mb-3">Personnaliser les ingrédients</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {mainProduct.ingredients.map((ingredient: any) => (
                        <button
                          key={`ingredient-${ingredient.id}`}
                          onClick={() => toggleIngredient(ingredient.id)}
                          className={`p-1 rounded-lg text-center transition-colors ${
                            excludedIngredients.includes(ingredient.id)
                              ? 'bg-red-50 text-red-500'
                              : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <span className="text-lg block mb-0.5">{ingredient.icon}</span>
                          <span className="text-xs">{ingredient.name}</span>
                          {excludedIngredients.includes(ingredient.id) && (
                            <span className="text-xs text-red-500 block mt-0.5">Exclu</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    {loading ? 'Chargement des ingrédients...' : 'Aucun ingrédient personnalisable'}
                  </div>
                )}
              </>
            )}

            {/* Combo sections */}
            {currentStep > 0 && item.sections && (
              <div className="space-y-4">
                <h4 className="font-medium mb-3">
                  {item.sections[currentStep - 1].name}
                  {item.sections[currentStep - 1].required && (
                    <span className="text-sm text-red-500 ml-1">(Obligatoire)</span>
                  )}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {item.sections[currentStep - 1].items.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleOptionSelect(item.sections![currentStep - 1].id, option.id, option.included)}
                      className={`flex flex-col rounded-lg border overflow-hidden ${
                        selectedOptions[item.sections![currentStep - 1].id]?.[option.id]?.selected
                          ? 'bg-opacity-10'
                          : 'border-gray-200'
                      }`}
                      style={selectedOptions[item.sections![currentStep - 1].id]?.[option.id]?.selected ? {
                        borderColor: themeColor,
                        backgroundColor: `${themeColor}10`
                      } : undefined}
                    >
                      {option.image && (
                        <img
                          src={option.image}
                          alt={option.name}
                          className="w-full aspect-square object-cover"
                        />
                      )}
                      <div className="p-2 flex flex-col">
                        <span className="font-medium text-xs line-clamp-2">{option.name}</span>
                        {!option.included && (
                          <span className="text-xs mt-1" style={{ color: themeColor }}>+{option.price.toFixed(2)} €</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Remarques */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarques pour le restaurant
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Ex: Sans sauce, bien cuit..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                rows={3}
              />
            </div>

          </div>
     </div>

     {/* Footer */}
     <div className="sticky bottom-0 bg-white border-t p-4 pb-safe">
       {currentStep < steps.length - 1 ? (
         <button
           onClick={() => setCurrentStep(prev => prev + 1)}
           className="w-full text-white py-3 rounded-xl font-medium"
           style={{ backgroundColor: themeColor }}
         >
           Suivant
         </button>
       ) : (
         <button
           onClick={handleAddToCart}
           disabled={!canAddToCart()}
           className="w-full text-white py-3 rounded-xl font-medium disabled:opacity-50"
           style={{ backgroundColor: themeColor }}
         >
           Ajouter au panier
         </button>
       )}
     </div>
   </div>
 </div>
);
}