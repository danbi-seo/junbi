"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMyProfile, setPetName } from "@/app/actions/pairing";
import { OWNER_EMOJI } from "@/lib/emoji";
import { hon } from "@/lib/naming";

/**
 * 내 정보 고치기.
 *
 * 생일을 잘못 넣는 일이 실제로 잦은데, 페어링이 끝나면 그 화면을 다시
 * 볼 일이 없어서 고칠 데가 없었다.
 *
 * 이름·생일은 페어링 확인 화면에서만 쓰지만, 그래도 틀린 채로 두면
 * 다음에 연결할 때(재결합·기기 변경) 상대가 나를 못 알아본다.
 *
 * 애칭은 성격이 다르다. **내 화면에서 상대를 부르는 이름**이고 소유자는 나다.
 * 상대는 내가 뭐라고 부르는지 모른다 → docs/11-naming.md
 */
export function ProfileCard({
  initial,
  partnerName,
  paired,
}: {
  initial: {
    name: string;
    birthDate: string;
    birthIsLunar: boolean;
    emoji: string;
    petName: string;
  };
  partnerName: string | null;
  paired: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(initial.emoji);
  const [pet, setPet] = useState(initial.petName);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none " +
    "focus:border-slot-a";

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">내 정보</h2>

      {!open ? (
        <>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ash">이름</dt>
              <dd>
                {initial.emoji} {initial.name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash">생년월일</dt>
              <dd className="tnum">
                {initial.birthIsLunar && "음력 "}
                {initial.birthDate}
              </dd>
            </div>
            {paired && (
              <div className="flex justify-between">
                <dt className="text-ash">상대를 부르는 이름</dt>
                <dd>{initial.petName || "안 정함"}</dd>
              </div>
            )}
          </dl>

          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSaved(false);
            }}
            className="mt-4 rounded-lg border border-line px-4 py-2 text-sm"
          >
            고치기
          </button>

          {saved && <p className="mt-3 text-sm text-ok">저장했어요.</p>}

          <p className="mt-3 text-xs leading-5 text-ash">
            이름과 생일은 상대와 서로 확인할 때만 써요. 달력이나 알림에는
            애칭만 나와요.
          </p>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            form.set("emoji", emoji);
            form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

            start(async () => {
              setError(null);
              // create_my_profile은 upsert다. 고치기에도 그대로 쓴다 —
              // 같은 검증(이름 필수·미래 생일 거부)을 두 번 만들 이유가 없다.
              const res = await createMyProfile(form);
              if (!res.ok) return setError(res.message);

              if (paired && pet.trim() !== initial.petName) {
                await setPetName(pet.trim());
              }
              setOpen(false);
              setSaved(true);
              router.refresh();
            });
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ash">이름</span>
            <input
              name="name"
              defaultValue={initial.name}
              required
              maxLength={20}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ash">생년월일</span>
            <input
              name="birth"
              type="date"
              defaultValue={initial.birthDate}
              required
              className={field}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="lunar"
              defaultChecked={initial.birthIsLunar}
              className="size-4"
            />
            음력이에요
          </label>

          <div>
            <p className="mb-2 text-sm text-ash">나를 나타낼 이모지</p>
            <div className="flex flex-wrap gap-2">
              {OWNER_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`rounded-lg border px-3 py-1.5 text-lg ${
                    emoji === e ? "border-slot-a bg-slot-a-bg" : "border-line"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {paired && (
            <div className="border-t border-line pt-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ash">
                  {partnerName}님을 뭐라고 부를까요?
                </span>
                <input
                  value={pet}
                  onChange={(e) => setPet(e.target.value)}
                  maxLength={12}
                  placeholder="애칭"
                  className={field}
                />
              </label>
              {/* 실제 알림이 어떻게 나올지 보여주면 이상한 애칭을 덜 고른다 */}
              <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs">
                → {hon(pet.trim() || partnerName || "상대")}이 일정을 추가했어요
              </p>
              <p className="mt-2 text-xs leading-5 text-ash">
                내 화면에서만 쓰는 이름이라 상대는 몰라요.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slot-a px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEmoji(initial.emoji);
                setPet(initial.petName);
                setError(null);
              }}
              className="px-4 py-2 text-sm text-ash"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
