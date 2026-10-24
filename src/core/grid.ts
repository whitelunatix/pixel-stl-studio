import type { PixelGrid } from "../types";

export function gridIndex(grid: PixelGrid, x: number, y: number): number {
  return y * grid.width + x;
}

export function isInsideGrid(grid: PixelGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function setCell(grid: PixelGrid, x: number, y: number, value: string | null): PixelGrid {
  if (!isInsideGrid(grid, x, y)) return grid;
  const cells = grid.cells.slice();
  cells[gridIndex(grid, x, y)] = value;
  return { ...grid, cells };
}

export function shiftGrid(grid: PixelGrid, dx: number, dy: number): PixelGrid {
  if (dx === 0 && dy === 0) return grid;
  const cells = Array.from({ length: grid.width * grid.height }, () => null as string | null);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (isInsideGrid(grid, nextX, nextY)) {
        cells[gridIndex(grid, nextX, nextY)] = grid.cells[gridIndex(grid, x, y)];
      }
    }
  }
  return { ...grid, cells };
}

export function resizeGrid(grid: PixelGrid, width: number, height: number): PixelGrid {
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (nextWidth === grid.width && nextHeight === grid.height) return grid;
  const cells = Array.from({ length: nextWidth * nextHeight }, () => null as string | null);
  const copyWidth = Math.min(grid.width, nextWidth);
  const copyHeight = Math.min(grid.height, nextHeight);
  for (let y = 0; y < copyHeight; y += 1) {
    for (let x = 0; x < copyWidth; x += 1) {
      cells[y * nextWidth + x] = grid.cells[gridIndex(grid, x, y)];
    }
  }
  return { width: nextWidth, height: nextHeight, cells };
}

export function usedColorIds(grid: PixelGrid): string[] {
  return Array.from(new Set(grid.cells.filter((cell): cell is string => Boolean(cell))));
}

export function countFilledCells(grid: PixelGrid): number {
  return grid.cells.reduce((count, cell) => count + (cell ? 1 : 0), 0);
}
