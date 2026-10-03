export type Meeting = {
  id: string;
  title: string;
  meeting_url: string | null;
  created_at: string;
  capture_state:
    | "not_started"
    | "joining"
    | "awaiting_admission"
    | "recording"
    | "stopped"
    | "failed";
  transcription_state: "pending" | "running" | "ready" | "failed";
  summary_state: "pending" | "running" | "ready" | "failed";
  failure_code: string | null;
  demo_seed_key?: string | null;
  recording_ready: boolean;
  duration_seconds: number | null;
  lifecycle_state:
    | "not_started"
    | "joining"
    | "awaiting_admission"
    | "recording"
    | "recorded"
    | "transcribing"
    | "transcribed"
    | "summarizing"
    | "ready"
    | "failed";
  lifecycle_version: number;
  lifecycle_updated_at: string | null;
  consent_confirmed_at: string | null;
  capture_mode: "demo" | "manual";
};

export type Segment = {
  id: string;
  ordinal: number;
  text: string;
  start_seconds: number;
  end_seconds: number;
  speaker: string | null;
};
export type Evidence = { text: string; source_segment_ids: string[] };
export type ActionItem = Evidence & {
  id: string;
  owner: string | null;
  due_date: string | null;
  completed: boolean;
};
export type Highlight = {
  id: string;
  segment_id: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
};
export type SearchHit = {
  meeting_id: string;
  title: string;
  kind: string;
  snippet: string;
  segment_id: string | null;
  start_seconds: number | null;
};
export type MeetingEvidence = {
  highlights?: Highlight[];
  segments: Segment[];
  summary: {
    overview: Evidence;
    topics: Evidence[];
    decisions: Evidence[];
  } | null;
  actions: ActionItem[];
  questions: {
    id: string;
    question: string;
    is_sample?: boolean;
    answer: {
      answer: string;
      supported: boolean;
      source_segment_ids: string[];
    };
  }[];
  jobs: {
    job_key: string;
    stage: string;
    status: string;
    attempts: number;
    error_code: string | null;
    retry_after: string | null;
    interrupted: boolean;
  }[];
};
