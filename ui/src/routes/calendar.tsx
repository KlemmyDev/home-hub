import { createFileRoute } from "@tanstack/react-router";

// The screens are drawn by the layout in __root.tsx; this route is the address that opens one.
export const Route = createFileRoute("/calendar")({ component: () => null });
