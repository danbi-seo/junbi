import ical, { ICalAlarmType, ICalCalendarMethod } from "ical-generator";
import { partnerLabel, type Profile } from "@/lib/naming";
import { MASKED_TITLE } from "@/lib/events";

/**
 * .ics 피드 생성 — docs/12-ics-feed.md
 *
 * ⚠ 이 파일이 이 프로젝트에서 가장 조심스러운 코드다.
 *
 * .ics 라우트는 service_role로 돌기 때문에 RLS도 events_visible 뷰도 걸리지 않는다.
 * 마스킹을 여기서 직접 해야 한다. 그리고 이 파일은 상대 기기의 캘린더 앱에
 * 저장되어 홈 화면 위젯과 잠금화면에 뜬다.
 *
 * 넣지 말 것: 상대의 busy 일정 제목, 건강 정보, 지출 금액.
 */

export type FeedEvent = {
  id: string;
  owner_id: string;
  scope: "shared" | "personal";
  visibility: "full" | "busy" | "private";
  status: "confirmed" | "proposed" | "declined";
  title: string;
  memo: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

/**
 * 캘린더 앱에는 색도 레인도 없다. 텍스트 접두어가 유일한 구분 수단이다.
 * 내 일정에는 접두어를 안 붙인다. 대부분이 내 것이라 다 붙이면 목록이 지저분해진다.
 */
export function summaryOf(
  e: FeedEvent,
  viewerId: string,
  partner: string,
): string | null {
  if (e.scope === "shared") {
    return e.status === "proposed" ? `[제안] ${e.title}` : `[함께] ${e.title}`;
  }
  if (e.owner_id === viewerId) return e.title;
  if (e.visibility === "full") return `[${partner}] ${e.title}`;
  if (e.visibility === "busy") return `[${partner}] ${MASKED_TITLE}`;
  return null; // private — 발행하지 않는다
}

/** 기념일 — 종일 일정으로 발행한다 */
export type FeedAnniversary = {
  key: string;
  title: string;
  emoji: string;
  /** YYYY-MM-DD */
  date: string;
};

export function buildIcs(opts: {
  events: FeedEvent[];
  anniversaries?: FeedAnniversary[];
  viewer: Profile;
  partner: Profile | null;
  /** 일정 몇 분 전에 알릴지. notification_prefs.upcoming_min */
  reminderMinutes: number;
  origin: string;
}): string {
  const { events, anniversaries = [], viewer, partner, reminderMinutes, origin } = opts;
  const label = partner ? partnerLabel(viewer, partner) : "상대";

  // 시각은 UTC(Z 접미사)로 내보낸다.
  //
  // calendar에 timezone을 지정하면 ical-generator가 VTIMEZONE 블록 없이
  // 시간대 없는 '떠 있는 시각'을 쓴다. 그러면 캘린더 앱이 "보는 사람의 현지 시각"으로
  // 해석해서, 한쪽이 해외에 나가면 약속 시간이 그 나라 시각으로 밀린다.
  // UTC는 절대 시각이라 어디서 봐도 같은 순간을 가리킨다.
  // 종일 일정은 ical-generator가 VALUE=DATE로 따로 처리한다.
  const cal = ical({
    name: "JUNBI",
    prodId: { company: "JUNBI", product: "JUNBI", language: "KO" },
    method: ICalCalendarMethod.PUBLISH,
    // 힌트일 뿐이다. OS가 무시한다. 폴링 횟수는 제어할 수 없고
    // 폴링당 전송량만 ETag로 줄일 수 있다.
    ttl: 60 * 15,
  });

  for (const e of events) {
    const summary = summaryOf(e, viewer.id, label);
    if (summary === null) continue;

    const masked = e.owner_id !== viewer.id && e.visibility !== "full" && e.scope !== "shared";

    const event = cal.createEvent({
      // UID는 일정마다 영구히 고정한다. 바뀌면 캘린더 앱이 새 일정으로 보고
      // 중복이 생긴다. 그래서 events.id를 그대로 쓴다.
      id: `evt-${e.id}@junbi`,
      start: new Date(e.starts_at),
      end: new Date(e.ends_at),
      allDay: e.all_day,
      summary,
      // 메모는 마스킹된 일정에 절대 넣지 않는다
      description: masked ? undefined : (e.memo ?? undefined),
      url: `${origin}/event/${e.id}`,
    });

    // 종일 일정에 알림을 걸면 자정에 울린다. 시각 있는 일정에만 건다.
    // 상대의 시간만·비공개 일정에도 알림을 보내지 않는다 — 달력에서 제목을
    // 가려도 알림이 시각을 알려주면 가린 의미가 절반 사라진다 → docs/11-naming.md
    if (!e.all_day && !masked && reminderMinutes > 0) {
      event.createAlarm({
        type: ICalAlarmType.display,
        triggerBefore: reminderMinutes * 60,
        description: summary,
      });
    }
  }

  for (const a of anniversaries) {
    const [y, m, d] = a.date.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));

    const event = cal.createEvent({
      // 자동 생성 기념일(100일 등)에도 고정 키를 쓴다.
      // UID가 바뀌면 캘린더 앱이 새 일정으로 보고 중복이 생긴다.
      id: `anv-${a.key}@junbi`,
      start,
      // 종일 일정의 DTEND는 다음 날이다. 하루를 빼먹으면 캘린더에 안 뜬다.
      end: new Date(start.getTime() + 86400000),
      allDay: true,
      summary: `${a.emoji} ${a.title}`,
      url: `${origin}/dday`,
    });

    // 종일 일정의 '0초 전'은 자정에 울린다. 하루 전과 일주일 전만 건다.
    for (const days of [7, 1]) {
      event.createAlarm({
        type: ICalAlarmType.display,
        triggerBefore: days * 86400,
        description: `${a.title}이 ${days === 1 ? "내일" : "일주일 남았"}어요`,
      });
    }
  }

  return cal.toString();
}
