import { createFileRoute, redirect } from "@tanstack/react-router";

// The shopping list lives on the Pantry page now; an old bookmark or installed icon still lands there.
export const Route = createFileRoute("/shopping")({ beforeLoad: () => { throw redirect({ to: "/pantry" }); }, component: () => null });
