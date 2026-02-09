
export enum DocCategory {
  INVOICE = 'Invoice',
  RESUME = 'Resume',
  LEGAL = 'Legal Contract',
  IDENTIFICATION = 'ID/Passport',
  RECEIPT = 'Receipt',
  TECHNICAL = 'Technical Doc',
  OTHER = 'Other'
}

export enum RoutingStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  QUARANTINED = 'Quarantined',
  ROUTED = 'Routed',
  FAILED = 'Failed'
}

export interface ExtractedField {
  key: string;
  value: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'Administrator' | 'Operator' | 'Auditor';
  lastLogin: number;
}

export interface DocumentRecord {
  id: string;
  name: string;
  timestamp: number;
  category: DocCategory;
  confidence: number;
  status: RoutingStatus;
  extractedFields: ExtractedField[];
  destination: string;
  summary: string;
  thumbnail?: string;
  flaggedForRetraining?: boolean;
  origin: 'Upload' | 'Email';
}

export interface ClassificationResult {
  category: DocCategory;
  confidence: number;
  extractedFields: ExtractedField[];
  summary: string;
  routingDestination: string;
}

export interface SystemSettings {
  confidenceThreshold: number;
  autoRoutingEnabled: boolean;
  defaultDestination: string;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: number;
  attachmentName: string;
  attachmentData: string; // base64
  attachmentMimeType: string;
  isProcessed: boolean;
}

export interface OutboundEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: number;
  relatedDocId: string;
}

export interface MySQL_LogRecord {
  log_id: string;
  user_id: string;
  timestamp: string;
  event_name: string;
  log_level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  payload_json: string;
}
