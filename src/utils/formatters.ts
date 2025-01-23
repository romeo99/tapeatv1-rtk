export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters}m`;
  }
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')}km`;
}

export function formatCurrency(amount: number): string {
  return amount.toFixed(2) + ' €';
}

export function formatLogoUrlForMarker(restaurantId: string) {
  return `https://${import.meta.env.VITE_AWS_BUCKET_NAME}.s3.${import.meta.env.VITE_AWS_REGION}.amazonaws.com/${restaurantId}-logo.png`;
}