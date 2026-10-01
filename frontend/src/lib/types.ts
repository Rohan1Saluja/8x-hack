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
