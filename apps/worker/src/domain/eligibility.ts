export const isEligibleDeal = (
  discountRatio: number,
  inStock: boolean,
  stock: number,
  threshold: number
) => discountRatio >= threshold && inStock && stock > 0;
