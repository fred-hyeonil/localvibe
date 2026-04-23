import { useEffect, useRef, useState } from "react";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || "0da5b46d0248e671b357568d3720d935";
const KAKAO_SCRIPT_ID = "kakao-map-sdk-script";
const MARKER_IMAGE_URL = "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png";

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

function createSdkUrl(withServices = false) {
  const libs = withServices ? "&libraries=services" : "";
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false${libs}`;
}

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.load) {
      window.kakao.maps.load(() => resolve(window.kakao));
      return;
    }
    if (!KAKAO_JS_KEY) {
      reject(new Error("missing_key"));
      return;
    }

    const mountScript = (src, removeExisting = false) =>
      new Promise((innerResolve, innerReject) => {
        if (removeExisting) {
          const stale = document.getElementById(KAKAO_SCRIPT_ID);
          if (stale) {
            stale.remove();
          }
        }

        const existing = document.getElementById(KAKAO_SCRIPT_ID);
        if (existing) {
          existing.addEventListener("load", () => innerResolve(window.kakao), { once: true });
          existing.addEventListener("error", () => innerReject(new Error("sdk_blocked")), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.id = KAKAO_SCRIPT_ID;
        script.async = true;
        script.src = `${src}&_ts=${Date.now()}`;
        script.onload = () => innerResolve(window.kakao);
        script.onerror = () => innerReject(new Error("sdk_blocked"));
        document.head.appendChild(script);
      });

    // Keep timeout short so fallback map appears quickly.
    const timeout = setTimeout(() => reject(new Error("sdk_timeout")), 2500);

    mountScript(createSdkUrl(false), false)
      .catch(() => mountScript(createSdkUrl(false), true))
      .then(() => {
        if (!window.kakao?.maps?.load) {
          throw new Error("sdk_blocked");
        }
        window.kakao.maps.load(() => resolve(window.kakao));
      })
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timeout));
  });
}

export default function KakaoMap({ address, latitude, longitude }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapCenterRef = useRef(null);
  const [error, setError] = useState("");
  const mapUrl = buildKakaoMapUrl(address, latitude, longitude);

  useEffect(() => {
    let active = true;

    if (!hasValidCoord(latitude, longitude)) {
      setError("좌표 정보가 없어 지도를 표시할 수 없습니다.");
      return () => {
        active = false;
      };
    }
    if (!KAKAO_JS_KEY) {
      setError("카카오 JavaScript 키가 설정되지 않았습니다.");
      return () => {
        active = false;
      };
    }

    setError("");

    loadKakaoSdk()
      .then((kakao) => {
        if (!active || !mapRef.current) {
          return;
        }
        const coords = new kakao.maps.LatLng(Number(latitude), Number(longitude));
        mapRef.current.innerHTML = "";
        const map = new kakao.maps.Map(mapRef.current, { center: coords, level: 4 });
        const markerImage = new kakao.maps.MarkerImage(MARKER_IMAGE_URL, new kakao.maps.Size(40, 42));
        new kakao.maps.Marker({ map, position: coords, image: markerImage });
        mapInstanceRef.current = map;
        mapCenterRef.current = coords;

        [0, 180, 420, 800].forEach((delay) => {
          setTimeout(() => {
            if (!active || !mapInstanceRef.current || !mapCenterRef.current) {
              return;
            }
            mapInstanceRef.current.relayout();
            mapInstanceRef.current.setCenter(mapCenterRef.current);
          }, delay);
        });
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        const message = String(err?.message || "");
        if (message.includes("sdk_blocked")) {
          setError("카카오 SDK 로드가 차단되었습니다. 브라우저 확장/보안 설정을 확인해주세요.");
          return;
        }
        if (message.includes("sdk_timeout")) {
          setError("카카오 SDK 로드 시간이 초과되었습니다. 새로고침 후 다시 시도해주세요.");
          return;
        }
        setError("카카오 지도를 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, [latitude, longitude]);

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

    const observer = new ResizeObserver(() => relayoutNow());
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
      {error ? (
        <>
          {mapUrl ? (
            <div className="kakao-map-canvas kakao-map-fallback-viewport">
              <iframe
                src={mapUrl}
                title="카카오 지도 폴백"
                className="kakao-map-iframe"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            <p className="kakao-map-error">{error}</p>
          )}
        </>
      ) : (
        <div ref={mapRef} className="kakao-map-canvas" />
      )}
      {mapUrl ? (
        <a className="kakao-map-link" href={mapUrl} target="_blank" rel="noreferrer">
          카카오맵에서 위치 열기
        </a>
      ) : null}
    </section>
  );
}
