// Turns a persona's palette grid into what each surface draws: Raster cells
// for the terminal (two pixel rows per cell, upper half-block), an SVG
// source for desktop and VS Code.

import { SHARED_PALETTE, type Persona } from './personas'

const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const toBase64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

const hexToInt = (hex: string): number => parseInt(hex.replace('#', ''), 16)

/** The colour of one pixel, or undefined where it is transparent. */
export const pixel = (persona: Persona, x: number, y: number): string | undefined => {
  const ch = persona.sprite[y]?.[x]
  if (ch === undefined || ch === '.') return undefined
  return persona.palette[ch] ?? SHARED_PALETTE[ch]
}

export const spriteSize = (persona: Persona) => ({
  width: persona.sprite[0]?.length ?? 0,
  height: persona.sprite.length,
})

/** Raster cells: `columns` = sprite width, `rows` = half the sprite height. */
export const rasterCells = (persona: Persona) => {
  const { width, height } = spriteSize(persona)
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < width; x++) {
      const top = pixel(persona, x, r * 2)
      const bottom = pixel(persona, x, r * 2 + 1)
      if (top !== undefined) {
        words[i++] = UPPER_HALF
        words[i++] = hexToInt(top)
        words[i++] = bottom === undefined ? DEFAULT_COLOR : hexToInt(bottom)
      } else if (bottom !== undefined) {
        words[i++] = LOWER_HALF
        words[i++] = hexToInt(bottom)
        words[i++] = DEFAULT_COLOR
      } else {
        words[i++] = SPACE
        words[i++] = DEFAULT_COLOR
        words[i++] = DEFAULT_COLOR
      }
    }
  }
  // Little-endian u32s, whatever the host's byte order.
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((w, j) => {
    bytes[j * 4] = w & 0xff
    bytes[j * 4 + 1] = (w >>> 8) & 0xff
    bytes[j * 4 + 2] = (w >>> 16) & 0xff
    bytes[j * 4 + 3] = (w >>> 24) & 0xff
  })
  return { columns: width, rows, cells: toBase64(bytes) }
}

/** An SVG of the sprite, one rect per pixel, crisp when scaled. */
export const svgSource = (persona: Persona, scale = 6): string => {
  const { width, height } = spriteSize(persona)
  let rects = ''
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = pixel(persona, x, y)
      if (c !== undefined) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width * scale}" height="${height * scale}" shape-rendering="crispEdges">${rects}</svg>`
  )
}
