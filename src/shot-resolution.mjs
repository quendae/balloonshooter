import { bombAffectedKeys, chooseRainbowColor } from './sky-rescue-core.mjs';

export function resolveShotOnGrid({ grid, shot, c, r, geometry, pickColor, ceilRow = 0 }) {
  let popped = [];
  let dropped = [];
  let placedColor = shot.color || pickColor();

  if (shot.type === 'bomb') {
    geometry.setBalloon(grid, c, r, placedColor);
    popped = bombAffectedKeys(c, r, geometry.neighbors).filter((key) => grid.has(key));
    popped.forEach((key) => grid.delete(key));
    const connected = geometry.topConnected(grid, ceilRow);
    dropped = [...grid.keys()].filter((key) => !connected.has(key));
    dropped.forEach((key) => grid.delete(key));
  } else {
    placedColor = shot.type === 'rainbow'
      ? chooseRainbowColor(grid, c, r, geometry.neighbors) || pickColor()
      : shot.color;
    geometry.setBalloon(grid, c, r, placedColor);
    const settled = geometry.settle(grid, c, r, ceilRow);
    popped = settled.popped;
    dropped = settled.dropped;
  }

  return { popped, dropped, placedColor };
}
