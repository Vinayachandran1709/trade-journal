import { apiFetch } from "@/lib/api";

export interface SupportedBroker {
  code: string;
  label: string;
  status: string;
  connection_fields: string[];
}

export interface BrokerConnection {
  id: number;
  broker_name: string;
  broker_user_id: string | null;
  client_id: string | null;
  account_label: string | null;
  auth_status: string;
  sync_status: string;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  metadata_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function getSupportedBrokers(): Promise<SupportedBroker[]> {
  return apiFetch<SupportedBroker[]>("/brokers/supported");
}

export function getBrokerConnections(): Promise<BrokerConnection[]> {
  return apiFetch<BrokerConnection[]>("/brokers/connections");
}
