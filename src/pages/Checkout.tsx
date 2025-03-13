import { loadStripe } from '@stripe/stripe-js';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import UpsellModal from '../components/UpsellModal';
import { db } from '../config/firebase';
//import { useAuth } from '../context/AuthContext';
import OrderSummary from '../components/OrderSummary';
import { useCart } from '../context/CartContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { createFoodCourtOrder, createOrder } from '../services/orderService';
import { Restaurant } from '../types/firebase';
import { getSuggestionGroups } from '../utils/suggestionEngine';

// Initialize Stripe
const stripePromise = loadStripe('pk_test_51PH7PV1LCdahk0ySP7Kcm127sOdgOuOKSBNxVuIegQhWgi0AvXL4NupqnQY0wDQPEo38AJi3wV9mrFdAzSLvFGXG00PttU7DHT');

export default function Checkout() {
  const navigate = useNavigate();
  const { items, applicationFee, serviceFees, subtotal, total, clearCart, scheduledTime, isFoodCourtOrder, foodCourtId } = useCart();
  //const { user } = useAuth();
  const { themeColor } = useRestaurantContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const [selectedMethod, setSelectedMethod] = useState<string>('card');
  const [showUpsell, setShowUpsell] = useState(true);
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurantId');
  const [restaurantData, setRestaurantData] = useState<Restaurant | null>(null);

  // Redirect if no restaurant ID
  useEffect(() => {
    if (!restaurantId) {
      navigate('/');
      return;
    }
    //Recuperation du restaurant depuis firebase
    const restaurantRef = doc(db, 'restaurants', restaurantId);
    const unsubscribe = onSnapshot(restaurantRef, (doc) => {
      if (doc.exists()) {
        setRestaurantData(doc.data() as Restaurant);
      } else {
        navigate('/');
      }
    }
    );
    return () => unsubscribe();
  }, [restaurantId, navigate]);

  // Filter available payment methods
  const availablePaymentMethods = {
    card: { icon: '💳', label: 'Carte' },
    cash: { icon: '💵', label: 'Espèces' },
    apple_pay: { icon: 'apple-pay', label: 'Apple Pay' }
  };

  const allowedMethods = restaurantData?.paymentMethods || ['card', 'cash', 'apple_pay'];

  // Set first allowed payment method as default
  useEffect(() => {
    if (allowedMethods.length > 0 && !allowedMethods.includes(selectedMethod)) {
      setSelectedMethod(allowedMethods[0]);
    }
    if (!restaurantData?.stripeAccountId) {

      setSelectedMethod('cash');
    }
  }, [allowedMethods, selectedMethod, restaurantData?.id]);

  /* if (!user) {
    window.location.href = '/signin?redirect=checkout';
  } */

  // Memoize restaurant items grouping to prevent unnecessary recalculations
  const restaurantItems = useMemo(() => {
    return items.reduce((acc, item) => {
      if (!acc[item.restaurantId]) {
        acc[item.restaurantId] = {
          items: [],
          amount: 0,
        };
      }
      acc[item.restaurantId].items.push(item);
      acc[item.restaurantId].amount += item.price * item.quantity;
      return acc;
    }, {} as Record<string, { items: typeof items; amount: number }>);
  }, [items]);

  /* const handlePayment = async () => {
    setLoading(true);
    setError(null);
    let orderId: string | undefined;

    // En mode caisse, toujours sur place
    let orderType = JSON.parse(localStorage.getItem('orderType') || '{"type":"takeaway"}');

    if (!['dine_in', 'takeaway', 'delivery'].includes(orderType.type)) {
      throw new Error('Type de commande invalide');
    }

    // Préparer les données de livraison si nécessaire
    let deliveryInfo = null;
    if (orderType.type === 'delivery') {
      const deliveryData = localStorage.getItem('deliveryInfo');
      if (!deliveryData) {
        throw new Error('Informations de livraison manquantes');
      }
      try {
        deliveryInfo = JSON.parse(deliveryData);
      } catch (e) {
        throw new Error('Informations de livraison invalides');
      }
    }

    if (selectedMethod === 'card') {
      if (isFoodCourtOrder && foodCourtId) {
        // Group items by restaurant
        const restaurantOrders = Object.entries(
          items.reduce((acc, item) => {
            if (!acc[item.restaurantId]) {
              acc[item.restaurantId] = { items: [] };
            }
            acc[item.restaurantId].items.push({
              id: item.id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              image: item.image,
              menuOptions: item.menuOptions
            });
            return acc;
          }, {} as Record<string, { items: any[] }>)
        ).map(([restaurantId, data]) => ({
          restaurantId,
          ...data
        }));

        orderId = await createOrder(foodCourtId, {
          restaurantOrders,
          type: orderType.type,
          paymentMethod: selectedMethod,
          scheduledTime,
          ...(deliveryInfo && { delivery: deliveryInfo })
        });
      }

      try {
        const stripe = await stripePromise;
        if (!stripe ) return;

        const functions = getFunctions();
        const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');

        // Prepare restaurants data for the payment session
        const restaurants = Object.entries(restaurantItems).map(([restaurantId, { items, amount }]) => ({
          restaurantId,
          items,
          amount,
        }));

        // Create checkout session
        const { data } = await createCheckoutSession({
          restaurants,
          fees: applicationFee,
          successUrl: `${window.location.origin}/order-confirmation`,
          cancelUrl: `${window.location.origin}/checkout`,
        });

        // Redirect to Stripe checkout
        const { sessionId } = data as { sessionId: string };
        const result = await stripe.redirectToCheckout({
          sessionId,
        });

        if (result.error) {
          console.error('Stripe checkout error:', result.error);
          setError('Une erreur est survenue lors de la redirection vers la page de paiement.');
        }
      } catch (error) {
        console.error('Payment error:', error);
        setError('Une erreur est survenue lors de la création de la session de paiement.');
      } finally {
        setLoading(false);
      }
    } else if (selectedMethod === "cash") {
      if (isFoodCourtOrder && foodCourtId) {
        // Group items by restaurant
        const restaurantOrders = Object.entries(
          items.reduce((acc, item) => {
            if (!acc[item.restaurantId]) {
              acc[item.restaurantId] = { items: [] };
            }
            acc[item.restaurantId].items.push({
              id: item.id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              image: item.image,
              menuOptions: item.menuOptions
            });
            return acc;
          }, {} as Record<string, { items: any[] }>)
        ).map(([restaurantId, data]) => ({
          restaurantId,
          ...data
        }));

        orderId = await createOrder(foodCourtId, {
          restaurantOrders,
          type: orderType.type,
          paymentMethod: selectedMethod,
          scheduledTime,
          ...(deliveryInfo && { delivery: deliveryInfo })
        });
      } else {
        // Regular restaurant order
        const orderData = {
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            menuOptions: item.menuOptions
          })),
          type: orderType.type,
          subtotal: subtotal,
          total: totalPrice,
          paymentMethod: selectedMethod,
          paymentStatus: selectedMethod === 'cash' ? 'pending' : 'paid',
          scheduledTime,
          ...(deliveryInfo && { delivery: deliveryInfo })
        };

        orderId = await createOrder(restaurantData?.id!, orderData);
        if (!orderId) {
          throw new Error('Erreur lors de la création de la commande');
        }
      }

      clearCart();
      localStorage.removeItem('foodCourtId');
      localStorage.removeItem('deliveryInfo');

      navigate('/order-confirmation', {
        state: { orderId, foodCourtId },
        replace: true
      });
      setLoading(false)
    }
  }; */

  const prepareOrderData = (selectedMethod: string) => {
    let orderData;
    let orderType = JSON.parse(localStorage.getItem('orderType') || '{"type":"takeaway"}');

    if (!['dine_in', 'takeaway', 'delivery'].includes(orderType.type)) {
      throw new Error('Type de commande invalide');
    }

    // Préparer les données de livraison si nécessaire
    let deliveryInfo = null;
    if (orderType.type === 'delivery') {
      const deliveryData = localStorage.getItem('deliveryInfo');
      if (!deliveryData) {
        throw new Error('Informations de livraison manquantes');
      }
      try {
        deliveryInfo = JSON.parse(deliveryData);
      } catch (e) {
        throw new Error('Informations de livraison invalides');
      }
    }

    if (isFoodCourtOrder && foodCourtId) {
      // Regroupement des items par restaurant
      const restaurantOrders = Object.entries(
        items.reduce((acc, item) => {
          if (!acc[item.restaurantId]) {
            acc[item.restaurantId] = { items: [] };
          }
          acc[item.restaurantId].items.push({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            menuOptions: item.menuOptions,
            excludedIngredients: item.excludedIngredients,
            remarks: item.remarks,
            sections: item.sections,
            promotionLabel: item.promotionLabel,
            restaurantName: item.restaurantName,
            restaurantId: item.restaurantId,
          });
          return acc;
        }, {} as Record<string, { items: any[] }>)
      ).map(([restaurantId, data]) => ({
        restaurantId,
        ...data
      }));

      orderData = {
        restaurantOrders,
        type: orderType.type,
        subtotal: parseFloat(subtotal.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        paymentMethod: selectedMethod,
        paymentStatus: selectedMethod === 'cash' ? 'pending' : 'paid',
        scheduledTime,
        ...(deliveryInfo && { delivery: deliveryInfo })
      };
    } else {
      // Commande d'un seul restaurant
      orderData = {
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          menuOptions: item.menuOptions,
          excludedIngredients: item.excludedIngredients,
          remarks: item.remarks,
          sections: item.sections,
          promotionLabel: item.promotionLabel,
          restaurantName: item.restaurantName,
          restaurantId: item.restaurantId,
        })),
        type: orderType.type,
        subtotal: parseFloat(subtotal.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        paymentMethod: selectedMethod,
        paymentStatus: selectedMethod === 'cash' ? 'pending' : 'paid',
        scheduledTime,
        ...(deliveryInfo && { delivery: deliveryInfo })
      };
    }
    return orderData;
  };

  const processPayment = async () => {
    try {
      const stripe = await stripePromise;
      if (!stripe) return;

      const functions = getFunctions();
      const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');

      // Préparer les données des restaurants pour la session de paiement
      const restaurants = Object.entries(restaurantItems).map(([restaurantId, { items, amount }]) => ({
        restaurantId,
        items,
        amount,
      }));

      // Créer la session Stripe
      const { data } = await createCheckoutSession({
        restaurants,
        fees: applicationFee,
        successUrl: `${window.location.origin}/order-confirmation`,
        cancelUrl: `${window.location.origin}/checkout`,
        method: selectedMethod
      });

      clearCart();
      localStorage.removeItem('foodCourtId');
      localStorage.removeItem('deliveryInfo');

      // Rediriger vers Stripe Checkout
      const { sessionId } = data as { sessionId: string };
      const result = await stripe.redirectToCheckout({ sessionId });

      if (result.error) {
        console.error('Stripe checkout error:', result.error);
        setError('Une erreur est survenue lors de la redirection vers la page de paiement.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setError('Une erreur est survenue lors de la création de la session de paiement.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);

    try {
      const orderData = prepareOrderData(selectedMethod);
      let orderId: string | string[] | void = isFoodCourtOrder ? await createFoodCourtOrder(foodCourtId!, orderData) : await createOrder(restaurantData?.id!, orderData);

      if (!orderId) {
        throw new Error('Erreur lors de la création de la commande');
      }

      if (selectedMethod === 'card' || selectedMethod === 'apple_pay') {
        await processPayment();
      } else {
        clearCart();
        localStorage.removeItem('foodCourtId');
        localStorage.removeItem('deliveryInfo');
        if (isFoodCourtOrder && foodCourtId) {
          navigate('/order-confirmation', {
            state: { foodCourtId },
            replace: true
          });
        } else {
          navigate('/order-confirmation', {
            state: { orderId, foodCourtId },
            replace: true
          });
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Order error:', error);
      setError('Une erreur est survenue lors de la commande.');
      setLoading(false);
    }
  };

  const handleUpsellComplete = () => {
    setShowUpsell(false);
  };

  // Obtenir les suggestions basées sur le panier actuel
  const suggestions = getSuggestionGroups(items, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: themeColor }}>
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <h1 className="text-xl font-semibold text-center">Paiement</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-20 flex-1 flex flex-col">
        {error && <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-lg">{error}</div>}

        <div className="grid grid-cols-3 gap-3 mb-4">
          {Object.entries(availablePaymentMethods).map(([method, details]) => {
            const isAllowed = allowedMethods.includes(method) && ((method !== 'card' && method !== 'apple_pay') || restaurantData?.stripeAccountId);
            const paymentMethod = availablePaymentMethods[method as keyof typeof availablePaymentMethods];
            if (!paymentMethod) return null;

            return (
              <button
                key={method}
                onClick={() => setSelectedMethod(method)}
                disabled={!isAllowed}
                className={`p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1 sm:gap-2 border-2 transition-colors ${selectedMethod === method
                  ? 'bg-opacity-10'
                  : isAllowed
                    ? 'bg-white border-gray-200 hover:border-2'
                    : 'bg-gray-50 border border-gray-200 opacity-50 cursor-not-allowed'
                  }`}
                style={selectedMethod === method ? {
                  backgroundColor: `${themeColor}20`,
                  borderColor: themeColor
                } : undefined}
              >
                {method === 'apple_pay' ? (
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Apple_Pay_logo.svg/1920px-Apple_Pay_logo.svg.png"
                    alt="Apple Pay"
                    className="h-6 sm:h-8 object-contain"
                  />
                ) : (
                  <span className="text-xl sm:text-2xl">{details.icon}</span>
                )}
                <span className="text-xs sm:text-sm font-medium">{details.label}</span>
                {!isAllowed && (
                  <span className="text-[10px] sm:text-xs text-gray-500">Non disponible</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto">
          <OrderSummary
            restaurants={restaurantItems}
            items={items}
            serviceFees={serviceFees}
            subtotal={subtotal}
            total={total}
            themeColor={themeColor}
          />
        </div>

        {/* <div className="flex-1 overflow-auto">
          {Object.entries(restaurantItems).map(([restaurantId, { items, amount }]) => (
            <div key={restaurantId} className="bg-white rounded-lg shadow-sm mb-4 p-4">
              <div className="font-medium mb-3">Restaurant name: {items[0].restaurantName}</div>
              {items.map((item, index) => (
                <div key={`${item.id}-${index}`} className="flex items-center gap-3 py-2 ">
                  <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    <div className="text-sm text-gray-500">Quantité: {item.quantity}</div>
                  </div>
                  <div className="font-medium flex-shrink-0">${(item.price * item.quantity).toFixed(2)}</div>
                </div>
              ))}
              <div className="flex justify-between mt-3 pt-3 border-t">
                <div className="font-medium">Sous-total</div>
                <div className="font-medium">{amount.toFixed(2)}€</div>
              </div>
            </div>
          ))}
          <div className="mt-6 p-4 bg-white rounded-lg shadow">
            <div className="flex justify-between">
              <div className="font-medium">Sous-total total</div>
              <div className="font-medium">{subtotal.toFixed(2)}€</div>
            </div>
            <div className="flex justify-between mt-2">
              <div className="text-gray-600">Frais de service</div>
              <div className="text-gray-600">{serviceFees.toFixed(2)}€</div>
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t">
              <div className="font-semibold text-lg">Total</div>
              <div className="font-semibold text-lg">{totalPrice.toFixed(2)}€</div>
            </div>
          </div>
        </div> */}

        <div className="sticky bottom-0 left-0 right-0 pb-safe bg-gray-50 pt-2">
          <button onClick={handlePayment} disabled={loading /* || !user */ || items.length === 0} className="w-full text-white py-2.5 sm:py-3 rounded-xl font-medium" style={{ backgroundColor: themeColor }}>
            {loading ? 'Traitement en cours...' : `Payer ${total.toFixed(2)} €`}
          </button>
        </div>
      </div>

      {/* Modal de suggestions */}
      {showUpsell && items.length > 0 && suggestions.length > 0 && (
        <UpsellModal
          suggestions={suggestions}
          onClose={handleUpsellComplete}
          onComplete={handleUpsellComplete}
        />
      )}
    </div>
  );
}
