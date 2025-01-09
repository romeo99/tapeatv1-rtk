import { Restaurant } from '../types/firebase';

export function isRestaurantOpen(restaurant: Restaurant): boolean {
  if (!restaurant?.openingHours) return true;

  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = days[now.getDay()];
  const currentTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const daySchedule = restaurant.openingHours[currentDay];
  
  // Si le restaurant est marqué comme fermé ce jour
  if (daySchedule?.closed) return false;

  // Si pas d'horaires définis, considérer comme ouvert
  if (!daySchedule?.open || !daySchedule?.close) return true;

  // Convertir les heures en minutes pour faciliter la comparaison
  const currentMinutes = convertTimeToMinutes(currentTime);
  const openMinutes = convertTimeToMinutes(daySchedule.open);
  const closeMinutes = convertTimeToMinutes(daySchedule.close);

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

function convertTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}