export type Meeting = {
  id: string;
  title: string;
  meeting_url: string;
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
  recording_ready: boolean;
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
export type MeetingEvidence = {
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
