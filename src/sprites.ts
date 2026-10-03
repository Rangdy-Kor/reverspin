export const SPRITE_URLS = {
  rocket: '/assets/01-rocket.png',
  heavy: '/assets/02-heavy_meteorite.png',
  normal: '/assets/03-normal_meteorite.png',
  swift: '/assets/04-swift_meteorite.png',
  heart: '/assets/05-heart.png',
} as const

export type Sprites = Partial<Record<keyof typeof SPRITE_URLS, HTMLImageElement>>

// Longest rendered side in logical units; these never define colliders.
export const SPRITE_SIZES = {
  rocketDiameterScale: 1.75,
  meteorDiameterScale: 1.15,
  heartDiameterScale: 1.2,
} as const

export async function loadSprites(createImage: () => HTMLImageElement = () => new Image()): Promise<Sprites> {
  const sprites: Sprites = {}
  await Promise.all(Object.entries(SPRITE_URLS).map(([key, url]) => new Promise<void>(resolve => {
    const image = createImage()
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        sprites[key as keyof typeof SPRITE_URLS] = image
      }
      resolve()
    }
    image.onerror = () => resolve()
    image.src = url
  })))
  return sprites
}
