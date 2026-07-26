interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  angle: number;
  wanderAngle: number;
  wanderStrength: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Field {
  addRectangle: (x: number, y: number, width: number, height: number) => Rectangle;
  addRectanglesInGrid: (count: number) => Rectangle[];
  moveRectangle: (rect: Rectangle, x: number, y: number) => void;
  rectangles: Rectangle[];
  obstacles: Obstacle[];
}

interface Window {
  field: Field;
}
