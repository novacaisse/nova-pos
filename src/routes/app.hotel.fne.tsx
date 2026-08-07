import { createFileRoute } from "@tanstack/react-router";
import { FnePage } from "@/components/app/FnePage";

export const Route = createFileRoute("/app/hotel/fne")({
  component: FnePage,
});
