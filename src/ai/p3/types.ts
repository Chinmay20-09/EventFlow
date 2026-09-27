export type RiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface P3StrategyAction {
  source_node_id: string;
  destination_node_id: string;
  action: string;
}

export interface P3StrategySetRequest {
  name: string;
  description: string;
  risk_level: RiskLevel;
  strategies: P3StrategyAction[];
}

export interface P3StrategySetResponse {
  strategy_set_id: string | number;
  status: "PROPOSED";
}

export interface P3StrategySetErrorResponse {
  success: false;
  error: unknown;
}