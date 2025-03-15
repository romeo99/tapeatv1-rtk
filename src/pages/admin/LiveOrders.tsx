import { Bike, Calculator, Calendar, CheckCircle, Clock, CreditCard, Package, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSound } from 'use-sound';
import AdminLayout from '../../components/admin/AdminLayout';
import OrderSearchKeypad from '../../components/admin/OrderSearchKeypad';
import Receipt from '../../components/Receipt';
import { AdminLayoutContext } from '../../context/AdminLayoutContext';
import { notificationSoundUrl, useNotification } from '../../context/NotificationContext';
import { useOrderContext } from '../../context/OrderContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import useOrderNotification from '../../hooks/useOrderNotification';
import { deductInventoryFromOrder } from '../../services/inventoryService';
import { getButtonPosition, saveButtonPosition } from '../../services/uiPreferencesService';
import { Order } from '../../types/firebase';

const TABS = [
  { id: 'scheduled', name: 'Programmées', icon: Calendar, color: 'bg-blue-100 text-blue-800' },
  { id: 'pending', name: 'En attente', icon: Clock, color: 'bg-red-100 text-red-800' },
  { id: 'preparing', name: 'En préparation', icon: Package, color: 'bg-orange-100 text-orange-800' },
  { id: 'ready', name: 'Prêtes', icon: CheckCircle, color: 'bg-green-100 text-green-800' }
];

