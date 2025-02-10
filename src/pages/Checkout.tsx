import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { ChevronLeft } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getApplicationFee } from '../services/superadminService';

// Initialize Stripe
const stripePromise = loadStripe('pk_test_51PH7PV1LCdahk0ySP7Kcm127sOdgOuOKSBNxVuIegQhWgi0AvXL4NupqnQY0wDQPEo38AJi3wV9mrFdAzSLvFGXG00PttU7DHT');

export default function Checkout() {
  const navigate = useNavigate();
  const { items, total } = useCart();
  const { user } = useAuth();
  const { themeColor } = useRestaurantContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationFee, setApplicationFee] = useState<number>(0);
  const [subtotal, setSubtotal] = useState<number>(0);
  const [serviceFees, setServiceFees] = useState<number>(0);
  const [totalPrice, setTotalPrice] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const fetchFee = async () => {
      if (!mounted) return;
      setLoading(true);
      try {
        const fee = await getApplicationFee();
        if (mounted) {
          setApplicationFee(fee);
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to fetch application fee');
          console.error('Error fetching application fee:', err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    fetchFee();
    return () => {
      mounted = false;
    };
  }, []);

  // Calculate subtotal, service fees, and total price when items or application fee changes
  useEffect(() => {
    const newSubtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const newServiceFees = newSubtotal * applicationFee;
    const newTotalPrice = newSubtotal + newServiceFees;
    setSubtotal(newSubtotal);
    setServiceFees(newServiceFees);
    setTotalPrice(newTotalPrice);
  }, [items, applicationFee]);

  if (!user) {
    window.location.href = '/signin?redirect=checkout';
  }

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


  const handlePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      const stripe = await stripePromise;
      if (!stripe || !user) return;

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
  };

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

        <div className="flex-1 overflow-auto">
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
        </div>

        <div className="sticky bottom-0 left-0 right-0 pb-safe bg-gray-50 pt-2">
          <button onClick={handlePayment} disabled={loading || !user || items.length === 0} className="w-full text-white py-2.5 sm:py-3 rounded-xl font-medium" style={{ backgroundColor: themeColor }}>
            {loading ? 'Traitement en cours...' : `Payer ${totalPrice.toFixed(2)} €`}
          </button>
        </div>
      </div>
    </div>
  );
}
