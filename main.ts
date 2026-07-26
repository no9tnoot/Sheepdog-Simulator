const canvasEl = document.querySelector('canvas');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Canvas not found');
}
const canvas = canvasEl;

const context = canvas.getContext('2d');
if (!context) {
  throw new Error('Canvas 2D context not available');
}
const ctx: CanvasRenderingContext2D = context;

const RECT_WIDTH = 5;
const RECT_HEIGHT = 10;
const SPACING = 4;

// Boid behavior weights
const BOID_SEPARATION_WEIGHT = 1.35;
const BOID_ALIGNMENT_WEIGHT = 0.5;
const BOID_COHESION_WEIGHT = 0.9;
const BOID_OBSTACLE_AVOIDANCE_WEIGHT = 2.5;
const BOID_BOUNDARY_AVOIDANCE_WEIGHT = 1.8;
const BOID_WANDER_WEIGHT = 0.45;

// Boid perception and movement
const BOID_PERCEPTION_RADIUS = 25;
const BOID_SEPARATION_RADIUS = 18;
const BOID_OBSTACLE_AVOIDANCE_DISTANCE = 1;
const BOID_BOUNDARY_MARGIN = 1;
const BOID_MIN_SPEED = 0.05;
const BOID_MAX_SPEED = 0.5;
const BOID_MAX_FORCE = 0.15;

// Wander steering
const BOID_WANDER_JITTER = 0.2;
const BOID_WANDER_RADIUS = 10;
const BOID_WANDER_DISTANCE = 18;

// Rotation smoothing
const BOID_ROTATION_SMOOTHING = 0.2;

const rectangles: Rectangle[] = [];
const obstacles: Obstacle[] = [
  { x: 90, y: 140, width: 45, height: 35 },
  { x: 250, y: 210, width: 55, height: 30 },
  { x: 170, y: 80, width: 35, height: 50 },
];

let animationId: number | null = null;

function getCenter(rect: Rectangle): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function setCenter(rect: Rectangle, x: number, y: number): void {
  rect.x = x - rect.width / 2;
  rect.y = y - rect.height / 2;
}

function velocityToAngle(vx: number, vy: number): number {
  return Math.atan2(vy, vx) - Math.PI / 2;
}

