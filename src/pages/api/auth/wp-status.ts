import type { APIRoute } from "astro";
import jwt from "jsonwebtoken";

export const GET: APIRoute = async ({ cookies }) => {
  const wpToken = cookies.get("wp_token")?.value || null;
  const refreshToken = cookies.get("wp_refresh")?.value || null;

  if (!wpToken) {
    return new Response(
      JSON.stringify({ connected: false, canRefresh: !!refreshToken }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const decoded = jwt.decode(wpToken) as any;
    const exp = decoded?.exp || 0;
    // WPGraphQL authToken may omit `exp`; treat missing exp as connected
    // (can't judge staleness), mirroring middleware/me.ts behavior.
    const expired = exp !== 0 && exp * 1000 < Date.now();

    return new Response(
      JSON.stringify({
        connected: !expired,
        expired,
        canRefresh: !!refreshToken,
        userName: decoded?.data?.user_display_name || decoded?.name || "",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ connected: false, canRefresh: !!refreshToken }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
