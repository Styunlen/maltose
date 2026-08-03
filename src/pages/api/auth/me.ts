import type { APIRoute } from "astro";
import { verifySessionToken, sessionToUser } from "@lib/auth/session";

export const GET: APIRoute = async ({ cookies }) => {
  const sessionCookie = cookies.get("session")?.value;

  if (!sessionCookie) {
    return new Response(
      JSON.stringify({ authenticated: false, user: null }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const session = verifySessionToken(sessionCookie);
  if (!session) {
    cookies.delete("session", { path: "/" });
    return new Response(
      JSON.stringify({ authenticated: false, user: null }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: sessionToUser(session),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
