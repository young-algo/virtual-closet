export const productImageBlendMode = (category: string): 'multiply' | 'darken' =>
  category === 'Sneakers' ? 'multiply' : 'darken';
