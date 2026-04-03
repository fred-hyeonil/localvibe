import { useEffect, useRef, useState } from "react";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || "";
const KAKAO_SCRIPT_ID = "kakao-map-sdk-script";

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.services) {
      resolve(window.kakao);
      return;
    }
    if (!KAKAO_JS_KEY) {
      reject(new Error("missing kakao key"));
      return;
    }

    const existing = document.getElementById(KAKAO_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => {
        window.kakao.maps.load(() => resolve(window.kakao));
      });
      existing.addEventListener("error", () => reject(new Error("failed kakao sdk")));
      return;
    }

    const script = document.createElement("script");
    script.id = KAKAO_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => reject(new Error("failed kakao sdk"));
    document.head.appendChild(script);
  });
}

export default function KakaoMap({ address, latitude, longitude }) {
  const mapRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (latitude == null && longitude == null && !address) {
      setError("주소/좌표 정보가 없어 지도를 표시할 수 없습니다.");
      return;
    }
    if (!KAKAO_JS_KEY) {
      setError("카카오 지도 키가 설정되지 않았습니다.");
      return;
    }

    setError("");

    loadKakaoSdk()
      .then((kakao) => {
        if (!active || !mapRef.current) {
          return;
        }

        const renderMap = (lat, lng) => {
          const coords = new kakao.maps.LatLng(Number(lat), Number(lng));
          const map = new kakao.maps.Map(mapRef.current, {
            center: coords,
            level: 4,
          });
          new kakao.maps.Marker({ map, position: coords });
          // Modal layout can settle after map mount; force relayout.
          setTimeout(() => {
            if (!active) {
              return;
            }
            map.relayout();
            map.setCenter(coords);
          }, 0);
          setTimeout(() => {
            if (!active) {
              return;
            }
            map.relayout();
            map.setCenter(coords);
          }, 180);
        };

        if (latitude != null && longitude != null) {
          renderMap(latitude, longitude);
          return;
        }

        if (!address) {
          setError("주소/좌표 정보가 없어 지도를 표시할 수 없습니다.");
          return;
        }

        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(address, (result, status) => {
          if (!active || !mapRef.current) {
            return;
          }
          if (status !== kakao.maps.services.Status.OK || !result[0]) {
            setError("주소 좌표를 찾을 수 없습니다.");
            return;
          }
          renderMap(result[0].y, result[0].x);
        });
      })
      .catch(() => {
        if (active) {
          setError("카카오 지도를 불러오지 못했습니다.");
        }
      });

    return () => {
      active = false;
    };
  }, [address, latitude, longitude]);

  return (
    <section className="kakao-map-wrapper">
      <h3>위치 지도</h3>
      {address ? <p className="kakao-map-address">{address}</p> : null}
      {error ? <p className="kakao-map-error">{error}</p> : <div ref={mapRef} className="kakao-map-canvas" />}
    </section>
  );
}