function randomVelocity(): { vx: number; vy: number } {
  const angle = Math.random() * Math.PI * 2;
  const speed = BOID_MIN_SPEED + Math.random() * (BOID_MAX_SPEED - BOID_MIN_SPEED);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

function createBoidMotion(velocity: { vx: number; vy: number }): Pick<
  Rectangle,
  'vx' | 'vy' | 'angle' | 'wanderAngle' | 'wanderStrength'
> {
  return {
    vx: velocity.vx,
    vy: velocity.vy,
    angle: velocityToAngle(velocity.vx, velocity.vy),
    wanderAngle: Math.random() * Math.PI * 2,
    wanderStrength: 0.75 + Math.random() * 0.5,
  };
}

function smoothRotation(boid: Rectangle): void {
  if (Math.hypot(boid.vx, boid.vy) <= 0.001) return;

  const targetAngle = velocityToAngle(boid.vx, boid.vy);
  let angleDiff = targetAngle - boid.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  boid.angle += angleDiff * BOID_ROTATION_SMOOTHING;
}

function wander(boid: Rectangle): { x: number; y: number } {
  boid.wanderAngle += (Math.random() - 0.5) * 2 * BOID_WANDER_JITTER;

  const speed = Math.hypot(boid.vx, boid.vy);
  const heading = speed > 0.001 ? Math.atan2(boid.vy, boid.vx) : boid.wanderAngle;
  const center = getCenter(boid);

  const circleCenterX = center.x + Math.cos(heading) * BOID_WANDER_DISTANCE;
  const circleCenterY = center.y + Math.sin(heading) * BOID_WANDER_DISTANCE;
  const targetX = circleCenterX + Math.cos(boid.wanderAngle) * BOID_WANDER_RADIUS;
  const targetY = circleCenterY + Math.sin(boid.wanderAngle) * BOID_WANDER_RADIUS;

  const steer = limitForce(targetX - center.x, targetY - center.y);
  return {
    x: steer.x * boid.wanderStrength,
    y: steer.y * boid.wanderStrength,
  };
}

function limitForce(fx: number, fy: number): { x: number; y: number } {
  const magnitude = Math.hypot(fx, fy);
  if (magnitude > BOID_MAX_FORCE) {
    return { x: (fx / magnitude) * BOID_MAX_FORCE, y: (fy / magnitude) * BOID_MAX_FORCE };
  }
  return { x: fx, y: fy };
}

function limitSpeed(rect: Rectangle): void {
  const speed = Math.hypot(rect.vx, rect.vy);
  if (speed === 0) {
    const velocity = randomVelocity();
    rect.vx = velocity.vx;
    rect.vy = velocity.vy;
    return;
  }
  if (speed > BOID_MAX_SPEED) {
    rect.vx = (rect.vx / speed) * BOID_MAX_SPEED;
    rect.vy = (rect.vy / speed) * BOID_MAX_SPEED;
  } else if (speed < BOID_MIN_SPEED) {
    rect.vx = (rect.vx / speed) * BOID_MIN_SPEED;
    rect.vy = (rect.vy / speed) * BOID_MIN_SPEED;
  }
}

function getObbPoints(rect: Rectangle): { x: number; y: number }[] {
  const center = getCenter(rect);
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const c = Math.cos(rect.angle);
  const s = Math.sin(rect.angle);
  const local = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  return local.map((point) => ({
    x: center.x + point.x * c - point.y * s,
    y: center.y + point.x * s + point.y * c,
  }));
}

function projectPoints(
  points: { x: number; y: number }[],
  axis: { x: number; y: number },
): { min: number; max: number } {
  let min = points[0].x * axis.x + points[0].y * axis.y;
  let max = min;

  for (let i = 1; i < points.length; i++) {
    const projection = points[i].x * axis.x + points[i].y * axis.y;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }

  return { min, max };
}

function getObbAabbMtv(
  boid: Rectangle,
  obstacle: Obstacle,
): { x: number; y: number } | null {
  const obbPoints = getObbPoints(boid);
  const aabbPoints = [
    { x: obstacle.x, y: obstacle.y },
    { x: obstacle.x + obstacle.width, y: obstacle.y },
    { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height },
    { x: obstacle.x, y: obstacle.y + obstacle.height },
  ];

  const c = Math.cos(boid.angle);
  const s = Math.sin(boid.angle);
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: c, y: s },
    { x: -s, y: c },
  ];

  let minOverlap = Infinity;
  let mtvAxis: { x: number; y: number } | null = null;

  for (const axis of axes) {
    const length = Math.hypot(axis.x, axis.y);
    const normal = { x: axis.x / length, y: axis.y / length };
    const obbProjection = projectPoints(obbPoints, normal);
    const aabbProjection = projectPoints(aabbPoints, normal);
    const overlap =
      Math.min(obbProjection.max, aabbProjection.max) -
      Math.max(obbProjection.min, aabbProjection.min);

    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      mtvAxis = normal;
    }
  }

  if (!mtvAxis) return null;

  const center = getCenter(boid);
  const obstacleCenter = {
    x: obstacle.x + obstacle.width / 2,
    y: obstacle.y + obstacle.height / 2,
  };
  const direction = {
    x: center.x - obstacleCenter.x,
    y: center.y - obstacleCenter.y,
  };

  if (direction.x * mtvAxis.x + direction.y * mtvAxis.y < 0) {
    mtvAxis = { x: -mtvAxis.x, y: -mtvAxis.y };
  }

  return { x: mtvAxis.x * minOverlap, y: mtvAxis.y * minOverlap };
}

function removeVelocityIntoNormal(
  rect: Rectangle,
  normalX: number,
  normalY: number,
): void {
  const dot = rect.vx * normalX + rect.vy * normalY;
  if (dot < 0) {
    rect.vx -= normalX * dot;
    rect.vy -= normalY * dot;
  }
}

function resolveObstacleCollisions(boid: Rectangle): void {
  for (const obstacle of obstacles) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const mtv = getObbAabbMtv(boid, obstacle);
      if (!mtv) break;

      const center = getCenter(boid);
      setCenter(boid, center.x + mtv.x, center.y + mtv.y);

      const mtvLength = Math.hypot(mtv.x, mtv.y);
      if (mtvLength > 0) {
        removeVelocityIntoNormal(boid, mtv.x / mtvLength, mtv.y / mtvLength);
      }
    }
  }
}

