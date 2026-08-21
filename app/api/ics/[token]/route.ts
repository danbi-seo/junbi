import { createAdminClient } from "@/lib/supabase/admin";
import { buildIcs, type FeedEvent } from "@/lib/ics";
import type { Profile } from "@/lib/naming";

// service_role 키와 ical-generator가 Node를 요구한다.
export const runtime = "nodejs";
// 캘린더 앱마다 폴링 시각이 달라 캐시가 의미 없다. 매번 새로 판단한다.
export const dynamic = "force-dynamic";

const PROFILE_COLUMNS =
  "id,name,display_name,pet_name_for_partner,emoji_key,member_slot,couple_id,timezone";

/**
 * 사용자별 비밀 URL로 캘린더 파일을 발행한다 → docs/12-ics-feed.md
 *
 * 이게 이 프로젝트에서 비용 대비 효과가 가장 큰 기능이다.
 * 위젯을 만드는 대신 아이폰 기본 캘린더의 위젯에 데이터를 넣는다.
 *
 * ⚠ service_role로 돌기 때문에 RLS도 events_visible 뷰도 걸리지 않는다.
 *   마스킹은 lib/ics.ts가 코드로 직접 한다.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await ctx.params;
  const token = raw.replace(/\.ics$/i, "");

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("ics_tokens")
    .select("user_id")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle<{ user_id: string }>();

  if (!row) return new Response("Not found", { status: 404 });

  const { data: viewer } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", row.user_id)
    .maybeSingle<Profile>();

  // couple_id는 ics_tokens에 두지 않는다. 여기서 profiles를 타고 가면
  // 연결 해제로 couple_id가 null이 되는 순간 자동으로 404가 된다.
  if (!viewer?.couple_id) return new Response("Not found", { status: 404 });

  // ── ETag ──────────────────────────────────────────────────────
  // 이게 없으면 두 사람만 써도 무료 한도를 첫 달에 넘긴다.
  // 캘린더 앱이 안 바뀐 파일을 하루 190번씩 새로 받아가기 때문이다.
  // 한 행만 읽어 만든다.
  const etag = await buildEtag(admin, viewer.couple_id);

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=300" },
    });
  }

  // ── 바뀌었을 때만 전체를 만든다 ────────────────────────────────
  const { data: partner } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("couple_id", viewer.couple_id)
    .neq("id", viewer.id)
    .maybeSingle<Profile>();

  const now = Date.now();
  const from = new Date(now - 31 * 86400000).toISOString();
  // 범위를 안 자르면 파일이 무한히 커지고, 폴링마다 그 크기가 전송량이 된다.
  const to = new Date(now + 183 * 86400000).toISOString();

  const { data: events } = await admin
    .from("events")
    .select(
      "id,owner_id,scope,visibility,status,title,memo,starts_at,ends_at,all_day",
    )
    .eq("couple_id", viewer.couple_id)
    .is("deleted_at", null)
    // 구글에서 가져온 일정을 다시 발행하면 사용자 캘린더에 같은 게 두 개 뜬다.
    .eq("source", "local")
    .neq("status", "declined")
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at")
    .returns<FeedEvent[]>();

  const { data: prefs } = await admin
    .from("notification_prefs")
    .select("recv_event_upcoming,upcoming_min")
    .eq("user_id", viewer.id)
    .maybeSingle<{ recv_event_upcoming: boolean; upcoming_min: number }>();

  const origin = new URL(request.url).origin;
  const body = buildIcs({
    events: events ?? [],
    viewer,
    partner: partner ?? null,
    reminderMinutes: prefs?.recv_event_upcoming === false ? 0 : (prefs?.upcoming_min ?? 60),
    origin,
  });

  // 캘린더 앱이 한 번이라도 읽었으면 구독 성공이다 → docs/21-onboarding.md
  await admin
    .from("ics_tokens")
    .update({ last_read: new Date().toISOString() })
    .eq("token", token);

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      ETag: etag,
      // private을 빼지 말 것. 공유 캐시에 저장되면 안 되는 데이터다.
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="junbi.ics"',
    },
  });
}

/**
 * 최대 updated_at 한 행만 읽어 ETag를 만든다.
 *
 * 소프트 삭제도 updated_at을 올리므로(events_touch 트리거) 함께 반영된다.
 * 하드 삭제를 쓰면 최대값이 과거로 돌아가 ETag가 이전 값과 같아진다.
 * 그래서 .ics에 실리는 데이터는 소프트 삭제만 쓴다.
 */
async function buildEtag(
  admin: ReturnType<typeof createAdminClient>,
  coupleId: string,
): Promise<string> {
  const { data: e } = await admin
    .from("events")
    .select("updated_at")
    .eq("couple_id", coupleId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ updated_at: string }>();

  // 기념일도 종일 일정으로 발행되므로, 기념일만 바뀌어도 ETag가 바뀌어야 한다.
  const { data: a } = await admin
    .from("anniversaries")
    .select("created_at")
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();

  const stamp = [e?.updated_at, a?.created_at].filter(Boolean).sort().pop();
  return `"${stamp ?? "empty"}"`;
}
