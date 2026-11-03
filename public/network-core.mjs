// Geometry-only exploration. This is not a train service or operating timetable.
export const project = ([lon, lat]) => [lon, -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI];
export const unproject = ([x, y]) => [x, (2 * Math.atan(Math.exp(-y * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI];
export function distanceKm(a, b) {
  const r = Math.PI / 180, dlat = (b[1] - a[1]) * r, dlon = (b[0] - a[0]) * r;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dlon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function matchesGauge(edge, gauge) {
  return gauge === 'all' || String(edge.gauge ?? '').split(/[^0-9]+/).includes(String(gauge));
}
class Heap {
  values = [];
  push(value) { const a = this.values; a.push(value); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= value[0]) break; a[i] = a[p]; i = p; } a[i] = value; }
  pop() { const a = this.values, top = a[0], last = a.pop(); if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= last[0]) break; a[i] = a[c]; i = c; } a[i] = last; } return top; }
}
export function createGeographicGraph(data) {
  const adjacency = Array.from({ length: data.nodes.length }, () => []), edgeIndex = new Map();
  const coordinates = data.nodes.map(project);
  data.edges.forEach((edge, i) => { edgeIndex.set(String(edge.id), i); adjacency[edge.from].push(i); adjacency[edge.to].push(i); });
  const componentCache = new Map();
  function components(gauge) {
    if (componentCache.has(gauge)) return componentCache.get(gauge);
    const parent = Int32Array.from(data.nodes, (_, i) => i), size = new Uint32Array(data.nodes.length).fill(1);
    const find = n => { while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; } return n; };
    for (const e of data.edges) if (matchesGauge(e, gauge)) { const a = find(e.from), b = find(e.to); if (a !== b) { if (size[a] >= size[b]) { parent[b] = a; size[a] += size[b]; } else { parent[a] = b; size[b] += size[a]; } } }
    const roots = Int32Array.from(parent, (_, i) => find(i)); componentCache.set(gauge, { roots, size }); return { roots, size };
  }
  function candidates(station, gauge) {
    const { roots, size } = components(gauge), point = [station.lon, station.lat], found = [];
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      if (Math.abs(node[0] - point[0]) > .017 || Math.abs(node[1] - point[1]) > .012 || !adjacency[i].some(j => matchesGauge(data.edges[j], gauge))) continue;
      const km = distanceKm(point, node); if (km <= 1) found.push({ node: i, offsetKm: km, component: roots[i], size: size[roots[i]] });
    }
    return found.sort((a, b) => a.offsetKm - b.offsetKm).slice(0, 24);
  }
  function endpoints(fromId, toId, gauge) {
    const from = data.stations.find(s => s.id === fromId), to = data.stations.find(s => s.id === toId);
    if (!from || !to || fromId === toId) return { error: 'SELECT_DISTINCT_STATIONS' };
    const starts = candidates(from, gauge), ends = candidates(to, gauge);
    if (!starts.length || !ends.length) return { error: 'STATION_NOT_CONNECTED', from, to };
    // Match only existing endpoint components within 1km of a station. No artificial
    // interchanges or bridges are added; both offsets are returned to the viewer.
    const pairs = starts.flatMap(a => ends.filter(b => a.component === b.component).map(b => ({ a, b, score: a.offsetKm + b.offsetKm })));
    pairs.sort((a, b) => a.score - b.score);
    return pairs.length ? { from, to, start: pairs[0].a, end: pairs[0].b } : { error: 'DISCONNECTED_GEOMETRY', from, to };
  }
  function route({ fromId, toId, gauge = '1435', blocked = [] }) {
    const pair = endpoints(fromId, toId, gauge); if (pair.error) return { feasible: false, code: pair.error, edgeIds: [], ...pair };
    if (!Array.isArray(blocked) || blocked.length > 12 || blocked.some(id => !edgeIndex.has(String(id)))) return { feasible: false, code: 'INVALID_CLOSURE', edgeIds: [] };
    const closed = new Set(blocked.map(String)), costs = new Float64Array(data.nodes.length).fill(Infinity), previous = new Int32Array(data.nodes.length).fill(-1), heap = new Heap();
    costs[pair.start.node] = 0; heap.push([0, pair.start.node]); let visited = 0;
    while (heap.values.length) {
      const [cost, node] = heap.pop(); if (cost !== costs[node]) continue; visited++;
      if (node === pair.end.node) break;
      for (const i of adjacency[node]) {
        const e = data.edges[i]; if (!matchesGauge(e, gauge) || closed.has(String(e.id))) continue;
        const next = node === e.from ? e.to : e.from, value = cost + e.lengthKm;
        if (value < costs[next]) { costs[next] = value; previous[next] = i; heap.push([value, next]); }
      }
    }
    if (!Number.isFinite(costs[pair.end.node])) return { feasible: false, code: 'NO_GEOGRAPHIC_PATH', edgeIds: [], matchedEndpoints: pair, visited };
    const path = []; let node = pair.end.node;
    while (node !== pair.start.node) { const e = data.edges[previous[node]]; if (!e) throw Error('BROKEN_PATH'); path.push({ id: String(e.id), reversed: node === e.from }); node = node === e.to ? e.from : e.to; }
    path.reverse();
    return { feasible: true, code: 'GEOGRAPHIC_PATH', distanceKm: costs[pair.end.node], gauge, edgeIds: path.map(p => p.id), path, matchedEndpoints: pair, visited,
      scope: 'Shortest geometric path over matched IGN endpoints. Operating status, permitted turns, rolling-stock compatibility and train-service availability are not supplied.' };
  }
  return { data, coordinates, edgeIndex, adjacency, route, components, candidates };
}
export function validateGeographicPath(graph, result, blocked = []) {
  if (!result.feasible) return false;
  const closed = new Set(blocked.map(String)); let node = result.matchedEndpoints.start.node, km = 0;
  for (const step of result.path) {
    const e = graph.data.edges[graph.edgeIndex.get(String(step.id))];
    if (!e || closed.has(String(e.id)) || !matchesGauge(e, result.gauge) || (e.from !== node && e.to !== node)) return false;
    const next = step.reversed ? e.from : e.to; if ((step.reversed ? e.to : e.from) !== node) return false;
    node = next; km += e.lengthKm;
  }
  return node === result.matchedEndpoints.end.node && Math.abs(km - result.distanceKm) < .00001;
}
