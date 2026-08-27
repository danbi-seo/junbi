import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// auth.admin.deleteUser는 service_role이 필요하다. Edge에서는 못 돈다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 탈퇴 — docs/08-auth-pairing.md 7
 *
 * 클라이언트에서 못 한다. auth.users를 지우는 건 service_role만 할 수 있다.
 *
 * 짝이 있으면 연결 해제가 먼저 일어난다. 해제를 건너뛰고 계정만 지우면
 * 건강 기록·상태·ics 토큰 정리가 통째로 빠진다. cascade는 couples를
 * 지울 때만 도는데, 탈퇴는 profiles만 지우기 때문이다.
 *
 * 확인은 화면에서 받는다. 여기서는 본인인지만 확인하고 지운다.
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response("Unauthorized", { status: 401 });

  // 1. 짝이 있으면 먼저 해제한다. 사용자 권한으로 부른다 —
  //    dissolve_couple()이 auth.uid()로 대상을 찾기 때문이다.
  const { error: dissolveError } = await supabase.rpc("dissolve_couple", {
    p_purge_now: false,
  });

  // NOT_PAIRED는 정상이다. 짝이 없는 사람도 탈퇴할 수 있어야 한다.
  if (dissolveError && !dissolveError.message.includes("NOT_PAIRED")) {
    return Response.json(
      { error: "dissolve_failed", message: dissolveError.message },
      { status: 500 },
    );
  }

  // 2. 계정 삭제. profiles → cascade로 개인 소유 행이 따라간다.
  //    push_subscriptions · ics_tokens · notification_prefs · health_sharing 등
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return Response.json(
      { error: "missing_env", message: (e as Error).message },
      { status: 500 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return Response.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