const getStatusBadgeColor = (status: string, isActive: boolean) => {
  if (isActive) return 'bg-white text-emerald-600';

  switch (status) {
    case 'scheduled':
      return 'bg-blue-500 text-white';
    case 'pending':
      return 'bg-red-500 text-white';
    case 'preparing':
      return 'bg-orange-500 text-white';
    case 'ready':
      return 'bg-green-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

const orderTypeIcons = {
  dine_in: { icon: UtensilsCrossed, label: 'Sur place' },
  takeaway: { icon: ShoppingBag, label: 'À emporter' },
  delivery: { icon: Bike, label: 'Livraison' }
};

export default function LiveOrders() {
  const { playNotificationSound } = useNotification();
  const { orders, updateOrderStatus } = useOrderContext();
  const { restaurant } = useRestaurantContext();
  const { isRegisterMode } = useContext(AdminLayoutContext);
  const [buttonPosition, setButtonPosition] = useState({ x: -1, y: -1 });
  const [containerWidth, setContainerWidth] = useState(window.innerWidth * (isRegisterMode ? 0.666 : 1));
  const [isDragging, setIsDragging] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isMoving, setIsMoving] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout>();
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const lastPosition = useRef({ x: 0, y: 0 });
  const animationFrame = useRef<number>();
  const [activeTab, setActiveTab] = useState('pending');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [play] = useSound(notificationSoundUrl, {
    volume: 1.0,
    interrupt: true // Allow interrupting previous sound
  });
  const [newOrders, setNewOrders] = useState<string[]>([]);
  const previousOrdersRef = useRef<string[]>([]);

  const { contentRef, orderToPrint, setOrderToPrint, handlePrint } = useOrderNotification();

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      // La notification sera envoyée automatiquement via le OrderContext
    } catch (err) {
      console.error('Failed to update order status:', err);
    }
  };

  // Check for new orders
  useEffect(() => {
    const currentOrderIds = orders.filter(o => o.status === 'pending').map(o => o.id);
    const previousOrderIds = previousOrdersRef.current;

    // Find new orders that weren't in the previous list
    const newOrderIds = currentOrderIds.filter(id => !previousOrderIds.includes(id));

    if (newOrderIds.length > 0) {
      const notifications: { [key: string]: boolean } = JSON.parse(localStorage.getItem('orderNotifications') || '{}');

      newOrderIds.forEach(id => {
        if (!notifications[id]) {
          playNotificationSound();
          notifications[id] = true;
        }
      });

      // Clean up notifications for orders that are no longer pending
      const updatedNotifications: { [key: string]: boolean } = Object.keys(notifications)
        .filter(id => currentOrderIds.includes(id))
        .reduce((obj: { [key: string]: boolean }, key: string) => {
          obj[key] = notifications[key];
          return obj;
        }, {});

      localStorage.setItem('orderNotifications', JSON.stringify(updatedNotifications));

      /* try {
        // Play notification sound
        const audio = new Audio(notificationSound);
        audio.volume = 1.0;
        const playPromise = audio.play();

        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Error playing notification:', error);
          });
        }
      } catch (error) {
        console.error('Error playing notification sound:', error);
      } */

      // Add to animated orders list
      setNewOrders(prev => [...prev, ...newOrderIds]);

      // Remove from animation list after 5 seconds
      setTimeout(() => {
        setNewOrders(prev => prev.filter(id => !newOrderIds.includes(id)));
      }, 5000);
    }

    // Update previous orders reference
    previousOrdersRef.current = currentOrderIds;
  }, [orders, play]);

  // Load saved position
  useEffect(() => {
    async function loadPosition() {
      if (!restaurant?.id || isInitialized) return;

      try {
        const savedPosition = await getButtonPosition(restaurant.id);
        const width = isRegisterMode ? window.innerWidth * 0.666 : window.innerWidth;

        const position = savedPosition ? {
          x: Math.min(Math.max(0, savedPosition.x), width - 56),
          y: Math.min(Math.max(0, savedPosition.y), window.innerHeight - 56)
        } : {
          x: width - 100,
          y: window.innerHeight - 200
        };

        setButtonPosition(position);
        lastPosition.current = position;
        setIsInitialized(true);
      } catch (error) {
        console.error('Error loading button position:', error);
        // Set default position on error
        const width = isRegisterMode ? window.innerWidth * 0.666 : window.innerWidth;
        const defaultPosition = {
          x: width - 100,
          y: window.innerHeight - 200
        };
        setButtonPosition(defaultPosition);
        lastPosition.current = defaultPosition;
        setIsInitialized(true);
      }
    }
    loadPosition();
  }, [restaurant?.id, isRegisterMode, isInitialized]);

  // Debounced save position
  const savePosition = useCallback(async (position: { x: number; y: number }) => {
    try {
      if (!restaurant?.id) return;
      if (!isInitialized) return;

      // Validate position before saving
      const width = isRegisterMode ? window.innerWidth * 0.666 : window.innerWidth;
      const validPosition = {
        x: Math.min(Math.max(0, position.x), width - 56),
        y: Math.min(Math.max(0, position.y), window.innerHeight - 56)
      };

      await saveButtonPosition(restaurant.id, validPosition);
    } catch (error) {
      console.error('Error saving button position:', error);
    }
  }, [restaurant?.id, isRegisterMode, isInitialized]);

  // Update container width when register mode changes
  useEffect(() => {
    const width = window.innerWidth - (isRegisterMode ? window.innerWidth * 0.333 : 0);
    setContainerWidth(width);

    // Adjust button position with animation when mode changes
    if (buttonPosition.x > width - 56) {
      const newX = Math.min(buttonPosition.x, width - 56);
      smoothMove(newX, buttonPosition.y);
    }
  }, [isRegisterMode]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  const smoothMove = (targetX: number, targetY: number) => {
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }

    const animate = () => {
      const currentX = lastPosition.current.x;
      const currentY = lastPosition.current.y;

      const dx = targetX - currentX;
      const dy = targetY - currentY;

      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        lastPosition.current = { x: targetX, y: targetY };
        setButtonPosition({ x: targetX, y: targetY });
        setIsMoving(false);
        return;
      }

      lastPosition.current = {
        x: currentX + dx * 0.3,
        y: currentY + dy * 0.3
      };

      setButtonPosition(lastPosition.current);
      animationFrame.current = requestAnimationFrame(animate);
    };

    lastPosition.current = buttonPosition;
    setIsMoving(true);
    animationFrame.current = requestAnimationFrame(animate);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffsetRef.current = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    }

    longPressTimer.current = setTimeout(() => {
      setIsLongPress(true);
      setIsDragging(true);
    }, 500); // 500ms long press
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) {
      if (touchStartPos.current) {
        const touch = e.touches[0];
        const moveX = Math.abs(touch.clientX - touchStartPos.current.x);
        const moveY = Math.abs(touch.clientY - touchStartPos.current.y);
        if (moveX > 10 || moveY > 10) {
          clearTimeout(longPressTimer.current);
          setIsDragging(true);
        }
      }
      return;
    }

    e.preventDefault(); // Prevent scrolling while dragging
    const touch = e.touches[0];
    const containerOffset = isRegisterMode ? window.innerWidth * 0.333 : 0;
    const adjustedX = touch.clientX - containerOffset;
    const x = Math.max(0, Math.min(adjustedX - dragOffsetRef.current.x, containerWidth - 56));
    const y = Math.max(0, Math.min(touch.clientY - dragOffsetRef.current.y, window.innerHeight - 56));
    smoothMove(x, y);
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
    touchStartPos.current = null;
    setIsLongPress(false);
    setIsDragging(false);
    setIsMoving(false);
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    // Save final position
    savePosition(lastPosition.current);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      setIsDragging(true);

      // Create a transparent drag image
      const dragImg = document.createElement('div');
      dragImg.style.opacity = '0';
      document.body.appendChild(dragImg);
      e.dataTransfer.setDragImage(dragImg, 0, 0);
      setTimeout(() => document.body.removeChild(dragImg), 0);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX === 0 && e.clientY === 0) return; // Ignore invalid positions

    const adjustedX = e.clientX - (isRegisterMode ? window.innerWidth * 0.333 : 0);
    const x = Math.max(0, Math.min(adjustedX - dragOffsetRef.current.x, containerWidth - 56));
    const y = Math.max(0, Math.min(e.clientY - dragOffsetRef.current.y, window.innerHeight - 56));

    smoothMove(x, y);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsMoving(false);
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    // Save final position
    savePosition(lastPosition.current);
  };

  // Listen for messages from parent window in register mode
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SEARCH_ORDER') {
        handleOrderSearch(event.data.orderNumber);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Filtrer uniquement les commandes actives
  const activeOrders = orders.filter(order =>
    ['scheduled', 'pending', 'preparing', 'ready'].includes(order.status)
  );

  // Compter les commandes par statut
  const orderCounts = activeOrders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredOrders = activeOrders.filter(order => order.status === activeTab);

  const handlePayAndPrepare = async (orderId: string) => {
    try {
      // Use the updateOrderStatus function from context
      await updateOrderStatus(orderId, 'preparing');

    } catch (err) {
      console.error('Error updating order:', err);
      alert('Une erreur est survenue lors de la mise à jour de la commande');
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    try {
      if (!restaurant?.id) {
        throw new Error('Restaurant ID is required');
      }

      const order = orders.find(o => o.id === orderId);
      if (!order?.restaurantId) {
        console.error('No restaurant ID found for order');
        return;
      }

      // First update order status
      await updateOrderStatus(orderId, 'completed');

      // Then deduct from inventory
      console.log('Deducting inventory for order:', order.items);
      await deductInventoryFromOrder(order.restaurantId, order.items);

    } catch (err) {
      console.error('Error completing order:', err);
      alert('Une erreur est survenue lors de la finalisation de la commande');
    }
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  const handleOrderSearch = (orderNumber: string) => {
    const order = activeOrders.find(o => {
      if (!o.orderNumber) return false;
      const searchNumber = orderNumber.toLowerCase();
      const orderNum = o.orderNumber.toLowerCase();
      return orderNum.includes(searchNumber);
    });

    if (order) {
      setActiveTab(order.status);
      setExpandedOrder(order.id);

      setTimeout(() => {
        const orderElement = document.getElementById(`order-${order.id}`);
        const container = document.querySelector('.p-4.space-y-4.overflow-auto');

        if (orderElement && container) {
          // Ensure the order header is visible
          const headerOffset = 200; // Height of header + tabs
          const elementPosition = orderElement.offsetTop - headerOffset;

          const containerRect = container.getBoundingClientRect();
          const elementRect = orderElement.getBoundingClientRect();

          // Scroll to the element
          container.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
          });

          // Add pulse animation class only to found order
          orderElement.classList.add('animate-pulse-emerald');

          // Remove animation class after completion
          setTimeout(() => {
            orderElement.classList.remove('animate-pulse-emerald');
          }, 2000);
        }
      }, 100);
    } else {
      alert('Aucune commande trouvée avec ce numéro');
    }
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();

      // Filtrer les commandes planifiées dont la mise à jour est nécessaire
      const ordersToUpdate = activeOrders.filter((order) => {
        if (order.status !== 'scheduled' || !order.scheduledTime) return false;

        const { date, time } = order.scheduledTime;
        const scheduledDateTime = new Date(`${date}T${time}`);
        const timeDifference = (scheduledDateTime.getTime() - now.getTime()) / (1000 * 60); // Diff en minutes

        return timeDifference <= 15 && timeDifference > 0; // Vérifie si dans la fenêtre de 15 min
      });

      if (ordersToUpdate.length > 0) {
        try {
          await Promise.all(
            ordersToUpdate.map(async (order) => {
              await updateOrderStatus(order.id, 'pending');
              console.log(`Commande ${order.id} mise à jour en "pending".`);
            })
          );
        } catch (err) {
          console.error('Erreur lors de la mise à jour des commandes:', err);
        }
      }
    }, 60000); // Exécuter toutes les minutes

    return () => clearInterval(interval);
  }, [activeOrders]);

  const printOrder = (order: Order) => {
    setOrderToPrint(order);
    setTimeout(() => {
      handlePrint(); // Lancer l'impression
      setOrderToPrint(null);
    }, 2000);
  }

  return (
    <AdminLayout>
      <div className="bg-white shadow">
        <div className="px-4 py-4 border-b">
          <h1 className="text-xl font-bold text-gray-900">Commandes en direct</h1>
          <p className="mt-1 text-sm text-gray-500">
            {activeOrders.length} commande{activeOrders.length > 1 ? 's' : ''} en cours
          </p>
        </div>

        {/* Grille de boutons pour les statuts */}
        <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50">
          {TABS.map((tab) => {
            const count = orderCounts[tab.id] || 0;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center justify-between p-4 rounded-xl transition-colors border-2 border-emerald-500 ${activeTab === tab.id
                  ? 'bg-emerald-500 text-white shadow-lg transform scale-[1.02]'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <Icon className="h-5 w-5" />
                  <span className="font-medium text-[15px]">{tab.name}</span>
                </div>
                {count > 0 && (
                  <span className={`min-w-[32px] h-8 px-2.5 flex items-center justify-center rounded-full text-sm font-bold ${getStatusBadgeColor(tab.id, activeTab === tab.id)
                    }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-auto" style={{ height: 'calc(100vh - 200px)' }}>
        {filteredOrders.map((order) => (
          <div
            key={order.id}
            id={`order-${order.id}`}
            className={`bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-300 ${newOrders.includes(order.id) ? 'animate-pulse-emerald' : ''
              }`}
          >
            <div className="p-4 cursor-pointer" onClick={() => toggleOrderExpansion(order.id)}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                    {(() => {
                      const TypeIcon = orderTypeIcons[order.type as keyof typeof orderTypeIcons]?.icon;
                      return TypeIcon ? <TypeIcon className="h-5 w-5 text-emerald-600" /> : null;
                    })()}
                  </div>
                  <div>
                    <div className="flex items-start gap-2">
                      <span className="text-lg font-semibold">#{order.orderNumber}</span>
                      {order.items.some(item => item.remarks) && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          Remarques client
                        </span>
                      )}
                      {order.type === 'dine_in' && order.table ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                          {order.table === 'caisse' ? 'Caisse' : `Table ${order.table}`}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        {orderTypeIcons[order.type as keyof typeof orderTypeIcons]?.label}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end min-w-[120px] text-right">
                  <span className="text-lg font-semibold text-emerald-600 mb-1">{order.total.toFixed(2)} €</span>
                  <span className="text-sm text-gray-500">
                    {order.status === 'scheduled' ? order.scheduledTime!.date + ' à ' + order.scheduledTime!.time :
                      new Date(order.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                  </span>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    {order.paymentMethod === 'cash' && order.paymentStatus === 'pending' && order.status === 'pending' && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                        À encaisser
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-1" onClick={() => { printOrder(order) }
                  }>
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-white-800">
                      Imprimer le ticket
                    </span>
                  </div>
                </div>
              </div>

              {expandedOrder === order.id && (
                <div className="mt-4 border-t pt-4">
                  {/* Liste des articles */}
                  <div className="space-y-3">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between">
                            <span className="font-medium">{item.quantity}x {item.name}</span>
                            <span>{(item.price * item.quantity).toFixed(2)} €</span>
                          </div>
                          {/* Affichage des sections de combo */}
                          {item.sections?.map((section, idx) => (
                            <div key={idx} className="text-sm text-gray-500 mt-1">
                              <span className="font-medium">{section.name} : </span>
                              {section.choice}
                              {!section.included && (
                                <span className="text-emerald-500 ml-1">(+supplément)</span>
                              )}
                            </div>
                          ))}

                          {/* Affichage des options classiques */}
                          {item.menuOptions && !item.sections && (
                            <div className="text-sm text-gray-500">
                              {item.menuOptions.drink && (
                                <p>Boisson : {item.menuOptions.drink}</p>
                              )}
                              {item.menuOptions.side && (
                                <p>Accompagnement : {item.menuOptions.side}</p>
                              )}
                              {item.menuOptions.sauces?.length! > 0 && (
                                <p>Sauces : {item.menuOptions.sauces!.join(', ')}</p>
                              )}
                            </div>
                          )}

                          {item.excludedIngredients!.length > 0 && (
                            <div className="text-sm text-red-500 mt-1">
                              Sans : {item.excludedIngredients?.join(', ')}
                            </div>
                          )}

                          {item.remarks && (
                            <p className="text-sm text-gray-600 italic mt-1 bg-gray-50 p-2 rounded-lg">
                              <span className="font-medium">Remarque client :</span> {item.remarks}
                            </p>
                          )}
                          {/* Affichage des sections de combo 
                          {item.sections?.map((section, idx) => (
                            <div key={idx} className="text-sm text-gray-500 mt-1">
                              <span className="font-medium">{section.name} : </span>
                              {section.choice}
                              {!section.included && (
                                <span className="text-emerald-500 ml-1">(+supplément)</span>
                              )}
                            </div>
                          ))}

                          {/* Affichage des options classiques 
                          {item.menuOptions && !item.sections && (
                            <div className="text-sm text-gray-500">
                              {item.menuOptions.drink && (
                                <p>Boisson : {item.menuOptions.drink}</p>
                              )}
                              {item.menuOptions.side && (
                                <p>Accompagnement : {item.menuOptions.side}</p>
                              )}
                              {item.menuOptions.sauces?.length > 0 && (
                                <p>Sauces : {item.menuOptions.sauces.join(', ')}</p>
                              )}
                            </div>
                          )}

                          {item.excludedIngredients!.length > 0 && (
                            <div className="text-sm text-red-500 mt-1">
                              Sans : {item.excludedIngredients?.join(', ')}
                            </div>
                          )}

                          {item.remarks && (
                            <p className="text-sm text-gray-600 italic mt-1 bg-gray-50 p-2 rounded-lg">
                              <span className="font-medium">Remarque client :</span> {item.remarks}
                            </p>
                          )}*/}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    {order.status === 'pending' && (
                      <>
                        {order.paymentMethod === 'cash' && order.paymentStatus === 'pending' ? (
                          <button
                            onClick={() => handlePayAndPrepare(order.id)}
                            className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <CreditCard className="h-4 w-4" />
                            Encaisser & Préparer
                          </button>
                        ) : (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                            className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium"
                          >
                            Commencer la préparation
                          </button>
                        )}
                        <button
                          onClick={() => updateOrderStatus(order.id, 'cancelled')}
                          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium"
                        >
                          Refuser
                        </button>
                      </>
                    )}

                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium"
                      >
                        Marquer comme prête
                      </button>
                    )}

                    {order.status === 'ready' && (
                      <button
                        onClick={() => handleCompleteOrder(order.id)}
                        className="w-full bg-gray-500 text-white py-2 rounded-lg text-sm font-medium"
                      >
                        Terminer la commande
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              Aucune commande {activeTab === 'scheduled' ? 'programmée' :
                activeTab === 'pending' ? 'en attente' :
                  activeTab === 'preparing' ? 'en préparation' : 'prête'}
            </p>
          </div>
        )}
      </div>

      {orderToPrint && (
        <Receipt
          ref={contentRef}
          order={orderToPrint}
        />
      )}

      {/* Keypad Modal */}
      {showKeypad && (
        <OrderSearchKeypad
          onClose={() => setShowKeypad(false)}
          onSearch={handleOrderSearch}
        />
      )}

      {/* Floating Keypad Button */}
      <button
        ref={buttonRef}
        className={`w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all fixed z-40 ${(isDragging || isLongPress) ? 'scale-110 cursor-move' : 'cursor-pointer'
          }`}
        onClick={() => !isDragging && setShowKeypad(true)}
        draggable="true"
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          left: `${buttonPosition.x}px`,
          top: `${buttonPosition.y}px`,
          transform: isMoving ? 'scale(1.1)' : 'none',
          touchAction: 'none',
          userSelect: 'none',
          transition: isMoving ? 'none' : 'transform 0.2s ease-out',
          right: isRegisterMode ? `calc(33.333333% + ${buttonPosition.x}px)` : `${buttonPosition.x}px`,
          pointerEvents: 'auto',
          willChange: 'transform'
        }}
      >
        <Calculator className="h-6 w-6 text-white" />
      </button>

      {/* Menu client en mode caisse */}
      {isRegisterMode && restaurant?.id && (
        <div className="fixed right-0 top-20 bottom-0 w-1/3 bg-white border-l border-gray-200 overflow-hidden">
          <div className="w-full h-full">
            <div className="w-full h-full flex flex-col">
              <div className="flex-1 overflow-hidden">
                <iframe
                  id="orders-iframe"
                  src={`${window.location.origin}/restaurant?restaurantId=${restaurant.id}&mode=register`}
                  className="w-full h-full border-none"
                  title="Menu client"
                  style={{ height: '100%' }}
                  sandbox="allow-same-origin allow-scripts allow-forms"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}