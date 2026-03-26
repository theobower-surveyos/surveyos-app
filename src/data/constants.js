// ─────────────────────────────────────────────────
// SurveyOS · constants.js · THE FINAL STACK
// ─────────────────────────────────────────────────

export const COLORS = {
  navy:   '#0F1B2D',
  gold:   '#C9963B',
  goldFaded: 'rgba(201, 150, 59, 0.3)',
  green:  '#059669',
  blue:   '#2563EB',
  red:    '#DC2626',
  gray:   '#64748B',
  lgray:  '#F8FAFC',
  mgray:  '#E2E8F0',
  white:  '#FFFFFF',
  black:  '#111827',
};

export const USERS = [
  { id: 'u-001', name: 'Theo B.', role: 'owner', org_name: 'Bower Land Surveying' },
  { id: 'u-002', name: 'Sarah Miller', role: 'pm', org_name: 'Bower Land Surveying' },
  { id: 'u-003', name: 'Marcus Wright', role: 'party_chief', org_name: 'Bower Land Surveying' },
  { id: 'u-004', name: 'Alex Rivera', role: 'cad_tech', org_name: 'Bower Land Surveying' }, 
  { id: 'u-005', name: 'SurveyOS Admin', role: 'platform_admin', org_name: 'SurveyOS HQ' },
];

export const ROLE_META = {
  owner: { portal: 'MorningBrief', label: 'Owner', color: COLORS.gold },
  pm: { portal: 'CommandCenter', label: 'Project Manager', color: COLORS.blue },
  party_chief: { portal: 'TodaysWork', label: 'Party Chief', color: COLORS.green },
  cad_tech: { portal: 'LiveView', label: 'CAD Tech', color: COLORS.gray },
  client: { portal: 'ClientPortal', label: 'Client', color: COLORS.navy },
  platform_admin: { portal: 'NetworkOps', label: 'Network Ops', color: '#8B5CF6' }
};

export const PROJECT_STATUSES = ['proposal', 'accepted', 'field', 'office', 'review', 'delivered', 'closed'];

export const STATUS_COLORS = {
  proposal: '#94A3B8', accepted: '#2563EB', field: '#D97706',
  office: '#7C3AED', review: '#0891B2', delivered: '#059669', closed: '#64748B',
};

export const FEE_SCHEDULE = [
  { id: 'boundary-res', category: 'Boundary', name: 'Residential Boundary Survey', basePrice: 3500 },
  { id: 'alta', category: 'ALTA/NSPS', name: 'ALTA/NSPS Land Title Survey', basePrice: 5500 },
  { id: 'topo-small', category: 'Topographic', name: 'Topographic Survey (< 5 acres)', basePrice: 4000 },
  { id: 'drone-map', category: 'Drone', name: 'Drone Aerial Mapping', basePrice: 3000 },
];

export const FEE_ADDONS = [
  { id: 'rush', name: 'Rush Fee (< 5 days)', multiplier: 1.5 },
  { id: 'weekend', name: 'Weekend Premium', multiplier: 1.25 },
  { id: 'cad-3d', name: '3D CAD Deliverable', flatFee: 1000 },
];

export const EQUIPMENT = [
  { id: 'eq-01', name: 'Trimble R12i GNSS', type: 'GPS', status: 'available' },
  { id: 'eq-02', name: 'Trimble S7 Robotic', type: 'Total Station', status: 'available' },
  { id: 'eq-03', name: 'TSC7 Data Collector', type: 'Controller', status: 'available' },
];

export const MOCK_CLIENTS = [
  { id: 'cl-001', name: 'Prescott Development Group', contact: 'Sarah Prescott' },
  { id: 'cl-002', name: 'Cactus Title & Escrow', contact: 'Mike Reyes' },
];

export const MOCK_CREW = [
  { id: 'crew-01', name: 'Theo B.', role: 'Party Chief' },
  { id: 'crew-02', name: 'Marcus W.', role: 'Party Chief' },
];

export const MOCK_PROJECTS = [
  {
    id: 'proj-001', name: 'Prescott Phase 2 ALTA', clientId: 'cl-001',
    status: 'closed', fee: 5500, deliveredDate: '2026-02-05', paidDate: '2026-02-19', monuments: 4,
  },
  {
    id: 'proj-002', name: 'Cactus Title Boundary', clientId: 'cl-002',
    status: 'field', fee: 3500, deliveredDate: null, paidDate: null, monuments: 2,
  }
];

export const MOCK_MONUMENTS = [
  { id: 'mon-001', lat: 33.4484, lng: -111.9430, type: 'Iron Pipe', condition: 'Set' },
];

// ── THE "NO-MORE-CRASHES" ALIASES ────────────────
export const STATUS_SEQUENCE = PROJECT_STATUSES;
export const CREW_MEMBERS = MOCK_CREW;
export const CLIENTS = MOCK_CLIENTS;
export const PROJECTS = MOCK_PROJECTS;
export const MONUMENTS = MOCK_MONUMENTS;

// ── HELPERS ──────────────────────────────────────
export const getClient = (id) => MOCK_CLIENTS.find(c => c.id === id) || { name: 'Unknown' };
export const getService = (id) => FEE_SCHEDULE.find(s => s.id === id) || { name: 'General Survey' };
export const getCrew = (id) => MOCK_CREW.find(c => c.id === id) || { name: 'Unassigned' };

export const calcDSO = (p) => {
  if (!p || !p.deliveredDate || !p.paidDate) return 0;
  return Math.round((new Date(p.paidDate) - new Date(p.deliveredDate)) / (86400000));
};

export const fmt = (n) => '$' + Number(n || 0).toLocaleString();