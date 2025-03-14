import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { sendOrderNotification } from './notificationService';

async function generateOrderNumber(restaurantId: string, paymentMethod: string): Promise<string> {
  try {
    if (!restaurantId?.trim()) throw new Error('Restaurant ID is required');
    if (!paymentMethod?.trim()) throw new Error('Payment method is required');

    const counterRef = doc(db, 'restaurants', restaurantId, 'settings', 'orderCounters');

    // Use transaction to ensure atomic counter increment
    const newCounter = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      let counter = 1;
      if (counterDoc.exists()) {
        counter = (counterDoc.data()[paymentMethod] || 0) + 1;
        if (counter > 999) counter = 1; // Reset to 1 after 999
      }

      transaction.set(counterRef, {
        [paymentMethod]: counter,
        updatedAt: serverTimestamp()
      }, { merge: true });

      return counter;
    });

    // Format order number
    const prefix = paymentMethod === 'card' ? 'CB' :
      paymentMethod === 'cash' ? 'ESP' :
        paymentMethod === 'apple_pay' ? 'AP' : 'CMD';

    return `${prefix}${newCounter.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating order number:', error);
    throw new Error('Failed to generate order number');
  }
}

export async function createOrder(restaurantId: string, orderData: {
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
    remarks?: string;
    menuOptions?: any;
    sections: { name: string, choice: string, included: boolean }
    excludedIngredients?: string[];
  }>;
  type: 'dine_in' | 'takeaway' | 'delivery';
  subtotal: number;
  total: number;
  paymentMethod: string;
  scheduledTime?: { date: string; time: string } | null;
  delivery?: {
    name: string;
    address: string;
    phone: string;
  };
}) {
  try {
    // Validate restaurant ID
    if (!restaurantId?.trim()) {
      throw new Error('ID du restaurant invalide');
    }

    if (!Array.isArray(orderData?.items) || orderData.items.length === 0) {
      throw new Error('La commande doit contenir au moins un article');
    }

    if (!orderData.paymentMethod?.trim()) {
      throw new Error('Le moyen de paiement est requis');
    }

    // Get restaurant info first
    const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));

    if (!restaurantDoc.exists()) {
      throw new Error('Restaurant invalide ou introuvable');
    }

    const restaurantInfo = {
      name: restaurantDoc.data()?.name || 'Restaurant',
      logo: restaurantDoc.data()?.logo || restaurantDoc.data()?.coverImage || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      id: restaurantId
    };

    // Clean and validate item data
    const cleanedItems = orderData.items.map(item => ({
      id: item.id,
      name: item.name?.trim() || 'Article',
      price: Number(item.price) || 0,
      quantity: Math.max(1, Number(item.quantity) || 1),
      image: item.image || null,
      remarks: typeof item.remarks === 'string' ? item.remarks.trim() || null : null,
      sections: Array.isArray(item.sections) ? item.sections.map(section => ({
        name: String(section.name || ''),
        choice: String(section.choice || ''),
        included: Boolean(section.included)
      })) : null,
      menuOptions: item.menuOptions ? {
        drink: item.menuOptions.drink || null,
        side: item.menuOptions.side || null,
        sauces: Array.isArray(item.menuOptions.sauces) ? item.menuOptions.sauces : []
      } : null,
      excludedIngredients: Array.isArray(item.excludedIngredients) ? item.excludedIngredients : [],
    }));

    // Get table number if present
    const orderTypeData = localStorage.getItem('orderType');
    let orderType = { type: 'takeaway', table: '' };
    let tableNumber = null;

    try {
      if (orderTypeData) {
        orderType = JSON.parse(orderTypeData);
        if (orderType.table) {
          tableNumber = String(orderType.table);
        }
      }
      // Handle register mode
      const isRegisterMode = new URLSearchParams(window.location.search).get('mode') === 'register';
      if (isRegisterMode) {
        orderType.type = 'dine_in';
        orderType.table = 'caisse';
      }
    } catch (e) {
      console.error('Error parsing order type:', e);
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(restaurantId, orderData.paymentMethod);

    // Validate delivery data if needed
    if (orderData.type === 'delivery' && !orderData.delivery?.address) {
      throw new Error('L\'adresse de livraison est requise');
    }

    console.log("cleanedItems", cleanedItems);

    // Prepare order data
    const orderToCreate = {
      restaurantId,
      restaurantInfo,
      items: cleanedItems,
      type: orderType.type,
      ...(orderType.table && { table: orderType.table }),
      status: orderData.scheduledTime ? 'scheduled' : 'pending',
      paymentStatus: 'pending', // Always mark as paid in register mode
      paymentMethod: orderData.paymentMethod,
      subtotal: Math.max(0, Number(orderData.subtotal) || 0),
      total: Math.max(0, Number(orderData.total) || 0),
      orderNumber,
      ...(tableNumber && { table: tableNumber }),
      ...(orderData.scheduledTime && {
        scheduledTime: orderData.scheduledTime
      }),
      ...(orderData.delivery && {
        delivery: {
          name: String(orderData.delivery.name).trim(),
          address: String(orderData.delivery.address).trim(),
          phone: String(orderData.delivery.phone).trim()
        }
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Create order in restaurant's orders collection
    const ordersRef = collection(db, 'restaurants', restaurantDoc.id, 'orders');
    const orderRef = await addDoc(ordersRef, orderToCreate);
    const orderId = orderRef.id;

    // If in register mode, don't save to user's orders
    const isRegisterMode = new URLSearchParams(window.location.search).get('mode') === 'register';
    if (isRegisterMode) {
      // Mark order as paid immediately in register mode
      await updateDoc(orderRef, {
        paymentStatus: 'paid',
        updatedAt: serverTimestamp()
      });
      return orderId;
    }

    // Update restaurant stats in a transaction to avoid race conditions
    await runTransaction(db, async (transaction) => {
      const restaurantRef = doc(db, 'restaurants', restaurantId);
      const restaurantDoc = await transaction.get(restaurantRef);

      if (!restaurantDoc.exists()) {
        throw new Error('Restaurant not found');
      }

      const currentStats = restaurantDoc.data()?.stats || {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        pendingOrders: 0,
        dailyRevenue: {},
        dailyOrders: {},
        paymentMethodBreakdown: {
          card: 0,
          cash: 0,
          apple_pay: 0
        },
        topProducts: []
      };

      const dateKey = new Date().toISOString().split('T')[0];
      const newStats = {
        totalRevenue: (currentStats.totalRevenue || 0) + orderToCreate.total,
        totalOrders: (currentStats.totalOrders || 0) + 1,
        averageOrderValue: ((currentStats.totalRevenue || 0) + orderToCreate.total) / ((currentStats.totalOrders || 0) + 1),
        pendingOrders: (currentStats.pendingOrders || 0) + 1,
        dailyRevenue: {
          ...currentStats.dailyRevenue,
          [dateKey]: ((currentStats.dailyRevenue || {})[dateKey] || 0) + orderToCreate.total
        },
        dailyOrders: {
          ...currentStats.dailyOrders,
          [dateKey]: ((currentStats.dailyOrders || {})[dateKey] || 0) + 1
        },
        paymentMethodBreakdown: {
          ...currentStats.paymentMethodBreakdown,
          [orderToCreate.paymentMethod]: ((currentStats.paymentMethodBreakdown || {})[orderToCreate.paymentMethod] || 0) + orderToCreate.total
        },
        topProducts: currentStats.topProducts || []
      };

      transaction.update(restaurantRef, {
        stats: newStats,
        updatedAt: serverTimestamp()
      });
    });

    // Update restaurant stats
    const restaurantRef = doc(db, 'restaurants', restaurantId);
    const statsDoc = await getDoc(restaurantRef);
    const currentStats = statsDoc.data()?.stats || {
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      pendingOrders: 0,
      dailyRevenue: {},
      dailyOrders: {},
      paymentMethodBreakdown: {
        card: 0,
        cash: 0,
        apple_pay: 0
      },
      topProducts: []
    };

    const dateKey = new Date().toISOString().split('T')[0];

    await updateDoc(restaurantRef, {
      stats: {
        ...currentStats,
        totalRevenue: currentStats.totalRevenue + orderToCreate.total,
        totalOrders: currentStats.totalOrders + 1,
        averageOrderValue: (currentStats.totalRevenue + orderToCreate.total) / (currentStats.totalOrders + 1),
        pendingOrders: currentStats.pendingOrders + 1,
        dailyRevenue: {
          ...currentStats.dailyRevenue,
          [dateKey]: (currentStats.dailyRevenue[dateKey] || 0) + orderToCreate.total
        },
        dailyOrders: {
          ...currentStats.dailyOrders,
          [dateKey]: (currentStats.dailyOrders[dateKey] || 0) + 1
        },
        paymentMethodBreakdown: {
          ...currentStats.paymentMethodBreakdown,
          [orderToCreate.paymentMethod]: (currentStats.paymentMethodBreakdown[orderToCreate.paymentMethod] || 0) + orderToCreate.total
        }
      }
    });
    // If user is authenticated, save to their orders collection
    const currentUser = auth.currentUser;
    if (currentUser) {
      const userOrderRef = doc(db, 'users', currentUser.uid, 'orders', orderId);
      await setDoc(userOrderRef, {
        ...orderToCreate,
        id: orderId
      });
    }

    return orderId;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error instanceof Error
      ? error
      : new Error('Une erreur est survenue lors de la création de la commande');
  }
}

export async function createFoodCourtOrder(foodCourtId: string, orderData: {
  restaurantOrders: Array<{
    restaurantId: string;
    items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      image?: string;
      remarks?: string;
      menuOptions?: any;
      sections: { name: string, choice: string, included: boolean }
      excludedIngredients?: string[];
    }>;
    type: 'dine_in' | 'takeaway' | 'delivery';
    subtotal: number;
    total: number;
    paymentMethod: string;
    scheduledTime?: { date: string; time: string } | null;
    delivery?: {
      name: string;
      address: string;
      phone: string;
    };
  }>;
  type: 'dine_in' | 'takeaway' | 'delivery';
  subtotal: number;
  total: number;
  paymentMethod: string;
  scheduledTime?: { date: string; time: string } | null;
  delivery?: {
    name: string;
    address: string;
    phone: string;
  };
}) {
  if (!foodCourtId) {
    throw new Error('ID du food court invalide');
  }

  if (!Array.isArray(orderData.restaurantOrders) || orderData.restaurantOrders.length === 0) {
    throw new Error('La commande doit contenir au moins une commande de restaurant');
  }

  if (!orderData.paymentMethod?.trim()) {
    throw new Error('Le moyen de paiement est requis');
  }

  // Get food court info first
  const foodCourtDoc = await getDoc(doc(db, 'foodCourts', foodCourtId));

  if (!foodCourtDoc.exists()) {
    throw new Error('Food court invalide ou introuvable');
  }

  // Save each restaurant order
  const restaurantOrderIds = await Promise.all(orderData.restaurantOrders.map(async (restaurantOrder) => {
    return createOrder(restaurantOrder.restaurantId, {
      ...restaurantOrder,
      type: orderData.type,
      subtotal: orderData.subtotal,
      total: orderData.total,
      paymentMethod: orderData.paymentMethod,
      scheduledTime: orderData.scheduledTime,
      delivery: orderData.delivery
    });
  }));

  return restaurantOrderIds;
};

/* try {
  // Validate restaurant ID
  if (!restaurantId?.trim()) {
    throw new Error('ID du restaurant invalide');
  }

  if (!Array.isArray(orderData?.items) || orderData.items.length === 0) {
    throw new Error('La commande doit contenir au moins un article');
  }

  if (!orderData.paymentMethod?.trim()) {
    throw new Error('Le moyen de paiement est requis');
  }

  // Get restaurant info first
  const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));

  if (!restaurantDoc.exists()) {
    throw new Error('Restaurant invalide ou introuvable');
  }

  const restaurantInfo = {
    name: restaurantDoc.data()?.name || 'Restaurant',
    logo: restaurantDoc.data()?.logo || restaurantDoc.data()?.coverImage || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
    id: restaurantId
  };

  // Clean and validate item data
  const cleanedItems = orderData.items.map(item => ({
    id: item.id,
    name: item.name?.trim() || 'Article',
    price: Number(item.price) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
    image: item.image || null,
    remarks: typeof item.remarks === 'string' ? item.remarks.trim() || null : null,
    sections: Array.isArray(item.sections) ? item.sections.map(section => ({
      name: String(section.name || ''),
      choice: String(section.choice || ''),
      included: Boolean(section.included)
    })) : null,
    menuOptions: item.menuOptions ? {
      drink: item.menuOptions.drink || null,
      side: item.menuOptions.side || null,
      sauces: Array.isArray(item.menuOptions.sauces) ? item.menuOptions.sauces : []
    } : null,
    excludedIngredients: Array.isArray(item.excludedIngredients) ? item.excludedIngredients : [],
  }));

  // Get table number if present
  const orderTypeData = localStorage.getItem('orderType');
  let orderType = { type: 'takeaway' };
  let tableNumber = null;

  try {
    if (orderTypeData) {
      orderType = JSON.parse(orderTypeData);
      if (orderType.table) {
        tableNumber = String(orderType.table);
      }
    }
    // Handle register mode
    const isRegisterMode = new URLSearchParams(window.location.search).get('mode') === 'register';
    if (isRegisterMode) {
      orderType.type = 'dine_in';
      orderType.table = 'caisse';
    }
  } catch (e) {
    console.error('Error parsing order type:', e);
  }

  // Generate order number
  const orderNumber = await generateOrderNumber(restaurantId, orderData.paymentMethod);

  // Validate delivery data if needed
  if (orderData.type === 'delivery' && !orderData.delivery?.address) {
    throw new Error('L\'adresse de livraison est requise');
  }

  console.log("cleanedItems", cleanedItems);

  // Prepare order data
  const orderToCreate = {
    restaurantId,
    restaurantInfo,
    items: cleanedItems,
    type: orderType.type,
    status: 'pending',
    paymentStatus: 'pending', // Always mark as paid in register mode
    paymentMethod: orderData.paymentMethod,
    subtotal: Math.max(0, Number(orderData.subtotal) || 0),
    total: Math.max(0, Number(orderData.total) || 0),
    orderNumber,
    ...(tableNumber && { table: tableNumber }),
    ...(orderData.scheduledTime && {
      scheduledTime: orderData.scheduledTime
    }),
    ...(orderData.delivery && {
      delivery: {
        name: String(orderData.delivery.name).trim(),
        address: String(orderData.delivery.address).trim(),
        phone: String(orderData.delivery.phone).trim()
      }
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  // Create order in restaurant's orders collection
  const ordersRef = collection(db, 'restaurants', restaurantDoc.id, 'orders');
  const orderRef = await addDoc(ordersRef, orderToCreate);
  const orderId = orderRef.id;

  // If in register mode, don't save to user's orders
  const isRegisterMode = new URLSearchParams(window.location.search).get('mode') === 'register';
  if (isRegisterMode) {
    // Mark order as paid immediately in register mode
    await updateDoc(orderRef, {
      paymentStatus: 'paid',
      updatedAt: serverTimestamp()
    });
    return orderId;
  }

  // Update restaurant stats in a transaction to avoid race conditions
  await runTransaction(db, async (transaction) => {
    const restaurantRef = doc(db, 'restaurants', restaurantId);
    const restaurantDoc = await transaction.get(restaurantRef);

    if (!restaurantDoc.exists()) {
      throw new Error('Restaurant not found');
    }

    const currentStats = restaurantDoc.data()?.stats || {
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      pendingOrders: 0,
      dailyRevenue: {},
      dailyOrders: {},
      paymentMethodBreakdown: {
        card: 0,
        cash: 0,
        apple_pay: 0
      },
      topProducts: []
    };

    const dateKey = new Date().toISOString().split('T')[0];
    const newStats = {
      totalRevenue: (currentStats.totalRevenue || 0) + orderToCreate.total,
      totalOrders: (currentStats.totalOrders || 0) + 1,
      averageOrderValue: ((currentStats.totalRevenue || 0) + orderToCreate.total) / ((currentStats.totalOrders || 0) + 1),
      pendingOrders: (currentStats.pendingOrders || 0) + 1,
      dailyRevenue: {
        ...currentStats.dailyRevenue,
        [dateKey]: ((currentStats.dailyRevenue || {})[dateKey] || 0) + orderToCreate.total
      },
      dailyOrders: {
        ...currentStats.dailyOrders,
        [dateKey]: ((currentStats.dailyOrders || {})[dateKey] || 0) + 1
      },
      paymentMethodBreakdown: {
        ...currentStats.paymentMethodBreakdown,
        [orderToCreate.paymentMethod]: ((currentStats.paymentMethodBreakdown || {})[orderToCreate.paymentMethod] || 0) + orderToCreate.total
      },
      topProducts: currentStats.topProducts || []
    };

    transaction.update(restaurantRef, {
      stats: newStats,
      updatedAt: serverTimestamp()
    });
  });

  // Update restaurant stats
  const restaurantRef = doc(db, 'restaurants', restaurantId);
  const statsDoc = await getDoc(restaurantRef);
  const currentStats = statsDoc.data()?.stats || {
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    pendingOrders: 0,
    dailyRevenue: {},
    dailyOrders: {},
    paymentMethodBreakdown: {
      card: 0,
      cash: 0,
      apple_pay: 0
    },
    topProducts: []
  };

  const dateKey = new Date().toISOString().split('T')[0];

  await updateDoc(restaurantRef, {
    stats: {
      ...currentStats,
      totalRevenue: currentStats.totalRevenue + orderToCreate.total,
      totalOrders: currentStats.totalOrders + 1,
      averageOrderValue: (currentStats.totalRevenue + orderToCreate.total) / (currentStats.totalOrders + 1),
      pendingOrders: currentStats.pendingOrders + 1,
      dailyRevenue: {
        ...currentStats.dailyRevenue,
        [dateKey]: (currentStats.dailyRevenue[dateKey] || 0) + orderToCreate.total
      },
      dailyOrders: {
        ...currentStats.dailyOrders,
        [dateKey]: (currentStats.dailyOrders[dateKey] || 0) + 1
      },
      paymentMethodBreakdown: {
        ...currentStats.paymentMethodBreakdown,
        [orderToCreate.paymentMethod]: (currentStats.paymentMethodBreakdown[orderToCreate.paymentMethod] || 0) + orderToCreate.total
      }
    }
  });
  // If user is authenticated, save to their orders collection
  const currentUser = auth.currentUser;
  if (currentUser) {
    const userOrderRef = doc(db, 'users', currentUser.uid, 'orders', orderId);
    await setDoc(userOrderRef, {
      ...orderToCreate,
      id: orderId
    });
  }

  return orderId;
} catch (error) {
  console.error('Error creating order:', error);
  throw error instanceof Error
    ? error
    : new Error('Une erreur est survenue lors de la création de la commande');
}
}
*/
export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  try {
    if (!orderId) throw new Error('Order ID is required');

    // Find the restaurant that has this order
    const restaurantsRef = collection(db, 'restaurants');
    const restaurantsSnapshot = await getDocs(restaurantsRef);

    let orderRef;
    let orderData;

    for (const restaurantDoc of restaurantsSnapshot.docs) {
      const tempOrderRef = doc(db, 'restaurants', restaurantDoc.id, 'orders', orderId);
      const orderDoc = await getDoc(tempOrderRef);

      if (orderDoc.exists()) {
        orderRef = tempOrderRef;
        orderData = orderDoc.data();
        break;
      }
    }

    if (!orderRef || !orderData) {
      throw new Error('Order not found in any restaurant');
    }

    // Update order status
    await updateDoc(orderRef, {
      status,
      updatedAt: serverTimestamp()
    });

    // Send notification to user
    const currentUser = auth.currentUser;
    if (currentUser) {
      await sendOrderNotification(currentUser.uid, orderId, status);
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
}