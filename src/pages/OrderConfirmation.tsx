import { ChevronLeft, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import OrderSummary from '../components/OrderSummary';
import { useOrderContext } from '../context/OrderContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { getRestaurant } from '../services/restaurantService';
import type { Order } from '../types/firebase';

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isRegisterMode = searchParams.get('mode') === 'register';
  const restaurantId = searchParams.get('restaurantId');
  const foodCourtId = searchParams.get('foodCourtId') || localStorage.getItem('foodCourtId');
  const { restaurant } = useRestaurantContext();
  const { orders } = useOrderContext();
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const orderId = location.state?.orderId;
  const [currentThemeColor, setCurrentThemeColor] = useState('#10B981');

  // Fetch restaurant data and theme color
  useEffect(() => {
    const loadRestaurant = async () => {
      if (!restaurantId) return;

      try {
        const restaurantData = await getRestaurant(restaurantId);
        setCurrentThemeColor(restaurantData.theme?.primaryColor || '#10B981');
      } catch (err) {
        console.error('Error loading restaurant:', err);
      }
    };

    loadRestaurant();
  }, [restaurantId]);

  useEffect(() => {
    if (!orderId) {
      try {
        const redirectDelay = isRegisterMode ? 1500 : 0;
        setRedirecting(true);
        const storedFoodCourtId = localStorage.getItem('foodCourtId');
        setTimeout(() => {
          if (isRegisterMode) {
            setTimeout(() => {
              navigate(`/restaurant?restaurantId=${restaurant?.id}&mode=register${storedFoodCourtId ? `&foodCourtId=${storedFoodCourtId}` : ''}`);
            }, 1500);
          } else if (storedFoodCourtId) {
            navigate(`/food-court?foodCourtId=${storedFoodCourtId}`);
          } else {
            navigate('/menu');
          }
        }, redirectDelay);
      } catch (error) {
        console.error('Error handling navigation:', error);
        navigate('/');
      }
      return;
    }

    const order = orders.find(o => o.id === orderId);
    if (order) {
      setOrderDetails(order);
    }
  }, [orderId, orders, navigate, isRegisterMode, restaurant?.id, foodCourtId]);

  const handleTrackOrder = () => {
    if (orderId) {
      navigate(`/track-order/${orderId}`, { state: { order: orderDetails } });
    }
  };

  if (!orderDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
        <div className="flex items-center p-4">
          <button
            onClick={() => {
              const foodCourtId = localStorage.getItem('foodCourtId');
              if (isRegisterMode) {
                navigate(`/restaurant?restaurantId=${restaurant?.id}&mode=register${foodCourtId ? `&foodCourtId=${foodCourtId}` : ''}`);
              } else {
                navigate(foodCourtId ? `/food-court?foodCourtId=${foodCourtId}` : '/menu');
              }
            }}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: currentThemeColor }}
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <h1 className="ml-4 text-xl font-semibold">Confirmation de commande</h1>
        </div>
      </div>

      <div className="pt-20 px-4 pb-24">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
            style={{ backgroundColor: `${currentThemeColor}20` }}>
            <Receipt className="h-8 w-8" style={{ color: currentThemeColor }} />
          </div>
          <h2 className="text-4xl font-bold mb-2" style={{ color: currentThemeColor }}>
            #{orderDetails.orderNumber}
          </h2>
          <p className="text-gray-600 mb-4">Numéro de commande</p>
        </div>

        <OrderSummary
          items={orderDetails.items}
          subtotal={orderDetails.subtotal}
          serviceFees={orderDetails.total - orderDetails.subtotal}
          //tax={orderDetails.tax}
          total={orderDetails.total}
          themeColor={currentThemeColor}
        />

        {!isRegisterMode ? (
          <div className="space-y-3 mt-6">
            <button
              onClick={handleTrackOrder}
              className="w-full text-white rounded-xl py-3 font-medium"
              style={{ backgroundColor: currentThemeColor }}
            >
              Suivre ma commande
            </button>
            <button
              onClick={() => foodCourtId ? navigate(`/food-court?foodCourtId=${foodCourtId}`) : navigate('/menu')}
              className="w-full bg-gray-100 text-gray-600 rounded-xl py-3 font-medium"
            >
              {foodCourtId ? 'Retour au food court' : 'Retour au menu'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/restaurant?mode=register')}
            className="w-full text-white rounded-xl py-3 font-medium"
            style={{ backgroundColor: currentThemeColor }}
          >
            Nouvelle commande
          </button>
        )}
      </div>
    </div>
  );
}