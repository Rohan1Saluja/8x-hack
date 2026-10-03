import { DemoExperience } from "@/components/demo-experience";
import samples from "../../../../backend/app/demo_meetings.json";

export const metadata = { title: "Explore the demo" };
export default function DemoPage() {
  return <DemoExperience sample={samples[0]} />;
}

