import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Minus, Trash2, Calendar } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { getRestaurant } from '../services/restaurantService';

export default function Cart() {
  const cartRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { themeColor } = useRestaurantContext();
  const { items, total, isCartOpen, toggleCart, updateQuantity, removeItem, scheduledTime, isFoodCourtOrder } = useCart();
  const [restaurantNames, setRestaurantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadRestaurantNames = async () => {
      try {
        // Get unique restaurant IDs and filter out empty/null values
        const restaurantIds = [...new Set(items.map(item => item.restaurantId).filter(Boolean))];
        if (restaurantIds.length === 0) {
          setRestaurantNames({});
          return;
        }

        // Load all restaurants in parallel
        const results = await Promise.allSettled(
          restaurantIds.map(async (id) => {
            const restaurant = await getRestaurant(id);
            if (!restaurant) {
              throw new Error('Restaurant not found');
            }
            return {
              id: restaurant.id,
              name: restaurant.name
            }; 
          })
        );

        // Build names object from results
        const names = results.reduce((acc, result) => {
          if (result.status === 'fulfilled') {
            acc[result.value.id] = result.value.name;
          }
          return acc;
        }, {} as Record<string, string>);

        setRestaurantNames(names);
      } catch (err) {
        console.error('Error loading restaurant names:', err);
        // Set empty object on error to avoid undefined access
        setRestaurantNames({});
      }
    };

    loadRestaurantNames();
  }, [items]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cartRef.current && !cartRef.current.contains(event.target as Node)) {
        toggleCart();
      }
    }

    if (isCartOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCartOpen, toggleCart]);

  const handleCheckout = () => {
    toggleCart();
    const isRegisterMode = new URLSearchParams(window.location.search).get('mode') === 'register';
    const foodCourtId = localStorage.getItem('foodCourtId'); 
    const restaurantId = items[0]?.restaurantId;
    
    // Pour les commandes food court, on vérifie juste le foodCourtId
    if (foodCourtId) {
      navigate(`/checkout?foodCourtId=${foodCourtId}`);
      return;
    }
    
    // Pour les commandes normales, on vérifie le restaurantId
    // Pour les commandes normales, on vérifie le restaurantId
    if (!restaurantId) {
      console.error('No restaurant ID found');
      return;
    }
    navigate(isRegisterMode 
      ? `/checkout?mode=register&restaurantId=${restaurantId}`
      : `/checkout?restaurantId=${restaurantId}`
    );
  };

  if (!isCartOpen) return null;

  // Group items by restaurant
  const groupedItems = items.reduce((acc, item) => {
    const restaurantId = item.restaurantId;
    const restaurantName = restaurantNames[restaurantId] || 'Restaurant non disponible';
    if (!acc[restaurantId]) {
      acc[restaurantId] = {
        name: restaurantName,
        subtotal: 0,
        items: []
      };
    }
    // Calculate subtotal for each restaurant
    acc[restaurantId].subtotal += item.price * item.quantity;
    acc[restaurantId].items.push(item);
    return acc;
  }, {} as Record<string, { 
    name: string; 
    subtotal: number;
    items: typeof items 
  }>);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div ref={cartRef} className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-lg">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Votre panier</h2>
                {scheduledTime && (
                  <div className="flex items-center gap-2 text-emerald-600 mt-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">
                      {new Date(scheduledTime.date).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })} à {scheduledTime.time}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={toggleCart} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                Votre panier est vide
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedItems).map(([restaurantId, { name, items: restaurantItems, subtotal }]) => (
                  <div key={restaurantId} className="space-y-4">
                    {/* Restaurant header */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-lg">{name}</h3>
                      {isFoodCourtOrder && (
                        <span className="text-sm text-gray-500">
                          Sous-total: {subtotal.toFixed(2)} €
                        </span>
                      )}
                    </div>
                    {/* Restaurant items */}
                    <div className="border-l-2 border-emerald-500 pl-4 space-y-4">
                      {restaurantItems.map((item, index) => (
                        <div 
                          key={`${item.id}-${index}-${JSON.stringify(item.menuOptions)}`}
                          className="flex items-center gap-4 bg-white rounded-lg p-3 shadow-sm"
                        >
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="font-medium">{item.quantity}x {item.name}</span>
                              <span>{(item.price * item.quantity).toFixed(2)} €</span>
                            </div>
                            {/* Affichage des sections de combo */}
                            {item.sections?.map((section, idx) => (
                              <div key={idx} className="text-sm text-gray-500 mt-1">
                                <p>
                                  <span className="font-medium">{section.name} : </span>
                                  {section.choice}
                                  {!section.included && <span className="text-emerald-500 ml-1">(+supplément)</span>}
                                </p>
                              </div>
                            ))}
                            {/* Affichage des options classiques */}
                            {item.menuOptions && !item.sections && (
                              <div className="text-sm text-gray-500 mt-1">
                                {item.menuOptions.side && (
                                  <p className="mt-0.5">Accompagnement : {item.menuOptions.side}</p>
                                )}
                                {item.menuOptions.sauces?.length > 0 && (
                                  <p className="mt-0.5">Sauces : {item.menuOptions.sauces.join(', ')}</p>
                                )}
                              </div>
                            )}
                            {item.excludedIngredients?.length > 0 && (
                              <p className="text-sm text-red-500 mt-1">
                                Sans : {item.excludedIngredients.join(', ')}
                              </p>
                            )}
                            {item.remarks && (
                              <p className="text-sm text-gray-600 italic mt-1 bg-gray-50 p-2 rounded-lg">
                                <span className="font-medium">Remarque client :</span> {item.remarks}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="p-1 rounded-full"
                                style={{ backgroundColor: themeColor, color: 'white' }}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span>{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="p-1 rounded-full"
                                style={{ backgroundColor: themeColor, color: 'white' }}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-2 hover:bg-gray-100 rounded-full"
                          >
                            <Trash2 className="h-5 w-5 text-gray-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Restaurant separator */}
                    {Object.keys(groupedItems).length > 1 && (
                      <div className="border-t border-gray-200" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="p-4 border-t">
              {isFoodCourtOrder && (
                <div className="mb-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Sous-total</span>
                    <span>{(total * 0.8).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Frais de service</span>
                    <span>{(total * 0.05).toFixed(2)} €</span>
                  </div>
                  <div className="pt-2 border-t" />
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium">Total</span>
                <span className="font-semibold" style={{ color: themeColor }}>{total.toFixed(2)} €</span>
              </div>
              <button 
                onClick={handleCheckout}
                className="w-full text-white py-2.5 sm:py-3 rounded-xl font-medium"
                style={{ backgroundColor: themeColor }}
              >
                Passer la commande
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}