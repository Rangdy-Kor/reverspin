export interface Viewport {
  width: number
  height: number
}

export const WORLD_SHORT_SIDE = 800
export const DEFAULT_VIEWPORT: Readonly<Viewport> = { width: 800, height: 800 }

export function logicalViewport(width: number, height: number): Viewport {
  const scale = WORLD_SHORT_SIDE / Math.min(width, height)
  return { width: width * scale, height: height * scale }
}
