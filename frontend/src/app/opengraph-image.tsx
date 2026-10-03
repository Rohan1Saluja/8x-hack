import { ImageResponse } from "next/og";

export const alt = "8x — AI Meeting Intelligence. Great conversations. Clear next moves.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Decorative signal geometry; no invented meeting data or capture claims. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#13171d", color: "#edf2f7", padding: "56px 64px", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(ellipse at 85% 40%, #29344f 0%, #13171d 65%)" }} />
        <div style={{ position: "absolute", right: -90, top: -110, width: 660, height: 660, display: "flex", borderRadius: "50%", border: "1px solid #8d7ef52b" }} />
        <div style={{ position: "absolute", right: -10, top: -30, width: 500, height: 500, display: "flex", borderRadius: "50%", border: "1px solid #53d9f233" }} />
        <div style={{ display: "flex", flexDirection: "column", position: "relative", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span style={{ fontSize: 62, fontWeight: 700, letterSpacing: -4 }}>8x</span>
            <span style={{ width: 1, height: 28, background: "#ffffff30" }} />
            <span style={{ fontSize: 18, letterSpacing: 3, color: "#aab7c9" }}>AI MEETING INTELLIGENCE</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 68, fontSize: 66, fontWeight: 700, letterSpacing: -3, lineHeight: 1.12 }}>
            <span>Great conversations.</span>
            <span style={{ color: "#79e6f6", marginTop: 8 }}>Clear next moves.</span>
          </div>
          <div style={{ display: "flex", maxWidth: 700, fontSize: 24, color: "#aab7c9", lineHeight: 1.5, marginTop: 28 }}>
            Grounded summaries. Actionable decisions.
            Answers backed by the conversation.
          </div>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 12, fontSize: 16, color: "#aab7c9" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#53d9f2" }} />
            MEETING INTELLIGENCE. GROUNDED IN CONVERSATION.
          </div>
        </div>
        <div style={{ position: "absolute", right: 76, top: 218, height: 218, display: "flex", alignItems: "center", gap: 14 }}>
          {[40, 108, 200, 108, 40].map((height, index) => (
            <div key={index} style={{ width: 12, height, borderRadius: 8, background: index > 2 ? "#9a8cf5" : "#53d9f2", boxShadow: "0 0 28px #53d9f225" }} />
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 64, right: 64, height: 3, background: "linear-gradient(90deg, #53d9f2, #9a8cf5, #13171d)" }} />
      </div>
    ),
    size,
  );
}
