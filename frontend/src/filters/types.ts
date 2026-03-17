// ---------------------------------------------------------------------------
// FleetTracker – Filter type definitions
// ---------------------------------------------------------------------------

/** Which ES indexes this filter applies to. ['*'] means all active indexes. */
export type FilterScope = string[];

// -- Geographic filter -------------------------------------------------------

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeoFilter {
  id: string;
  kind: 'geo';
  label: string;
  enabled: boolean;
  scope: FilterScope;
  mode: 'bbox' | 'polygon' | 'country';
  geoField: string; // ES geo field name (default: 'location')
  bbox?: GeoBounds;
  polygon?: Array<[number, number]>; // ring coordinates [lon, lat]
  country?: string;                  // ISO-3166-1 alpha-2 code
}

// -- Time filter -------------------------------------------------------------

export type TimeMode = 'last' | 'before' | 'after' | 'between';
export type TimeUnit = 'minute' | 'hour' | 'day' | 'week';

export interface TimeFilter {
  id: string;
  kind: 'time';
  label: string;
  enabled: boolean;
  scope: FilterScope;
  field: string;       // ES date field name (default: 'timestamp')
  mode: TimeMode;
  from?: string;       // ISO datetime
  to?: string;         // ISO datetime
  lastAmount?: number; // e.g. 24
  lastUnit?: TimeUnit; // e.g. 'hour'
}

// -- Value filter ------------------------------------------------------------

export type ValueFieldType = 'number' | 'keyword' | 'text' | 'date';
export type NumericOp = 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'eq' | 'ne';
export type KeywordOp  = 'in' | 'not_in' | 'eq' | 'ne';
export type ValueOp = NumericOp | KeywordOp;

export interface ValueFilter {
  id: string;
  kind: 'value';
  label: string;
  enabled: boolean;
  scope: FilterScope; // typically single-index for value filters
  field: string;
  fieldType: ValueFieldType;
  op: ValueOp;
  value?: string | number;
  valueTo?: number;    // for 'between'
  terms?: string[];    // for 'in' / 'not_in'
}

// -- Union -------------------------------------------------------------------

export type ActiveFilter = GeoFilter | TimeFilter | ValueFilter;

// -- Views -------------------------------------------------------------------

export interface FilterView {
  /** Unique name – serves as the primary key. */
  name: string;
  /** ISO-8601 creation date. */
  createdAt: string;
  /** Optional description. */
  description?: string;
  /** Snapshot of all filters in this view. */
  filters: ActiveFilter[];
  /** Whether this view is currently active (toggled on). */
  active: boolean;
}

// -- Attribute visibility config (per-index) ---------------------------------

export interface IndexAttributeConfig {
  /** ES index / source ID. */
  indexId: string;
  /** Map of attribute name → visible in tooltip. */
  attributes: Record<string, boolean>;
  /** Ordered field names for tooltip display. If absent, uses Object.keys(attributes). */
  fieldOrder?: string[];
  /** Field used as timestamp for the global time filter. Defaults to 'timestamp'. */
  timestampField?: string;
}