function resolveBoundaryCollisions(boid: Rectangle): void {
  for (let attempt = 0; attempt < 4; attempt++) {
    const corners = getObbPoints(boid);
    let dx = 0;
    let dy = 0;

    for (const corner of corners) {
      if (corner.x < 0) dx = Math.max(dx, -corner.x);
      if (corner.x > canvas.width) dx = Math.min(dx, canvas.width - corner.x);
      if (corner.y < 0) dy = Math.max(dy, -corner.y);
      if (corner.y > canvas.height) dy = Math.min(dy, canvas.height - corner.y);
    }

    if (dx === 0 && dy === 0) break;

    const center = getCenter(boid);
    setCenter(boid, center.x + dx, center.y + dy);

    if (dx !== 0) removeVelocityIntoNormal(boid, Math.sign(dx), 0);
    if (dy !== 0) removeVelocityIntoNormal(boid, 0, Math.sign(dy));
  }
}

function closestPointOnRect(
  px: number,
  py: number,
  rect: Obstacle,
): { x: number; y: number } {
  const closestX = Math.max(rect.x, Math.min(px, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(py, rect.y + rect.height));
  return { x: closestX, y: closestY };
}

function separation(boid: Rectangle, neighbors: Rectangle[]): { x: number; y: number } {
  const center = getCenter(boid);
  let steerX = 0;
  let steerY = 0;
  let count = 0;

  for (const other of neighbors) {
    if (other === boid) continue;

    const otherCenter = getCenter(other);
    const dx = center.x - otherCenter.x;
    const dy = center.y - otherCenter.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0 && dist < BOID_SEPARATION_RADIUS) {
      steerX += dx / dist;
      steerY += dy / dist;
      count++;
    }
  }

  if (count === 0) return { x: 0, y: 0 };

  steerX /= count;
  steerY /= count;
  return limitForce(steerX, steerY);
}

function alignment(boid: Rectangle, neighbors: Rectangle[]): { x: number; y: number } {
  let avgVx = 0;
  let avgVy = 0;
  let count = 0;

  for (const other of neighbors) {
    if (other === boid) continue;

    const center = getCenter(boid);
    const otherCenter = getCenter(other);
    const dist = Math.hypot(center.x - otherCenter.x, center.y - otherCenter.y);

    if (dist > 0 && dist < BOID_PERCEPTION_RADIUS) {
      avgVx += other.vx;
      avgVy += other.vy;
      count++;
    }
  }

  if (count === 0) return { x: 0, y: 0 };

  avgVx /= count;
  avgVy /= count;
  return limitForce(avgVx - boid.vx, avgVy - boid.vy);
}

function cohesion(boid: Rectangle, neighbors: Rectangle[]): { x: number; y: number } {
  const center = getCenter(boid);
  let avgX = 0;
  let avgY = 0;
  let count = 0;

  for (const other of neighbors) {
    if (other === boid) continue;

    const otherCenter = getCenter(other);
    const dist = Math.hypot(center.x - otherCenter.x, center.y - otherCenter.y);

    if (dist > 0 && dist < BOID_PERCEPTION_RADIUS) {
      avgX += otherCenter.x;
      avgY += otherCenter.y;
      count++;
    }
  }

  if (count === 0) return { x: 0, y: 0 };

  avgX /= count;
  avgY /= count;
  return limitForce(avgX - center.x, avgY - center.y);
}

function obstacleAvoidance(boid: Rectangle): { x: number; y: number } {
  const center = getCenter(boid);
  let steerX = 0;
  let steerY = 0;

  for (const obstacle of obstacles) {
    const closest = closestPointOnRect(center.x, center.y, obstacle);
    const dx = center.x - closest.x;
    const dy = center.y - closest.y;
    const dist = Math.hypot(dx, dy);

    if (dist < BOID_OBSTACLE_AVOIDANCE_DISTANCE && dist > 0) {
      const strength = (BOID_OBSTACLE_AVOIDANCE_DISTANCE - dist) / BOID_OBSTACLE_AVOIDANCE_DISTANCE;
      steerX += (dx / dist) * strength;
      steerY += (dy / dist) * strength;
    }
  }

  return limitForce(steerX, steerY);
}

function boundaryAvoidance(boid: Rectangle): { x: number; y: number } {
  const center = getCenter(boid);
  let steerX = 0;
  let steerY = 0;

  if (center.x < BOID_BOUNDARY_MARGIN) {
    steerX += (BOID_BOUNDARY_MARGIN - center.x) / BOID_BOUNDARY_MARGIN;
  } else if (center.x > canvas.width - BOID_BOUNDARY_MARGIN) {
    steerX -= (center.x - (canvas.width - BOID_BOUNDARY_MARGIN)) / BOID_BOUNDARY_MARGIN;
  }

  if (center.y < BOID_BOUNDARY_MARGIN) {
    steerY += (BOID_BOUNDARY_MARGIN - center.y) / BOID_BOUNDARY_MARGIN;
  } else if (center.y > canvas.height - BOID_BOUNDARY_MARGIN) {
    steerY -= (center.y - (canvas.height - BOID_BOUNDARY_MARGIN)) / BOID_BOUNDARY_MARGIN;
  }

  return limitForce(steerX, steerY);
}

