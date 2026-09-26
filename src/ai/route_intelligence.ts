import { VenueGraph } from "../engine/graph";
import type {
  EdgeMetric,
  SimulationResult,
  VenueEdge,
} from "../engine/types";
import type { RouteObjective } from "./intent";

export interface RouteDecisionRequest {
  source: string;
  destination: string;
  objective: RouteObjective;
}

export interface RouteMetrics {
  distance: number;
  travelTime: number;
  congestion: number;
  edges: number;
}

export interface RouteCandidate {
  nodes: string[];
  edges: string[];
  metrics: RouteMetrics;
}

export interface RouteDecisionResult {
  success: boolean;
  source: string;
  destination: string;
  objective: RouteObjective;
  selectedRoute?: RouteCandidate;
  alternatives: RouteCandidate[];
  reason?: string;
  error?: string;
}

interface RouteSearchState {
  nodeId: string;
  nodes: string[];
  edges: string[];
  distance: number;
  travelTime: number;
  congestion: number;
}

/**
 * P2 Route Intelligence
 *
 * Responsibility:
 * - Receive the route request.
 * - Read the graph and P1-generated simulation values.
 * - Generate candidate routes.
 * - Evaluate candidates according to the requested objective.
 * - Select the route.
 *
 * P1 remains responsible for calculating the actual simulation values.
 * P2 is responsible for deciding which route should be selected.
 */
export class RouteIntelligence {
  private readonly graph: VenueGraph;
  private readonly simulation?: SimulationResult;

  constructor(
    graph: VenueGraph,
    simulation?: SimulationResult,
  ) {
    this.graph = graph;
    this.simulation = simulation;
  }

  public findBestRoute(
    request: RouteDecisionRequest,
  ): RouteDecisionResult {
    const source = request.source.trim();
    const destination = request.destination.trim();

    if (!source || !destination) {
      return {
        success: false,
        source,
        destination,
        objective: request.objective,
        alternatives: [],
        error: "Source and destination are required.",
      };
    }

    if (!this.graph.node(source)) {
      return {
        success: false,
        source,
        destination,
        objective: request.objective,
        alternatives: [],
        error: `Source node '${source}' does not exist in the P1 graph.`,
      };
    }

    if (!this.graph.node(destination)) {
      return {
        success: false,
        source,
        destination,
        objective: request.objective,
        alternatives: [],
        error: `Destination node '${destination}' does not exist in the P1 graph.`,
      };
    }

    if (source === destination) {
      return {
        success: true,
        source,
        destination,
        objective: request.objective,
        selectedRoute: {
          nodes: [source],
          edges: [],
          metrics: {
            distance: 0,
            travelTime: 0,
            congestion: 0,
            edges: 0,
          },
        },
        alternatives: [],
        reason: "Source and destination are the same node.",
      };
    }

    /*
     * P1 has already calculated the current edge metrics.
     * P2 reads those metrics and uses them for route selection.
     */
    const edgeMetrics = this.buildEdgeMetrics();

    /*
     * Generate candidate routes in P2.
     */
    const candidates = this.generateCandidateRoutes(
      source,
      destination,
      edgeMetrics,
    );

    if (candidates.length === 0) {
      return {
        success: false,
        source,
        destination,
        objective: request.objective,
        alternatives: [],
        error: `No traversable route was found from '${source}' to '${destination}'.`,
      };
    }

    /*
     * P2 ranks the candidate routes according to
     * the organizer's requested objective.
     */
    const ranked = [...candidates].sort((a, b) =>
      this.compareRoutes(
        a,
        b,
        request.objective,
      ),
    );

    const selectedRoute = ranked[0];

    return {
      success: true,
      source,
      destination,
      objective: request.objective,
      selectedRoute,
      alternatives: ranked.slice(1, 4),
      reason: this.buildDecisionReason(
        ranked,
        request.objective,
      ),
    };
  }

  /**
   * Extract the latest P1 edge metrics.
   *
   * P1 calculates these values.
   * P2 only reads them.
   */
  private buildEdgeMetrics(): Map<string, EdgeMetric> {
    const result = new Map<string, EdgeMetric>();

    if (!this.simulation?.steps?.length) {
      return result;
    }

    const latestStep =
      this.simulation.steps[
        this.simulation.steps.length - 1
      ];

    for (const metric of latestStep.edgeMetrics ?? []) {
      result.set(metric.id, metric);
    }

    return result;
  }

  /**
   * Generate candidate paths inside P2.
   *
   * P1 provides:
   * - graph
   * - traversability
   * - edge values
   *
   * P2 performs:
   * - candidate generation
   * - candidate evaluation
   * - route selection
   */
  private generateCandidateRoutes(
    source: string,
    destination: string,
    edgeMetrics: Map<string, EdgeMetric>,
  ): RouteCandidate[] {
    const candidates: RouteCandidate[] = [];

    const maxCandidates = 20;
    const maxDepth = Math.max(
      this.graph.nodes.length,
      1,
    );

    const initialState: RouteSearchState = {
      nodeId: source,
      nodes: [source],
      edges: [],
      distance: 0,
      travelTime: 0,
      congestion: 0,
    };

    this.depthFirstSearch(
      initialState,
      destination,
      edgeMetrics,
      candidates,
      maxCandidates,
      maxDepth,
    );

    return candidates;
  }

