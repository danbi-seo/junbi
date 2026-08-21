import type { Metadata } from "next";
import { BrandFull } from "@/app/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인 · JUNBI" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { e } = await props.searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <BrandFull className="mx-auto mb-8 max-w-[15rem]" />

        {e === "link" && (
          <p className="mb-6 rounded-lg bg-slot-b-bg px-4 py-3 text-sm leading-6">
            링크가 만료됐거나 이미 사용됐어요.
            <br />
            아래에서 코드를 새로 받아 주세요.
          </p>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