function updateBoids(): void {
  for (const boid of rectangles) {
    const separationForce = separation(boid, rectangles);
    const alignmentForce = alignment(boid, rectangles);
    const cohesionForce = cohesion(boid, rectangles);
    const obstacleForce = obstacleAvoidance(boid);
    const boundaryForce = boundaryAvoidance(boid);
    const wanderForce = wander(boid);

    boid.vx +=
      separationForce.x * BOID_SEPARATION_WEIGHT +
      alignmentForce.x * BOID_ALIGNMENT_WEIGHT +
      cohesionForce.x * BOID_COHESION_WEIGHT +
      obstacleForce.x * BOID_OBSTACLE_AVOIDANCE_WEIGHT +
      boundaryForce.x * BOID_BOUNDARY_AVOIDANCE_WEIGHT +
      wanderForce.x * BOID_WANDER_WEIGHT;

    boid.vy +=
      separationForce.y * BOID_SEPARATION_WEIGHT +
      alignmentForce.y * BOID_ALIGNMENT_WEIGHT +
      cohesionForce.y * BOID_COHESION_WEIGHT +
      obstacleForce.y * BOID_OBSTACLE_AVOIDANCE_WEIGHT +
      boundaryForce.y * BOID_BOUNDARY_AVOIDANCE_WEIGHT +
      wanderForce.y * BOID_WANDER_WEIGHT;

    limitSpeed(boid);
    smoothRotation(boid);

    const center = getCenter(boid);
    setCenter(boid, center.x + boid.vx, center.y + boid.vy);

    resolveObstacleCollisions(boid);
    resolveBoundaryCollisions(boid);
  }
}

function drawBackground(): void {
  ctx.fillStyle = 'green';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function render(): void {
  drawBackground();

  ctx.fillStyle = '#5c3d1e';
  for (const obstacle of obstacles) {
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }

  ctx.fillStyle = 'white';
  for (const rect of rectangles) {
    const center = getCenter(rect);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rect.angle);
    ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
    ctx.restore();
  }
}

function tick(): void {
  updateBoids();
  render();
  animationId = requestAnimationFrame(tick);
}

function startSimulation(): void {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }
  animationId = requestAnimationFrame(tick);
}

function addRectangle(x: number, y: number, width: number, height: number): Rectangle {
  const velocity = randomVelocity();
  const rect: Rectangle = {
    x,
    y,
    width,
    height,
    ...createBoidMotion(velocity),
  };
  rectangles.push(rect);
  render();
  return rect;
}

function moveRectangle(rect: Rectangle, x: number, y: number): void {
  rect.x = x;
  rect.y = y;
  render();
}

function addRectanglesInGrid(count: number): Rectangle[] {
  rectangles.length = 0;

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellWidth = RECT_WIDTH + SPACING;
  const cellHeight = RECT_HEIGHT + SPACING;
  const gridWidth = cols * RECT_WIDTH + (cols - 1) * SPACING;
  const gridHeight = rows * RECT_HEIGHT + (rows - 1) * SPACING;
  const startX = (canvas.width - gridWidth) / 2;
  const startY = (canvas.height - gridHeight) / 2;

  const added: Rectangle[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * cellWidth;
    const y = startY + row * cellHeight;
    const velocity = randomVelocity();
    const rect: Rectangle = {
      x,
      y,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      ...createBoidMotion(velocity),
    };
    rectangles.push(rect);
    added.push(rect);
  }

  render();
  return added;
}

const countInput = document.getElementById('count-input');
if (!(countInput instanceof HTMLInputElement)) {
  throw new Error('Count input not found');
}

const startBtn = document.getElementById('start-btn');
if (!startBtn) throw new Error('Start button not found');

startBtn.addEventListener('click', () => {
  const count = Math.max(1, parseInt(countInput.value, 10) || 1);
  countInput.value = String(count);
  addRectanglesInGrid(count);
  startSimulation();
});

render();

window.field = { addRectangle, addRectanglesInGrid, moveRectangle, rectangles, obstacles };