  private depthFirstSearch(
    state: RouteSearchState,
    destination: string,
    edgeMetrics: Map<string, EdgeMetric>,
    candidates: RouteCandidate[],
    maxCandidates: number,
    maxDepth: number,
  ): void {
    if (candidates.length >= maxCandidates) {
      return;
    }

    /*
     * Destination reached.
     */
    if (state.nodeId === destination) {
      candidates.push({
        nodes: [...state.nodes],
        edges: [...state.edges],
        metrics: {
          distance: state.distance,
          travelTime: state.travelTime,
          congestion:
            state.edges.length > 0
              ? state.congestion / state.edges.length
              : 0,
          edges: state.edges.length,
        },
      });

      return;
    }

    /*
     * Prevent infinitely deep searches.
     */
    if (state.nodes.length > maxDepth) {
      return;
    }

    const outgoingEdges =
      this.graph.outgoing(state.nodeId);

    for (const edge of outgoingEdges) {
      /*
       * Do not use blocked/non-traversable edges.
       */
      if (!this.graph.isTraversable(edge)) {
        continue;
      }

      /*
       * Prevent cycles.
       */
      if (state.nodes.includes(edge.to)) {
        continue;
      }

      const metric = edgeMetrics.get(edge.id);

      /*
       * Values come from P1 graph / metrics.
       */
      const edgeDistance =
        this.getEdgeDistance(edge);

      const edgeTravelTime =
        this.getEdgeTravelTime(edge);

      const edgeCongestion =
        this.getEdgeCongestion(metric);

      const nextState: RouteSearchState = {
        nodeId: edge.to,
        nodes: [
          ...state.nodes,
          edge.to,
        ],
        edges: [
          ...state.edges,
          edge.id,
        ],
        distance:
          state.distance + edgeDistance,
        travelTime:
          state.travelTime + edgeTravelTime,
        congestion:
          state.congestion + edgeCongestion,
      };

      this.depthFirstSearch(
        nextState,
        destination,
        edgeMetrics,
        candidates,
        maxCandidates,
        maxDepth,
      );

      if (candidates.length >= maxCandidates) {
        return;
      }
    }
  }

  /**
   * Distance comes from the P1 graph.
   */
  private getEdgeDistance(
    edge: VenueEdge,
  ): number {
    return Math.max(
      edge.distance ?? 0,
      0,
    );
  }

  /**
   * Travel time comes from P1's currentTime
   * when available.
   *
   * Otherwise baselineTime is used.
   */
  private getEdgeTravelTime(
    edge: VenueEdge,
  ): number {
    return Math.max(
      edge.currentTime ??
        edge.baselineTime ??
        0,
      0,
    );
  }

  /**
   * Congestion is read from P1's calculated
   * edge utilization.
   */
  private getEdgeCongestion(
    metric?: EdgeMetric,
  ): number {
    if (!metric) {
      return 0;
    }

    return Math.max(
      metric.utilization ?? 0,
      0,
    );
  }

  /**
   * P2 route-selection policy.
   *
   * least_congested -> lowest congestion
   * shortest        -> lowest distance
   * fastest         -> lowest travel time
   * safest          -> lowest available congestion
   *
   * IMPORTANT:
   * The current P1 EdgeMetric contract does not
   * expose a dedicated safety/risk score.
   *
   * Therefore P2 does not invent a safety number.
   */
  private compareRoutes(
    a: RouteCandidate,
    b: RouteCandidate,
    objective: RouteObjective,
  ): number {
    switch (objective) {
      case "shortest":
        return this.compareNumbers(
          a.metrics.distance,
          b.metrics.distance,
        );

      case "fastest":
        return this.compareNumbers(
          a.metrics.travelTime,
          b.metrics.travelTime,
        );

      case "safest":
        return this.compareNumbers(
          a.metrics.congestion,
          b.metrics.congestion,
        );

      case "least_congested":
      default:
        return this.compareNumbers(
          a.metrics.congestion,
          b.metrics.congestion,
        );
    }
  }

  private compareNumbers(
    a: number,
    b: number,
  ): number {
    if (a !== b) {
      return a - b;
    }

    return 0;
  }

  /**
   * Generate the explanation for the selected route.
   *
   * This explanation is based only on the route metrics
   * already calculated/read by P2.
   */
  private buildDecisionReason(
    ranked: RouteCandidate[],
    objective: RouteObjective,
  ): string {
    if (ranked.length <= 1) {
      return (
        "The selected route is the only available " +
        "traversable route for the requested destination."
      );
    }

    switch (objective) {
      case "shortest":
        return (
          "The selected route has the lowest " +
          "distance among the evaluated candidate routes."
        );

      case "fastest":
        return (
          "The selected route has the lowest " +
          "travel time among the evaluated candidate routes."
        );

      case "safest":
        return (
          "The selected route has the lowest available " +
          "congestion signal among the evaluated candidate " +
          "routes. An explicit P1 safety/risk metric is " +
          "not currently available."
        );

      case "least_congested":
      default:
        return (
          "The selected route has the lowest P1-reported " +
          "congestion/utilization among the evaluated " +
          "candidate routes."
        );
    }
  }
}

/**
 * Convenience function for direct P2 usage.
 */
export function findBestRoute(
  graph: VenueGraph,
  request: RouteDecisionRequest,
  simulation?: SimulationResult,
): RouteDecisionResult {
  const intelligence =
    new RouteIntelligence(
      graph,
      simulation,
    );

  return intelligence.findBestRoute(request);
}