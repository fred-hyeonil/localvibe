import { useEffect, useRef, useState } from "react";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || "";
const KAKAO_SCRIPT_ID = "kakao-map-sdk-script";

function hasValidCoord(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

function buildKakaoMapUrl(address, latitude, longitude) {
  if (hasValidCoord(latitude, longitude)) {
    return `https://map.kakao.com/link/map/${Number(latitude)},${Number(longitude)}`;
  }
  if (!address) {
    return "";
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
}

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timerId = null;
    let pollId = null;

    const finishResolve = (kakaoObj) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
      if (pollId) {
        clearInterval(pollId);
      }
      resolve(kakaoObj);
    };

    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
      if (pollId) {
        clearInterval(pollId);
      }
      reject(error);
    };

    const resolveAfterLoad = () => {
      if (!window.kakao?.maps?.load) {
        finishReject(new Error("kakao_sdk_blocked"));
        return;
      }
      window.kakao.maps.load(() => finishResolve(window.kakao));
    };

    if (window.kakao?.maps?.load) {
      resolveAfterLoad();
      return;
    }
    if (!KAKAO_JS_KEY) {
      finishReject(new Error("missing kakao key"));
      return;
    }

    // Safety timeout: if load event never arrives, fail fast.
    timerId = setTimeout(() => {
      finishReject(new Error("kakao_sdk_timeout"));
    }, 6000);

    // Polling fallback for browsers where script load event is flaky.
    pollId = setInterval(() => {
      if (window.kakao?.maps?.load) {
        resolveAfterLoad();
      }
    }, 120);

    const existing = document.getElementById(KAKAO_SCRIPT_ID);
    if (existing) {
      // If script is already loaded, load callback must run immediately.
      if (existing.dataset.loaded === "true" || existing.readyState === "complete") {
        resolveAfterLoad();
        return;
      }
      // Sometimes a stale script tag stays forever pending; recreate it.
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = KAKAO_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services&_ts=${Date.now()}`;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolveAfterLoad();
    };
    script.onerror = () => finishReject(new Error("kakao_sdk_blocked"));
    document.head.appendChild(script);
  });
}

export default function KakaoMap({ address, latitude, longitude }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapCenterRef = useRef(null);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState({
    phase: "idle",
    containerHeight: 0,
    resourceCount: 0,
  });
  const mapUrl = buildKakaoMapUrl(address, latitude, longitude);

  useEffect(() => {
    let active = true;
    if (!hasValidCoord(latitude, longitude) && !address) {
      setError("주소/좌표 정보가 없어 지도를 표시할 수 없습니다.");
      return;
    }
    if (!KAKAO_JS_KEY) {
      setError("카카오 지도 키가 설정되지 않았습니다.");
      return;
    }

    setError("");

    setDebugInfo((prev) => ({
      ...prev,
      phase: "sdk_loading",
      containerHeight: mapRef.current ? mapRef.current.offsetHeight : 0,
    }));

    loadKakaoSdk()
      .then((kakao) => {
        if (!active || !mapRef.current) {
          return;
        }
        setDebugInfo((prev) => ({ ...prev, phase: "sdk_loaded" }));

        const renderMap = (lat, lng) => {
          if (!hasValidCoord(lat, lng)) {
            setError("좌표 정보가 유효하지 않아 지도를 표시할 수 없습니다.");
            return;
          }
          const coords = new kakao.maps.LatLng(Number(lat), Number(lng));
          mapRef.current.innerHTML = "";
          let map = null;
          try {
            map = new kakao.maps.Map(mapRef.current, {
              center: coords,
              level: 4,
            });
            new kakao.maps.Marker({ map, position: coords });
          } catch (mapError) {
            const message = String(mapError?.message || mapError || "");
            if (message.includes("NotAuthorizedError") || message.includes("OPEN_MAP_AND_LOCAL")) {
              setError("카카오 지도 권한 오류입니다. 도메인 등록/지도 사용 설정을 확인해주세요.");
            } else {
              setError("지도를 생성하지 못했습니다. SDK 권한/브라우저 차단 상태를 확인해주세요.");
            }
            setDebugInfo((prev) => ({ ...prev, phase: "map_create_failed" }));
            return;
          }
          mapInstanceRef.current = map;
          mapCenterRef.current = coords;
          setDebugInfo((prev) => ({
            ...prev,
            phase: "map_created",
            containerHeight: mapRef.current ? mapRef.current.offsetHeight : 0,
          }));

          // Modal layout settles slightly late; retry relayout multiple times.
          [0, 120, 300, 700].forEach((delay) => {
            setTimeout(() => {
              if (!active || !mapInstanceRef.current || !mapCenterRef.current) {
                return;
              }
              mapInstanceRef.current.relayout();
              mapInstanceRef.current.setCenter(mapCenterRef.current);
            }, delay);
          });

          setTimeout(() => {
            if (!active || !mapRef.current) {
              return;
            }
            const resources = performance
              .getEntriesByType("resource")
              .filter((entry) =>
                /dapi\.kakao\.com|t1\.daumcdn\.net|mts\.daumcdn\.net/.test(entry.name),
              ).length;
            setDebugInfo((prev) => ({
              ...prev,
              phase: "map_post_check",
              containerHeight: mapRef.current ? mapRef.current.offsetHeight : 0,
              resourceCount: resources,
            }));
          }, 1200);
        };

        if (hasValidCoord(latitude, longitude)) {
          renderMap(latitude, longitude);
          return;
        }

        if (!address) {
          setError("주소/좌표 정보가 없어 지도를 표시할 수 없습니다.");
          return;
        }

        if (!kakao.maps.services?.Geocoder) {
          setError("주소 검색 라이브러리 권한이 없어 주소 기반 지도 생성이 불가합니다.");
          setDebugInfo((prev) => ({ ...prev, phase: "geocoder_unavailable" }));
          return;
        }

        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(address, (result, status) => {
          if (!active || !mapRef.current) {
            return;
          }
          if (status !== kakao.maps.services.Status.OK || !result[0]) {
            setError("주소 좌표를 찾을 수 없습니다.");
            setDebugInfo((prev) => ({ ...prev, phase: "geocode_failed" }));
            return;
          }
          setDebugInfo((prev) => ({ ...prev, phase: "geocode_ok" }));
          renderMap(result[0].y, result[0].x);
        });
      })
      .catch((err) => {
        if (active) {
          const message = String(err?.message || "");
          if (message.includes("OPEN_MAP_AND_LOCAL") || message.includes("NotAuthorizedError")) {
            setError("카카오 지도 권한 오류입니다. 도메인 등록/지도 사용 설정을 확인해주세요.");
            return;
          }
          if (message.includes("kakao_sdk_blocked")) {
            setError("브라우저가 카카오 SDK를 차단했습니다(CORB/확장프로그램). 브라우저 보안 설정을 확인해주세요.");
            setDebugInfo((prev) => ({ ...prev, phase: "sdk_blocked" }));
            return;
          }
          if (message.includes("kakao_sdk_timeout")) {
            setError("카카오 SDK 응답이 지연되어 로드에 실패했습니다. 새로고침 후 다시 시도해주세요.");
            setDebugInfo((prev) => ({ ...prev, phase: "sdk_timeout" }));
            return;
          }
          setError("카카오 지도를 불러오지 못했습니다.");
          setDebugInfo((prev) => ({ ...prev, phase: "sdk_failed" }));
        }
      });

    return () => {
      active = false;
    };
  }, [address, latitude, longitude]);

  useEffect(() => {
    if (!mapRef.current) {
      return undefined;
    }

    const relayoutNow = () => {
      if (!mapInstanceRef.current || !mapCenterRef.current) {
        return;
      }
      mapInstanceRef.current.relayout();
      mapInstanceRef.current.setCenter(mapCenterRef.current);
    };

    const observer = new ResizeObserver(() => {
      relayoutNow();
    });
    observer.observe(mapRef.current);
    window.addEventListener("resize", relayoutNow);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", relayoutNow);
    };
  }, []);

  return (
    <section className="kakao-map-wrapper">
      <h3>위치 지도</h3>
      {address ? <p className="kakao-map-address">{address}</p> : null}
      {error ? <p className="kakao-map-error">{error}</p> : <div ref={mapRef} className="kakao-map-canvas" />}
      {mapUrl ? (
        <a className="kakao-map-link" href={mapUrl} target="_blank" rel="noreferrer">
          카카오맵에서 위치 열기
        </a>
      ) : null}
      {import.meta.env.DEV ? (
        <p className="kakao-map-error">
          debug: {debugInfo.phase} / h:{debugInfo.containerHeight} / res:{debugInfo.resourceCount}
        </p>
      ) : null}
    </section>
  );
}
