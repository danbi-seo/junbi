"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록.
 *
 * 오프라인 안내 화면과 웹 푸시 수신을 같은 워커가 맡는다.
 * 실패해도 앱은 정상 동작해야 한다 — 서비스 워커는 부가 기능이다.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 사파리 사생활 보호 모드 등에서 실패한다. 조용히 넘어간다.
      });
    };

    // 첫 화면이 뜨는 걸 방해하지 않게 로드 후에 등록한다.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
