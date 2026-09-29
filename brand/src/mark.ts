/**
 * The mark: a 3 x 5 checkerboard of rounded cells (plan section 8.1).
 *
 * Cells that touch at a corner are joined by a curve, so the union is one vector shape. The outline
 * is built by walking the cells' edges clockwise. At a free corner the walk turns right along a
 * convex arc. Where two diagonal cells are joined it crosses over to the other cell instead, turning
 * left along a concave arc.
 */

export interface MarkParams {
  /** Height of one cell (H), in drawing units. */
  cellHeight: number;
  /** Cell width divided by cell height. */
  cellRatio: number;
  /** Radius of outer corners, as a fraction of H. */
  cornerRadius: number;
  /** Radius of the curve that joins two cells, as a fraction of H. */
  joinRadius: number;
  /** Diagonal neighbours that stay separate, as [column, row] pairs. */
  openJoins: readonly (readonly [Cell, Cell])[];
}

type Cell = readonly [column: number, row: number];

export const defaultMarkParams: MarkParams = {
  cellHeight: 100,
  cellRatio: 1.6,
  cornerRadius: 0.28,
  joinRadius: 0.2,
  // The top cell and the cell to its lower right.
  openJoins: [
    [
      [1, 0],
      [2, 1],
    ],
  ],
};

export interface MarkGeometry {
  /** SVG path data. Its top-left corner is at the requested origin (0,0 by default). */
  path: string;
  width: number;
  height: number;
}

const columns = 3;
const rows = 5;

type Direction = "E" | "S" | "W" | "N";
const clockwise: Record<Direction, Direction> = { E: "S", S: "W", W: "N", N: "E" };
const counterClockwise: Record<Direction, Direction> = { E: "N", N: "W", W: "S", S: "E" };
const step: Record<Direction, readonly [number, number]> = {
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
  N: [0, -1],
};

interface Edge {
  /** The grid vertex the edge starts at. */
  from: readonly [number, number];
  direction: Direction;
  cell: Cell;
}

const edgeKey = (x: number, y: number, direction: Direction) => `${x},${y}${direction}`;

function isCell(column: number, row: number): boolean {
  return column >= 0 && column < columns && row >= 0 && row < rows && (column + row) % 2 === 1;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function format(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function buildMark(
  params: MarkParams = defaultMarkParams,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): MarkGeometry {
  const cellWidth = params.cellHeight * params.cellRatio;
  const outerRadius = params.cornerRadius * params.cellHeight;
  const joinRadius = params.joinRadius * params.cellHeight;

  // Every cell contributes four clockwise edges.
  const edges = new Map<string, Edge>();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!isCell(column, row)) continue;
      const cell: Cell = [column, row];
      const sides: [number, number, Direction][] = [
        [column, row, "E"],
        [column + 1, row, "S"],
        [column + 1, row + 1, "W"],
        [column, row + 1, "N"],
      ];
      for (const [x, y, direction] of sides) {
        edges.set(edgeKey(x, y, direction), { from: [x, y], direction, cell });
      }
    }
  }

  /** The cell diagonally across a grid vertex from `cell`, when that pair is joined. */
  function joinedNeighbour(vertex: readonly [number, number], cell: Cell): Cell | undefined {
    const [x, y] = vertex;
    // The vertex is a corner of `cell`; the cell across it mirrors `cell` through the vertex.
    const opposite: Cell = [2 * x - 1 - cell[0], 2 * y - 1 - cell[1]];
    if (!isCell(opposite[0], opposite[1])) return undefined;
    const open = params.openJoins.some(
      ([a, b]) =>
        (sameCell(a, cell) && sameCell(b, opposite)) ||
        (sameCell(b, cell) && sameCell(a, opposite)),
    );
    return open ? undefined : opposite;
  }

  interface Corner {
    x: number;
    y: number;
    arriving: Direction;
    leaving: Direction;
    radius: number;
    /** Clockwise turns are convex; counter-clockwise turns are the concave join curves. */
    convex: boolean;
  }

  const visited = new Set<string>();
  const loops: Corner[][] = [];

  for (const [startKey, start] of edges) {
    if (visited.has(startKey)) continue;
    const loop: Corner[] = [];
    let edge: Edge = start;
    while (!visited.has(edgeKey(edge.from[0], edge.from[1], edge.direction))) {
      visited.add(edgeKey(edge.from[0], edge.from[1], edge.direction));
      const [dx, dy] = step[edge.direction];
      const vertex: [number, number] = [edge.from[0] + dx, edge.from[1] + dy];
      const joined = joinedNeighbour(vertex, edge.cell);
      const leaving = joined ? counterClockwise[edge.direction] : clockwise[edge.direction];
      loop.push({
        x: origin.x + vertex[0] * cellWidth,
        y: origin.y + vertex[1] * params.cellHeight,
        arriving: edge.direction,
        leaving,
        radius: joined ? joinRadius : outerRadius,
        convex: !joined,
      });
      const next = edges.get(edgeKey(vertex[0], vertex[1], leaving));
      if (!next) throw new Error(`the mark outline has no edge leaving ${vertex.join(",")}`);
      edge = next;
    }
    loops.push(loop);
  }

  const point = (corner: Corner, direction: Direction, distance: number) => {
    const [dx, dy] = step[direction];
    return `${format(corner.x + dx * distance)} ${format(corner.y + dy * distance)}`;
  };

  const path = loops
    .map((loop) => {
      const first = loop[0];
      if (!first) return "";
      const parts = [`M${point(first, first.leaving, first.radius)}`];
      for (const corner of [...loop.slice(1), first]) {
        const before = point(corner, corner.arriving, -corner.radius);
        const after = point(corner, corner.leaving, corner.radius);
        const sweep = corner.convex ? 1 : 0;
        parts.push(
          `L${before}`,
          `A${format(corner.radius)} ${format(corner.radius)} 0 0 ${sweep} ${after}`,
        );
      }
      parts.push("Z");
      return parts.join("");
    })
    .join("");

  return { path, width: columns * cellWidth, height: rows * params.cellHeight };
}
