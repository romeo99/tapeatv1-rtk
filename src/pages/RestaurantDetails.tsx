import { ChevronLeft, Clock, Instagram, MapPin, Phone, ShoppingBag, Star, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRestaurantContext } from '../context/RestaurantContext';

export default function RestaurantDetails() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { restaurant } = useRestaurantContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isRegisterMode = new URLSearchParams(window.location.search).get('mode') === 'register';

  useEffect(() => {
    if (!restaurant?.id) {
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [restaurant]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {!isRegisterMode && (
        <>
          <button
            onClick={() => navigate(-1)}
            className="fixed top-4 left-4 z-50 w-10 h-10 bg-black/50 backdrop-blur-sm hover:bg-black/60 rounded-lg flex items-center justify-center shadow-lg transition-colors border-2 border-white/30"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <div className="relative h-48">
            <img
              src={restaurant?.coverImage || "https://images.unsplash.com/photo-1542574271-7f3b92e6c821?auto=format&fit=crop&w=1200&q=80"}
              alt="Restaurant background"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="px-4 -mt-20 relative">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <img
                      src={restaurant?.logo || "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=200&h=200"}
                      alt="Restaurant logo"
                      className="w-16 h-16 rounded-full border-4 border-white shadow-md"
                    />
                    <div>
                      <h1 className="text-xl font-bold">{restaurant?.name || "Urban Burger"}</h1>
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                        <span className="font-medium">4.5</span>
                        <span className="text-gray-500">(500+ avis)</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{restaurant?.address || "85 Rue Ferrari, 13005 Marseille"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>11:00 - 23:00</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${restaurant?.phone}`}>{restaurant?.phone || "04 91 47 85 62"}</a>
                      {restaurant?.instagramUrl && (
                        <div className="flex items-center gap-2 ml-auto">
                          <a
                            href={restaurant.instagramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                          >
                            <Instagram className="h-4 w-4 text-gray-600" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>)}
      <div className="mt-6 px-4">
        <h2 className="text-lg font-semibold mb-4">
          Comment souhaitez-vous être servi ?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => {
              localStorage.setItem('orderType', JSON.stringify({ type: 'dine_in' }));
              navigate(`/menu?restaurantId=${restaurant?.id}`);
            }}
            className="bg-white rounded-xl p-8 shadow-sm hover:shadow-md transition-all text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <UtensilsCrossed className="h-8 w-8 text-emerald-500" />
            </div>
            <span className="font-medium">Sur place</span>
          </button>
          <button
            onClick={() => {
              localStorage.setItem('orderType', JSON.stringify({ type: 'takeaway' }));
              navigate(`/menu?restaurantId=${restaurant?.id}`);
            }}
            className="bg-white rounded-xl p-8 shadow-sm hover:shadow-md transition-all text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="h-8 w-8 text-emerald-500" />
            </div>
            <span className="font-medium">À emporter</span>
          </button>
        </div>
      </div>
    </div>
  );
}